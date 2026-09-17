import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type {
  EvenementSortant,
  MissionEvenement,
  PropositionEvenement,
  TypeEvenement,
  UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
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
