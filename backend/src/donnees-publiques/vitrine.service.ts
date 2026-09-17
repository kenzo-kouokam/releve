import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrigineCoordonnees,
  Prisma,
  StatutOffreCollectee,
  type OffreCollectee,
} from '@prisma/client';
import type {
  AnnoncePartenaire,
  AnnoncePartenaireDetail,
  AnnoncesQuery,
  MissionsVitrineQuery,
  MissionVitrine,
  MotifAnnonces,
  OptionsAnnonces,
  OptionsVitrine,
  PageResultat,
} from '@releve/shared';
import { distanceKm } from '../matching/score';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Etats dans lesquels une mission cherche encore quelqu'un.
 *
 * Volontairement plus etroit que la liste du service des missions, qui inclut
 * PROPOSEE : une mission deja proposee a quelqu'un attend une reponse, et
 * l'afficher sur la vitrine publique amenerait des candidatures sur un poste
 * qui n'est plus vraiment ouvert.
 */
const ETATS_VITRINE = ['PUBLIEE', 'EN_MATCHING'] as const;

/** Valeur de la colonne `source` pour les offres venant de France Travail. */
const SOURCE_FRANCE_TRAVAIL = 'FRANCE_TRAVAIL';

/**
 * Plafond de securite sur le lot rapporte par la boite englobante.
 *
 * Ce n'est plus lui qui decide de la pertinence — c'est la boite, qui ecarte en
 * base tout ce qui est hors du rayon. Il ne reste la que pour empecher un cas
 * pathologique de charger des milliers de lignes : un candidat au rayon tres
 * large dans une metropole dense.
 */
const CANDIDATES_A_CLASSER = 400;

/** Noms des departements, pour les menus deroulants de la vitrine. */
const NOMS_DEPARTEMENTS: Record<string, string> = {
  '44': 'Loire-Atlantique',
  '49': 'Maine-et-Loire',
  '53': 'Mayenne',
  '72': 'Sarthe',
  '85': 'Vendee',
};

/**
 * Ce que le site montre a qui n'est pas connecte, et ce qu'il ouvre a un
 * candidat dont le dossier est valide.
 *
 * Les deux vivent dans le meme service parce qu'ils repondent a la meme
 * question — « qu'est-ce qui se cherche autour de moi ? » — mais ils ne
 * puisent pas au meme endroit, et la distinction gouverne tout le fichier : la
 * vitrine publique lit les missions de Releve, sur lesquelles on postule ici ;
 * les annonces partenaire lisent les offres collectees sur France Travail, sur
 * lesquelles on ne postule pas du tout depuis la plateforme.
 */
