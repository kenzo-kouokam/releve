import { z } from 'zod';
import { typeClientSchema, type TypeClient } from './enums';
import { MOTIF_EMAIL, MOTIF_TELEPHONE } from './motifs';
import { paginationQuerySchema } from './pagination';
import { siretValide } from './siret';
import { type LieuResume } from './lieu';
import { champsHabilitation, verifierHabilitation, type Habilitation } from './habilitation';

/**
 * Le client est l'entreprise utilisatrice qui signe la mission. Ce n'est pas le
 * lieu ou l'interimaire travaille : un SAAD signe, l'intervention a lieu chez
 * le beneficiaire. Les deux notions sont donc deux modeles distincts.
 */
const clientBase = z.object({
  raisonSociale: z.string().trim().min(1, 'La raison sociale est obligatoire').max(160),
  siret: z
    .string()
    .trim()
    .transform((valeur) => valeur.replace(/\s/g, ''))
    .refine(siretValide, 'SIRET invalide (14 chiffres, cle de controle incorrecte)'),
  // Un seul type aujourd'hui : le champ reste dans le contrat pour pouvoir en
  // reintroduire un autre sans casser les appelants, mais il peut etre omis.
  type: typeClientSchema.default('SAAD'),

  // Porte par le client et non par le candidat : c'est la convention de
  // l'entreprise utilisatrice qui fixe le salaire de reference de l'interimaire.
  conventionCollective: z.string().trim().max(160).optional(),
  idcc: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'L IDCC est un code a 4 chiffres')
    .optional(),

  contactNom: z.string().trim().max(120).optional(),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .regex(MOTIF_EMAIL, 'Adresse e-mail invalide')
    .optional(),
  contactTel: z.string().trim().regex(MOTIF_TELEPHONE, 'Numero de telephone invalide').optional(),

  // Statut reglementaire et sa piece justificative. Ce que chacun rend
  // obligatoire est verifie par `verifierHabilitation` : le champ attendu
  // depend du statut, un schema plat ne saurait pas l'exprimer seul.
  ...champsHabilitation,
});

export const clientCreateSchema = clientBase.superRefine(verifierHabilitation);

export type ClientCreate = z.infer<typeof clientCreateSchema>;

// Le SIRET n'est pas modifiable : un autre SIRET, c'est une autre entite
// juridique, donc un autre client - pas une correction de fiche.
//
// Le statut reglementaire, lui, se corrige : une structure declaree obtient son
// autorisation, un agrement arrive a echeance. Changer de statut oblige a
// fournir le justificatif correspondant dans la meme requete — la piece
// precedente ne prouve plus rien pour le nouveau regime.
export const clientUpdateSchema = clientBase
  .omit({ siret: true })
  .partial()
  .extend({ actif: z.boolean().optional() })
  .superRefine(verifierHabilitation);

export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

export const clientListQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(160).optional(),
  actif: z.coerce.boolean().optional(),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export interface ClientResume extends Habilitation {
  id: string;
  raisonSociale: string;
  siret: string;
  type: TypeClient;
  conventionCollective: string | null;
  idcc: string | null;
  contactNom: string | null;
  contactEmail: string | null;
  contactTel: string | null;
  actif: boolean;
  nombreLieux: number;
}

export interface ClientDetail extends ClientResume {
  lieux: LieuResume[];
}
