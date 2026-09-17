import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CandidatPropose,
  PageResultat,
  PointFortCandidat,
  PropositionListQuery,
  PropositionResume,
  PropositionsAgenceCreate,
  ScoreDetail,
  UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { dureeHeures, MissionsService } from '../missions/missions.service';
import { EvenementsService } from '../evenements/evenements.service';

/** Etats dans lesquels une mission accepte encore des candidatures. */
const ETATS_OUVERTS = ['PUBLIEE', 'EN_MATCHING', 'PROPOSEE'] as const;

const avecRelations = Prisma.validator<Prisma.PropositionDefaultArgs>()({
  include: {
    candidat: {
      select: {
        id: true,
        nom: true,
        prenom: true,
        statut: true,
        rayonKm: true,
        permisB: true,
        vehicule: true,
        visiteMedicaleLe: true,
        qualifications: {
          where: { verifieeLe: { not: null } },
          select: {
            obtenueLe: true,
            qualification: { select: { id: true, code: true, libelle: true } },
          },
        },
        _count: { select: { missions: true } },
      },
    },
    mission: {
      include: {
        client: { select: { id: true, raisonSociale: true } },
        lieu: { select: { id: true, libelle: true, ville: true, codePostal: true } },
        qualificationRequise: { select: { id: true, code: true, libelle: true } },
        _count: { select: { propositions: { where: { statut: 'ACCEPTEE_CANDIDAT' } } } },
      },
    },
  },
});

type PropositionChargee = Prisma.PropositionGetPayload<typeof avecRelations>;

/**
 * Ce que la session a le droit de voir.
 *
 * Le candidat ne voit que ses propres candidatures, le client celles deposees
 * sur ses missions, l'agence toutes celles de son perimetre. Aucune route ne
 * recalcule cette regle de son cote.
 */
function porteeLecture(session: UtilisateurSession): Prisma.PropositionWhereInput {
  if (session.agenceId) {
    return { mission: { agenceId: session.agenceId } };
  }

  if (session.clientId) {
    return { mission: { clientId: session.clientId } };
  }

  if (session.candidatId) {
    // Pas de filtre d'agence a ajouter ici : une candidature appartient a son
    // candidat, et il ne peut avoir postule qu'a des missions de son agence.
    return { candidatId: session.candidatId };
  }

  throw new ForbiddenException('Ce compte ne peut consulter aucune candidature');
}

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

function anneesDepuis(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000)));
}

function jourIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class PropositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly missions: MissionsService,
    private readonly matching: MatchingService,
    private readonly evenements: EvenementsService,
  ) {}

  /**
   * Profil du candidat tel que l'etablissement le lit.
   *
   * Tout ce qui est affiche vient de la base : nombre de missions realisees,
   * anciennete du diplome, rayon de deplacement. Aucune note ni evaluation
   * n'est inventee - le modele n'en porte pas, et une etoile fictive sur un
   * profil de soignant serait trompeuse.
   */
  private profil(candidat: PropositionChargee['candidat'], codeRequis: string): CandidatPropose {
    const pertinente =
      candidat.qualifications.find((lien) => lien.qualification.code === codeRequis) ??
      candidat.qualifications[0];

    const pointsForts: PointFortCandidat[] = [];

    if (pertinente?.obtenueLe) {
      const annees = anneesDepuis(pertinente.obtenueLe);

      pointsForts.push({
        icone: 'briefcase',
        libelle: 'Diplome',
        valeur:
          annees > 0
            ? `${pertinente.qualification.code} depuis ${annees} an${annees > 1 ? 's' : ''}`
            : `${pertinente.qualification.code}, obtenu cette annee`,
      });
    }

    pointsForts.push({
      icone: 'star',
      libelle: 'Missions realisees',
      valeur: `${candidat._count.missions} avec l agence`,
    });

    pointsForts.push({
      icone: 'map-pin',
      libelle: 'Mobilite',
      valeur: candidat.vehicule
        ? `Rayon de ${candidat.rayonKm} km, vehicule`
        : `Rayon de ${candidat.rayonKm} km`,
    });

    const etiquettes: string[] = [];

    if (candidat.statut === 'ACTIF') etiquettes.push('Profil valide');
    if (candidat.permisB) etiquettes.push('Permis B');
    if (candidat.visiteMedicaleLe) etiquettes.push('Visite medicale a jour');

    return {
      id: candidat.id,
      nom: candidat.nom,
      prenom: candidat.prenom,
      initiales: initiales(candidat.prenom, candidat.nom),
      qualification: pertinente?.qualification.libelle ?? null,
      etiquettes,
      pointsForts,
    };
  }

  private resume(proposition: PropositionChargee): PropositionResume {
    const { mission } = proposition;

    return {
      id: proposition.id,
      statut: proposition.statut,
      envoyeeLe: proposition.envoyeeLe.toISOString(),
      repondueLe: proposition.repondueLe?.toISOString() ?? null,
      motifRefus: proposition.motifRefus,
      message: proposition.message,
      score: proposition.score ? Number(proposition.score) : null,
      detailScore: (proposition.detailScore as ScoreDetail | null) ?? null,
      candidat: this.profil(proposition.candidat, mission.qualificationRequise.code),
      mission: {
        id: mission.id,
        reference: mission.reference,
        statut: mission.statut,
        client: mission.client,
        lieu: mission.lieu,
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
        // La distance n'a de sens que depuis une fiche candidat donnee : sur
        // une candidature, c'est le score qui porte deja cette information. Le
        // rayon suit la meme logique — et de toute facon, une candidature hors
        // rayon ne peut plus exister : la porte la refuse a la creation.
        distanceKm: null,
        horsRayon: null,
      },
    };
  }

  /**
   * Candidature spontanee : le candidat postule depuis le tableau des missions.
   *
   * La ligne nait ACCEPTEE_CANDIDAT et non ENVOYEE : en cliquant, l'interesse a
   * deja donne son accord. Il ne reste que la decision du client.
   */
  async postuler(
    missionId: string,
    candidatId: string,
    message: string | undefined,
  ): Promise<PropositionResume> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        statut: true,
        qualificationRequiseId: true,
        qualificationRequise: { select: { code: true } },
      },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (!(ETATS_OUVERTS as readonly string[]).includes(mission.statut)) {
      throw new ForbiddenException("Cette mission n'accepte plus de candidature");
    }

    const candidat = await this.prisma.candidat.findUnique({
      where: { id: candidatId },
      select: { id: true, statut: true },
    });

    if (!candidat) {
      throw new NotFoundException('Candidat introuvable');
    }

    // Porte d'eligibilite binaire. Elle refuse avec un motif lisible plutot que
    // de faire disparaitre la mission de la liste : un candidat doit pouvoir
    // comprendre ce qui lui manque.
    if (candidat.statut !== 'ACTIF') {
      throw new ForbiddenException(
        "Votre profil doit etre valide par l'agence avant de pouvoir postuler",
      );
    }

    const detient = await this.missions.detientQualification(
      candidatId,
      mission.qualificationRequiseId,
    );

    if (!detient) {
      throw new ForbiddenException(
        `Cette mission exige le diplome ${mission.qualificationRequise.code}, verifie et non expire`,
      );
    }

    // La meme porte que celle du classement de l'agence, et c'est tout l'objet
    // de cet appel. Elle ne verifiait ici que le statut et le diplome : une
    // intervenante hors de son rayon, absente sur la periode ou deja engagee
    // ailleurs pouvait postuler, obtenir un score, apparaitre chez
    // l'etablissement — et rester introuvable dans le classement de l'agence,
    // qui l'ecartait. Trois ecrans, trois verites.
    const evaluation = await this.matching.evaluer(missionId, candidatId);

    if (!evaluation) {
      throw new NotFoundException('Mission introuvable');
    }

    if (evaluation.motifs.length) {
      // Le libelle du motif est repris tel quel : il est deja ecrit pour etre
      // lu par la personne concernee, et il chiffre l'ecart plutot que de dire
      // « non ». « A 42 km, au-dela du rayon de 15 km » se corrige tout seul.
      throw new ForbiddenException(evaluation.motifs.map((motif) => motif.libelle).join(' · '));
    }

    // Le score est fige au moment de la candidature. Le recalculer a
    // l'affichage le ferait bouger apres coup - parce que le candidat a deplace
    // une disponibilite - et rendrait la decision de l'etablissement
    // incomprehensible a posteriori.
    const score = evaluation.score;

    try {
      const proposition = await this.prisma.proposition.create({
        data: {
          missionId,
          candidatId,
          statut: 'ACCEPTEE_CANDIDAT',
          repondueLe: new Date(),
          message: message ?? null,
          score: score.total,
          detailScore: score as unknown as Prisma.InputJsonValue,
        },
        ...avecRelations,
      });

      await this.evenements.consigner({
        missionId,
        type: 'proposition.acceptee',
        propositionIds: [proposition.id],
      });

      return this.resume(proposition);
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw new ConflictException('Vous avez deja postule a cette mission');
      }

      throw cause;
    }
  }

  /**
   * L'agence propose des candidats, depuis le classement d'une mission.
   *
   * L'autre sens de circulation, et le seul qui manquait. La ligne nait
   * ENVOYEE : personne n'a encore dit oui. C'est la difference avec la
   * candidature spontanee, ou l'interesse a deja donne son accord en cliquant.
   *
   * La meme porte d'eligibilite que partout ailleurs, et elle refuse l'envoi
   * entier plutot que d'ecarter en silence. Un chargé de recrutement qui
   * selectionne trois profils et n'en voit partir que deux ne saurait pas
   * lequel manque, ni pourquoi : mieux vaut nommer le candidat et le motif, et
   * le laisser recommencer sans lui.
   *
   * Un seul evenement pour tout l'envoi, et non un par ligne : il s'est passe
   * une chose — l'agence a propose — et ceux qui ecoutent doivent en voir une.
   */
  async proposer(
    missionId: string,
    donnees: PropositionsAgenceCreate,
    session: UtilisateurSession,
  ): Promise<PropositionResume[]> {
    const mission = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        ...(session.agenceId ? { agenceId: session.agenceId } : {}),
      },
      select: { id: true, statut: true, agenceId: true },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (!(ETATS_OUVERTS as readonly string[]).includes(mission.statut)) {
      throw new ForbiddenException("Cette mission n'accepte plus de candidature");
    }

    // La meme personne citee deux fois dans la liste ne doit produire qu'une
    // ligne — et surtout pas une violation d'unicite au milieu de la boucle.
    const demandes = [...new Set(donnees.candidatIds)];

    const existantes = await this.prisma.proposition.findMany({
      where: { missionId, candidatId: { in: demandes } },
      select: { candidatId: true },
    });

    const dejaProposes = new Set(existantes.map((ligne) => ligne.candidatId));
    const aCreer: { candidatId: string; score: ScoreDetail }[] = [];

    for (const candidatId of demandes) {
      if (dejaProposes.has(candidatId)) {
        continue;
      }

      // Le vivier est borne a l'agence de la mission, comme dans le classement :
      // sans ce controle, un identifiant devine ouvrirait le vivier voisin.
      const candidat = await this.prisma.candidat.findFirst({
        where: { id: candidatId, agenceId: mission.agenceId },
        select: { id: true, nom: true, prenom: true },
      });

      if (!candidat) {
        throw new NotFoundException(`Candidat introuvable dans le vivier de l agence`);
      }

      const evaluation = await this.matching.evaluer(missionId, candidatId);

      if (!evaluation) {
        throw new NotFoundException('Mission introuvable');
      }

      if (evaluation.motifs.length) {
        throw new BadRequestException(
          `${candidat.prenom} ${candidat.nom} : ` +
            evaluation.motifs.map((motif) => motif.libelle).join(' · '),
        );
      }

      aCreer.push({ candidatId, score: evaluation.score });
    }

    if (!aCreer.length) {
      return [];
    }

    const creees = await this.prisma.$transaction(
      aCreer.map((ligne) =>
        this.prisma.proposition.create({
          data: {
            missionId,
            candidatId: ligne.candidatId,
            statut: 'ENVOYEE',
            message: donnees.message ?? null,
            score: ligne.score.total,
            detailScore: ligne.score as unknown as Prisma.InputJsonValue,
          },
          ...avecRelations,
        }),
      ),
    );

    await this.evenements.consigner({
      missionId,
      type: 'proposition.envoyee',
      auteur: session,
      propositionIds: creees.map((proposition) => proposition.id),
    });

    return creees.map((proposition) => this.resume(proposition));
  }

  async lister(
    query: PropositionListQuery,
    session: UtilisateurSession,
  ): Promise<PageResultat<PropositionResume>> {
    const where: Prisma.PropositionWhereInput = {
      AND: [
        porteeLecture(session),
        ...(query.statut ? [{ statut: query.statut }] : []),
        ...(query.missionId ? [{ missionId: query.missionId }] : []),
      ],
    };

    const [total, propositions] = await this.prisma.$transaction([
      this.prisma.proposition.count({ where }),
      this.prisma.proposition.findMany({
        where,
        ...avecRelations,
        orderBy: { envoyeeLe: 'desc' },
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    return {
      donnees: propositions.map((proposition) => this.resume(proposition)),
      total,
      page: query.page,
      limite: query.limite,
    };
  }

  async detail(id: string, session: UtilisateurSession): Promise<PropositionResume> {
    const proposition = await this.prisma.proposition.findFirst({
      where: { AND: [{ id }, porteeLecture(session)] },
      ...avecRelations,
    });

    if (!proposition) {
      throw new NotFoundException('Candidature introuvable');
    }

    return this.resume(proposition);
  }

  /**
   * Le client retient un candidat.
   *
   * Une mission n'a qu'une place : valider une candidature refuse les autres et
   * pourvoit la mission. Le tout en une transaction, sinon deux validations
   * concurrentes laisseraient deux candidats persuades d'avoir la mission.
   */
  async valider(id: string, session: UtilisateurSession): Promise<PropositionResume> {
    if (session.candidatId) {
      throw new ForbiddenException("La validation appartient a l'etablissement");
    }

    const existante = await this.prisma.proposition.findFirst({
      where: { AND: [{ id }, porteeLecture(session)] },
      select: {
        id: true,
        statut: true,
        candidatId: true,
        missionId: true,
        mission: { select: { statut: true, candidatRetenuId: true } },
      },
    });

    if (!existante) {
      throw new NotFoundException('Candidature introuvable');
    }

    if (existante.mission.candidatRetenuId) {
      throw new ConflictException('Cette mission est deja pourvue');
    }

    if (existante.statut !== 'ACCEPTEE_CANDIDAT') {
      throw new BadRequestException(
        "Seule une candidature acceptee par l'interesse peut etre validee",
      );
    }

    await this.prisma.$transaction([
      this.prisma.proposition.update({
        where: { id },
        data: { statut: 'VALIDEE_CLIENT', repondueLe: new Date() },
      }),
      this.prisma.proposition.updateMany({
        where: {
          missionId: existante.missionId,
          id: { not: id },
          statut: { in: ['ENVOYEE', 'ACCEPTEE_CANDIDAT'] },
        },
        data: {
          statut: 'REFUSEE_CLIENT',
          repondueLe: new Date(),
          motifRefus: 'Mission pourvue par un autre profil',
        },
      }),
      this.prisma.mission.update({
        where: { id: existante.missionId },
        data: { statut: 'VALIDEE', candidatRetenuId: existante.candidatId },
      }),
    ]);

    // Relecture apres coup, et non le retour de l'update : dans une transaction
    // en tableau, chaque operation lit l'etat au moment ou elle s'execute. La
    // proposition, mise a jour en premier, embarquerait donc une mission encore
    // PUBLIEE alors qu'elle vient d'etre pourvue trois lignes plus bas.
    const proposition = await this.prisma.proposition.findUniqueOrThrow({
      where: { id },
      ...avecRelations,
    });

    await this.evenements.consigner({
      missionId: existante.missionId,
      type: 'mission.pourvue',
      auteur: session,
      propositionIds: [id],
    });

    return this.resume(proposition);
  }

  /**
   * Refus. Le sens depend de qui parle : le candidat se retire, le client ecarte.
   */
  async refuser(
    id: string,
    motif: string | undefined,
    session: UtilisateurSession,
  ): Promise<PropositionResume> {
    const existante = await this.prisma.proposition.findFirst({
      where: { AND: [{ id }, porteeLecture(session)] },
      select: { id: true, statut: true, missionId: true, candidatId: true },
    });

    if (!existante) {
      throw new NotFoundException('Candidature introuvable');
    }

    if (existante.statut === 'VALIDEE_CLIENT') {
      throw new ForbiddenException(
        'Cette candidature est validee : il faut annuler la mission pour revenir dessus',
      );
    }

    const proposition = await this.prisma.proposition.update({
      where: { id },
      data: {
        statut: session.candidatId ? 'REFUSEE_CANDIDAT' : 'REFUSEE_CLIENT',
        repondueLe: new Date(),
        motifRefus: motif ?? null,
      },
      ...avecRelations,
    });

    return this.resume(proposition);
  }

  /**
   * Prochaine mission confirmee du candidat, pour son ecran de suivi.
   *
   * On renvoie null plutot qu'une 404 : « aucune mission a venir » est un etat
   * normal, pas une erreur.
   */
  async courante(candidatId: string): Promise<PropositionResume | null> {
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const proposition = await this.prisma.proposition.findFirst({
      where: {
        candidatId,
        statut: 'VALIDEE_CLIENT',
        mission: {
          statut: { in: ['VALIDEE', 'CONTRACTUALISEE', 'EN_COURS'] },
          dateFin: { gte: aujourdHui },
        },
      },
      ...avecRelations,
      orderBy: { mission: { dateDebut: 'asc' } },
    });

    return proposition ? this.resume(proposition) : null;
  }
}
