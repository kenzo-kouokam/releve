import { z } from 'zod';

/**
 * Combien de temps la plateforme garde une pièce justificative, et ce qui se
 * passe ensuite.
 *
 * La règle tient en trois temps. Un an après son dépôt, une pièce arrive au
 * terme de sa conservation. La plateforme écrit alors à la personne pour lui
 * demander si elle veut qu'on la garde. Sans réponse au bout du délai
 * ci-dessous, la pièce est effacée : le silence ne vaut pas accord.
 *
 * Ces valeurs vivent dans le paquet partagé parce que trois endroits les
 * disent — la commande qui relance, le courriel qui annonce l'échéance, et la
 * politique de confidentialité qui l'écrit noir sur blanc. Trois copies
 * finiraient par ne plus s'accorder, et c'est la page publique qui aurait tort.
 */

/** Douze mois à compter du dépôt, renouvelables sur confirmation. */
export const DUREE_CONSERVATION_MOIS = 12;

/** Délai laissé pour répondre au courriel, avant effacement. */
export const DELAI_REPONSE_JOURS = 30;

/**
 * Ce que la personne répond en cliquant.
 *
 * Deux verbes et pas un booléen : `{ garder: false }` se lit mal dans un
 * journal, et une valeur par défaut mal placée y effacerait des dossiers.
 */
export const decisionConservationSchema = z.enum(['CONSERVER', 'EFFACER']);
export type DecisionConservation = z.infer<typeof decisionConservationSchema>;

export const reponseConservationSchema = z.object({
  jeton: z.string().min(1, 'Lien incomplet'),
  decision: decisionConservationSchema,
});

export type ReponseConservation = z.infer<typeof reponseConservationSchema>;

/**
 * Ce que la page de décision affiche avant de demander à la personne de
 * trancher : elle doit voir ce qu'elle s'apprête à garder ou à effacer.
 */
export interface DossierEnAttente {
  prenom: string | null;
  /** Intitulés des pièces concernées, dans l'ordre du dossier. */
  pieces: string[];
  /** Date au-delà de laquelle le silence efface, au format ISO. */
  effacementLe: string;
}

/** Résultat d'un balayage de conservation, rendu par la ligne de commande. */
export interface RapportConservation {
  /** Nombre de dossiers concernés. */
  dossiers: number;
  /** Nombre de pièces concernées. */
  pieces: number;
  /** Vrai quand rien n'a été écrit : la commande a tourné à blanc. */
  simulation: boolean;
}
