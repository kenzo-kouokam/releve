import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsMissionsService } from './notifications-missions.service';

/**
 * L'annonce quotidienne des missions, planifiee.
 *
 * Le balayage lui-meme existait deja et etait teste ; rien ne le declenchait.
 * Il fallait un ordonnanceur exterieur — `pnpm cli notifier:missions` dans une
 * crontab, ou le workflow n8n qui appelle
 * `POST /api/interne/notifications/missions`. Les deux restent valables, et le
 * second le sera de nouveau quand WF2 sera ecrit ; en attendant, un dossier
 * valide ne servait a rien parce que personne n'apprenait qu'une mission
 * s'etait ouverte.
 *
 * ## Pourquoi un balayage, et non un envoi a la publication
 *
 * Publier une mission n'envoie toujours rien, et c'est deliberé : une agence
 * qui depose huit besoins dans l'apres-midi ferait huit courriels a la meme
 * personne, et c'est ainsi qu'on se fait classer en indesirable. Un message par
 * jour au plus, avec toutes les missions parues depuis le precedent.
 *
 * ## L'heure
 *
 * Sept heures : apres les deux imports de la nuit, et assez tot pour qu'un
 * intervenant qui cherche a remplir sa journee lise le message avant de
 * commencer la sienne. Un remplacement se decide le matin.
 *
 * ## Le verrou
 *
 * Meme raison que pour l'import : sans lui, chaque poste de developpement
 * enverrait des courriels depuis sa base locale. Ici le risque est plus serieux
 * encore — l'import ne fait que consommer du quota, un balayage de
 * notifications ecrit a de vraies personnes.
 */
@Injectable()
export class AnnoncePlanifieeService {
  private readonly logger = new Logger(AnnoncePlanifieeService.name);

  /**
   * Garde-fou contre le recouvrement. Le balayage evalue l'eligibilite de
   * chaque candidat sur chaque mission parue : sur un gros vivier il dure. Deux
   * passages concurrents ecriraient deux fois aux memes personnes, puisque la
   * date de dernier envoi n'est posee qu'a la fin.
   */
  private enCours = false;

  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationsMissionsService,
  ) {}

  private actif(): boolean {
    return this.config.get<string>('ANNONCE_MISSIONS_AUTOMATIQUE') === 'true';
  }

  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'annonce-missions' })
  async annoncer(): Promise<void> {
    if (!this.actif()) {
      return;
    }

    if (this.enCours) {
      this.logger.warn("Annonce ignoree : le balayage precedent n'est pas termine.");

      return;
    }

    this.enCours = true;

    try {
      const rapport = await this.notifications.notifier(false);

      this.logger.log(
        `Annonce quotidienne : ${rapport.avertis} courriel(s) et ${rapport.missions} mission(s) ` +
          `annoncee(s), sur ${rapport.examines} candidat(s) examine(s)`,
      );
    } catch (cause) {
      // Jamais propagee : une exception non rattrapee dans une tache planifiee
      // remonte en `unhandledRejection` et peut arreter le processus. L'API
      // doit continuer a servir meme si l'annonce du matin a echoue.
      this.logger.error(`Annonce quotidienne en echec : ${(cause as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }
}
