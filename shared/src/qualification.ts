import { z } from 'zod';

/**
 * Referentiel partage par toutes les agences : un DEAS est un DEAS partout.
 * Il n'est donc pas cloisonne par agence, contrairement aux clients et aux
 * candidats.
 */
export const qualificationCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Le code ne contient que des majuscules, chiffres et tirets'),
  libelle: z.string().trim().min(1, 'Le libelle est obligatoire').max(160),
});

export type QualificationCreate = z.infer<typeof qualificationCreateSchema>;

export interface QualificationResume {
  id: string;
  code: string;
  libelle: string;
}
