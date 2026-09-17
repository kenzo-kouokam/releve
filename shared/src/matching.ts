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
export const CLES_COMPOSANTES = ['experience', 'zone', 'disponibilite'] as const;

export type CleComposante = (typeof CLES_COMPOSANTES)[number];

/**
 * Poids de chaque composante. Leur somme fait 100 : le total est un pourcentage.
 *
 * `experience` a remplacé `competences`. L'ancienne composante mesurait la
 * détention d'un diplôme et son ancienneté — or la porte d'éligibilité exige
 * déjà le diplôme, donc tout candidat classé le possède : ces points-là étaient
 * une constante ajoutée à tout le monde, qui ne départageait personne. Ce qui
 * distingue deux titulaires du même diplôme, c'est le temps passé sur le
 * terrain, et c'est ce que mesure la nouvelle composante.
 *
 * Les poids sont ici, en clair, et nulle part ailleurs. Ils devront passer en
 * base le jour où deux agences voudront des barèmes différents ; en attendant,
 * ce fichier est l'endroit où l'on en discute.
 */
export const POIDS_COMPOSANTES: Record<CleComposante, number> = {
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
