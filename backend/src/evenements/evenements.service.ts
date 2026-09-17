import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  SEUIL_URGENCE_HEURES,
  type CandidatVise,
  type EvenementSortant,
  type MissionEvenement,
  type PropositionEvenement,
  type TypeEvenement,
  type UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DestinatairesService } from './destinataires.service';
import { WebhooksService } from './webhooks.service';

/** Ce qu'il faut pour rendre compte d'une transition. */
export interface TransitionAConsigner {
  missionId: string;
  type: TypeEvenement;
  /** Qui a agi. Absent quand c'est l'ordonnanceur : une relance n'a pas d'auteur. */
  auteur?: UtilisateurSession;
  /** Candidatures concernées. Vide pour les événements qui n'en visent aucune. */
  propositionIds?: string[];
  /** Ce qui mérite d'être relu plus tard dans le journal de la mission. */
  donnees?: Prisma.InputJsonValue;

  /**
   * Candidats dont la candidature en cours vient de tomber.
   *
   * Fournis par l'appelant et non recalculés ici : au moment où cette méthode
   * s'exécute, la transaction a déjà refermé ces candidatures, et plus rien ne
   * les distingue de celles refusées la semaine dernière. C'est donc à
   * l'appelant de les relever avant d'écrire.
   */
  candidatsAPrevenirIds?: string[];
}

/**
 * Le point unique par lequel une transition sort de la plateforme.
 *
 * Deux effets, et l'ordre entre eux n'est pas négociable : la transition est
 * d'abord **écrite** dans `EvenementMission`, puis **émise** vers les
 * automatisations. Le journal est la vérité ; l'émission n'en est qu'une copie
 * qui peut se perdre. Inverser reviendrait à annoncer dans Slack une relance
 * dont la plateforme n'aurait aucune trace — et que le calcul du seuil
 * ignorerait, donc qui repartirait en boucle.
 *
 * Ce service est appelé **après** la transaction qui porte la transition, jamais
 * dedans. Un événement émis depuis une transaction annulée décrirait quelque
 * chose qui n'a pas eu lieu.
 */
@Injectable()
export class EvenementsService {
  private readonly logger = new Logger(EvenementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly destinataires: DestinatairesService,
    private readonly config: ConfigService,
  ) {}

