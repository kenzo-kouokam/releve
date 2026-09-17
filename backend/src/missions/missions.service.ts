import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MissionCreate,
  MissionDetail,
  MissionListQuery,
  MissionResume,
  MissionUpdate,
  OptionsPublication,
  PageResultat,
  PrerequisMission,
  ResumeMissions,
  UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { dansLeRayon, distanceKm } from '../matching/score';
import { GeocodageService } from '../geocodage/geocodage.service';
import { EvenementsService } from '../evenements/evenements.service';

/** Etats dans lesquels une mission cherche encore quelqu'un. */
const ETATS_OUVERTS = [
  'PUBLIEE',
  'EN_MATCHING',
  'PROPOSEE',
] as const satisfies readonly Prisma.MissionWhereInput['statut'][];

/** Etats ou la mission est pourvue et engage l'agence. */
const ETATS_ENGAGES = ['VALIDEE', 'CONTRACTUALISEE', 'EN_COURS'] as const;

const avecRelations = Prisma.validator<Prisma.MissionDefaultArgs>()({
  include: {
    client: { select: { id: true, raisonSociale: true } },
    lieu: {
      select: {
        id: true,
        libelle: true,
        ville: true,
        codePostal: true,
        adresse: true,
        consignes: true,
        latitude: true,
        longitude: true,
      },
    },
    qualificationRequise: { select: { id: true, code: true, libelle: true } },
    _count: { select: { propositions: { where: { statut: 'ACCEPTEE_CANDIDAT' } } } },
  },
});

type MissionChargee = Prisma.MissionGetPayload<typeof avecRelations>;

/** Position et rayon du candidat connecte, lus une fois pour toute une liste. */
interface PointCandidat {
  latitude: number | null;
  longitude: number | null;
  rayonKm: number;
}

/**
 * Ce que la session a le droit de voir.
 *
 * Le calcul est fait une fois ici plutot que repete dans chaque methode : c'est
 * la seule facon de garantir qu'aucune route n'oublie le cloisonnement. Un
 * client ne voit que ses missions, un candidat que celles de son agence qui
 * sont publiees, et l'agence tout ce qui lui appartient.
 */
async function porteeLecture(
  session: UtilisateurSession,
  prisma: PrismaService,
): Promise<Prisma.MissionWhereInput> {
  if (session.agenceId) {
    return { agenceId: session.agenceId };
  }

  if (session.clientId) {
    return { clientId: session.clientId };
  }

  if (session.candidatId) {
    // Le jeton d'un candidat ne porte pas d'agence : il faut la lire. Sans ce
    // filtre, le tableau des missions montrerait celles de toutes les agences
    // du deploiement, ce qui casserait l'invariant de cloisonnement.
    const candidat = await prisma.candidat.findUnique({
      where: { id: session.candidatId },
      select: { agenceId: true },
    });

    if (!candidat) {
      throw new ForbiddenException('Fiche candidat introuvable');
    }

    // Il voit le tableau des missions ouvertes de son agence, plus celles qui
    // le concernent personnellement : celles ou il a postule, et celle qu'il a
    // decrochee. Sinon sa page de suivi se viderait des qu'une mission quitte
    // l'etat PUBLIEE.
    return {
      agenceId: candidat.agenceId,
      OR: [
        { statut: { in: [...ETATS_OUVERTS] } },
        { propositions: { some: { candidatId: session.candidatId } } },
        { candidatRetenuId: session.candidatId },
      ],
    };
  }

  throw new ForbiddenException('Ce compte ne peut consulter aucune mission');
}

function enMinutes(heure: string): number {
  const [h, m] = heure.split(':');

  return Number(h) * 60 + Number(m);
}

/**
 * Duree d'une vacation en heures.
 *
 * Une fin anterieure au debut traverse minuit : c'est le cas normal du travail
 * de nuit. Sans ce rattrapage, une vacation 20:00-07:00 durerait -13 heures.
 */
export function dureeHeures(heureDebut: string, heureFin: string): number {
  const debut = enMinutes(heureDebut);
  const fin = enMinutes(heureFin);
  const minutes = fin > debut ? fin - debut : fin + 24 * 60 - debut;

  return Math.round((minutes / 60) * 100) / 100;
}

