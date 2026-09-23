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
  /**
   * La même durée en heures de travail effectif.
   *
   * Pas une coquetterie d'affichage : c'est l'unité dans laquelle se lit
   * l'exercice préalable exigé avant une mise à disposition (voir
   * `SEUIL_EXERCICE_PREALABLE_HEURES`). En mois, un mi-temps et un temps plein
   * se ressemblent ; en heures, ils ne se confondent plus.
   */
  dureeHeures: number;
  /** Poste toujours occupé : la durée court encore. */
  enCours: boolean;
}

/**
 * Durée annuelle légale du travail en France, en heures.
 *
 * 1 607 h : 35 heures hebdomadaires sur l'année, journée de solidarité
 * comprise. C'est la base de conversion retenue partout ici — une seule, pour
 * que la fiche du candidat, l'écran de l'agence et celui de l'établissement
 * affichent le même nombre.
 */
export const HEURES_PAR_AN_LEGALES = 1607;

/** Un mois de travail à temps plein, en heures. */
export const HEURES_PAR_MOIS = HEURES_PAR_AN_LEGALES / 12;

/**
 * L'exercice préalable exigé avant une mise à disposition en intérim.
 *
 * La loi Valletoux (loi 2023-1268 du 27 décembre 2023, art. 8) interdit
 * l'intérim en début de carrière pour les professionnels de santé : une durée
 * minimale d'exercice est requise avant qu'une agence puisse les mettre à
 * disposition d'un établissement de santé ou d'un ESMS. La durée elle-même est
 * renvoyée à un décret, et dépend du métier.
 *
 * Elle est posée ici à **deux ans**, soit 3 214 heures. Deux réserves, qui
 * doivent être dites plutôt que noyées : la valeur est à confirmer sur le texte
 * applicable au métier concerné, et le décret raisonne en durée d'exercice, pas
 * en heures. La conversion n'est donc pas la loi — c'est la façon dont nous la
 * mesurons, et elle a un mérite précis : le temps partiel est la norme dans ce
 * secteur, et deux ans à mi-temps ne sont pas deux ans d'exercice.
 *
 * Conséquence pratique : ce seuil s'**affiche**, il ne ferme rien. Un candidat
 * en dessous reste proposable — c'est à l'agence de trancher sur pièce, pas à
 * un calcul dérivé de dates déclaratives.
 */
export const SEUIL_EXERCICE_PREALABLE_HEURES = 2 * HEURES_PAR_AN_LEGALES;

/** Conversion d'une durée en mois vers des heures de travail effectif. */
export function heuresDepuisMois(mois: number): number {
  return mois * HEURES_PAR_MOIS;
}

/**
 * Où en est un candidat de l'exercice préalable exigé.
 *
 * Deux totaux, et la distinction compte. `heuresVerifiees` ne retient que ce que
 * l'agence a contrôlé sur certificat de travail : c'est le seul chiffre
 * opposable. `heuresDeclarees` ajoute ce qui attend d'être vérifié, pour que la
 * fiche puisse montrer au candidat ce qui lui manque en contrôle plutôt qu'en
 * expérience.
 *
 * Seul l'exercice rattaché au référentiel est compté. Un poste de caissière pèse
 * pour moitié au barème, mais il ne vaut rien ici : la loi parle d'exercice du
 * métier, pas d'ancienneté au travail.
 */
export interface ExercicePrealable {
  /** Heures rattachées au référentiel et vérifiées par l'agence. */
  heuresVerifiees: number;
  /** Les mêmes, vérification comprise ou non. */
  heuresDeclarees: number;
  /** Le seuil applicable, rappelé pour que l'écran n'ait rien à recalculer. */
  seuilHeures: number;
  /** Vrai dès que `heuresVerifiees` atteint le seuil. */
  seuilAtteint: boolean;
  /** Ce qui manque encore, en heures vérifiées. Zéro une fois le seuil franchi. */
  heuresManquantes: number;
}
