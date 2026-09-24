import { Controller, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  annoncesQuerySchema,
  missionsVitrineQuerySchema,
  type AnnoncePartenaire,
  type AnnoncePartenaireDetail,
  type AnnoncesQuery,
  type MissionsVitrineQuery,
  type MissionVitrine,
  type MotifAnnonces,
  type OptionsAnnonces,
  type OptionsVitrine,
  type PageResultat,
  type UtilisateurSession,
} from '@releve/shared';
import { Public, Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VitrineService } from './vitrine.service';

/**
 * Les offres d'emploi telles que le site les presente.
 *
 * Deux familles de routes, et la frontiere entre elles est la distinction la
 * plus importante de ce controleur.
 *
 * **Ouvert a tous** : nos missions. Celles que les etablissements deposent sur
 * Releve, sur lesquelles on postule ici, et dont l'agence recoit les
 * candidatures.
 *
 * **Reserve aux candidats au dossier valide** : les annonces partenaire,
 * collectees sur France Travail. Elles ne sont jamais republiees au
 * tout-venant, et surtout **aucune route n'en donne le chemin de
 * candidature** — pas meme le lien vers la source. Ces postes appartiennent a
 * d'autres employeurs ; Releve les montre pour que le candidat voie ce que
 * cherche le secteur, puis vienne en parler a son charge de recrutement.
 */
@ApiTags('offres')
@Controller('offres')
export class OffresController {
  constructor(private readonly vitrine: VitrineService) {}

  /**
   * La fiche candidat rattachee au compte.
   *
   * Le role `CANDIDAT` seul ne suffit pas : un compte peut porter le role sans
   * `candidatId` si le rattachement a ete defait cote agence, et la requete
   * n'aurait alors aucun sujet.
   */
  private candidatDe(session: UtilisateurSession): string {
    if (!session.candidatId) {
      throw new ForbiddenException('Ce compte n est rattache a aucune fiche candidat');
    }

    return session.candidatId;
  }

  // Declaree avant toute route a parametre : « options » serait sinon lu comme
  // un identifiant.
  @Get('options')
  @Public()
  @ApiOperation({ summary: 'Departements, villes et metiers proposes au filtrage' })
  options(): Promise<OptionsVitrine> {
    return this.vitrine.options();
  }

  /**
   * Menus deroulants du catalogue partenaire.
   *
   * Declaree avant `annonces/:id`, sinon « options » serait lu comme un
   * identifiant d'annonce.
   */
  @Get('annonces/options')
  @Roles('CANDIDAT')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Departements et metiers presents dans le catalogue partenaire' })
  optionsAnnonces(@UtilisateurCourant() session: UtilisateurSession): Promise<OptionsAnnonces> {
    return this.vitrine.optionsAnnonces(this.candidatDe(session));
  }

  /**
   * Catalogue des annonces partenaire.
   *
   * Tout le marche collecte sur France Travail, reserve aux candidats dont
   * l'agence a valide le dossier. Aucun chemin de candidature n'en sort : ces
   * postes appartiennent a d'autres employeurs, et Releve ne recoit pas de
   * candidature pour eux. Un dossier non valide recoit une liste vide et le
   * motif `DOSSIER_NON_VALIDE`, pas une erreur — « pas encore » n'est pas un
   * refus, et l'ecran doit pouvoir le dire.
   */
  @Get('annonces')
  @Roles('CANDIDAT')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annonces partenaire, pour un candidat au dossier valide' })
  @ApiQuery({ name: 'recherche', required: false })
  @ApiQuery({ name: 'departement', required: false })
  @ApiQuery({ name: 'rome', required: false })
  @ApiQuery({ name: 'monRayon', required: false, type: Boolean })
  @ApiQuery({ name: 'tri', required: false, enum: ['PROCHES', 'RECENTES', 'TAUX_DECROISSANT'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  annonces(
    @Query(new ZodValidationPipe(annoncesQuerySchema)) query: AnnoncesQuery,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<PageResultat<AnnoncePartenaire> & { motif: MotifAnnonces | null }> {
    return this.vitrine.annonces(this.candidatDe(session), query);
  }

  /**
   * L'identifiant est celui de la source (« 213YHHM »), pas un UUID : pas de
   * `ParseUUIDPipe` ici, il rejetterait toutes les annonces.
   */
  @Get('annonces/:id')
  @Roles('CANDIDAT')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Detail d'une annonce partenaire" })
  annonce(
    @Param('id') id: string,
    @UtilisateurCourant() session: UtilisateurSession,
  ): Promise<AnnoncePartenaireDetail> {
    return this.vitrine.annonce(this.candidatDe(session), id);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Missions Releve ouvertes, visibles sans session' })
  @ApiQuery({ name: 'departement', required: false })
  @ApiQuery({ name: 'ville', required: false })
  @ApiQuery({ name: 'metier', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  missions(
    @Query(new ZodValidationPipe(missionsVitrineQuerySchema)) query: MissionsVitrineQuery,
  ): Promise<PageResultat<MissionVitrine>> {
    return this.vitrine.missions(query);
  }
}
