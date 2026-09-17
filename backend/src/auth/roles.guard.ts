import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleUtilisateur } from '@releve/shared';
import { CLE_ROLES } from './auth.decorateurs';
import type { RequeteAuthentifiee } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const rolesRequis = this.reflector.getAllAndOverride<RoleUtilisateur[]>(CLE_ROLES, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);

    if (!rolesRequis?.length) {
      return true;
    }

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const role = requete.utilisateur?.role;

    if (!role || !rolesRequis.includes(role)) {
      throw new ForbiddenException('Role insuffisant pour cette operation');
    }

    return true;
  }
}
