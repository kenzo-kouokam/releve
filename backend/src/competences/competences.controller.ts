import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { competencesQuerySchema, type CompetenceResume, type CompetencesQuery } from '@releve/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompetencesService } from './competences.service';

@ApiTags('competences')
@ApiBearerAuth()
@Controller('competences')
export class CompetencesController {
  constructor(private readonly competences: CompetencesService) {}

  /**
   * Lecture ouverte a tout compte authentifie.
   *
   * Comme le referentiel des qualifications, et pour la meme raison : aucune
   * donnee nominative, et les trois profils en ont besoin. L'etablissement pour
   * rediger son besoin, le candidat pour declarer ce qu'il sait faire, l'agence
   * pour chercher un profil par mots-cles.
   *
   * Aucune ecriture n'est exposee : le referentiel se reconstruit depuis les
   * offres publiques par `pnpm cli competences`, et une ligne ajoutee a la main
   * ne serait plus une observation du marche mais une opinion.
   */
  @Get()
  @ApiOperation({ summary: 'Referentiel de competences, classe par demande du marche' })
  lister(
    @Query(new ZodValidationPipe(competencesQuerySchema)) query: CompetencesQuery,
  ): Promise<CompetenceResume[]> {
    return this.competences.lister(query);
  }
}
