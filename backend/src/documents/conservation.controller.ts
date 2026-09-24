import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  reponseConservationSchema,
  type DossierEnAttente,
  type ReponseConservation,
} from '@releve/shared';
import { Public } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ConservationService } from './conservation.service';

/**
 * La decision de conserver ou d'effacer ses pieces.
 *
 * Seul controleur du module, et pour une raison precise : ces deux routes
 * repondent a un lien recu par courriel, pas a une session. Les placer sous
 * `/mon-profil` aurait exige une connexion de quelqu'un qui, precisement, ne
 * s'est peut-etre plus connecte depuis un an — c'est bien pourquoi on lui
 * ecrit.
 *
 * Le jeton tient lieu d'autorisation : a usage unique, borne au delai de
 * reponse, emis pour une adresse donnee et invalide si elle a change depuis.
 */
@ApiTags('conservation')
@Controller('conservation')
export class ConservationController {
  constructor(private readonly conservation: ConservationService) {}

  /**
   * Ce que la page montre avant de demander de trancher.
   *
   * Debit resserre : la route prend un secret en parametre, et rien d'autre
   * n'empeche de la sonder.
   */
  @Public()
  @Throttle({ defaut: { limit: 20, ttl: 60_000 } })
  @Get()
  @ApiOperation({ summary: 'Pieces en attente de decision, pour un lien donne' })
  dossier(@Query('jeton') jeton: string): Promise<DossierEnAttente> {
    return this.conservation.dossierEnAttente(jeton ?? '');
  }

  /**
   * La reponse. `204` et pas le dossier : apres coup il n'y a plus rien a
   * montrer — les pieces sont prolongees, ou elles n'existent plus.
   */
  @Public()
  @Throttle({ defaut: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Conserver les pieces un an de plus, ou les effacer' })
  async repondre(
    @Body(new ZodValidationPipe(reponseConservationSchema)) donnees: ReponseConservation,
  ): Promise<void> {
    await this.conservation.repondre(donnees.jeton, donnees.decision);
  }
}
