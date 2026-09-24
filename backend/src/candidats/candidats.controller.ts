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
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  candidatCreateSchema,
  candidatListQuerySchema,
  candidatUpdateSchema,
  disponibilitesRemplaceSchema,
  experienceCreateSchema,
  experienceVerificationSchema,
  indisponibiliteSchema,
  qualificationCandidatSchema,
  qualificationCandidatUpdateSchema,
  ROLES_AGENCE,
  type CandidatCreate,
  type CandidatDetail,
  type CandidatListQuery,
  type CandidatResume,
  type CandidatUpdate,
  type DisponibilitesRemplace,
  type ExperienceCreate,
  type ExperienceVerification,
  type Indisponibilite,
  type PageResultat,
  type QualificationCandidatCreate,
  type QualificationCandidatUpdate,
  type UtilisateurSession,
  type LigneDossier,
} from '@releve/shared';
import { AgenceCourante, Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DocumentsService } from '../documents/documents.service';
import { CandidatsService } from './candidats.service';

// Le vivier est un ecran de back-office : ni le client ni le candidat n'y accedent.
@ApiTags('candidats')
@ApiBearerAuth()
@Roles(...ROLES_AGENCE)
@Controller('candidats')
export class CandidatsController {
  constructor(
    private readonly candidats: CandidatsService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister le vivier, filtrable par statut' })
  @ApiQuery({ name: 'statut', required: false })
  @ApiQuery({ name: 'recherche', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  lister(
    @Query(new ZodValidationPipe(candidatListQuerySchema)) query: CandidatListQuery,
    @AgenceCourante() agenceId: string,
  ): Promise<PageResultat<CandidatResume>> {
    return this.candidats.lister(query, agenceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche complete : qualifications, disponibilites, indisponibilites' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.detail(id, agenceId);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un candidat' })
  creer(
    @Body(new ZodValidationPipe(candidatCreateSchema)) donnees: CandidatCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatResume> {
    return this.candidats.creer(donnees, agenceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier la fiche ou le statut' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(candidatUpdateSchema)) donnees: CandidatUpdate,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.modifier(id, donnees, agenceId);
  }

  @Post(':id/qualifications')
  @ApiOperation({ summary: 'Rattacher une qualification du referentiel' })
  ajouterQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qualificationCandidatSchema)) donnees: QualificationCandidatCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.ajouterQualification(id, donnees, agenceId);
  }

  @Patch(':id/qualifications/:qualificationId')
  @ApiOperation({ summary: 'Verifier une qualification ou corriger ses dates' })
  modifierQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('qualificationId', ParseUUIDPipe) qualificationId: string,
    @Body(new ZodValidationPipe(qualificationCandidatUpdateSchema))
    donnees: QualificationCandidatUpdate,
    @UtilisateurCourant() utilisateur: UtilisateurSession,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.modifierQualification(
      id,
      qualificationId,
      donnees,
      utilisateur,
      agenceId,
    );
  }

  @Delete(':id/qualifications/:qualificationId')
  @ApiOperation({ summary: 'Retirer une qualification du candidat' })
  retirerQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('qualificationId', ParseUUIDPipe) qualificationId: string,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.retirerQualification(id, qualificationId, agenceId);
  }

  @Post(':id/experiences')
  @ApiOperation({ summary: 'Ajouter un poste au parcours du candidat' })
  ajouterExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(experienceCreateSchema)) donnees: ExperienceCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.ajouterExperience(id, donnees, agenceId);
  }

  // Le seul geste qui fait entrer une experience dans le score. Separe de la
  // saisie a dessein : declarer et constater ne sont pas la meme action, et
  // les confondre reviendrait a ne plus savoir quelles lignes ont ete
  // controlees sur piece.
  @Patch(':id/experiences/:experienceId')
  @ApiOperation({ summary: 'Verifier un poste sur certificat de travail, ou le devalider' })
  verifierExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
    @Body(new ZodValidationPipe(experienceVerificationSchema)) donnees: ExperienceVerification,
    @UtilisateurCourant() utilisateur: UtilisateurSession,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.verifierExperience(id, experienceId, donnees, utilisateur, agenceId);
  }

  @Delete(':id/experiences/:experienceId')
  @ApiOperation({ summary: 'Retirer un poste du parcours' })
  retirerExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.retirerExperience(id, experienceId, agenceId);
  }

  @Put(':id/disponibilites')
  @ApiOperation({ summary: 'Remplacer le planning hebdomadaire complet' })
  remplacerDisponibilites(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disponibilitesRemplaceSchema)) donnees: DisponibilitesRemplace,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.remplacerDisponibilites(id, donnees, agenceId);
  }

  @Post(':id/indisponibilites')
  @ApiOperation({ summary: 'Declarer une periode d indisponibilite' })
  ajouterIndisponibilite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(indisponibiliteSchema)) donnees: Indisponibilite,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.ajouterIndisponibilite(id, donnees, agenceId);
  }

  @Delete(':id/indisponibilites/:indisponibiliteId')
  @ApiOperation({ summary: 'Supprimer une periode d indisponibilite' })
  retirerIndisponibilite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('indisponibiliteId', ParseUUIDPipe) indisponibiliteId: string,
    @AgenceCourante() agenceId: string,
  ): Promise<CandidatDetail> {
    return this.candidats.retirerIndisponibilite(id, indisponibiliteId, agenceId);
  }

  /* ------------------------------------------------------ pieces justificatives */

  /**
   * L'agence lit les pieces pour les verifier — c'est toute la raison d'etre du
   * depot. Elle ne peut ni en deposer ni en retirer : ces gestes appartiennent
   * a la personne, et un document retire par un tiers serait indefendable.
   */
  @Get(':id/documents')
  @ApiOperation({ summary: 'Le dossier de pieces d un candidat' })
  async documentsDe(
    @Param('id', ParseUUIDPipe) id: string,
    @AgenceCourante() agenceId: string,
  ): Promise<LigneDossier[]> {
    const candidatId = await this.candidats.exigerAppartenance(id, agenceId);

    return this.documents.dossier(candidatId);
  }

  @Get(':id/documents/:documentId/contenu')
  @ApiOperation({ summary: 'Telecharger une piece pour la verifier' })
  async telechargerDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @AgenceCourante() agenceId: string,
    @Res() reponse: Response,
  ): Promise<void> {
    const candidatId = await this.candidats.exigerAppartenance(id, agenceId);
    const piece = await this.documents.contenu(candidatId, documentId);

    reponse.setHeader('Content-Type', piece.typeMime);
    reponse.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(piece.nomOrigine)}"`,
    );
    reponse.send(piece.contenu);
  }
}
