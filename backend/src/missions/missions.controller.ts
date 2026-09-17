import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  candidatureCreateSchema,
  classementQuerySchema,
  missionCreateSchema,
  missionListQuerySchema,
  missionUpdateSchema,
  propositionsAgenceCreateSchema,
  ROLES_AGENCE,
  type CandidatureCreate,
  type ClassementMission,
  type ClassementQuery,
  type MissionCreate,
  type MissionDetail,
  type MissionListQuery,
  type MissionResume,
  type MissionUpdate,
  type OptionsPublication,
  type PageResultat,
  type PropositionResume,
  type PropositionsAgenceCreate,
  type ResumeMissions,
  type UtilisateurSession,
} from '@releve/shared';
import { ForbiddenException } from '@nestjs/common';
import { Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MatchingService } from '../matching/matching.service';
import { PropositionsService } from '../propositions/propositions.service';
import { MissionsService } from './missions.service';

/**
 * Les trois profils passent par ce controleur, et c'est voulu : la mission est
 * le seul objet que l'agence, l'etablissement et l'interimaire regardent
 * ensemble. Ce que chacun voit est decide dans le service, pas ici - dupliquer
 * la regle par role serait le moyen le plus sur de l'oublier quelque part.
 */
@ApiTags('missions')
@ApiBearerAuth()
@Controller('missions')
export class MissionsController {
  constructor(
    private readonly missions: MissionsService,
    private readonly propositions: PropositionsService,
    private readonly matching: MatchingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les missions visibles par le profil connecte' })
  @ApiQuery({ name: 'statut', required: false })
  @ApiQuery({ name: 'recherche', required: false })
  @ApiQuery({ name: 'depuis', required: false })
  @ApiQuery({ name: 'jusqua', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  lister(
    @Query(new ZodValidationPipe(missionListQuerySchema)) query: MissionListQuery,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PageResultat<MissionResume>> {
    return this.missions.lister(query, session);
  }

  // Declaree avant `:id`, sinon « resume » serait lu comme un identifiant.
  @Get('resume')
  @ApiOperation({ summary: 'Compteurs du tableau de bord' })
  resume(@UtilisateurCourant() session: UtilisateurSession): Promise<ResumeMissions> {
    return this.missions.resumeChiffre(session);
  }

  @Get('options-publication')
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Lieux et diplomes disponibles pour un depot de besoin' })
  @ApiQuery({ name: 'clientId', required: false })
  options(
    @UtilisateurCourant() session: UtilisateurSession,
    @Query('clientId') clientId?: string,
  ): Promise<OptionsPublication> {
    return this.missions.optionsPublication(session, clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d une mission' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<MissionDetail> {
    return this.missions.detail(id, session);
  }

  @Post()
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Deposer un besoin de remplacement' })
  creer(
    @Body(new ZodValidationPipe(missionCreateSchema)) donnees: MissionCreate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<MissionResume> {
    return this.missions.creer(donnees, session);
  }

  @Patch(':id')
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Modifier une mission non pourvue' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(missionUpdateSchema)) donnees: MissionUpdate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<MissionResume> {
    return this.missions.modifier(id, donnees, session);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Annuler une mission et liberer les candidatures' })
  annuler(
    @Param('id', ParseUUIDPipe) id: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<MissionResume> {
    return this.missions.annuler(id, session);
  }

  @Get(':id/candidats')
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Classer le vivier pour cette mission, score explique' })
  @ApiQuery({ name: 'ecartes', required: false, type: Boolean })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  classer(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(classementQuerySchema)) query: ClassementQuery,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<ClassementMission> {
    return this.matching.classer(id, query, session);
  }

  @Post(':id/candidatures')
  @Roles('CANDIDAT')
  @ApiOperation({ summary: 'Postuler a une mission' })
  postuler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(candidatureCreateSchema)) donnees: CandidatureCreate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PropositionResume> {
    if (!session.candidatId) {
      throw new ForbiddenException("Ce compte n'est rattache a aucune fiche candidat");
    }

    return this.propositions.postuler(id, session.candidatId, donnees.message);
  }

  /**
   * L'autre sens : l'agence propose, depuis le classement.
   *
   * Reservee a l'agence, et non ouverte au client : l'etablissement choisit
   * parmi ce qu'on lui presente, il ne puise pas dans le vivier lui-meme. La
   * liste des candidats ne lui est d'ailleurs jamais rendue en entier.
   */
  @Post(':id/propositions')
  @Roles(...ROLES_AGENCE)
  @ApiOperation({ summary: 'Proposer un ou plusieurs candidats a cette mission' })
  proposer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(propositionsAgenceCreateSchema)) donnees: PropositionsAgenceCreate,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PropositionResume[]> {
    return this.propositions.proposer(id, donnees, session);
  }
}
