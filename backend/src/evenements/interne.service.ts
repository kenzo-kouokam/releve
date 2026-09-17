import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MissionNonPourvue,
  MissionsNonPourvuesQuery,
  RelanceCreate,
  RelanceEnregistree,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EvenementsService } from './evenements.service';

/** Etats dans lesquels une mission cherche encore quelqu'un. */
const ETATS_OUVERTS = [
  'PUBLIEE',
  'EN_MATCHING',
  'PROPOSEE',
] as const satisfies readonly Prisma.MissionWhereInput['statut'][];

/**
 * Les mouvements qui remettent le compteur d'attente à zéro.
 *
 * Publier ouvre la mission ; relancer et escalader sont des actions qui
 * viennent d'être faites. Dans les trois cas, l'attente repart de là — sans
 * quoi une mission relancée il y a une minute ressortirait immédiatement comme
 * à relancer, et le workflow tournerait en boucle.
 */
const MOUVEMENTS_DATANTS = ['mission.publiee', 'mission.relancee', 'mission.escaladee'];

const MINUTE_MS = 60_000;

/**
 * Ce que les automatisations ont le droit de demander à la plateforme.
 *
 * Aucune de ces méthodes ne porte de cloisonnement par agence, et c'est
 * délibéré : l'appelant n'est pas un utilisateur, il n'appartient à aucune
 * agence, et il traite le parc entier. La contrepartie est qu'aucune ne rend de
 * donnée personnelle — la même règle que pour les événements émis.
 */
@Injectable()
export class InterneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evenements: EvenementsService,
  ) {}

  /**
   * Les missions ouvertes qui attendent depuis trop longtemps.
   *
   * Le seuil se mesure depuis le dernier mouvement — publication ou relance —
   * et non depuis la création : une mission relancée trois fois n'est pas « en
   * attente depuis sa publication », elle est en attente depuis la dernière
   * relance. C'est cette date qui décide, et c'est elle qui est rendue.
   */
  async missionsNonPourvues(query: MissionsNonPourvuesQuery): Promise<MissionNonPourvue[]> {
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const missions = await this.prisma.mission.findMany({
      where: {
        statut: { in: [...ETATS_OUVERTS] },
        candidatRetenuId: null,
        // Une vacation dont la date de début est passée ne se relance plus :
        // il est trop tard pour la pourvoir, la relancer ne ferait que du bruit.
        dateDebut: { gte: aujourdHui },
      },
      select: {
        id: true,
        reference: true,
        createdAt: true,
        dateDebut: true,
        dateFin: true,
        heureDebut: true,
        heureFin: true,
        tauxHoraire: true,
        lieu: { select: { ville: true, codePostal: true } },
        qualificationRequise: { select: { code: true } },
        evenements: {
          where: { type: { in: MOUVEMENTS_DATANTS } },
          select: { type: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { propositions: { where: { statut: 'ACCEPTEE_CANDIDAT' } } } },
      },
      orderBy: { dateDebut: 'asc' },
    });

    const maintenant = Date.now();
    const seuilMs = query.seuilMinutes * MINUTE_MS;
    const mures: MissionNonPourvue[] = [];

    for (const mission of missions) {
      // Le journal peut être vide : les missions créées avant la mise en place
      // des événements n'en ont aucun. Leur date de création fait alors foi,
      // sinon elles resteraient invisibles à toute relance.
      const dernier = mission.evenements[0]?.createdAt ?? mission.createdAt;
      const attente = maintenant - dernier.getTime();

      if (attente < seuilMs) {
        continue;
      }

      mures.push({
        mission: this.evenements.decrire(mission),
        candidaturesEnAttente: mission._count.propositions,
        relances: mission.evenements.filter((e) => e.type === 'mission.relancee').length,
        depuisLe: dernier.toISOString(),
        ouverteDepuisMinutes: Math.floor(attente / MINUTE_MS),
      });

      if (mures.length >= query.limite) {
        break;
      }
    }

    return mures;
  }

  /** Enregistre une relance. */
  relancer(missionId: string, donnees: RelanceCreate): Promise<RelanceEnregistree> {
    return this.marquer(missionId, 'mission.relancee', donnees);
  }

  /** Enregistre une escalade — la relance n'a plus rien donné. */
  escalader(missionId: string, donnees: RelanceCreate): Promise<RelanceEnregistree> {
    return this.marquer(missionId, 'mission.escaladee', donnees);
  }

  /**
   * Écrit le mouvement, et le réémet.
   *
   * La réémission peut surprendre — l'automatisation nous appelle, et nous lui
   * répondons par un événement. Elle est voulue : le journal et le flux doivent
   * raconter la même histoire, et un tableau de bord branché sur les seuls
   * événements ne verrait sinon jamais les relances.
   */
  private async marquer(
    missionId: string,
    type: 'mission.relancee' | 'mission.escaladee',
    donnees: RelanceCreate,
  ): Promise<RelanceEnregistree> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { id: true, statut: true, candidatRetenuId: true },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    // Relancer une mission déjà pourvue enverrait un message qui contredit
    // l'état réel. Le cas arrive : le workflow lit une liste, l'établissement
    // valide entre-temps, la relance part quand même.
    if (mission.candidatRetenuId || !(ETATS_OUVERTS as readonly string[]).includes(mission.statut)) {
      throw new ForbiddenException("Cette mission n'est plus ouverte : elle ne se relance pas");
    }

    await this.evenements.consigner({
      missionId,
      type,
      ...(donnees.motif ? { donnees: { motif: donnees.motif } } : {}),
    });

    const relances = await this.prisma.evenementMission.count({
      where: { missionId, type: 'mission.relancee' },
    });

    return {
      missionId,
      type,
      relances,
      enregistreeLe: new Date().toISOString(),
    };
  }
}
