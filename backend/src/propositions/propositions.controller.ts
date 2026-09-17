import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  propositionListQuerySchema,
  refusSchema,
  ROLES_AGENCE,
  type PageResultat,
  type PropositionListQuery,
  type PropositionResume,
  type Refus,
  type UtilisateurSession,
} from '@releve/shared';
import { Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PropositionsService } from './propositions.service';

@ApiTags('propositions')
@ApiBearerAuth()
@Controller('propositions')
export class PropositionsController {
  constructor(private readonly propositions: PropositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les candidatures visibles par le profil connecte' })
  @ApiQuery({ name: 'statut', required: false })
  @ApiQuery({ name: 'missionId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  lister(
    @Query(new ZodValidationPipe(propositionListQuerySchema)) query: PropositionListQuery,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PageResultat<PropositionResume>> {
    return this.propositions.lister(query, session);
  }

  // Avant `:id` : « courante » n'est pas un identifiant.
  @Get('courante')
  @Roles('CANDIDAT')
  @ApiOperation({ summary: 'Prochaine mission confirmee du candidat connecte' })
  courante(@UtilisateurCourant() session: UtilisateurSession): Promise<PropositionResume | null> {
    if (!session.candidatId) {
      throw new ForbiddenException("Ce compte n'est rattache a aucune fiche candidat");
    }

    return this.propositions.courante(session.candidatId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d une candidature et profil du candidat' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PropositionResume> {
    return this.propositions.detail(id, session);
  }

  @Post(':id/valider')
  @Roles(...ROLES_AGENCE, 'CLIENT')
  @ApiOperation({ summary: 'Retenir ce candidat et pourvoir la mission' })
  valider(
    @Param('id', ParseUUIDPipe) id: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PropositionResume> {
    return this.propositions.valider(id, session);
  }

  @Post(':id/refuser')
  @ApiOperation({ summary: 'Ecarter la candidature, ou se retirer quand on est le candidat' })
  refuser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refusSchema)) donnees: Refus,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PropositionResume> {
    return this.propositions.refuser(id, donnees.motif, session);
  }
}
