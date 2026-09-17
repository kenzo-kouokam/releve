import { Injectable, Logger } from '@nestjs/common';
import { OrigineCoordonnees, Prisma, StatutOffreCollectee } from '@prisma/client';
import type { Barometre, SuggestionTaux } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from './cache.service';
import { FranceTravailClient, type CriteresRecherche } from './france-travail.client';
import { preparerLot, type OffreBrute, type ResultatNettoyage } from './normalisation';

/**
 * Codes ROME du secteur, et raison de leur presence.
 *
 * Ce sont eux qui definissent ce que « notre marche » veut dire : elargir la
 * liste elargit mecaniquement la tension mesuree, donc elle se decide, elle ne
 * se devine pas.
 */
export const ROMES_SECTEUR = [
  'J1501', // Soins d'hygiene, de confort du patient - aide-soignant
  'K1302', // Assistance aupres d'adultes
  'K1304', // Services domestiques
] as const;

/** Duree de vie du barometre en cache : il ne change qu'apres un import. */
const CACHE_SECONDES = 24 * 3600;

/** Valeur de la colonne `source` pour les offres venant de France Travail. */
const SOURCE_FRANCE_TRAVAIL = 'FRANCE_TRAVAIL';

/**
 * Part du catalogue qu'un balayage doit ramener pour qu'on le croie complet.
 *
 * Le chiffre est volontairement prudent. Une variation normale du marche fait
 * bouger le catalogue de quelques pourcents d'un jour a l'autre ; tomber a
 * moins de sept offres sur dix signale un import tronque — plafond `max` trop
 * bas, coupure reseau au milieu de la pagination, ou API qui repond court. Dans
 * ces cas-la, l'absence d'une offre ne prouve pas sa disparition.
 */
const PART_MINIMALE_BALAYAGE = 0.7;

interface LigneAgregat {
  romeCode: string;
  romeLibelle: string;
  departement: string;
  offres: bigint;
  postes: bigint;
  median: Prisma.Decimal | null;
  minimum: Prisma.Decimal | null;
  maximum: Prisma.Decimal | null;
  avecExperience: bigint;
  sansSalaire: bigint;
}

export interface RapportImport extends ResultatNettoyage {
  enregistrees: number;
  source: string;
  simulation: boolean;
  /**
   * Offres passees en EXPIREE parce qu'elles ont disparu de la source. Nul
   * quand le balayage n'etait pas complet : voir `expirerLesDisparues`.
   */
  expirees: number;
}

@Injectable()
export class OffresService {
  private readonly logger = new Logger(OffresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FranceTravailClient,
    private readonly cache: CacheService,
  ) {}

  /**
   * Importe depuis l'API.
   *
   * `balayageComplet` dit si le resultat couvre reellement tout ce que la
   * source publie sur ces criteres. Lui seul autorise l'expiration des offres
   * absentes : voir `expirerLesDisparues`, ou se joue toute la prudence de
   * cette methode.
   */
  async importerDepuisApi(
    criteres: CriteresRecherche,
    simulation = false,
    balayageComplet = false,
  ): Promise<RapportImport> {
    const brutes = await this.client.rechercher(criteres);

    return this.traiter(brutes, 'API France Travail', simulation, balayageComplet);
  }

  /**
   * Importe depuis un instantane local.
   *
   * Indispensable le jour d'une demonstration : l'API peut etre indisponible,
   * le quota atteint, ou le reseau filtre. Le fichier rejoue exactement la meme
   * preparation que l'appel en direct.
   *
   * Jamais de balayage complet ici : un instantane est par nature partiel, et
   * en deduire que le reste du catalogue a disparu effacerait le site.
   */
  async importerDepuisFichier(contenu: string, simulation = false): Promise<RapportImport> {
    const lu = JSON.parse(contenu) as { resultats?: OffreBrute[] } | OffreBrute[];
    const brutes = Array.isArray(lu) ? lu : (lu.resultats ?? []);

    return this.traiter(brutes, 'instantane local', simulation, false);
  }

