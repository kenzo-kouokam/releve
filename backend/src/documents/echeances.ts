import { DELAI_REPONSE_JOURS, DUREE_CONSERVATION_MOIS } from '@releve/shared';

/**
 * Les deux dates qui gouvernent la conservation d'une piece.
 *
 * Isolees ici parce que le service qui depose et celui qui releve les echeances
 * les calculent tous les deux, et que deux copies d'un calcul de date finissent
 * toujours par diverger d'un jour — celui qui fait la difference entre une
 * piece effacee a temps et une piece gardee trop longtemps.
 */

/**
 * Terme de conservation : douze mois apres le depot.
 *
 * `setMonth` gere le report des fins de mois — un depot le 31 aout donne le 31
 * aout suivant, et un 29 fevrier bissextile donne le 1er mars. Ajouter 365
 * jours serait faux une annee sur quatre.
 */
export function echeanceConservation(depuis: Date = new Date()): Date {
  const echeance = new Date(depuis);
  echeance.setMonth(echeance.getMonth() + DUREE_CONSERVATION_MOIS);

  return echeance;
}

/** Date au-dela de laquelle l'absence de reponse vaut refus de conserver. */
export function echeanceReponse(relanceLe: Date): Date {
  return new Date(relanceLe.getTime() + DELAI_REPONSE_JOURS * 24 * 60 * 60 * 1000);
}
