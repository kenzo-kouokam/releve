import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertesService } from './alertes.service';
import { DestinatairesService } from './destinataires.service';
import { EvenementsService } from './evenements.service';
import { InterneController } from './interne.controller';
import { InterneService } from './interne.service';
import { WebhooksService } from './webhooks.service';

/**
 * Le journal des transitions et sa sortie vers les automatisations.
 *
 * `EvenementsService` est exporte : les modules metier l'appellent apres avoir
 * commite leur transition. Le reste — emission signee, routes internes — ne
 * sort pas d'ici, parce que rien d'autre n'a de raison de l'atteindre.
 */
@Module({
  imports: [MatchingModule, NotificationsModule],
  controllers: [InterneController],
  providers: [EvenementsService, WebhooksService, InterneService, DestinatairesService, AlertesService],
  exports: [EvenementsService, WebhooksService],
})
export class EvenementsModule {}