  private async traiter(
    brutes: OffreBrute[],
    source: string,
    simulation: boolean,
    balayageComplet: boolean,
  ): Promise<RapportImport> {
    const prepare = preparerLot(brutes);

    if (simulation) {
      return { ...prepare, enregistrees: 0, expirees: 0, source, simulation: true };
    }

    const debutBalayage = new Date();

    // Upsert plutot qu'insert : une offre republiee le lendemain doit mettre a
    // jour sa ligne, pas faire echouer tout le lot sur une cle dupliquee.
    let enregistrees = 0;

    for (const offre of prepare.offres) {
      const donnees = {
        romeCode: offre.romeCode,
        romeLibelle: offre.romeLibelle,
        intitule: offre.intitule,
        intituleNormalise: offre.intituleNormalise,
        description: offre.description,
        entreprise: offre.entreprise,
        entrepriseDescription: offre.entrepriseDescription,
        departement: offre.departement,
        communeNom: offre.communeNom,
        communeCode: offre.communeCode,
        codePostal: offre.codePostal,
        tauxHoraire: offre.tauxHoraire,
        salaireLibelle: offre.salaireLibelle,
        experienceExigee: offre.experienceExigee,
        experienceLibelle: offre.experienceLibelle,
        qualificationLibelle: offre.qualificationLibelle,
        secteurActiviteLibelle: offre.secteurActiviteLibelle,
        competences: offre.competences,
        horaires: offre.horaires,
        conditionsExercice: offre.conditionsExercice,
        dureeTravailLibelle: offre.dureeTravailLibelle,
        natureContrat: offre.natureContrat,
        typeContrat: offre.typeContrat,
        typeContratLibelle: offre.typeContratLibelle,
        alternance: offre.alternance,
        nombrePostes: offre.nombrePostes,
        publieeLe: offre.publieeLe,
        actualiseeLe: offre.actualiseeLe,
        urlOrigine: offre.urlOrigine,
        empreinte: offre.empreinte,
        // Revue chez la source, donc de retour en ligne : une offre republiee
        // apres avoir ete expiree doit redevenir visible.
        statut: StatutOffreCollectee.ACTIVE,
        expireeLe: null,
        vueLe: debutBalayage,
      };

      /**
       * Les coordonnees sont ecrites a part, et c'est un piege qu'il faut
       * nommer : France Travail ne geolocalise qu'une annonce sur sept, et les
       * autres sont situees ici au centre de leur commune. Les inclure dans
       * `donnees` ferait ecraser ce travail par le `null` de la source a chaque
       * import — le geocodage serait refait tous les jours pour etre efface
       * toutes les nuits.
       *
       * Absentes de l'objet, les colonnes ne sont pas touchees a la mise a
       * jour, et prennent leur valeur par defaut a la creation.
       */
      const coordonnees =
        offre.latitude !== null && offre.longitude !== null
          ? {
              latitude: offre.latitude,
              longitude: offre.longitude,
              origineCoordonnees: OrigineCoordonnees.SOURCE,
            }
          : {};

      await this.prisma.offreCollectee.upsert({
        where: { id: offre.id },
        update: { ...donnees, ...coordonnees },
        create: { id: offre.id, ...donnees, ...coordonnees },
      });

      enregistrees += 1;
    }

    const expirees = balayageComplet
      ? await this.expirerLesDisparues(debutBalayage, prepare.offres.length)
      : 0;

    await this.cache.oublier('tension:*');
    await this.cache.oublier('offres:*');

    this.logger.log(
      `Import ${source} : ${prepare.recues} recues, ${prepare.ecartees} ecartees, ` +
        `${prepare.doublons} republications, ${enregistrees} enregistrees, ${expirees} expirees`,
    );

    return { ...prepare, enregistrees, expirees, source, simulation: false };
  }

  /**
   * Passe en EXPIREE les offres que le dernier balayage complet n'a pas revues.
   *
   * La licence de reutilisation impose qu'une offre retiree chez France Travail
   * disparaisse aussi d'ici. Sans cette etape, le site afficherait indefiniment
   * des missions deja pourvues — c'est a la fois une infraction et le pire
   * defaut possible pour un site d'offres.
   *
   * Le garde-fou est ce qui compte. Le client plafonne les rapatriements
   * (`max`, et un rang maximal de 3000 impose par l'API) : un balayage tronque
   * rapporte une fraction du catalogue, et expirer tout le reste effacerait le
   * site en une commande. On refuse donc d'expirer si le balayage a ramene
   * moins que le seuil, et on le dit dans le journal plutot que de le taire.
   */
  private async expirerLesDisparues(debutBalayage: Date, vues: number): Promise<number> {
    const actives = await this.prisma.offreCollectee.count({
      where: { source: SOURCE_FRANCE_TRAVAIL, statut: StatutOffreCollectee.ACTIVE },
    });

    const plancher = Math.floor(actives * PART_MINIMALE_BALAYAGE);

    if (actives > 0 && vues < plancher) {
      this.logger.warn(
        `Expiration annulee : ${vues} offres revues pour ${actives} actives en base ` +
          `(seuil ${plancher}). Un balayage tronque ne prouve pas une disparition.`,
      );

      return 0;
    }

    const { count } = await this.prisma.offreCollectee.updateMany({
      where: {
        source: SOURCE_FRANCE_TRAVAIL,
        statut: StatutOffreCollectee.ACTIVE,
        vueLe: { lt: debutBalayage },
      },
      data: { statut: StatutOffreCollectee.EXPIREE, expireeLe: new Date() },
    });

    return count;
  }

  /**
   * Barometre de tension.
   *
   * La mediane plutot que la moyenne : quelques offres a 25 euros de l'heure
   * pour des gardes de nuit tireraient une moyenne vers le haut et feraient
   * suggerer un taux hors marche a une entreprise.
   */
  async barometre(jours = 30, departement?: string): Promise<Barometre> {
    const cle = `tension:${jours}:${departement ?? 'toutes'}`;
    const enCache = await this.cache.lire<Barometre>(cle);

    if (enCache) {
      return { ...enCache, depuisLeCache: true };
    }

    const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000);

