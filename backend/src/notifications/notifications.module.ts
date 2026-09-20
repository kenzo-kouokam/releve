import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { AnnoncePlanifieeService } from './annonce-planifiee.service';
import { NotificationsMissionsService } from './notifications-missions.service';

/**
 * Aucun controleur : rien ici ne repond a une requete HTTP.
 *
 * Le balayage se declenche de trois facons, et c'est voulu :
 *
 * - `pnpm cli notifier:missions`, pour un ordonnanceur exterieur ou une
 *   execution a la main ;
 * - `POST /api/interne/notifications/missions`, pour le workflow n8n ;
 * - la tache planifiee de ce module, a 7 h, **si et seulement si**
 *   `ANNONCE_MISSIONS_AUTOMATIQUE` vaut `"true"`.
 *
 * Cette troisieme voie n'existait pas, et son absence etait un choix : une
 * tache cachee dans le processus web s'execute autant de fois qu'il y a
 * d'instances. L'objection tient toujours, et c'est le drapeau qui y repond —
 * exactement comme `IMPORT_OFFRES_AUTOMATIQUE` pour la collecte. Il se pose sur
 * le serveur qui sert le site, et sur lui seul.
 *
 * Ce qui a fait pencher : sans ordonnanceur configure, rien ne partait. Un
 * dossier valide ne sert a rien si personne n'apprend qu'une mission s'est
 * ouverte, et la fonctionnalite paraissait absente alors qu'elle etait ecrite
 * et testee.
 */
@Module({
  imports: [MatchingModule],
  providers: [NotificationsMissionsService, AnnoncePlanifieeService],
  exports: [NotificationsMissionsService],
})
export class NotificationsModule {}