/** Une vacation qui franchit minuit est du travail de nuit. */
function franchitMinuit(heureDebut: string, heureFin: string): boolean {
  return enMinutes(heureFin) <= enMinutes(heureDebut);
}

function jourIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodage: GeocodageService,
    private readonly evenements: EvenementsService,
  ) {}

  private resume(mission: MissionChargee, depuis?: PointCandidat): MissionResume {
    const distance = depuis
      ? distanceKm(depuis.latitude, depuis.longitude, mission.lieu.latitude, mission.lieu.longitude)
      : null;

    return {
      id: mission.id,
      reference: mission.reference,
      statut: mission.statut,
      client: mission.client,
      lieu: {
        id: mission.lieu.id,
        libelle: mission.lieu.libelle,
        ville: mission.lieu.ville,
        codePostal: mission.lieu.codePostal,
      },
      qualificationRequise: mission.qualificationRequise,
      dateDebut: jourIso(mission.dateDebut),
      dateFin: jourIso(mission.dateFin),
      heureDebut: mission.heureDebut,
      heureFin: mission.heureFin,
      dureeHeures: dureeHeures(mission.heureDebut, mission.heureFin),
      travailNuit: mission.travailNuit,
      tauxHoraire: mission.tauxHoraire ? Number(mission.tauxHoraire) : null,
      motifRecours: mission.motifRecours,
      candidaturesEnAttente: mission._count.propositions,
      candidatRetenuId: mission.candidatRetenuId,
      distanceKm: distance,
      // La mission reste visible au-dela du rayon, et le dit. La masquer
      // priverait la personne de l'information qui lui permettrait d'agir :
      // elargir son rayon de cinq kilometres lui ouvrirait peut-etre dix
      // missions, et une liste vide ressemble a une panne.
      horsRayon: depuis === undefined ? null : dansLeRayon(distance, depuis.rayonKm) === false,
    };
  }

  /**
   * Position du candidat connecte, lue une fois pour toute une liste.
   *
   * Une requete par mission couterait autant d'allers-retours que de cartes
   * affichees, pour une donnee qui ne change pas d'une ligne a l'autre.
   */
  private async positionCandidat(session: UtilisateurSession): Promise<PointCandidat | undefined> {
    if (!session.candidatId) {
      return undefined;
    }

    const fiche = await this.prisma.candidat.findUnique({
      where: { id: session.candidatId },
      select: { latitude: true, longitude: true, rayonKm: true },
    });

    return fiche ?? undefined;
  }

  /**
   * Prerequis affiches au candidat.
   *
   * Le diplome est le seul prerequis verifiable en base aujourd'hui, et il l'est
   * vraiment : une qualification expiree ou non verifiee par l'agence ne compte
   * pas. Les autres lignes sont annoncees comme non verifiees plutot que
   * cochees a tort.
   */
  private async prerequis(
    mission: MissionChargee,
    candidatId: string | null,
  ): Promise<PrerequisMission[]> {
    const libelleDiplome = `Diplome requis : ${mission.qualificationRequise.code}`;

    if (!candidatId) {
      return [{ libelle: libelleDiplome, verifie: false }];
    }

    const [detient, candidat] = await Promise.all([
      this.detientQualification(candidatId, mission.qualificationRequiseId),
      this.prisma.candidat.findUnique({
        where: { id: candidatId },
        select: { statut: true },
      }),
    ]);

    return [
      { libelle: libelleDiplome, verifie: detient },
      { libelle: 'Profil valide par l agence', verifie: candidat?.statut === 'ACTIF' },
    ];
  }

  async detientQualification(candidatId: string, qualificationId: string): Promise<boolean> {
    const maintenant = new Date();

    const lien = await this.prisma.qualificationCandidat.findUnique({
      where: { candidatId_qualificationId: { candidatId, qualificationId } },
      select: { verifieeLe: true, expireLe: true },
    });

    if (!lien?.verifieeLe) {
      return false;
    }

    return !lien.expireLe || lien.expireLe > maintenant;
  }

  /**
   * Options du formulaire de depot, bornees a la session.
   *
   * Le client recoit ses lieux a lui ; le back-office doit preciser pour quel
   * client il publie, sinon la liste n'aurait pas de sens.
   */
  async optionsPublication(
    session: UtilisateurSession,
    clientId?: string,
  ): Promise<OptionsPublication> {
    const cible = session.clientId ?? clientId;

    if (!cible) {
      throw new BadRequestException('Preciser le client pour lequel publier');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: cible, ...(session.agenceId ? { agenceId: session.agenceId } : {}) },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    const [lieux, qualifications] = await this.prisma.$transaction([
      this.prisma.lieuIntervention.findMany({
        where: { clientId: client.id },
        select: { id: true, libelle: true, ville: true, codePostal: true },
        orderBy: { libelle: 'asc' },
      }),
      this.prisma.qualification.findMany({
        select: { id: true, code: true, libelle: true, romeCode: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    return { lieux, qualifications };
  }

  async lister(
    query: MissionListQuery,
    session: UtilisateurSession,
  ): Promise<PageResultat<MissionResume>> {
    const where: Prisma.MissionWhereInput = {
      AND: [
        await porteeLecture(session, this.prisma),
        ...(query.statut ? [{ statut: query.statut }] : []),
        ...(query.depuis ? [{ dateDebut: { gte: new Date(query.depuis) } }] : []),
        ...(query.jusqua ? [{ dateDebut: { lte: new Date(query.jusqua) } }] : []),
        ...(query.recherche
          ? [
              {
                OR: [
                  { reference: { contains: query.recherche, mode: 'insensitive' as const } },
                  {
                    client: {
                      raisonSociale: { contains: query.recherche, mode: 'insensitive' as const },
                    },
                  },
                  { lieu: { ville: { contains: query.recherche, mode: 'insensitive' as const } } },
                  {
                    lieu: { libelle: { contains: query.recherche, mode: 'insensitive' as const } },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const [total, missions] = await this.prisma.$transaction([
      this.prisma.mission.count({ where }),
      this.prisma.mission.findMany({
        where,
        ...avecRelations,
        orderBy: [{ dateDebut: 'asc' }, { heureDebut: 'asc' }],
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    const depuis = await this.positionCandidat(session);

    return {
      donnees: missions.map((mission) => this.resume(mission, depuis)),
      total,
      page: query.page,
      limite: query.limite,
    };
  }

  async detail(id: string, session: UtilisateurSession): Promise<MissionDetail> {
    const mission = await this.prisma.mission.findFirst({
      where: { AND: [{ id }, await porteeLecture(session, this.prisma)] },
      ...avecRelations,
    });

    if (!mission) {
      // 404 plutot que 403 : un identifiant hors perimetre ne doit pas revenir
      // « existe mais interdit », sinon la liste des missions se devine.
      throw new NotFoundException('Mission introuvable');
    }

    const candidatId = session.candidatId ?? null;

    const dejaPostule = candidatId
      ? (await this.prisma.proposition.count({ where: { missionId: id, candidatId } })) > 0
      : false;

    // Les consignes d'acces ne concernent que ceux qui doivent entrer : le
    // personnel de l'agence, le client, et le candidat retenu. Un candidat qui
    // consulte l'annonce n'a pas a lire le code de la porte.
    const peutVoirConsignes =
      !!session.agenceId ||
      !!session.clientId ||
      (candidatId !== null && mission.candidatRetenuId === candidatId);

    return {
      ...this.resume(mission, await this.positionCandidat(session)),
      description: mission.description,
      coefficient: mission.coefficient ? Number(mission.coefficient) : null,
      adresse: `${mission.lieu.adresse}, ${mission.lieu.codePostal} ${mission.lieu.ville}`,
      consignes: peutVoirConsignes ? mission.lieu.consignes : null,
      prerequis: await this.prerequis(mission, candidatId),
      dejaPostule,
    };
  }

  /**
   * Reference lisible, unique par annee : M-2026-0001.
   *
   * Elle est calculee dans la transaction de creation pour que deux missions
   * creees en meme temps ne se disputent pas le meme numero.
   */
  private async referenceSuivante(tx: Prisma.TransactionClient): Promise<string> {
    const annee = new Date().getFullYear();
    const prefixe = `M-${annee}-`;

    const derniere = await tx.mission.findFirst({
      where: { reference: { startsWith: prefixe } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const rang = derniere ? Number(derniere.reference.slice(prefixe.length)) + 1 : 1;

    return `${prefixe}${String(rang).padStart(4, '0')}`;
  }

  /**
   * Un lieu sans coordonnées ne peut pas porter de mission.
   *
   * La distance devient alors non mesurable **pour tout le monde** : la porte
   * d'éligibilité écarte le vivier entier avec le motif « coordonnées
   * manquantes », et l'établissement contemple un classement vide sans
   * comprendre pourquoi. Pire depuis que la candidature traverse la même
   * porte : le candidat se voit refuser pour une erreur qui n'est pas la
   * sienne.
   *
   * Refuser à la publication traite la cause au lieu du symptôme, et le fait au
   * seul moment où quelqu'un peut encore corriger.
   *
   * Une tentative de géocodage précède le refus : si la BAN était indisponible
   * quand le lieu a été saisi, l'adresse est parfaitement bonne et il serait
   * absurde de bloquer un besoin urgent pour une panne réseau passée.
   */
  private async exigerLieuLocalise(lieu: {
    id: string;
    latitude: number | null;
    longitude: number | null;
    adresse: string;
    codePostal: string;
    ville: string;
  }): Promise<void> {
    if (lieu.latitude !== null && lieu.longitude !== null) {
      return;
    }

    const point = await this.geocodage.situer('lieu_intervention', lieu.id, lieu);

    if (point) {
      return;
    }

    // Les lieux se corrigent depuis le back-office, pas depuis l'espace client :
    // le message dit donc vers qui se tourner, sinon l'établissement resterait
    // devant un refus qu'il n'a aucun moyen de lever.
    throw new BadRequestException(
      `L adresse du lieu d intervention n a pas pu etre localisee (${lieu.adresse}, ` +
        `${lieu.codePostal} ${lieu.ville}). Sans coordonnees, aucun candidat ne peut etre ` +
        `classe sur cette mission : faire corriger l adresse par l agence avant de publier.`,
    );
  }

  async creer(donnees: MissionCreate, session: UtilisateurSession): Promise<MissionResume> {
    // Un client publie toujours pour lui-meme : son identifiant vient du jeton,
    // jamais du corps de la requete, sinon il publierait chez un concurrent.
    const clientId = session.clientId ?? donnees.clientId;

    if (!clientId) {
      throw new BadRequestException('Le client de la mission est obligatoire');
    }

    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        ...(session.agenceId ? { agenceId: session.agenceId } : {}),
      },
      select: { id: true, agenceId: true, actif: true },
    });

    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    if (!client.actif) {
      throw new ForbiddenException(
        "Ce client n'est pas encore valide par l'agence : il ne peut pas deposer de besoin",
      );
    }

    const lieu = await this.prisma.lieuIntervention.findFirst({
      where: { id: donnees.lieuId, clientId: client.id },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        adresse: true,
        codePostal: true,
        ville: true,
      },
    });

    if (!lieu) {
      throw new NotFoundException('Lieu introuvable pour ce client');
    }

    await this.exigerLieuLocalise(lieu);

    const qualification = await this.prisma.qualification.findUnique({
      where: { id: donnees.qualificationRequiseId },
      select: { id: true },
    });

    if (!qualification) {
      throw new NotFoundException('Qualification introuvable');
    }

    const mission = await this.prisma.$transaction(async (tx) => {
      const reference = await this.referenceSuivante(tx);

      return tx.mission.create({
        data: {
          reference,
          agenceId: client.agenceId,
          clientId: client.id,
          lieuId: donnees.lieuId,
          qualificationRequiseId: donnees.qualificationRequiseId,
          // Une mission deposee par un client est publiee d'emblee : la faire
          // naitre en brouillon obligerait l'agence a la republier a la main,
          // alors que le besoin est urgent par nature.
          statut: 'PUBLIEE',
          dateDebut: new Date(donnees.dateDebut),
          dateFin: new Date(donnees.dateFin),
          heureDebut: donnees.heureDebut,
          heureFin: donnees.heureFin,
          travailNuit: franchitMinuit(donnees.heureDebut, donnees.heureFin),
          motifRecours: donnees.motifRecours,
          description: donnees.description ?? null,
          tauxHoraire: donnees.tauxHoraire ?? null,
          coefficient: donnees.coefficient ?? null,
        },
        ...avecRelations,
      });
    });

    // Apres la transaction, jamais dedans : un evenement emis depuis une
    // transaction annulee annoncerait une mission qui n'existe pas.
    await this.evenements.consigner({
      missionId: mission.id,
      type: 'mission.publiee',
      auteur: session,
    });

    return this.resume(mission);
  }

  async modifier(
    id: string,
    donnees: MissionUpdate,
    session: UtilisateurSession,
  ): Promise<MissionResume> {
    const existante = await this.prisma.mission.findFirst({
      where: { AND: [{ id }, await porteeLecture(session, this.prisma)] },
      select: { id: true, statut: true, clientId: true },
    });

    if (!existante) {
      throw new NotFoundException('Mission introuvable');
    }

    if ((ETATS_ENGAGES as readonly string[]).includes(existante.statut)) {
      throw new ForbiddenException(
        'Cette mission est pourvue : elle ne se modifie plus, elle s annule',
      );
    }

    const heureDebut = donnees.heureDebut;
    const heureFin = donnees.heureFin;

    const mission = await this.prisma.mission.update({
      where: { id },
      data: {
        ...(donnees.lieuId ? { lieuId: donnees.lieuId } : {}),
        ...(donnees.qualificationRequiseId
          ? { qualificationRequiseId: donnees.qualificationRequiseId }
          : {}),
        ...(donnees.dateDebut ? { dateDebut: new Date(donnees.dateDebut) } : {}),
        ...(donnees.dateFin ? { dateFin: new Date(donnees.dateFin) } : {}),
        ...(heureDebut ? { heureDebut } : {}),
        ...(heureFin ? { heureFin } : {}),
        ...(heureDebut && heureFin ? { travailNuit: franchitMinuit(heureDebut, heureFin) } : {}),
        ...(donnees.motifRecours ? { motifRecours: donnees.motifRecours } : {}),
        ...(donnees.description === undefined ? {} : { description: donnees.description }),
        ...(donnees.tauxHoraire === undefined ? {} : { tauxHoraire: donnees.tauxHoraire }),
        ...(donnees.coefficient === undefined ? {} : { coefficient: donnees.coefficient }),
      },
      ...avecRelations,
    });

    return this.resume(mission);
  }

  async annuler(id: string, session: UtilisateurSession): Promise<MissionResume> {
    const existante = await this.prisma.mission.findFirst({
      where: { AND: [{ id }, await porteeLecture(session, this.prisma)] },
      select: { id: true, statut: true },
    });

    if (!existante) {
      throw new NotFoundException('Mission introuvable');
    }

    if (existante.statut === 'TERMINEE') {
      throw new ForbiddenException('Une mission terminee ne s annule pas');
    }

    const [mission] = await this.prisma.$transaction([
      this.prisma.mission.update({
        where: { id },
        data: { statut: 'ANNULEE', candidatRetenuId: null },
        ...avecRelations,
      }),
      // Les candidatures encore en attente deviennent caduques : les laisser
      // ouvertes ferait attendre des candidats pour rien.
      this.prisma.proposition.updateMany({
        where: { missionId: id, statut: { in: ['ENVOYEE', 'ACCEPTEE_CANDIDAT'] } },
        data: { statut: 'EXPIREE', repondueLe: new Date() },
      }),
    ]);

    await this.evenements.consigner({
      missionId: id,
      type: 'mission.annulee',
      auteur: session,
    });

    return this.resume(mission);
  }

  /**
   * Compteurs du tableau de bord.
   *
   * Trois agregats en une transaction plutot que trois allers-retours : la page
   * d'accueil de l'etablissement les affiche tous ensemble.
   */
  async resumeChiffre(session: UtilisateurSession): Promise<ResumeMissions> {
    const portee = await porteeLecture(session, this.prisma);

    const [actives, candidaturesRecues, aConfirmer] = await this.prisma.$transaction([
      this.prisma.mission.count({
        where: { AND: [portee, { statut: { in: [...ETATS_OUVERTS, ...ETATS_ENGAGES] } }] },
      }),
      this.prisma.proposition.count({
        where: { mission: portee, statut: { in: ['ENVOYEE', 'ACCEPTEE_CANDIDAT'] } },
      }),
      this.prisma.mission.count({
        where: {
          AND: [portee, { statut: { in: [...ETATS_OUVERTS] } }],
          propositions: { some: { statut: 'ACCEPTEE_CANDIDAT' } },
        },
      }),
    ]);

    return { actives, candidaturesRecues, aConfirmer };
  }
}