    /**
     * Le dedoublonnage se joue dans le `DISTINCT ON` ci-dessous, et c'est un
     * changement de fond.
     *
     * Il se faisait auparavant a l'import, lot par lot, avant l'ecriture. Deux
     * republications de la meme offre arrivees dans deux imports differents
     * portaient deux identifiants distincts : elles entraient toutes les deux
     * en base et la tension les comptait deux fois. L'index sur `empreinte`
     * existait mais ne servait a rien.
     *
     * Les lignes sont desormais toutes conservees — la licence de reutilisation
     * demande de restituer le catalogue — et c'est ici qu'on n'en garde qu'une
     * par empreinte. A empreinte egale, la plus ancienne gagne : c'est la vraie
     * date de mise sur le marche, et prendre la republication ferait glisser la
     * fenetre de tension a chaque reprise de l'annonce.
     *
     * Les offres expirees restent comptees : elles ont bel et bien existe
     * pendant la periode observee, et les retirer ferait fondre le barometre a
     * mesure que les missions se pourvoient.
     */
    const lignes = await this.prisma.$queryRaw<LigneAgregat[]>`
      WITH uniques AS (
        SELECT DISTINCT ON ("empreinte")
          "romeCode", "romeLibelle", "departement", "nombrePostes",
          "tauxHoraire", "experienceExigee"
        FROM "offre_collectee"
        WHERE "publieeLe" >= ${depuis}
          AND "romeCode" IS NOT NULL
          AND "departement" IS NOT NULL
          AND (${departement ?? null}::text IS NULL OR "departement" = ${departement ?? null})
        ORDER BY "empreinte", "publieeLe" ASC
      )
      SELECT
        "romeCode",
        MIN("romeLibelle")                                              AS "romeLibelle",
        "departement",
        COUNT(*)                                                        AS "offres",
        SUM("nombrePostes")                                             AS "postes",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "tauxHoraire")      AS "median",
        MIN("tauxHoraire")                                              AS "minimum",
        MAX("tauxHoraire")                                              AS "maximum",
        COUNT(*) FILTER (WHERE "experienceExigee")                      AS "avecExperience",
        COUNT(*) FILTER (WHERE "tauxHoraire" IS NULL)                   AS "sansSalaire"
      FROM uniques
      GROUP BY "romeCode", "departement"
      ORDER BY COUNT(*) DESC
    `;

    const barometre: Barometre = {
      periodeJours: jours,
      calculeLe: new Date().toISOString(),
      depuisLeCache: false,
      metiers: lignes.map((ligne) => ({
        romeCode: ligne.romeCode,
        romeLibelle: ligne.romeLibelle,
        departement: ligne.departement,
        offres: Number(ligne.offres),
        postes: Number(ligne.postes),
        tauxHoraireMedian: ligne.median ? Number(ligne.median) : null,
        tauxHoraireMin: ligne.minimum ? Number(ligne.minimum) : null,
        tauxHoraireMax: ligne.maximum ? Number(ligne.maximum) : null,
        partExperienceExigee:
          Number(ligne.offres) > 0
            ? Math.round((Number(ligne.avecExperience) / Number(ligne.offres)) * 100)
            : 0,
        offresSansSalaire: Number(ligne.sansSalaire),
      })),
    };

    await this.cache.ecrire(cle, barometre, CACHE_SECONDES);

    return barometre;
  }

  /**
   * Taux horaire suggere pour un metier et un departement.
   *
   * C'est le premier des deux usages visibles de la donnee publique : au moment
   * ou l'entreprise cree sa mission, elle voit ce que paie le marche autour
   * d'elle plutot que de deviner. Le repli sur la moyenne nationale evite de ne
   * rien afficher dans un departement peu couvert.
   */
  async tauxSuggere(romeCode: string, departement?: string, jours = 90): Promise<SuggestionTaux> {
    const barometre = await this.barometre(jours, departement);
    const local = barometre.metiers.find((metier) => metier.romeCode === romeCode);

    if (local?.tauxHoraireMedian) {
      return {
        tauxHoraireMedian: local.tauxHoraireMedian,
        offres: local.offres,
        perimetre: 'departemental',
      };
    }

    const national = await this.barometre(jours);
    const metiers = national.metiers.filter((metier) => metier.romeCode === romeCode);

    if (!metiers.length) {
      return { tauxHoraireMedian: null, offres: 0, perimetre: 'aucun' };
    }

    const taux = metiers
      .map((metier) => metier.tauxHoraireMedian)
      .filter((valeur): valeur is number => valeur !== null)
      .sort((a, b) => a - b);

    const offres = metiers.reduce((somme, metier) => somme + metier.offres, 0);

    if (!taux.length) {
      return { tauxHoraireMedian: null, offres, perimetre: 'aucun' };
    }

    return {
      tauxHoraireMedian: taux[Math.floor(taux.length / 2)]!,
      offres,
      perimetre: 'national',
    };
  }
}
