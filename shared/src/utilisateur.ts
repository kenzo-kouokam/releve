import { z } from 'zod';
import { roleUtilisateurSchema, type RoleUtilisateur } from './enums';
import { MOTIF_EMAIL } from './motifs';
import { paginationQuerySchema } from './pagination';

export const MOT_DE_PASSE_LONGUEUR_MIN = 12;

/**
 * Longueur plutot que complexite : c'est la recommandation ANSSI/CNIL depuis
 * qu'on sait que les regles du type "une majuscule et un chiffre" produisent
 * surtout des mots de passe previsibles.
 */
export const motDePasseSchema = z
  .string()
  .min(
    MOT_DE_PASSE_LONGUEUR_MIN,
    `Le mot de passe fait au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caracteres`,
  )
  .max(128);

/** Roles internes a l'agence, par opposition aux comptes externes. */
export const ROLES_INTERNES = [
  'ADMIN_AGENCE',
  'CHARGE_RECRUTEMENT',
] as const satisfies readonly RoleUtilisateur[];

export function estRoleInterne(role: RoleUtilisateur): boolean {
  return (ROLES_INTERNES as readonly RoleUtilisateur[]).includes(role);
}

/**
 * Un compte porte exactement un rattachement, et lequel depend du role :
 * l'agence pour le personnel interne, un client ou un candidat pour les acces
 * externes. C'est ce rattachement qui decide de ce que le jeton donne a voir,
 * donc il ne peut pas etre laisse au hasard de la saisie.
 */
export const utilisateurCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
    motDePasse: motDePasseSchema,
    role: roleUtilisateurSchema,
    clientId: z.string().uuid('Identifiant client invalide').optional(),
    candidatId: z.string().uuid('Identifiant candidat invalide').optional(),
  })
  .superRefine((valeur, contexte) => {
    if (estRoleInterne(valeur.role)) {
      for (const champ of ['clientId', 'candidatId'] as const) {
        if (valeur[champ]) {
          contexte.addIssue({
            code: 'custom',
            path: [champ],
            message: 'Un compte de l agence ne se rattache ni a un client ni a un candidat',
          });
        }
      }

      return;
    }

    const attendu = valeur.role === 'CLIENT' ? 'clientId' : 'candidatId';
    const interdit = valeur.role === 'CLIENT' ? 'candidatId' : 'clientId';

    if (!valeur[attendu]) {
      contexte.addIssue({
        code: 'custom',
        path: [attendu],
        message: `Un compte ${valeur.role} doit etre rattache a un ${attendu === 'clientId' ? 'client' : 'candidat'}`,
      });
    }

    if (valeur[interdit]) {
      contexte.addIssue({
        code: 'custom',
        path: [interdit],
        message: 'Rattachement incompatible avec le role',
      });
    }
  });

export type UtilisateurCreate = z.infer<typeof utilisateurCreateSchema>;

/**
 * Ni l'e-mail ni le rattachement ne se modifient : changer l'un ou l'autre
 * revient a changer de personne, et on perdrait la trace de qui a fait quoi.
 * Le role ne bouge qu'entre les deux roles internes (voir le service).
 */
export const utilisateurUpdateSchema = z.object({
  role: z.enum(ROLES_INTERNES).optional(),
  actif: z.boolean().optional(),
});

export type UtilisateurUpdate = z.infer<typeof utilisateurUpdateSchema>;

export const utilisateurListQuerySchema = paginationQuerySchema.extend({
  role: roleUtilisateurSchema.optional(),
  actif: z.coerce.boolean().optional(),
  recherche: z.string().trim().min(1).max(160).optional(),
});

export type UtilisateurListQuery = z.infer<typeof utilisateurListQuerySchema>;

/** Reinitialisation par un administrateur : il n'a pas l'ancien mot de passe. */
export const motDePasseReinitialiseSchema = z.object({
  motDePasse: motDePasseSchema,
});

export type MotDePasseReinitialise = z.infer<typeof motDePasseReinitialiseSchema>;

/** Changement par l'interesse : l'ancien mot de passe fait office de preuve. */
export const motDePasseChangeSchema = z
  .object({
    ancien: z.string().min(1, 'Mot de passe actuel requis').max(128),
    nouveau: motDePasseSchema,
  })
  .refine((valeur) => valeur.ancien !== valeur.nouveau, {
    path: ['nouveau'],
    message: 'Le nouveau mot de passe doit differer de l ancien',
  });

export type MotDePasseChange = z.infer<typeof motDePasseChangeSchema>;

export interface UtilisateurResume {
  id: string;
  email: string;
  role: RoleUtilisateur;
  actif: boolean;
  derniereCnx: string | null;
  agenceId: string | null;
  clientId: string | null;
  /** Raison sociale du client rattache, pour ne pas afficher un UUID nu. */
  clientNom: string | null;
  candidatId: string | null;
  candidatNom: string | null;
}
