import { createHmac, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ENTETE_EVENEMENT,
  ENTETE_LIVRAISON,
  ENTETE_SIGNATURE,
  type EvenementSortant,
  type TypeEvenement,
} from '@releve/shared';

/** Tentatives d'émission, la première comprise. */
const TENTATIVES = 3;

/** Attente avant la n-ième reprise, en millisecondes. */
const ATTENTES = [500, 2000];

/** Au-delà, on abandonne l'envoi : un consommateur muet ne doit pas retenir l'API. */
const DELAI_MAX_MS = 5000;

/**
 * La sortie des événements vers les automatisations.
 *
 * Trois propriétés valent d'être nommées, parce qu'elles décident de la forme
 * du reste.
 *
 * **L'émission n'est jamais bloquante.** Aucun appelant n'attend le résultat, et
 * aucune erreur ne remonte. Valider une mission met une intervenante au travail :
 * faire échouer cette validation parce qu'un conteneur d'automatisation est
 * arrêté serait absurde, et l'agence ne saurait pas quoi en faire. L'échec est
 * journalisé en `error`, et la transition métier reste écrite en base — le
 * journal `EvenementMission` permet de rejouer ce qui n'est pas parti.
 *
 * **La signature porte sur les octets envoyés.** Le corps est sérialisé une
 * fois, signé tel quel, puis transmis tel quel. Re-sérialiser après signature
 * suffirait à invalider le condensat au premier changement d'ordre de clés.
 *
 * **Sans configuration, le service se tait.** C'est ce qui permet aux suites
 * d'intégration de dérouler tout le parcours sans conteneur n8n, et à l'API de
 * démarrer sur un poste qui n'en a pas.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly url: string | undefined;
  private readonly secret: string | undefined;

  /** Vrai quand rien n'est configuré : les tests s'en servent d'assertion. */
  readonly enSourdine: boolean;

  /** Derniers envois, conservés en mémoire — et uniquement en sourdine. */
  private readonly emis: EvenementSortant[] = [];

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('N8N_EVENTS_WEBHOOK_URL') || undefined;
    this.secret = this.config.get<string>('N8N_WEBHOOK_SECRET') || undefined;
    this.enSourdine = !this.url || !this.secret;

    if (this.enSourdine) {
      this.logger.warn(
        'N8N_EVENTS_WEBHOOK_URL ou N8N_WEBHOOK_SECRET absent : les evenements sont ' +
          'journalises en base mais pas emis. Renseigner les deux pour activer les automatisations.',
      );
    }
  }

  /** Événements retenus en sourdine, pour les assertions de test. */
  derniersEmis(): readonly EvenementSortant[] {
    return this.emis;
  }

  viderEmis(): void {
    this.emis.length = 0;
  }

  /**
   * Référence pseudonyme d'un candidat.
   *
   * Dérivée par HMAC : stable — le même candidat porte la même référence d'un
   * message à l'autre, ce qui permet de suivre un dossier dans Slack — mais non
   * réversible sans le secret. C'est cette propriété qui autorise l'envoi vers
   * des services hébergés hors UE, où aucun nom ni aucune adresse ne doit
   * parvenir.
   *
   * Sans secret configuré, la dérivation se fait à vide : la référence reste
   * stable pour une même base, ce qui suffit en développement, et rien n'est de
   * toute façon émis puisque le service est alors en sourdine.
   */
  referenceCandidat(candidatId: string): string {
    const empreinte = createHmac('sha256', this.secret ?? '')
      .update(candidatId)
      .digest('hex');

    return `CAN-${empreinte.slice(0, 6).toUpperCase()}`;
  }

  /**
   * Émet un événement, sans faire attendre l'appelant.
   *
   * Le retour est `void` et non une promesse : l'appelant ne doit pas pouvoir
   * l'attendre par inadvertance, ni décider d'échouer sur son résultat.
   */
  emettre(type: TypeEvenement, evenement: EvenementSortant): void {
    if (this.enSourdine) {
      this.emis.push(evenement);

      return;
    }

    void this.livrer(type, evenement);
  }

  private async livrer(type: TypeEvenement, evenement: EvenementSortant): Promise<void> {
    // Sérialisé une fois : c'est cette chaîne qui est signée, et c'est elle qui
    // part. Toute reconstruction entre les deux romprait la signature.
    const corps = JSON.stringify(evenement);
    const signature = createHmac('sha256', this.secret!).update(corps).digest('hex');

    for (let tentative = 1; tentative <= TENTATIVES; tentative += 1) {
      try {
        const reponse = await fetch(this.url!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [ENTETE_EVENEMENT]: type,
            [ENTETE_LIVRAISON]: evenement.deliveryId,
            [ENTETE_SIGNATURE]: `sha256=${signature}`,
          },
          body: corps,
          signal: AbortSignal.timeout(DELAI_MAX_MS),
        });

        if (reponse.ok) {
          this.logger.log(`Evenement ${type} emis (${evenement.deliveryId})`);

          return;
        }

        // Une 4xx ne se répare pas en réessayant : le consommateur a reçu et
        // refusé. On le dit une fois et on s'arrête, plutôt que de marteler.
        if (reponse.status < 500) {
          this.logger.error(
            `Evenement ${type} refuse par le consommateur (HTTP ${reponse.status}), abandon`,
          );

          return;
        }

        throw new Error(`HTTP ${reponse.status}`);
      } catch (cause) {
        const dernier = tentative === TENTATIVES;

        if (dernier) {
          this.logger.error(
            `Evenement ${type} non emis apres ${TENTATIVES} tentatives ` +
              `(${evenement.deliveryId}) : ${(cause as Error).message}. ` +
              'La transition reste enregistree dans le journal de la mission.',
          );

          return;
        }

        await attendre(ATTENTES[tentative - 1]);
      }
    }
  }

  /** Identifiant d'envoi, pour que le consommateur puisse dédupliquer. */
  nouvelleLivraison(): string {
    return randomUUID();
  }
}

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}
