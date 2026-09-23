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

    /**
     * Le poste relève du secteur, sans qu'aucun diplôme du référentiel s'y
     * applique.
     *
     * Le troisième cas, et il manquait. Un faisant fonction d'aide-soignant, un
     * agent de service hospitalier, une auxiliaire de vie à domicile exercent le
     * métier sans détenir le DEAS ni le DEAES : les ranger avec un poste de
     * caisse effaçait des années de terrain. Sans portée tant que
     * `qualificationId` est renseigné — un poste diplômant relève du métier par
     * construction.
     *
     * Déclaratif comme le reste, et sans effet tant que l'agence n'a pas vérifié
     * la ligne : c'est elle qui lit le certificat et tranche.
     */
    exerciceMetier: z.boolean().default(false),

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

  /**
   * Rattachement au référentiel, corrigé par l'agence.
   *
   * Absent, le rattachement existant est laissé tel quel ; `null` le retire.
   *
   * Pourquoi l'agence peut le corriger, alors que le poste est déclaré par le
   * candidat. Le menu du formulaire proposait « Aucun / hors référentiel » en
   * premier choix, donc pré-sélectionné : un poste saisi sans y toucher partait
   * hors référentiel, en silence. Tant que cela ne coûtait que la moitié des
   * points, la correction pouvait attendre ; depuis que la durée d'exercice
   * préalable ferme la porte, un poste mal rattaché vaut zéro heure et écarte
   * la personne de toute mission. Le cas s'est produit : deux postes
   * d'aide-soignant vérifiés, onze mille heures, comptées pour rien.
   *
   * L'agence est au bon endroit pour le faire — c'est elle qui lit le
   * certificat de travail, et elle seule sait à quel diplôme le poste
   * correspond vraiment. La seule autre issue serait de demander au candidat de
   * supprimer sa ligne et de la ressaisir, en perdant la trace du contrôle.
   */
  qualificationId: z
    .string()
    .uuid('Identifiant de qualification invalide')
    .nullable()
    .optional(),

  /**
   * Requalifie le poste en exercice du secteur, sans diplôme rattaché.
   *
   * Même logique que `qualificationId` : absent, la valeur existante est
   * laissée telle quelle. C'est l'agence qui tranche, sur le certificat de
   * travail, si un poste sans diplôme relève du métier ou d'autre chose.
   */
  exerciceMetier: z.boolean().optional(),
});

export type ExperienceVerification = z.infer<typeof experienceVerificationSchema>;

export interface ExperienceResume {
  id: string;
  employeur: string;
  intitule: string;
  qualificationId: string | null;
  /** Libellé de la qualification rattachée, null hors référentiel. */
  qualificationLibelle: string | null;
  /**
   * Relève du secteur sans diplôme rattaché. Sans portée quand
   * `qualificationId` est renseigné : un poste diplômant relève du métier par
   * construction.
   */
  exerciceMetier: boolean;
  /**
   * Ce que la ligne pèse dans la durée d'exercice : `qualificationId` renseigné
   * ou `exerciceMetier`. Calculé au serveur pour que les trois écrans classent
   * une ligne de la même façon.
   */
  compteDansExercice: boolean;
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
 * Ce seuil **ferme** la candidature : en dessous, `motifsExclusion` écarte le
 * profil du classement et `postuler` répond 403 avec le motif chiffré. Ce n'est
 * pas une pénalité de score mais une porte, parce que la mise à disposition
 * n'est pas permise — le reste du profil n'y change rien.
 *
 * Ce que l'agence garde en main : ce qui est *compté*. Une ligne ne pèse qu'une
 * fois vérifiée sur certificat, et c'est elle qui décide si un poste sans
 * diplôme relève du métier (`exerciceMetier`) ou d'autre chose. Le calcul rend
 * lisibles des dates déclarées ; il ne juge pas à la place de qui lit la pièce.
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
