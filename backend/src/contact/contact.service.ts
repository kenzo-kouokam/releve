import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADRESSE_CONTACT, type MessageContact } from '@releve/shared';
import { courrielContact } from '../mail/gabarits';
import { MailService } from '../mail/mail.service';

/**
 * Le formulaire de contact du site public.
 *
 * Rien n'est enregistre en base : un message de contact n'a pas de cycle de
 * vie, personne ne le relit dans l'application, et le conserver ferait une
 * seconde copie d'adresses a proteger pour rien. Il part par courriel, et
 * l'agence y repond depuis sa boite.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Boite de l'agence. `CONTACT_EMAIL` la fixe par deploiement. */
  private get destinataire(): string {
    return this.config.get<string>('CONTACT_EMAIL') ?? ADRESSE_CONTACT;
  }

  /**
   * Relaie le message a l'agence.
   *
   * Contrairement aux courriels de compte, un echec d'envoi remonte en erreur.
   * La difference tient a ce qui reste derriere : une inscription dont le
   * courriel echoue laisse un compte cree et un bouton « renvoyer le lien » ;
   * un message de contact perdu ne laisse rien du tout, et la personne
   * croirait avoir ete entendue.
   */
  async relayer(demande: MessageContact): Promise<void> {
    // Le piege a robots est rempli : on repond comme si tout allait bien, sans
    // rien envoyer. Un refus explicite apprendrait a le contourner.
    if (demande.siteWeb) {
      this.logger.warn(`Message de contact ecarte (piege rempli) : ${demande.email}`);

      return;
    }

    const envoye = await this.mail.envoyer(courrielContact(this.destinataire, demande));

    if (!envoye) {
      throw new ServiceUnavailableException(
        "Envoi impossible pour le moment. Reessayez dans un instant, ou ecrivez directement a l'agence.",
      );
    }

    this.logger.log(`Message de contact relaye : ${demande.sujet} — ${demande.email}`);
  }
}
