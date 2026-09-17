import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CLE_PUBLIC } from './auth.decorateurs';
import type { ChargeUtileJeton, RequeteAuthentifiee } from './auth.types';

/**
 * Garde globale : par defaut une route exige un jeton valide. C'est le sens qui
 * pardonne le mieux les oublis - une nouvelle route est fermee tant qu'on ne
 * l'a pas explicitement marquee @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const estPublic = this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);

    if (estPublic) {
      return true;
    }

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const entete = requete.headers.authorization ?? '';
    const [schema, jeton] = entete.split(' ');

    if (schema !== 'Bearer' || !jeton) {
      throw new UnauthorizedException('Jeton absent');
    }

    let charge: ChargeUtileJeton;

    try {
      charge = await this.jwt.verifyAsync<ChargeUtileJeton>(jeton);
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expire');
    }

    requete.utilisateur = {
      id: charge.sub,
      email: charge.email,
      role: charge.role,
      agenceId: charge.agenceId,
      clientId: charge.clientId,
      candidatId: charge.candidatId,
    };

    return true;
  }
}
