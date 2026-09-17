import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsMissionsService } from './notifications-missions.service';

/**
 * Aucun controleur : rien ici ne repond a une requete HTTP. Le balayage est
 * declenche par `pnpm cli notifier:missions`, appele une fois par jour par
 * l'ordonnanceur — comme les deux commandes de conservation, et pour la meme
 * raison : une tache cachee dans le processus web s'executerait autant de fois
 * qu'il y a d'instances.
 */
@Module({
  imports: [MatchingModule],
  providers: [NotificationsMissionsService],
  exports: [NotificationsMissionsService],
})
export class NotificationsModule {}