@Injectable()
export class VitrineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Missions Releve ouvertes, visibles sans session.
   *
   * Le nom du client n'est pas projete : voir `MissionVitrine`. Ce n'est pas un
   * oubli, c'est la seule difference entre cette vue et celle du candidat
   * connecte.
   */
  async missions(query: MissionsVitrineQuery): Promise<PageResultat<MissionVitrine>> {
    const where: Prisma.MissionWhereInput = {
      statut: { in: [...ETATS_VITRINE] },
      ...(query.metier ? { qualificationRequise: { code: query.metier } } : {}),
      ...(query.ville ? { lieu: { ville: { equals: query.ville, mode: 'insensitive' } } } : {}),
      ...(query.departement ? { lieu: { codePostal: { startsWith: query.departement } } } : {}),
    };

    const [total, lignes] = await Promise.all([
      this.prisma.mission.count({ where }),
      this.prisma.mission.findMany({
        where,
        include: {
          lieu: { select: { type: true, libelle: true, ville: true, codePostal: true } },
          qualificationRequise: { select: { code: true, libelle: true } },
        },
        // La plus proche dans le temps d'abord : un candidat cherche a remplir
        // son planning, pas a lire un historique.
        orderBy: [{ dateDebut: 'asc' }, { heureDebut: 'asc' }],
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    return {
      donnees: lignes.map((mission) => ({
        id: mission.id,
        reference: mission.reference,
        metier: mission.qualificationRequise.libelle,
        metierCode: mission.qualificationRequise.code,
        typeLieu: mission.lieu.type as MissionVitrine['typeLieu'],
        secteur: mission.lieu.libelle,
        ville: mission.lieu.ville,
        codePostal: mission.lieu.codePostal,
        departement: departementDepuisCodePostal(mission.lieu.codePostal),
        dateDebut: mission.dateDebut.toISOString(),
        dateFin: mission.dateFin.toISOString(),
        heureDebut: mission.heureDebut,
        heureFin: mission.heureFin,
        travailNuit: mission.travailNuit,
        tauxHoraire: mission.tauxHoraire === null ? null : Number(mission.tauxHoraire),
        description: mission.description,
      })),
      total,
      page: query.page,
      limite: query.limite,
    };
  }

  /**
   * Contenu des menus deroulants.
   *
   * Construit sur les missions reellement ouvertes : un menu qui proposerait
   * les cent une divisions francaises alors que l'agence en couvre cinq ferait
   * cliquer le visiteur vers des listes vides.
   */
  async options(): Promise<OptionsVitrine> {
    const lignes = await this.prisma.mission.findMany({
      where: { statut: { in: [...ETATS_VITRINE] } },
      select: {
        lieu: { select: { ville: true, codePostal: true } },
        qualificationRequise: { select: { code: true, libelle: true } },
      },
    });

    const departements = new Map<string, number>();
    const villes = new Map<string, { nom: string; departement: string; missions: number }>();
    const metiers = new Map<string, { code: string; libelle: string; missions: number }>();

    for (const ligne of lignes) {
      const departement = departementDepuisCodePostal(ligne.lieu.codePostal);

      departements.set(departement, (departements.get(departement) ?? 0) + 1);

      const cleVille = `${departement}|${ligne.lieu.ville.toLowerCase()}`;
      const ville = villes.get(cleVille);

      if (ville) {
        ville.missions += 1;
      } else {
        villes.set(cleVille, { nom: ligne.lieu.ville, departement, missions: 1 });
      }

      const metier = metiers.get(ligne.qualificationRequise.code);

      if (metier) {
        metier.missions += 1;
      } else {
        metiers.set(ligne.qualificationRequise.code, {
          code: ligne.qualificationRequise.code,
          libelle: ligne.qualificationRequise.libelle,
          missions: 1,
        });
      }
    }

    return {
      departements: [...departements.entries()]
        .map(([code, missions]) => ({
          code,
          libelle: NOMS_DEPARTEMENTS[code] ? `${code} — ${NOMS_DEPARTEMENTS[code]}` : code,
          missions,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      villes: [...villes.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      metiers: [...metiers.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
    };
  }

  /**
   * Catalogue des annonces partenaire, pour un candidat au dossier valide.
   *
   * Tout le marche collecte, et pas une selection : le candidat a demande a voir
   * ce qui se cherche, pas six pistes choisies pour lui. Les filtres sont a sa
   * main — departement, metier, recherche libre, et une case « dans mon rayon »
   * qui reste decochee par defaut.
   *
   * Aucun chemin de candidature n'en sort, pas meme vers la source. C'est la
   * decision qui gouverne toute cette methode : ces postes appartiennent a
   * d'autres employeurs, Releve ne peut y placer personne, et afficher un bouton
   * laisserait croire le contraire a quelqu'un qui attendrait ensuite une
   * reponse qui ne viendrait jamais.
   *
   * La porte d'entree est le statut ACTIF, c'est-a-dire le dossier valide par
   * l'agence — la meme regle qui commande deja l'envoi des courriels de
   * missions. Montrer le marche a quelqu'un qui ne peut pas encore etre place
   * serait lui ouvrir une porte fermee.
   */
  async annonces(
    candidatId: string,
    query: AnnoncesQuery,
  ): Promise<PageResultat<AnnoncePartenaire> & { motif: MotifAnnonces | null }> {
    const candidat = await this.candidatValide(candidatId);

    if (!candidat) {
      return {
        donnees: [],
        total: 0,
        page: query.page,
        limite: query.limite,
        motif: 'DOSSIER_NON_VALIDE',
      };
    }

    const where = this.filtreAnnonces(candidat, query);

    /**
     * Le tri par distance se calcule en memoire : la base ne sait pas ordonner
     * sur une haversine sans index spatial sur cette table. On rapporte donc un
     * lot plafonne, qu'on classe puis qu'on decoupe ici.
     *
     * Le plafond n'ampute rien tant que le candidat a resserre par departement
     * ou par metier. Sur le catalogue national entier, il signifie que le tri
     * « les plus proches » porte sur les quatre cents annonces les plus
     * recentes — ce qui est le bon compromis : au-dela, c'est une recherche, pas
     * un parcours.
     */
    const parDistance = query.tri === 'PROCHES' && candidat.latitude !== null;

    // Typee a part : en ligne, l'inference de Prisma fige `take` sur la valeur
    // litterale du premier terme et rejette le second.
    const fenetre: Pick<Prisma.OffreCollecteeFindManyArgs, 'skip' | 'take'> = parDistance
      ? { take: CANDIDATES_A_CLASSER }
      : { skip: (query.page - 1) * query.limite, take: query.limite };

    const [total, lignes] = await Promise.all([
      this.prisma.offreCollectee.count({ where }),
      this.prisma.offreCollectee.findMany({
        where,
        orderBy: this.ordreAnnonces(query.tri),
        ...fenetre,
      }),
    ]);

    const avecDistance = lignes.map((offre) => ({
      offre,
      distance: distanceKm(candidat.latitude, candidat.longitude, offre.latitude, offre.longitude),
    }));

    if (parDistance) {
      // Les annonces non situees passent derriere : elles ne sont pas moins
      // pertinentes, on ne sait simplement pas les placer, et les glisser dans
      // le classement les ferait paraitre proches.
      avecDistance.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;

        return a.distance - b.distance;
      });
    }

    const page = parDistance
      ? avecDistance.slice((query.page - 1) * query.limite, query.page * query.limite)
      : avecDistance;

    return {
      donnees: page.map(({ offre, distance }) => this.enAnnonce(offre, distance)),
      total,
      page: query.page,
      limite: query.limite,
      motif: null,
    };
  }

  /**
   * Une annonce entiere.
   *
   * Meme porte que la liste : un identifiant devine ne doit pas ouvrir le
   * catalogue a un dossier que l'agence n'a pas valide.
   */
  async annonce(candidatId: string, id: string): Promise<AnnoncePartenaireDetail> {
    const candidat = await this.candidatValide(candidatId);

    if (!candidat) {
      throw new ForbiddenException(
        'Les annonces partenaire s ouvrent une fois votre dossier valide par l agence',
      );
    }

    const offre = await this.prisma.offreCollectee.findFirst({
      where: { id, source: SOURCE_FRANCE_TRAVAIL, statut: StatutOffreCollectee.ACTIVE },
    });

    if (!offre) {
      throw new NotFoundException('Cette annonce n est plus diffusee');
    }

    const distance = distanceKm(
      candidat.latitude,
      candidat.longitude,
      offre.latitude,
      offre.longitude,
    );

    return {
      ...this.enAnnonce(offre, distance),
      description: offre.description,
      entrepriseDescription: offre.entrepriseDescription,
      romeCode: offre.romeCode,
      romeLibelle: offre.romeLibelle,
      qualificationLibelle: offre.qualificationLibelle,
      secteurActiviteLibelle: offre.secteurActiviteLibelle,
      competences: (offre.competences ?? []) as unknown as AnnoncePartenaireDetail['competences'],
      horaires: (offre.horaires ?? []) as unknown as string[],
      conditionsExercice: (offre.conditionsExercice ?? []) as unknown as string[],
      natureContrat: offre.natureContrat,
    };
  }

  /**
   * Departements et metiers reellement presents dans le catalogue.
   *
   * Meme principe que pour la vitrine publique : les menus se construisent sur
   * ce qui existe, pas sur une liste figee. Proposer un departement sans annonce
   * ferait cliquer le candidat vers une page vide.
   */
  async optionsAnnonces(candidatId: string): Promise<OptionsAnnonces> {
    const candidat = await this.candidatValide(candidatId);

    if (!candidat) {
      return { departements: [], metiers: [], total: 0 };
    }

    const base = {
      source: SOURCE_FRANCE_TRAVAIL,
      statut: StatutOffreCollectee.ACTIVE,
    } satisfies Prisma.OffreCollecteeWhereInput;

    const [parDepartement, parRome, total] = await Promise.all([
      this.prisma.offreCollectee.groupBy({
        by: ['departement'],
        where: { ...base, departement: { not: null } },
        _count: true,
      }),
      this.prisma.offreCollectee.groupBy({
        by: ['romeCode', 'romeLibelle'],
        where: { ...base, romeCode: { not: null } },
        _count: true,
      }),
      this.prisma.offreCollectee.count({ where: base }),
    ]);

    // Un meme code ROME arrive avec plusieurs libelles selon les employeurs :
    // on les additionne sous le premier rencontre plutot que de montrer deux
    // lignes pour un seul metier.
    const metiers = new Map<string, { romeCode: string; libelle: string; annonces: number }>();

    for (const ligne of parRome) {
      const code = ligne.romeCode!;
      const deja = metiers.get(code);

      metiers.set(code, {
        romeCode: code,
        // « Aide-soignant / Aide-soignante » : la forme masculin/feminin du
        // referentiel n'apporte rien a un menu deroulant.
        libelle: deja?.libelle ?? (ligne.romeLibelle ?? code).split('/')[0]!.trim(),
        annonces: (deja?.annonces ?? 0) + ligne._count,
      });
    }

    return {
      departements: parDepartement
        .map((ligne) => ({ code: ligne.departement!, annonces: ligne._count }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      metiers: [...metiers.values()].sort((a, b) => b.annonces - a.annonces),
      total,
    };
  }

  /**
   * Le candidat, s'il a le droit de voir le marche.
   *
   * ACTIF veut dire « dossier valide par l'agence ». Les autres statuts —
   * brouillon, en verification, inactif, archive — ne sont pas des erreurs :
   * ce sont des moments ou la reponse est « pas encore », et c'est ce que
   * l'ecran doit dire.
   */
  private async candidatValide(candidatId: string) {
    return this.prisma.candidat.findFirst({
      where: { id: candidatId, statut: 'ACTIF' },
      select: { latitude: true, longitude: true, rayonKm: true },
    });
  }

  private filtreAnnonces(
    candidat: { latitude: number | null; longitude: number | null; rayonKm: number },
    query: AnnoncesQuery,
  ): Prisma.OffreCollecteeWhereInput {
    const boite =
      query.monRayon && candidat.latitude !== null && candidat.longitude !== null
        ? boiteEnglobante(candidat.latitude, candidat.longitude, candidat.rayonKm)
        : null;

    return {
      source: SOURCE_FRANCE_TRAVAIL,
      statut: StatutOffreCollectee.ACTIVE,
      ...(query.departement ? { departement: query.departement } : {}),
      ...(query.rome ? { romeCode: query.rome } : {}),
      ...(boite
        ? {
            latitude: { gte: boite.latMin, lte: boite.latMax },
            longitude: { gte: boite.lonMin, lte: boite.lonMax },
          }
        : {}),
      ...(query.recherche
        ? {
            OR: [
              { intitule: { contains: query.recherche, mode: 'insensitive' } },
              { entreprise: { contains: query.recherche, mode: 'insensitive' } },
              { communeNom: { contains: query.recherche, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private ordreAnnonces(
    tri: AnnoncesQuery['tri'],
  ): Prisma.OffreCollecteeOrderByWithRelationInput[] {
    // `nulls: 'last'` sur le taux : les trois quarts des annonces n'affichent
    // aucune remuneration, et Postgres trierait ces NULL en tete d'un classement
    // decroissant — la liste s'ouvrirait sur les annonces muettes.
    if (tri === 'TAUX_DECROISSANT') {
      return [{ tauxHoraire: { sort: 'desc', nulls: 'last' } }, { publieeLe: 'desc' }];
    }

    return [{ publieeLe: 'desc' }];
  }

  /**
   * Passage de la ligne en base a ce que voit le candidat.
   *
   * Ce que cette projection ne contient pas compte autant que le reste. Pas
   * d'`urlOrigine` : ce serait un chemin de candidature, et on a decide de n'en
   * ouvrir aucun. Pas d'`intituleNormalise` non plus : c'est une valeur derivee
   * pour le barometre, et l'afficher a la place du titre de l'employeur
   * reviendrait a denaturer l'annonce, ce que la licence interdit.
   */
  private enAnnonce(offre: OffreCollectee, distance: number | null): AnnoncePartenaire {
    return {
      id: offre.id,
      source: offre.source,
      intitule: offre.intitule,
      entreprise: offre.entreprise,
      communeNom: offre.communeNom,
      departement: offre.departement,
      codePostal: offre.codePostal,
      salaireLibelle: offre.salaireLibelle,
      typeContratLibelle: offre.typeContratLibelle,
      dureeTravailLibelle: offre.dureeTravailLibelle,
      experienceExigee: offre.experienceExigee,
      experienceLibelle: offre.experienceLibelle,
      nombrePostes: offre.nombrePostes,
      publieeLe: offre.publieeLe.toISOString(),
      actualiseeLe: offre.actualiseeLe?.toISOString() ?? null,
      distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
      distanceApprochee: offre.origineCoordonnees === OrigineCoordonnees.COMMUNE,
    };
  }
}

/** Degre de latitude, en kilometres. Constant sur toute la Terre. */
const KM_PAR_DEGRE_LATITUDE = 111.32;

/**
 * Carre de coordonnees contenant a coup sur le disque du rayon demande.
 *
 * Sert de pre-filtre en base, pas de reponse : un carre deborde le cercle dans
 * les coins, et c'est la distance a vol d'oiseau qui tranche ensuite. Il vaut
 * mieux trop large que trop etroit — un carre trop petit ecarterait des offres
 * qui sont pourtant dans le rayon, et personne ne s'en apercevrait.
 *
 * Un degre de longitude retrecit vers les poles, d'ou le cosinus. Sans lui, la
 * boite serait trop etroite en latitude nord, et d'autant plus que la France
 * est loin de l'equateur.
 */
function boiteEnglobante(
  latitude: number,
  longitude: number,
  rayonKm: number,
): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const deltaLat = rayonKm / KM_PAR_DEGRE_LATITUDE;
  // Le plancher evite une division par zero au pole, ou la boite couvrirait
  // alors tous les meridiens.
  const kmParDegreLongitude = Math.max(
    KM_PAR_DEGRE_LATITUDE * Math.cos((latitude * Math.PI) / 180),
    0.001,
  );
  const deltaLon = rayonKm / kmParDegreLongitude;

  return {
    latMin: latitude - deltaLat,
    latMax: latitude + deltaLat,
    lonMin: longitude - deltaLon,
    lonMax: longitude + deltaLon,
  };
}

/**
 * Les DOM tiennent sur trois chiffres. La Corse s'ecrit 2A / 2B ailleurs, mais
 * son code postal dit 20 : on garde la forme postale, seule presente ici.
 */
function departementDepuisCodePostal(codePostal: string): string {
  const propre = codePostal.trim();

  return propre.startsWith('97') || propre.startsWith('98')
    ? propre.slice(0, 3)
    : propre.slice(0, 2);
}
