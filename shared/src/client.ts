import { z } from 'zod';
import { typeClientSchema, type TypeClient } from './enums';
import { MOTIF_EMAIL, MOTIF_TELEPHONE } from './motifs';
import { paginationQuerySchema } from './pagination';
import { siretValide } from './siret';
import { type LieuResume } from './lieu';
import { champsHabilitation, verifierHabilitation, type Habilitation } from './habilitation';

/**
 * Le client est l'entreprise utilisatrice qui signe la mission. Ce n'est pas le
 * lieu ou l'interimaire travaille : un gestionnaire signe pour ses douze EHPAD,
 * l'intervention a lieu dans une unite precise de l'un d'eux. Les deux notions
 * sont donc deux modeles distincts.
 */
const clientBase = z.object({
  raisonSociale: z.string().trim().min(1, 'La raison sociale est obligatoire').max(160),
  siret: z
    .string()
    .trim()
    .transform((valeur) => valeur.replace(/\s/g, ''))
    .refine(siretValide, 'SIRET invalide (14 chiffres, cle de controle incorrecte)'),
  // Sans valeur par defaut, et c'est voulu depuis qu'il y en a trois : le type
  // decide de la piece que l'agence doit lire pour activer la fiche. En deviner
  // un reviendrait a reclamer un arrete conjoint a une clinique, qui n'en a
  // pas — et a prendre ce qu'elle repondrait pour une verification.
  type: typeClientSchema,

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

  // Statut juridique du gestionnaire et pieces de l'autorisation. Declarer le
  // premier oblige a produire les secondes, ce qu'un schema plat ne sait pas
  // exprimer seul : voir `verifierHabilitation`.
  ...champsHabilitation,
});

export const clientCreateSchema = clientBase.superRefine(verifierHabilitation);

export type ClientCreate = z.infer<typeof clientCreateSchema>;

// Le SIRET n'est pas modifiable : un autre SIRET, c'est une autre entite
// juridique, donc un autre client - pas une correction de fiche.
//
// L'autorisation, elle, se corrige : un arrete se renouvelle tous les quinze
// ans, et un etablissement change de gestionnaire. Declarer un statut oblige a
// produire l'arrete dans la meme requete — la reference precedente ne prouve
// rien du nouveau gestionnaire.
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
