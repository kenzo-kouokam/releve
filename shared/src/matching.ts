import { z } from 'zod';
import type { CandidatPropose } from './proposition';

/**
 * Le score se rend toujours décomposé.
 *
 * Un chargé de recrutement doit pouvoir dire à un candidat pourquoi il est
 * troisième et pas premier, et à un établissement pourquoi ce profil-là
 * remonte. Un nombre seul ne permet ni l'un ni l'autre, et il devient
 * indéfendable dès qu'on le conteste.
 */
export const CLES_COMPOSANTES = ['experience', 'zone', 'disponibilite', 'competences'] as const;

export type CleComposante = (typeof CLES_COMPOSANTES)[number];

/**
 * Poids de chaque composante. Leur somme fait 100 : le total est un pourcentage.
 *
 * `competences` est revenue, mais elle ne mesure plus ce que mesurait
 * l'ancienne composante du même nom. Celle-là pesait la détention d'un diplôme
 * et son ancienneté — or la porte d'éligibilité exige déjà le diplôme, donc
 * tout candidat classé le possède : ces points-là étaient une constante ajoutée
 * à tout le monde, qui ne départageait personne. La nouvelle compare deux
 * listes puisées dans le même référentiel métier : ce que l'établissement a
 * coché en déposant son besoin, et ce que l'intervenant a déclaré savoir faire.
 * Entre deux titulaires du même diplôme, c'est une différence réelle.
 *
 * Les poids sont ici, en clair, et nulle part ailleurs. Ils devront passer en
 * base le jour où deux agences voudront des barèmes différents ; en attendant,
 * ce fichier est l'endroit où l'on en discute.
 */
export const POIDS_COMPOSANTES: Record<CleComposante, number> = {
  experience: 30,
  zone: 30,
  disponibilite: 20,
  competences: 20,
};

/**
 * Le barème appliqué quand la mission ne demande aucune compétence.
 *
 * Il fallait trancher, et neutraliser la composante ne suffisait pas : un
 * candidat plafonnerait alors à 80 sur ces missions-là, et deux classements ne
 * seraient plus comparables — un 78 deviendrait excellent ici et médiocre
 * ailleurs, sans que rien ne le dise à l'écran.
 *
 * Les vingt points sont donc redistribués sur les trois autres composantes,
 * dans les proportions qui étaient les leurs avant l'arrivée de celle-ci. Une
 * mission sans compétences se note ainsi exactement comme elle se notait, et le
 * total reste sur 100 dans tous les cas.
 */
export const POIDS_SANS_COMPETENCES: Record<Exclude<CleComposante, 'competences'>, number> = {
  experience: 40,
  zone: 35,
  disponibilite: 25,
};

export interface ComposanteScore {
  cle: CleComposante;
  libelle: string;
  /** Points obtenus, arrondis à l'unité. */
  points: number;
  /** Maximum atteignable pour cette composante. */
  sur: number;
  /** Phrase lisible : ce qui a été mesuré, et avec quelle valeur. */
  explication: string;
}

export interface ScoreDetail {
  total: number;
  composantes: ComposanteScore[];
}

/**
 * Motif d'exclusion.
 *
 * L'éligibilité est binaire et se joue avant le score : inutile de classer
 * quelqu'un qui ne peut légalement ou matériellement pas y aller. Le motif est
 * rendu pour que l'agence sache quoi corriger, plutôt que de voir une liste
 * plus courte sans explication.
 */
export interface MotifExclusion {
  cle: 'statut' | 'diplome' | 'indisponible' | 'deja-engage' | 'hors-rayon' | 'sans-adresse';
  libelle: string;
}

export interface CandidatClasse {
  candidat: CandidatPropose;
  score: ScoreDetail;
  /** Distance à vol d'oiseau, null si l'un des deux points manque. */
  distanceKm: number | null;
  /** Une proposition existe déjà pour ce couple mission / candidat. */
  dejaPropose: boolean;
}

export interface CandidatEcarte {
  candidat: CandidatPropose;
  motifs: MotifExclusion[];
}

export interface ClassementMission {
  missionId: string;
  /** Éligibles, du meilleur score au moins bon. */
  retenus: CandidatClasse[];
  /** Écartés par la porte binaire, avec le motif. */
  ecartes: CandidatEcarte[];
  /** Nombre de fiches examinées, pour situer les deux listes. */
  examines: number;
}

export const classementQuerySchema = z.object({
  /** Inclure les profils écartés et leur motif. */
  ecartes: z.coerce.boolean().default(false),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export type ClassementQuery = z.infer<typeof classementQuerySchema>;
