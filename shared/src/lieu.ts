import { z } from 'zod';
import { typeLieuSchema, type TypeLieu } from './enums';
import type { PrecisionGeocodage } from './geocodage';
import { MOTIF_CODE_POSTAL } from './motifs';

/**
 * Lieu d'intervention rattache a un client.
 *
 * Regle RGPD structurante : aucune donnee de sante, aucune identite de
 * beneficiaire. `beneficiaireRef` est une reference pseudonymisee (BEN-0147) qui
 * permet a l'agence de parler du bon domicile sans stocker qui y vit. Les
 * `consignes` servent a l'acces au logement, pas a decrire une pathologie.
 */
export const lieuCreateSchema = z.object({
  type: typeLieuSchema,
  libelle: z.string().trim().min(1, 'Le libelle est obligatoire').max(160),

  adresse: z.string().trim().min(1, 'L adresse est obligatoire').max(160),
  codePostal: z.string().trim().regex(MOTIF_CODE_POSTAL, 'Code postal invalide'),
  ville: z.string().trim().min(1, 'La ville est obligatoire').max(80),

  // Coordonnees absentes de l'entree, comme pour le candidat : elles sont
  // calculees par geocodage. Les deux extremites de la mesure de distance
  // doivent venir de la meme source, sinon l'ecart entre un point saisi et un
  // point calcule se lit comme une distance.
  etage: z.string().trim().max(80).optional(),
  codeAcces: z.string().trim().max(40).optional(),
  consignes: z.string().trim().max(500).optional(),
  beneficiaireRef: z.string().trim().max(40).optional(),
});

export type LieuCreate = z.infer<typeof lieuCreateSchema>;

export const lieuUpdateSchema = lieuCreateSchema.partial();

export type LieuUpdate = z.infer<typeof lieuUpdateSchema>;

export interface LieuResume {
  id: string;
  clientId: string;
  type: TypeLieu;
  libelle: string;
  adresse: string;
  codePostal: string;
  ville: string;
  latitude: number | null;
  longitude: number | null;
  geocodePrecision: PrecisionGeocodage | null;
  etage: string | null;
  codeAcces: string | null;
  consignes: string | null;
  beneficiaireRef: string | null;
  /** Un lieu utilise par des missions ne peut plus etre supprime. */
  nombreMissions: number;
}
