import { z } from 'zod';
import {
  competencesCandidatSchema,
  COMPETENCES_MAX_CANDIDAT,
  type CompetenceLiee,
} from './competences';
import { statutCandidatSchema, type StatutCandidat } from './enums';
import type { DisponibiliteResume, IndisponibiliteResume } from './disponibilite';
import type { ExercicePrealable, ExperienceResume } from './experience';
import type { PrecisionGeocodage } from './geocodage';
import { MOTIF_CODE_POSTAL, MOTIF_DATE_ISO, MOTIF_EMAIL, MOTIF_TELEPHONE } from './motifs';
import { paginationQuerySchema } from './pagination';

/**
 * La fiche de l'intervenant.
 *
 * Elle ne porte plus de filiere : la plateforme ne couvre que l'hebergement
 * des personnes agees, et un champ qui ne prend qu'une valeur ne discrimine
 * rien. Ce qui rend proposable, c'est le diplome verifie, la zone et les
 * disponibilites.
 */
export const candidatCreateSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
  prenom: z.string().trim().min(1, 'Le prenom est obligatoire').max(80),
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
  telephone: z.string().trim().regex(MOTIF_TELEPHONE, 'Numero de telephone invalide'),
  adresse: z.string().trim().min(1).max(160),
  codePostal: z.string().trim().regex(MOTIF_CODE_POSTAL, 'Code postal invalide'),
  ville: z.string().trim().min(1).max(80),

  // Ni `latitude` ni `longitude` : elles sont calculees a partir de l'adresse
  // par geocodage, jamais recues. Les accepter en entree laisserait n'importe
  // quel compte se placer a cote du lieu d'une mission et remonter en tete de
  // tous les classements — la composante « zone » du bareme ne lit rien
  // d'autre. C'est la seule donnee du profil qui ne peut pas etre declarative.
  rayonKm: z.number().int().min(1).max(150).default(20),
  permisB: z.boolean().default(false),
  vehicule: z.boolean().default(false),
});

export type CandidatCreate = z.infer<typeof candidatCreateSchema>;

export const candidatUpdateSchema = candidatCreateSchema.partial().extend({
  statut: statutCandidatSchema.optional(),

  // Les deux seules donnees d'aptitude stockees, et volontairement les plus
  // pauvres possible : une date de visite et un booleen. La plateforme a besoin
  // de savoir si le candidat est deployable, pas de savoir pourquoi. Aucun
  // motif, aucun document medical, aucune pathologie.
  visiteMedicaleLe: z
    .string()
    .trim()
    .regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)')
    .nullable()
    .optional(),
  vaccinationVerifiee: z.boolean().optional(),

  /**
   * Compétences déclarées, choisies dans le même référentiel que celui qui
   * sert à rédiger une mission. C'est cette communauté de référentiel qui rend
   * les deux listes comparables — deux champs de texte libre ne l'auraient
   * jamais été.
   *
   * Déclarées, et non vérifiées : contrairement au diplôme, aucune pièce ne
   * les établit. Elles départagent donc, sans jamais ouvrir de porte.
   *
   * Remplace la liste entière, comme côté mission : l'omettre n'y touche pas,
   * la passer vide efface.
   */
  competences: competencesCandidatSchema.optional(),
});

export type CandidatUpdate = z.infer<typeof candidatUpdateSchema>;

export const candidatListQuerySchema = paginationQuerySchema.extend({
  statut: statutCandidatSchema.optional(),
  recherche: z.string().trim().min(1).max(80).optional(),
  permisB: z.coerce.boolean().optional(),

  /**
   * Recherche par compétences : identifiants du référentiel, séparés par des
   * virgules.
   *
   * Conjonctive — un candidat doit les détenir **toutes**. C'est le sens de la
   * recherche : un chargé de recrutement qui coche « lève-personne » et
   * « unité protégée » cherche quelqu'un qui sait faire les deux, pas la réunion
   * de deux viviers. Élargir se fait en décochant.
   */
  competences: z
    .union([z.string(), z.array(z.string())])
    .transform((valeur) =>
      (Array.isArray(valeur) ? valeur : valeur.split(','))
        .map((element) => element.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid('Compétence invalide')).max(COMPETENCES_MAX_CANDIDAT))
    .optional(),
});

export type CandidatListQuery = z.infer<typeof candidatListQuerySchema>;

export interface CandidatResume {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  statut: StatutCandidat;
  ville: string;
  codePostal: string;
  rayonKm: number;
  permisB: boolean;
  vehicule: boolean;
  qualifications: string[];
}

/** Rattachement d'une qualification du referentiel a un candidat. */
export const qualificationCandidatSchema = z.object({
  qualificationId: z.string().uuid('Identifiant de qualification invalide'),
  obtenueLe: z
    .string()
    .trim()
    .regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)')
    .optional(),
  expireLe: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)').optional(),
  justificatifUrl: z.string().trim().url('URL invalide').max(500).optional(),
});

export type QualificationCandidatCreate = z.infer<typeof qualificationCandidatSchema>;

/**
 * Verification d'une qualification par l'agence. `verifiee` a false permet de
 * revenir en arriere : un justificatif juge non conforme apres coup ne doit pas
 * obliger a supprimer puis recreer la ligne, on perdrait la trace.
 */
export const qualificationCandidatUpdateSchema = z.object({
  obtenueLe: z
    .string()
    .trim()
    .regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)')
    .nullable()
    .optional(),
  expireLe: z
    .string()
    .trim()
    .regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)')
    .nullable()
    .optional(),
  justificatifUrl: z.string().trim().url('URL invalide').max(500).nullable().optional(),
  verifiee: z.boolean().optional(),
});

export type QualificationCandidatUpdate = z.infer<typeof qualificationCandidatUpdateSchema>;

export interface QualificationCandidatResume {
  qualificationId: string;
  code: string;
  libelle: string;
  obtenueLe: string | null;
  expireLe: string | null;
  justificatifUrl: string | null;
  verifieeLe: string | null;
  verifieePar: string | null;
  /** Calcule cote serveur : une qualification expiree ne vaut pas verifiee. */
  expiree: boolean;
}

export interface CandidatDetail extends CandidatResume {
  adresse: string;
  /** Calculee par geocodage. Null tant que l'adresse n'a pas pu etre situee. */
  latitude: number | null;
  longitude: number | null;
  /** Finesse du point, pour ne pas faire passer une commune pour une rue. */
  geocodePrecision: PrecisionGeocodage | null;
  geocodeLe: string | null;
  visiteMedicaleLe: string | null;
  vaccinationVerifiee: boolean;
  qualificationsDetail: QualificationCandidatResume[];
  experiences: ExperienceResume[];
  /**
   * Le total des `experiences`, lu a l'aune de l'exercice prealable exige avant
   * une mise a disposition. Calcule au serveur : trois ecrans l'affichent, et
   * trois arithmetiques finiraient par diverger.
   */
  exercicePrealable: ExercicePrealable;
  disponibilites: DisponibiliteResume[];
  indisponibilites: IndisponibiliteResume[];
  competences: CompetenceLiee[];
}
