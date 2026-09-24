/**
 * Barometre de tension, calcule a partir des offres d'interim publiees sur
 * France Travail pour les metiers du secteur.
 *
 * Deux usages visibles dans le produit : le taux horaire suggere a l'entreprise
 * quand elle cree une mission, et l'indicateur de tension affiche sur l'annonce.
 */

export interface TensionMetier {
  romeCode: string;
  romeLibelle: string;
  departement: string;
  /** Offres retenues apres nettoyage et dedoublonnage. */
  offres: number;
  /** Postes ouverts : une offre peut en porter plusieurs. */
  postes: number;
  /**
   * Mediane et non moyenne : quelques gardes de nuit tres remunerees
   * deplaceraient une moyenne et feraient suggerer un taux hors marche.
   */
  tauxHoraireMedian: number | null;
  tauxHoraireMin: number | null;
  tauxHoraireMax: number | null;
  /** Pourcentage d'offres exigeant de l'experience. */
  partExperienceExigee: number;
  /**
   * Offres sans salaire annonce. A afficher : sur ce secteur, plus de la moitie
   * des offres n'affichent aucune remuneration, et la mediane ne porte donc que
   * sur une partie du marche.
   */
  offresSansSalaire: number;
}

export interface Barometre {
  periodeJours: number;
  calculeLe: string;
  depuisLeCache: boolean;
  metiers: TensionMetier[];
}

export interface SuggestionTaux {
  tauxHoraireMedian: number | null;
  offres: number;
  /** D'ou vient la suggestion, pour que l'entreprise sache ce qu'elle lit. */
  perimetre: 'departemental' | 'national' | 'aucun';
}
