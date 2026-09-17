import { z } from 'zod';
import { MOTIF_DATE_ISO } from './motifs';

/**
 * Un poste occupé, déclaré par l'intervenant.
 *
 * C'est la donnée que le profil ne portait pas, et sans laquelle le barème
 * mesurait l'expérience par l'ancienneté du diplôme — un substitut trompeur :
 * un diplôme de 2014 jamais exercé y valait autant que dix ans de terrain.
 *
 * Comme le diplôme, une expérience naît non vérifiée et ne compte pas tant que
 * l'agence ne l'a pas contrôlée sur certificat de travail. Le schéma ne porte
 * même pas de champ permettant de prétendre l'inverse.
 */
export const experienceCreateSchema = z
  .object({
    employeur: z.string().trim().min(1, 'Le nom de l employeur est obligatoire').max(120),
    intitule: z.string().trim().min(1, 'L intitule du poste est obligatoire').max(120),

    /**
     * Rattachement au référentiel des qualifications. Facultatif : un poste de
     * caissière n'y correspond à rien, et refuser de l'enregistrer priverait le
     * barème d'une information qu'il sait pondérer.
     */
    qualificationId: z.string().uuid('Identifiant de qualification invalide').optional(),

    debutLe: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)'),
    /** Absente quand le poste est toujours occupé. */
    finLe: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)').optional(),

    // Bornée à 10 % en bas : en dessous, il ne s'agit plus d'un poste mais de
    // quelques heures, et la précision affichée dépasserait la réalité de la
    // saisie.
    quotitePourcent: z
      .number()
      .int()
      .min(10, 'Au moins 10 % d un temps plein')
      .max(100, 'Au plus 100 % d un temps plein')
      .default(100),

    description: z.string().trim().max(500).optional(),
  })
  .refine((poste) => !poste.finLe || poste.finLe >= poste.debutLe, {
    message: 'La date de fin precede la date de debut',
    path: ['finLe'],
  })
  .refine((poste) => poste.debutLe <= new Date().toISOString().slice(0, 10), {
    // Une expérience à venir n'est pas une expérience. La refuser à la saisie
    // vaut mieux que de la neutraliser silencieusement dans le calcul, où
    // personne ne comprendrait pourquoi elle ne rapporte rien.
    message: 'Une experience ne peut pas commencer dans le futur',
    path: ['debutLe'],
  });

export type ExperienceCreate = z.infer<typeof experienceCreateSchema>;

/**
 * Vérification par l'agence, sur pièce.
 *
 * `verifiee` à false permet de revenir en arrière : un certificat jugé non
 * conforme après coup ne doit pas obliger à supprimer la ligne, on perdrait la
 * trace du contrôle.
 */
export const experienceVerificationSchema = z.object({
  verifiee: z.boolean(),
});

export type ExperienceVerification = z.infer<typeof experienceVerificationSchema>;

export interface ExperienceResume {
  id: string;
  employeur: string;
  intitule: string;
  qualificationId: string | null;
  /** Libellé de la qualification rattachée, null hors référentiel. */
  qualificationLibelle: string | null;
  debutLe: string;
  finLe: string | null;
  quotitePourcent: number;
  description: string | null;
  verifieeLe: string | null;
  verifieePar: string | null;
  /** Durée en mois, pondérée par la quotité. Calculée côté serveur. */
  dureeMois: number;
  /** Poste toujours occupé : la durée court encore. */
  enCours: boolean;
}
