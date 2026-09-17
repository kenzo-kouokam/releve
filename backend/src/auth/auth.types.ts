import type { Request } from 'express';
import type { RoleUtilisateur, UtilisateurSession } from '@releve/shared';

/**
 * Charge utile du JWT. Elle embarque le rattachement (agence / client /
 * candidat) pour qu'une requete authentifiee n'ait pas besoin d'un aller-retour
 * en base avant de savoir ce qu'elle a le droit de lire.
 */
export interface ChargeUtileJeton {
  sub: string;
  email: string;
  role: RoleUtilisateur;
  agenceId: string | null;
  clientId: string | null;
  candidatId: string | null;
}

export interface RequeteAuthentifiee extends Request {
  utilisateur?: UtilisateurSession;
}
