import type { ExercicePrealable, ExperienceResume } from '@releve/shared';

/**
 * Ce que les écrans font de la durée d'exercice préalable.
 *
 * Trois pages lisent la même mesure — la fiche du candidat, celle de l'agence,
 * la carte servie à l'établissement — et deux d'entre elles en affichaient une
 * copie séparée du même code. Les copies ne divergent pas le jour où on les
 * écrit, elles divergent six mois plus tard, quand l'une est corrigée et pas
 * l'autre. Le calcul lui-même reste au serveur ; ce fichier ne porte que la
 * mise en forme et les deux ou trois dérivations que l'affichage réclame.
 */

/**
 * Espace insécable fine (U+202F), posée avant l'unité.
 *
 * Écrite par son code plutôt qu'en clair : le caractère lui-même est invisible
 * dans un diff, et la règle `no-irregular-whitespace` le refuse à juste titre.
 */
const ESPACE_FINE = String.fromCharCode(0x202f);

/** « 3 214 h », séparateurs de milliers compris, sans coupure avant l'unité. */
export function enHeures(heures: number): string {
  return `${heures.toLocaleString('fr-FR')}${ESPACE_FINE}h`;
}

/**
 * Remplissage de la jauge, en pourcentage.
 *
 * Borné à 100 : au-delà du seuil elle reste pleine. Quelqu'un avec quatorze
 * mille heures n'a pas besoin qu'on lui dise qu'il en a 435 % — il a besoin de
 * voir que c'est acquis.
 */
export function partExercice(bilan: ExercicePrealable | undefined | null): number {
  if (!bilan || bilan.seuilHeures <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((bilan.heuresVerifiees / bilan.seuilHeures) * 100));
}

/**
 * Ce qui est déclaré mais pas encore contrôlé.
 *
 * La distinction n'est pas cosmétique : ces heures-là manquent en *pièce*, pas
 * en terrain. Le candidat qui les voit sait qu'il n'a rien de plus à faire
 * qu'attendre l'agence, au lieu de croire qu'il lui manque des années.
 */
export function heuresEnAttente(bilan: ExercicePrealable | undefined | null): number {
  return bilan ? Math.max(0, bilan.heuresDeclarees - bilan.heuresVerifiees) : 0;
}

/**
 * Les lignes s'additionnent-elles au total ?
 *
 * Pas toujours, et il faut le dire : deux postes menés en parallèle comptent
 * chacun leurs heures sur leur ligne, mais le total est plafonné au temps
 * réellement écoulé. Sans cette phrase, l'écran donne l'impression de compter
 * faux — le cas s'est présenté avec deux postes d'aide-soignant se recouvrant
 * sur trois ans.
 *
 * Une heure de tolérance : les arrondis de chaque ligne ne sont pas un
 * recouvrement.
 */
export function periodesSeRecouvrent(
  bilan: ExercicePrealable | undefined | null,
  experiences: readonly ExperienceResume[] | undefined | null,
): boolean {
  if (!bilan) {
    return false;
  }

  const somme = (experiences ?? [])
    .filter((poste) => poste.compteDansExercice && poste.verifieeLe !== null)
    .reduce((cumul, poste) => cumul + poste.dureeHeures, 0);

  return somme > bilan.heuresVerifiees + 1;
}

/**
 * Les deux réponses possibles quand aucun diplôme du référentiel ne s'applique.
 *
 * Toutes deux distinctes de la chaîne vide, qui veut dire « rien de choisi » :
 * « Aucun / hors référentiel » était la première option du menu, donc
 * présélectionnée, et un poste déclaré sans y toucher partait hors référentiel
 * en silence — onze mille heures d'aide-soignant ont ainsi compté pour zéro.
 *
 * Et surtout, elles ne disent pas la même chose. Un faisant fonction
 * d'aide-soignant, un agent de service, une auxiliaire de vie exercent le
 * métier sans détenir le DEAS ni le DEAES ; une hôtesse de caisse, non.
 */
export const SECTEUR = 'SECTEUR';
export const HORS_SECTEUR = 'HORS_SECTEUR';

/** Ce que le menu d'une ligne doit montrer comme sélectionné. */
export function choixPoste(poste: {
  qualificationId: string | null;
  exerciceMetier: boolean;
}): string {
  if (poste.qualificationId) {
    return poste.qualificationId;
  }

  return poste.exerciceMetier ? SECTEUR : HORS_SECTEUR;
}

/**
 * Traduit un choix de menu en ce que l'API attend.
 *
 * Les sentinelles restent côté écran : l'API reçoit un identifiant de diplôme,
 * ou bien le drapeau « exercice du secteur ». Un seul endroit fait la
 * conversion, pour que les deux formulaires ne l'écrivent pas chacun à leur
 * façon.
 */
export function versRattachement(valeur: string): {
  qualificationId: string | null;
  exerciceMetier: boolean;
} {
  const diplome = valeur !== '' && valeur !== SECTEUR && valeur !== HORS_SECTEUR;

  return {
    qualificationId: diplome ? valeur : null,
    exerciceMetier: valeur === SECTEUR,
  };
}
