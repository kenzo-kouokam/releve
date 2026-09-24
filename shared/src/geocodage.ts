/**
 * Ce que vaut un point calcule a partir d'une adresse.
 *
 * Une adresse n'est pas localisee ou non : elle l'est *a une finesse pres*. La
 * Base Adresse Nationale sait souvent placer un numero de rue au metre, mais
 * elle retombe parfois sur le centre de la commune. Les deux donnent un couple
 * latitude / longitude d'apparence identique, et les confondre revient a
 * afficher « a 3 km » pour un candidat qu'on n'a situe qu'a la ville pres.
 *
 * Le rayon de deplacement se compte en dizaines de kilometres : une precision a
 * la commune reste exploitable. C'est pour cela qu'on la conserve au lieu de la
 * rejeter — mais on la dit.
 */
export const PRECISIONS_GEOCODAGE = ['NUMERO', 'RUE', 'LIEU_DIT', 'COMMUNE'] as const;

export type PrecisionGeocodage = (typeof PRECISIONS_GEOCODAGE)[number];

export const PRECISION_GEOCODAGE_LIBELLES: Record<PrecisionGeocodage, string> = {
  NUMERO: 'Numero de rue',
  RUE: 'Rue',
  LIEU_DIT: 'Lieu-dit',
  COMMUNE: 'Commune',
};

/**
 * Marge d'erreur indicative, en kilometres. Elle n'entre dans aucun calcul :
 * elle sert a ecrire une phrase honnete sur une fiche.
 */
export const PRECISION_GEOCODAGE_MARGE_KM: Record<PrecisionGeocodage, number> = {
  NUMERO: 0.05,
  RUE: 0.2,
  LIEU_DIT: 2,
  COMMUNE: 5,
};

/** Adresse postale telle qu'elle est saisie, avant d'etre situee. */
export interface AdresseASituer {
  adresse: string;
  codePostal: string;
  ville: string;
}

/** Resultat d'un geocodage reussi. */
export interface AdresseLocalisee {
  latitude: number;
  longitude: number;
  precision: PrecisionGeocodage;
  /** Adresse normalisee telle que la BAN la reconnait, pour l'affichage et l'audit. */
  libelle: string;
  /** Confiance rendue par la BAN, de 0 a 1. */
  confiance: number;
}

/** Ce que le front affiche a cote de l'adresse d'une fiche. */
export interface LocalisationResume {
  latitude: number | null;
  longitude: number | null;
  precision: PrecisionGeocodage | null;
  /** Date du dernier geocodage reussi, ISO-8601. */
  geocodeLe: string | null;
}
