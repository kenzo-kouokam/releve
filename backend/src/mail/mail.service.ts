import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface Courriel {
  destinataire: string;
  sujet: string;
  texte: string;
  html: string;

  /**
   * Adresse a laquelle repondre, quand elle differe de l'expediteur.
   *
   * Sert au formulaire de contact : le message part de l'adresse technique du
   * site — c'est elle qui est autorisee a emettre pour le domaine — mais
   * « Repondre » doit tomber sur la personne qui a ecrit, pas sur une boite
   * qui ne lit rien.
   */
  repondreA?: string;
}

/**
 * Sortie des courriels.
 *
 * Un seul point de sortie, et une configuration qui ne change pas de forme
 * entre les environnements : en developpement le docker-compose fournit Mailpit
 * — un SMTP qui accepte tout et ne laisse rien sortir — et en production les
 * memes variables pointent sur un vrai relais. Le code, lui, est identique.
 *
 * Sans `MAIL_HOST`, le service bascule sur un transport qui n'ouvre aucune
 * connexion et journalise le message. C'est ce qui permet aux tests
 * d'integration de derouler tout le parcours d'inscription sans conteneur mail,
 * et a l'API de demarrer sur un poste ou Mailpit n'est pas lance.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly expediteur: string;

  /** Vrai quand aucun SMTP n'est configure : les tests s'en servent d'assertion. */
  readonly enSourdine: boolean;

  /**
   * Derniers messages, conserves en memoire — et uniquement en sourdine.
   *
   * C'est ce qui permet aux tests d'integration de derouler le parcours entier
   * tel qu'il se vit : s'inscrire, relire le courriel, en extraire le lien,
   * cliquer. Sans cela il faudrait appeler le service d'emission a la main, et
   * la suite ne prouverait plus que le lien part vraiment.
   *
   * Jamais alimentee quand un SMTP est configure : en production ce serait une
   * fuite de memoire, et une copie durable d'adresses que rien ne justifie.
   */
  private readonly boite: Courriel[] = [];

  constructor(private readonly config: ConfigService) {
    const hote = this.config.get<string>('MAIL_HOST');

    this.expediteur = this.config.get<string>('MAIL_FROM') ?? 'Releve <ne-pas-repondre@releve.fr>';
    this.enSourdine = !hote;

    if (!hote) {
      this.logger.warn(
        'MAIL_HOST absent : les courriels sont journalises et non envoyes. ' +
          'En developpement, lancer `pnpm infra:up` puis ouvrir http://localhost:8025',
      );

      this.transport = createTransport({ jsonTransport: true });

      return;
    }

    const utilisateur = this.config.get<string>('MAIL_USER');
    const motDePasse = this.config.get<string>('MAIL_PASSWORD');
    const port = Number(this.config.get<string>('MAIL_PORT') ?? 1025);

    this.transport = createTransport({
      host: hote,
      port,
      // 465 est le seul port ou TLS est implicite. Ailleurs, STARTTLS est
      // negocie s'il est disponible — ce que Mailpit ne propose pas, et n'a pas
      // a proposer sur une boucle locale.
      secure: port === 465,
      auth: utilisateur ? { user: utilisateur, pass: motDePasse } : undefined,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transport.close();
  }

  /** Dernier message adresse a quelqu'un. Sourdine seulement. */
  dernierPour(destinataire: string): Courriel | undefined {
    return this.boite.findLast((courriel) => courriel.destinataire === destinataire);
  }

  viderBoite(): void {
    this.boite.length = 0;
  }

  /**
   * L'echec d'envoi ne remonte pas en exception.
   *
   * Un SMTP indisponible ne doit pas annuler l'inscription qui vient d'aboutir :
   * le compte existe, et la personne a un bouton « renvoyer le lien ». Faire
   * echouer la requete laisserait au contraire un compte cree derriere un
   * message d'erreur, et une seconde tentative se heurterait a un 409.
   *
   * En revanche l'echec est journalise en `error` : c'est une panne, pas un
   * evenement ordinaire.
   */
  async envoyer(courriel: Courriel): Promise<boolean> {
    try {
      await this.transport.sendMail({
        from: this.expediteur,
        to: courriel.destinataire,
        subject: courriel.sujet,
        text: courriel.texte,
        html: courriel.html,
        ...(courriel.repondreA ? { replyTo: courriel.repondreA } : {}),
      });

      this.logger.log(`Courriel envoye a ${courriel.destinataire} : ${courriel.sujet}`);

      if (this.enSourdine) {
        this.boite.push(courriel);
      }

      return true;
    } catch (cause) {
      this.logger.error(
        `Envoi impossible a ${courriel.destinataire} : ${(cause as Error).message}`,
      );

      return false;
    }
  }
}
