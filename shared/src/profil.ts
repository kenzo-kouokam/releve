import { z } from 'zod';
import { MOTIF_CODE_POSTAL, MOTIF_TELEPHONE } from './motifs';

/**
 * Ce qu'un intérimaire peut modifier lui-même sur sa fiche.
 *
 * La liste est volontairement courte, et ce qui en est absent l'est pour une
 * raison. Le `statut` appartient à l'agence : se rendre actif soi-même viderait
 * la vérification de son sens. L'adresse e-mail est l'identifiant de connexion.
 * La visite médicale et la vaccination sont constatées par l'agence sur pièce,
 * jamais déclarées.
 */
export const monProfilUpdateSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(80).optional(),
  prenom: z.string().trim().min(1, 'Le prenom est obligatoire').max(80).optional(),
  telephone: z.string().trim().regex(MOTIF_TELEPHONE, 'Numero de telephone invalide').optional(),

  // L'adresse est modifiable, ses coordonnées ne le sont pas : elles sont
  // recalculées par géocodage à chaque changement. Les accepter en entrée
  // permettrait à un candidat de se placer à côté du lieu d'une mission et de
  // remonter en tête de tous les classements, sans avoir à mentir sur quoi que
  // ce soit de vérifiable.
  adresse: z.string().trim().min(1, 'L adresse est obligatoire').max(160).optional(),
  codePostal: z.string().trim().regex(MOTIF_CODE_POSTAL, 'Code postal invalide').optional(),
  ville: z.string().trim().min(1, 'La ville est obligatoire').max(80).optional(),

  // Le rayon pèse directement sur le matching : au-delà, les missions sont
  // écartées, elles ne sont pas simplement moins bien classées.
  rayonKm: z.number().int().min(1, 'Au moins 1 km').max(150, 'Au plus 150 km').optional(),
  permisB: z.boolean().optional(),
  vehicule: z.boolean().optional(),
});

export type MonProfilUpdate = z.infer<typeof monProfilUpdateSchema>;

/**
 * Déclaration d'un diplôme par l'intéressé.
 *
 * Elle naît non vérifiée, et c'est tout l'intérêt : le candidat annonce, la
 * plateforme ne le croit pas sur parole. Tant que l'agence n'a pas contrôlé le
 * justificatif, la ligne ne rend éligible à aucune mission.
 */
export const declarationDiplomeSchema = z.object({
  qualificationId: z.string().uuid('Identifiant de qualification invalide'),
  obtenueLe: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format AAAA-MM-JJ)')
    .optional(),
  justificatifUrl: z.string().trim().url('URL invalide').max(500).optional(),
});

export type DeclarationDiplome = z.infer<typeof declarationDiplomeSchema>;

/** Ce que l'intérimaire doit compléter pour devenir proposable. */
export interface CompletudeProfil {
  /** Part remplie, de 0 à 100. */
  pourcentage: number;
  manques: { cle: string; libelle: string }[];
}
