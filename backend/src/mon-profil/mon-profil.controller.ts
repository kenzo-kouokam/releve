import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  declarationDiplomeSchema,
  disponibilitesRemplaceSchema,
  experienceCreateSchema,
  monProfilUpdateSchema,
  type CandidatDetail,
  type CompletudeProfil,
  type DeclarationDiplome,
  type DisponibilitesRemplace,
  type ExperienceCreate,
  type MonProfilUpdate,
  type UtilisateurSession,
  TAILLE_MAX_DOCUMENT,
  typeDocumentSchema,
  type DocumentResume,
  type LigneDossier,
  type TypeDocument,
} from '@releve/shared';
import { Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DocumentsService, type FichierRecu } from '../documents/documents.service';
import { MonProfilService } from './mon-profil.service';

/**
 * L'interimaire sur sa propre fiche.
 *
 * Routes separees de `/candidats` plutot que des gardes assouplies : le
 * back-office garde ses regles intactes, et ce qu'un candidat peut toucher se
 * lit d'un coup d'oeil sur ce seul fichier.
 */
@ApiTags('mon-profil')
@ApiBearerAuth()
@Roles('CANDIDAT')
@Controller('mon-profil')
export class MonProfilController {
  constructor(
    private readonly profil: MonProfilService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ma fiche complete' })
  lire(@UtilisateurCourant() session: UtilisateurSession): Promise<CandidatDetail> {
    return this.profil.lire(session);
  }

  @Get('completude')
  @ApiOperation({ summary: 'Ce qu il me manque pour recevoir des missions' })
  completude(@UtilisateurCourant() session: UtilisateurSession): Promise<CompletudeProfil> {
    return this.profil.completude(session);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier mes coordonnees et mon secteur' })
  modifier(
    @Body(new ZodValidationPipe(monProfilUpdateSchema)) donnees: MonProfilUpdate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.modifier(donnees, session);
  }

  @Put('disponibilites')
  @ApiOperation({ summary: 'Declarer mes creneaux de disponibilite' })
  disponibilites(
    @Body(new ZodValidationPipe(disponibilitesRemplaceSchema)) donnees: DisponibilitesRemplace,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.remplacerDisponibilites(donnees, session);
  }

  @Post('diplomes')
  @ApiOperation({ summary: 'Declarer un diplome, en attente de verification' })
  declarer(
    @Body(new ZodValidationPipe(declarationDiplomeSchema)) donnees: DeclarationDiplome,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.declarerDiplome(donnees, session);
  }

  @Post('experiences')
  @ApiOperation({ summary: 'Declarer un poste occupe, en attente de verification' })
  declarerExperience(
    @Body(new ZodValidationPipe(experienceCreateSchema)) donnees: ExperienceCreate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.declarerExperience(donnees, session);
  }

  @Delete('experiences/:experienceId')
  @ApiOperation({ summary: 'Retirer un poste que l agence n a pas encore verifie' })
  retirerExperience(
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.retirerExperience(experienceId, session);
  }

  @Delete('diplomes/:qualificationId')
  @ApiOperation({ summary: 'Retirer un diplome que l agence n a pas encore verifie' })
  retirer(
    @Param('qualificationId', ParseUUIDPipe) qualificationId: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    return this.profil.retirerDiplome(qualificationId, session);
  }

  /* ------------------------------------------------------ pieces justificatives */

  @Get('documents')
  @ApiOperation({ summary: 'Mon dossier : une ligne par piece attendue' })
  async dossier(@UtilisateurCourant() session: UtilisateurSession): Promise<LigneDossier[]> {
    const { id } = await this.profil.fiche(session);

    return this.documents.dossier(id);
  }

  /**
   * Le fichier arrive en memoire, jamais dans un dossier temporaire : un
   * fichier ecrit avant validation est un fichier a nettoyer, et le nettoyage
   * finit toujours par manquer un cas.
   */
  @Post('documents/:type')
  @UseInterceptors(
    FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_DOCUMENT, files: 1 } }),
  )
  @ApiOperation({ summary: 'Deposer une piece, en remplacant celle du meme type' })
  async deposer(
    @Param('type', new ZodValidationPipe(typeDocumentSchema)) type: TypeDocument,
    @UploadedFile() fichier: FichierRecu | undefined,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<DocumentResume> {
    const { id } = await this.profil.fiche(session);

    return this.documents.deposer(id, type, fichier);
  }

  /**
   * Le binaire ne sort que par ici. Aucune racine n'est servie statiquement :
   * une adresse devinable donnerait acces a la piece d'identite d'un inconnu.
   */
  @Get('documents/:documentId/contenu')
  @ApiOperation({ summary: 'Telecharger une de mes pieces' })
  async telecharger(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UtilisateurCourant() session: UtilisateurSession,
    @Res() reponse: Response,
  ): Promise<void> {
    const { id } = await this.profil.fiche(session);
    const piece = await this.documents.contenu(id, documentId);

    reponse.setHeader('Content-Type', piece.typeMime);
    // `attachment` plutot qu'`inline` : un PDF ouvert dans l'onglet s'execute
    // dans le contexte de l'API, ce qu'un document televerse n'a pas a faire.
    reponse.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(piece.nomOrigine)}"`,
    );
    reponse.send(piece.contenu);
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: 'Retirer une de mes pieces' })
  async retirerDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<LigneDossier[]> {
    const { id } = await this.profil.fiche(session);

    await this.documents.retirer(id, documentId);

    return this.documents.dossier(id);
  }
}
