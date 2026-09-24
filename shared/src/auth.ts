import { z } from 'zod';
import type { RoleUtilisateur } from './enums';
import { MOTIF_EMAIL } from './motifs';

export const connexionSchema = z.object({
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
  motDePasse: z.string().min(8, 'Mot de passe trop court').max(128),
});

export type Connexion = z.infer<typeof connexionSchema>;

/**
 * Vue de session renvoyee au front. Elle porte les trois rattachements
 * possibles : le cloisonnement multi-agence du back-office (`agenceId`), et les
 * deux espaces externes prevus aux lots suivants (`clientId`, `candidatId`).
 * Un utilisateur n'en a jamais plus d'un.
 */
export interface UtilisateurSession {
  id: string;
  email: string;
  role: RoleUtilisateur;
  agenceId: string | null;
  clientId: string | null;
  candidatId: string | null;
}

export interface ReponseConnexion {
  /** JWT autoportant, court. Non revocable : il vaut jusqu'a son expiration. */
  jeton: string;
  /** Duree de validite du jeton d'acces, en secondes. */
  expireDans: number;

  /**
   * Jeton opaque, long, a usage unique. C'est lui qui porte la session : le
   * revoquer coupe l'acces, ce que le JWT seul ne permet pas.
   */
  jetonRafraichissement: string;
  rafraichissementExpireDans: number;

  utilisateur: UtilisateurSession;
}

export const rafraichissementSchema = z.object({
  jetonRafraichissement: z.string().trim().min(1, 'Jeton de rafraichissement absent'),
});

export type Rafraichissement = z.infer<typeof rafraichissementSchema>;

export const ROLE_LIBELLES: Record<RoleUtilisateur, string> = {
  ADMIN_AGENCE: "Administrateur d'agence",
  CHARGE_RECRUTEMENT: 'Charge de recrutement',
  CLIENT: 'Client',
  CANDIDAT: 'Candidat',
};

/** Roles qui ouvrent le back-office agence. */
export const ROLES_AGENCE = [
  'ADMIN_AGENCE',
  'CHARGE_RECRUTEMENT',
] as const satisfies readonly RoleUtilisateur[];
