import { z } from 'zod';
import { statutPropositionSchema, type StatutProposition } from './enums';
import type { ScoreDetail } from './matching';
import { paginationQuerySchema } from './pagination';
import type { MissionResume } from './mission';

/**
 * La proposition porte les deux sens de circulation.
 *
 * L'agence peut proposer un candidat a une mission : la ligne nait ENVOYEE et
 * attend la reponse de l'interesse. Le candidat peut aussi postuler de lui-meme
 * depuis le tableau des missions : la ligne nait alors ACCEPTEE_CANDIDAT,
 * puisqu'il a deja dit oui en cliquant. Dans les deux cas, le client tranche en
 * dernier - VALIDEE_CLIENT ou REFUSEE_CLIENT - et c'est cette decision qui
 * pourvoit la mission.
 */
export const candidatureCreateSchema = z.object({
  /** Mot d'accompagnement facultatif, affiche a l'etablissement. */
  message: z.string().trim().max(1000).optional(),
});

export type CandidatureCreate = z.infer<typeof candidatureCreateSchema>;

/**
 * L'agence propose, depuis le classement d'une mission.
 *
 * Plusieurs candidats en un appel, et non un par un. C'est le geste réel : on
 * regarde un classement et on retient les trois premiers. Un appel par candidat
 * produirait trois écritures, trois événements, et — pour qui écoute ces
 * événements — trois alertes là où il s'est passé une seule chose.
 *
 * Le doublon est toléré et non refusé : proposer une liste dont un candidat a
 * déjà été proposé ne doit pas faire échouer les autres. Ce sont les nouvelles
 * lignes qui sont rendues.
 */
export const propositionsAgenceCreateSchema = z.object({
  candidatIds: z
    .array(z.string().uuid('Candidat invalide'))
    .min(1, 'Au moins un candidat')
    .max(20, 'Vingt candidats au plus par envoi'),
  message: z.string().trim().max(1000).optional(),
});

export type PropositionsAgenceCreate = z.infer<typeof propositionsAgenceCreateSchema>;

export const refusSchema = z.object({
  motif: z.string().trim().max(300).optional(),
});

export type Refus = z.infer<typeof refusSchema>;

export const propositionListQuerySchema = paginationQuerySchema.extend({
  statut: statutPropositionSchema.optional(),
  missionId: z.string().uuid().optional(),
});

export type PropositionListQuery = z.infer<typeof propositionListQuerySchema>;

/** Un point fort du profil, tel que l'etablissement le lit sur la fiche. */
export interface PointFortCandidat {
  /** Nom d'icone cote front : briefcase, star, map-pin. */
  icone: 'briefcase' | 'star' | 'map-pin';
  libelle: string;
  valeur: string;
}

export interface CandidatPropose {
  id: string;
  nom: string;
  prenom: string;
  initiales: string;
  /** Qualification verifiee la plus pertinente pour la mission. */
  qualification: string | null;
  etiquettes: string[];
  pointsForts: PointFortCandidat[];
}

export interface PropositionResume {
  id: string;
  statut: StatutProposition;
  envoyeeLe: string;
  repondueLe: string | null;
  motifRefus: string | null;
  message: string | null;

  /** Score fige au moment de la candidature, sur 100. */
  score: number | null;
  /** Decomposition du score : c'est elle qui rend la decision explicable. */
  detailScore: ScoreDetail | null;
  candidat: CandidatPropose;
  mission: MissionResume;
}
