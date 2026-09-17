import { z } from 'zod';
import { statutMissionSchema, type StatutMission } from './enums';
import { MOTIF_DATE_ISO, MOTIF_HEURE } from './motifs';
import { paginationQuerySchema } from './pagination';

/**
 * Une mission, c'est un besoin de remplacement date et situe.
 *
 * Trois rattachements distincts, et c'est voulu : le `client` signe, le `lieu`
 * est l'endroit ou l'on travaille, la `qualification` dit qui peut y aller. Les
 * confondre serait l'erreur classique du domaine - un SAAD signe pour une
 * intervention au domicile d'un beneficiaire, jamais dans ses propres murs.
 */
export const missionCreateSchema = z
  .object({
    lieuId: z.string().uuid('Lieu invalide'),
    qualificationRequiseId: z.string().uuid('Qualification invalide'),

    dateDebut: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)'),
    dateFin: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)'),
    heureDebut: z.string().trim().regex(MOTIF_HEURE, 'Heure invalide (format 07:00)'),
    heureFin: z.string().trim().regex(MOTIF_HEURE, 'Heure invalide (format 07:00)'),

    // Le motif de recours est une obligation legale du contrat de mission :
    // sans lui, le contrat est requalifiable en CDI. Il n'est donc pas optionnel.
    motifRecours: z.string().trim().min(1, 'Le motif de recours est obligatoire').max(200),
    description: z.string().trim().max(2000).optional(),

    tauxHoraire: z.coerce.number().min(8, 'Taux horaire trop bas').max(120).optional(),
    coefficient: z.coerce.number().min(1).max(9.999).optional(),

    // Renseigne par le back-office seulement : un client publie toujours pour
    // lui-meme, et le service ignore ce champ dans ce cas.
    clientId: z.string().uuid('Client invalide').optional(),
  })
  .refine((valeurs) => valeurs.dateFin >= valeurs.dateDebut, {
    message: 'La date de fin precede la date de debut',
    path: ['dateFin'],
  });

export type MissionCreate = z.infer<typeof missionCreateSchema>;

/**
 * Une mission deja pourvue ne se re-date pas : c'est le contrat signe qui fait
 * foi. Le service refuse donc la modification passe l'etat VALIDEE, et ce
 * schema ne sert qu'aux etats amont.
 */
export const missionUpdateSchema = z.object({
  lieuId: z.string().uuid().optional(),
  qualificationRequiseId: z.string().uuid().optional(),
  dateDebut: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
  dateFin: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
  heureDebut: z.string().trim().regex(MOTIF_HEURE).optional(),
  heureFin: z.string().trim().regex(MOTIF_HEURE).optional(),
  motifRecours: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tauxHoraire: z.coerce.number().min(8).max(120).optional(),
  coefficient: z.coerce.number().min(1).max(9.999).optional(),
});

export type MissionUpdate = z.infer<typeof missionUpdateSchema>;

export const missionListQuerySchema = paginationQuerySchema.extend({
  statut: statutMissionSchema.optional(),
  recherche: z.string().trim().min(1).max(160).optional(),
  /** Bornes sur la date de debut, pour l'agenda d'un client. */
  depuis: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
  jusqua: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
});

export type MissionListQuery = z.infer<typeof missionListQuerySchema>;

/** Ce qu'une carte de liste affiche, sans requete supplementaire. */
export interface MissionResume {
  id: string;
  reference: string;
  statut: StatutMission;

  client: { id: string; raisonSociale: string };
  lieu: { id: string; libelle: string; ville: string; codePostal: string };
  qualificationRequise: { id: string; code: string; libelle: string };

  dateDebut: string;
  dateFin: string;
  heureDebut: string;
  heureFin: string;
  /** Duree d'une vacation en heures, minuit franchi compris. */
  dureeHeures: number;
  travailNuit: boolean;

  tauxHoraire: number | null;
  motifRecours: string;

  /** Compteur de candidatures en attente de decision du client. */
  candidaturesEnAttente: number;
  /**
   * Distance entre le candidat connecte et le lieu d'intervention.
   *
   * Renseignee pour une session candidat seulement, et null si l'une des deux
   * adresses n'est pas geocodee - on ne devine pas une distance.
   */
  distanceKm: number | null;

  /**
   * Le lieu est-il au-dela du rayon declare par le candidat connecte ?
   *
   * `null` quand la question ne se pose pas : session qui n'est pas celle d'un
   * candidat, ou distance non mesurable. Rendu par le serveur plutot que
   * recalcule par le front, parce que c'est la meme regle qui decide de
   * l'affichage ici et du refus a la candidature — deux copies finiraient par
   * diverger, et on afficherait un avertissement sur un ecran tout en laissant
   * postuler sur l'autre.
   */
  horsRayon: boolean | null;
  candidatRetenuId: string | null;
}

/**
 * Prerequis affiche au candidat sur la fiche : ce qui est verifie l'est
 * vraiment, a partir de ses qualifications en base. Rien n'est decoratif.
 */
export interface PrerequisMission {
  libelle: string;
  verifie: boolean;
}

export interface MissionDetail extends MissionResume {
  description: string | null;
  coefficient: number | null;
  adresse: string;
  /** Uniquement pour qui a le droit de la voir : agence, client, candidat retenu. */
  consignes: string | null;
  prerequis: PrerequisMission[];
  /** Renseigne pour un candidat connecte : a-t-il deja postule ? */
  dejaPostule: boolean;
}

/** Compteurs du tableau de bord, calcules en une requete. */
export interface ResumeMissions {
  actives: number;
  candidaturesRecues: number;
  aConfirmer: number;
}

/**
 * Ce qu'il faut pour remplir le formulaire de depot d'un besoin.
 *
 * Un etablissement n'a pas acces aux routes du back-office : il ne peut donc
 * pas lister « les clients » pour retrouver ses propres lieux. Cette route lui
 * rend exactement ses options, et rien d'autre.
 */
export interface OptionsPublication {
  lieux: { id: string; libelle: string; ville: string; codePostal: string }[];
  qualifications: {
    id: string;
    code: string;
    libelle: string;
    romeCode: string | null;
  }[];
}
