import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlerteCreate, AlerteEnvoyee, TypeAlerte } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  courrielConfirmationMission,
  courrielMissionCloturee,
  courrielMissionUrgente,
  type MissionCourriel,
} from '../mail/gabarits';
import { DestinatairesService, type Destinataire } from './destinataires.service';
import { WebhooksService } from './webhooks.service';

/**
 * Les envois demandés par l'automatisation.
 *
 * C'est la seconde moitié du parti pris retenu : l'événement sort sans aucune
 * adresse, l'automatisation décide qui prévenir — son plafond anti-spam, sa
 * déduplication, son horaire — puis rend la main. L'API compose et expédie.
 *
 * Deux conséquences qui valent d'être nommées.
 *
 * **Aucune adresse ne quitte la plateforme.** L'automatisation ne manipule que
 * des références pseudonymes, qu'elle ne peut pas inverser. C'est ce qui
 * distingue cette route d'un simple relais SMTP.
 *
 * **Chaque type borne ses destinataires possibles.** Une référence est résolue
 * contre l'ensemble autorisé pour ce type-là, et ignorée si elle n'y figure
 * pas. Sans cette borne, un appelant machine qui connaîtrait une référence
 * pourrait écrire à n'importe qui, sur n'importe quelle mission.
 */
@Injectable()
export class AlertesService {
  private readonly logger = new Logger(AlertesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly destinataires: DestinatairesService,
    private readonly webhooks: WebhooksService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get siteUrl(): string {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  async envoyer(missionId: string, demande: AlerteCreate): Promise<AlerteEnvoyee> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        reference: true,
        statut: true,
        dateDebut: true,
        heureDebut: true,
        heureFin: true,
        tauxHoraire: true,
        client: { select: { raisonSociale: true } },
        lieu: { select: { libelle: true, ville: true } },
      },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    const autorises = await this.autorises(missionId, demande.type);

    // La référence est dérivée, pas stockée : on la recalcule pour l'ensemble
    // autorisé — quelques dizaines de personnes au plus — plutôt que de tenir
    // une table de correspondance, qui serait précisément la table permettant
    // de repseudonymiser tout le monde.
    const parReference = new Map(
      autorises.map((candidat) => [this.webhooks.referenceCandidat(candidat.id), candidat]),
    );

    const demandees = [...new Set(demande.candidatRefs)];
    const ignorees: string[] = [];
    let envoyees = 0;

    const details: MissionCourriel = {
      reference: mission.reference,
      client: mission.client.raisonSociale,
      lieu: `${mission.lieu.libelle} · ${mission.lieu.ville}`,
      dateDebut: mission.dateDebut.toISOString(),
      heureDebut: mission.heureDebut,
      heureFin: mission.heureFin,
      tauxHoraire: mission.tauxHoraire === null ? null : Number(mission.tauxHoraire),
    };

    for (const reference of demandees) {
      const candidat = parReference.get(reference);

      if (!candidat) {
        ignorees.push(reference);
        continue;
      }

      const parti = await this.mail.envoyer(
        this.composer(demande.type, candidat, details, mission.id, mission.statut),
      );

      if (parti) {
        envoyees += 1;
      }
    }

    if (ignorees.length) {
      this.logger.warn(
        `Alerte ${demande.type} sur ${missionId} : ${ignorees.length} reference(s) hors ` +
          "de l'ensemble autorise, ignoree(s)",
      );
    }

    return { missionId, type: demande.type, demandees: demandees.length, envoyees, ignorees };
  }

  /**
   * Qui peut recevoir ce type d'envoi, sur cette mission.
   *
   * `urgente` passe par la même porte d'éligibilité que le classement : une
   * alerte pour une mission à laquelle on ne peut pas postuler serait une
   * impasse. `cloture` vise ceux qui se sont manifestés, le candidat retenu
   * excepté — lui reçoit une confirmation, pas un refus.
   */
  private async autorises(missionId: string, type: TypeAlerte): Promise<Destinataire[]> {
    if (type === 'urgente') {
      return this.destinataires.eligibles(missionId);
    }

    if (type === 'confirmation') {
      const retenu = await this.destinataires.retenu(missionId);

      return retenu ? [retenu] : [];
    }

    const retenu = await this.destinataires.retenu(missionId);

    return this.destinataires.ayantPostule(missionId, retenu?.id);
  }

  private composer(
    type: TypeAlerte,
    candidat: Destinataire,
    mission: MissionCourriel,
    missionId: string,
    statutMission: string,
  ) {
    // L'identifiant, et non la reference : c'est lui qui adresse la page, ici
    // comme dans le recapitulatif quotidien et dans le lien porte par les
    // evenements. La reference ne sert qu'a etre citee par la personne.
    const lienMission = `${this.siteUrl}/missions/${missionId}`;

    if (type === 'urgente') {
      return courrielMissionUrgente(candidat.email, candidat.prenom, mission, lienMission);
    }

    if (type === 'confirmation') {
      return courrielConfirmationMission(candidat.email, candidat.prenom, mission, lienMission);
    }

    // Le motif se lit sur la mission plutôt que d'être passé par l'appelant :
    // « pourvue » et « annulee » ne sont pas la même nouvelle, et c'est la
    // plateforme qui sait laquelle est vraie.
    return courrielMissionCloturee(
      candidat.email,
      candidat.prenom,
      mission,
      statutMission === 'ANNULEE' ? 'annulee' : 'pourvue',
      `${this.siteUrl}/missions`,
    );
  }
}