  private get siteUrl(): string {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  /**
   * Consigne une transition, puis l'émet.
   *
   * Ne lève jamais. Une transition métier réussie ne doit pas être défaite
   * parce que son compte rendu a échoué : l'appelant a déjà commité, il n'a
   * plus rien à annuler. L'échec est journalisé, et c'est tout ce qu'on peut
   * en faire d'utile ici.
   */
  async consigner(transition: TransitionAConsigner): Promise<void> {
    try {
      const evenement = await this.composer(transition);

      if (!evenement) {
        return;
      }

      await this.prisma.evenementMission.create({
        data: {
          missionId: transition.missionId,
          type: transition.type,
          auteurId: transition.auteur?.id ?? null,
          auteurRole: transition.auteur?.role ?? null,
          donnees: {
            deliveryId: evenement.deliveryId,
            propositions: evenement.propositions.map((p) => p.id),
            ...((transition.donnees as Record<string, unknown> | undefined) ?? {}),
          },
        },
      });

      this.webhooks.emettre(transition.type, evenement);
    } catch (cause) {
      this.logger.error(
        `Transition ${transition.type} non consignee pour la mission ` +
          `${transition.missionId} : ${(cause as Error).message}`,
      );
    }
  }

  /**
   * Assemble la charge utile.
   *
   * Tout ce qui pourrait désigner quelqu'un reste dehors : ni nom de client, ni
   * adresse précise, ni identité de candidat. La commune et le département
   * suffisent à rédiger une alerte, et le lien ramène dans l'application pour
   * le reste — derrière l'authentification, qui elle sait à qui elle parle.
   */
  private async composer(transition: TransitionAConsigner): Promise<EvenementSortant | null> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: transition.missionId },
      select: {
        id: true,
        reference: true,
        dateDebut: true,
        dateFin: true,
        heureDebut: true,
        heureFin: true,
        tauxHoraire: true,
        lieu: { select: { ville: true, codePostal: true } },
        qualificationRequise: { select: { code: true } },
      },
    });

    if (!mission) {
      this.logger.warn(`Mission ${transition.missionId} introuvable : evenement abandonne`);

      return null;
    }

    const propositions = transition.propositionIds?.length
      ? await this.prisma.proposition.findMany({
          where: { id: { in: transition.propositionIds } },
          select: { id: true, candidatId: true, score: true },
        })
      : [];

    // Les candidats éligibles ne se calculent qu'à la publication : c'est le
    // seul moment où la question se pose, et le calcul traverse tout le vivier
    // de l'agence. Le faire à chaque événement coûterait autant pour rien.
    const eligibles =
      transition.type === 'mission.publiee' ? await this.destinataires.eligibles(mission.id) : [];

    const retenu =
      transition.type === 'mission.pourvue' ? await this.destinataires.retenu(mission.id) : null;

    const viser = (candidatId: string): CandidatVise => ({
      candidatRef: this.webhooks.referenceCandidat(candidatId),
    });

    return {
      event: transition.type,
      occurredAt: new Date().toISOString(),
      deliveryId: this.webhooks.nouvelleLivraison(),
      mission: this.decrire(mission),
      propositions: propositions.map(
        (proposition): PropositionEvenement => ({
          id: proposition.id,
          candidatRef: this.webhooks.referenceCandidat(proposition.candidatId),
          score: proposition.score === null ? null : Number(proposition.score),
        }),
      ),
      candidatsEligibles: eligibles.map((candidat) => viser(candidat.id)),
      candidatRetenu: retenu ? viser(retenu.id) : null,
      candidatsAPrevenir: (transition.candidatsAPrevenirIds ?? []).map(viser),
    };
  }

  /** Traduit une mission chargée en bloc `mission` du contrat. */
  decrire(mission: {
    id: string;
    reference: string;
    dateDebut: Date;
    dateFin: Date;
    heureDebut: string;
    heureFin: string;
    tauxHoraire: Prisma.Decimal | null;
    lieu: { ville: string; codePostal: string };
    qualificationRequise: { code: string };
  }): MissionEvenement {
    return {
      id: mission.id,
      reference: mission.reference,
      urgente: estUrgente(mission.dateDebut, mission.heureDebut),
      qualification: mission.qualificationRequise.code,
      commune: mission.lieu.ville,
      departement: mission.lieu.codePostal.slice(0, 2),
      dateDebut: mission.dateDebut.toISOString().slice(0, 10),
      dateFin: mission.dateFin.toISOString().slice(0, 10),
      heureDebut: mission.heureDebut,
      heureFin: mission.heureFin,
      tauxHoraire: mission.tauxHoraire === null ? null : Number(mission.tauxHoraire),
      lienApp: `${this.siteUrl}/missions/${mission.id}`,
    };
  }
}

/**
 * Une vacation est urgente quand elle commence bientôt.
 *
 * L'heure de début compte autant que le jour : une vacation de demain 7 h et
 * une de demain 22 h ne laissent pas le même temps pour trouver quelqu'un. Les
 * dates sont stockées en `@db.Date`, donc à minuit UTC — l'heure vient du champ
 * texte, et c'est leur combinaison qui fait foi.
 */
function estUrgente(dateDebut: Date, heureDebut: string): boolean {
  const [heures, minutes] = heureDebut.split(':').map(Number);

  const debut = new Date(dateDebut);
  debut.setUTCHours(heures ?? 0, minutes ?? 0, 0, 0);

  const restant = debut.getTime() - Date.now();

  // Une vacation déjà commencée n'est plus urgente : elle est passée.
  return restant > 0 && restant <= SEUIL_URGENCE_HEURES * 3600 * 1000;
}
