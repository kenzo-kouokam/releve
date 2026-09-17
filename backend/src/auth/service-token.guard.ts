import { timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ENTETE_SERVICE } from '@releve/shared';
import type { Request } from 'express';
import { CLE_SERVICE } from './auth.decorateurs';

/**
 * L'entrée des appelants machine.
 *
 * Les routes `/api/interne/*` ne sont pas jouées par un humain : elles sont
 * appelées par un ordonnanceur, qui n'a ni navigateur ni session. Le jeton
 * d'accès ordinaire dure quinze minutes — le faire rafraîchir par un workflow
 * reviendrait à répandre la mécanique d'authentification dans chaque
 * automatisation, et à la casser dès qu'un nœud oublie le renouvellement.
 *
 * D'où un secret partagé, long et fixe, qui ne désigne pas une personne. La
 * contrepartie est qu'il ouvre tout ce qu'il ouvre : ces routes sont donc
 * volontairement peu nombreuses, et aucune ne lit de donnée personnelle.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(contexte: ExecutionContext): boolean {
    const reserve = this.reflector.getAllAndOverride<boolean>(CLE_SERVICE, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);

    if (!reserve) {
      return true;
    }

    const attendu = this.config.get<string>('INTERNAL_SERVICE_TOKEN');

    // Secret absent : la route ferme, elle ne s'ouvre pas. L'inverse — laisser
    // passer faute de comparaison possible — transformerait un oubli de
    // configuration en porte ouverte, et c'est exactement ce qui arrive lors
    // d'un premier deploiement.
    if (!attendu) {
      throw new ServiceUnavailableException(
        "Les routes internes sont fermees : INTERNAL_SERVICE_TOKEN n'est pas configure",
      );
    }

    const requete = contexte.switchToHttp().getRequest<Request>();
    const presente = requete.header(ENTETE_SERVICE);

    if (!presente || !memeSecret(presente, attendu)) {
      throw new UnauthorizedException('Jeton de service absent ou invalide');
    }

    return true;
  }
}

/**
 * Comparaison à durée constante.
 *
 * Un `===` sur une chaîne s'arrête au premier caractère qui diffère : le temps
 * de réponse trahit alors la longueur du préfixe correct, et un secret se
 * devine caractère par caractère. `timingSafeEqual` exige des tampons de même
 * taille, d'où le test de longueur préalable — lui-même sans danger, la
 * longueur du jeton n'étant pas le secret.
 */
function memeSecret(presente: string, attendu: string): boolean {
  const a = Buffer.from(presente);
  const b = Buffer.from(attendu);

  return a.length === b.length && timingSafeEqual(a, b);
}
