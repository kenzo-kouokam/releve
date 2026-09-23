import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import {
  alerteCreateSchema,
  balayageNotificationsSchema,
  missionsNonPourvuesQuerySchema,
  relanceCreateSchema,
  type AlerteCreate,
  type AlerteEnvoyee,
  type BalayageNotifications,
  type KpiAgence,
  type MissionNonPourvue,
  type MissionsNonPourvuesQuery,
  type RapportNotifications,
  type RelanceCreate,
  type RelanceEnregistree,
} from '@releve/shared';
import { ServiceInterne } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsMissionsService } from '../notifications/notifications-missions.service';
import { AlertesService } from './alertes.service';
import { InterneService } from './interne.service';

/**
 * Ce que les automatisations rappellent.
 *
 * Un préfixe à part, et non des routes glissées dans les contrôleurs métier :
 * la frontière doit se voir. Tout ce qui est sous `/api/interne` s'authentifie
 * par un secret de service, ne connaît pas la notion d'agence, et ne rend
 * aucune donnée personnelle. Une route qui aurait besoin de l'une de ces trois
 * choses n'a rien à faire ici.
 *
 * Absent de la documentation publique : elle décrit l'API des applications, et
 * ces routes ne s'adressent pas à elles.
 */
@ApiExcludeController()
@ServiceInterne()
@Controller('interne')
export class InterneController {
  constructor(
    private readonly interne: InterneService,
    private readonly alertes: AlertesService,
    private readonly notifications: NotificationsMissionsService,
  ) {}

  @Get('kpi')
  @ApiOperation({ summary: 'Indicateurs de performance : délai de pourvoi, taux non-pourvus, relances' })
  kpi(): Promise<KpiAgence> {
    return this.interne.kpi();
  }

  @Get('missions/non-pourvues')
  @ApiOperation({ summary: 'Missions ouvertes en attente au-dela du seuil' })
  missionsNonPourvues(
    @Query(new ZodValidationPipe(missionsNonPourvuesQuerySchema)) query: MissionsNonPourvuesQuery,
  ): Promise<MissionNonPourvue[]> {
    return this.interne.missionsNonPourvues(query);
  }

  @Post('missions/:id/relances')
  @ApiOperation({ summary: 'Enregistre une relance sur une mission ouverte' })
  relancer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(relanceCreateSchema)) donnees: RelanceCreate,
  ): Promise<RelanceEnregistree> {
    return this.interne.relancer(id, donnees);
  }

  @Post('missions/:id/escalade')
  @ApiOperation({ summary: 'Enregistre une escalade apres relances infructueuses' })
  escalader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(relanceCreateSchema)) donnees: RelanceCreate,
  ): Promise<RelanceEnregistree> {
    return this.interne.escalader(id, donnees);
  }

  /**
   * Expédie les courriels que l'automatisation a décidé d'envoyer.
   *
   * Le pendant de l'émission sans adresse : l'événement sort pseudonymisé, le
   * workflow applique son plafond et sa déduplication, puis rend la main avec
   * les seules références retenues. C'est l'API qui écrit, depuis les mêmes
   * gabarits que tous les autres courriels de la plateforme.
   */
  @Post('missions/:id/alertes')
  @ApiOperation({ summary: 'Envoie les courriels aux candidats designes par leur reference' })
  alerter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(alerteCreateSchema)) donnees: AlerteCreate,
  ): Promise<AlerteEnvoyee> {
    return this.alertes.envoyer(id, donnees);
  }

  /**
   * Déclenche le balayage des courriels de correspondance.
   *
   * La même méthode que `pnpm cli notifier:missions`, exposée pour un
   * ordonnanceur qui ne peut pas lancer un binaire sur la machine. Les deux
   * chemins appellent le même service : il n'y a pas deux règles d'envoi, et le
   * mode simulation reste disponible des deux côtés.
   */
  @Post('notifications/missions')
  @ApiOperation({ summary: 'Lance le balayage des courriels de missions correspondantes' })
  notifierMissions(
    @Body(new ZodValidationPipe(balayageNotificationsSchema)) donnees: BalayageNotifications,
  ): Promise<RapportNotifications> {
    return this.notifications.notifier(donnees.simulation);
  }
}
