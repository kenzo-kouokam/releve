import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificationsCompteService } from './notifications-compte.service';

/**
 * Global : la sortie courriel n'appartient a aucun domaine. L'authentification
 * s'en sert aujourd'hui, les relances de mission demain ; les faire dependre
 * d'un import croise n'apporterait rien.
 */
@Global()
@Module({
  providers: [MailService, NotificationsCompteService],
  exports: [MailService, NotificationsCompteService],
})
export class MailModule {}
