import { z } from 'zod';
import { candidatCreateSchema, type CandidatResume } from './candidat';
import { type ClientResume } from './client';
import { MOTIF_EMAIL } from './motifs';
import { motDePasseSchema } from './utilisateur';

/**
 * Inscription en ligne.
 *
 * Un seul parcours public : celui de l'intervenant. Les ESMS, eux, sont crees
 * par l'agence depuis le back-office — leur statut reglementaire (declaration
 * SAP, agrement, autorisation departementale) engage juridiquement, et se
 * verifie sur piece. Laisser une structure se declarer autorisee sans que
 * personne n'ouvre l'arrete reviendrait a ne rien verifier du tout.
 *
 * Ce qui reste vrai du parcours conserve : une inscription ouvre un compte,
 * elle ne rend personne operationnel. L'interimaire arrive en verification,
 * et c'est l'agence qui valide apres avoir vu les diplomes.
 */

/** Identifiants du compte. */
export const compteInscriptionSchema = z.object({
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
  motDePasse: motDePasseSchema,
});

export type CompteInscription = z.infer<typeof compteInscriptionSchema>;

/**
 * L'e-mail vient du compte : une seule adresse a saisir, et surtout une seule
 * verite. Deux champs distincts finiraient par diverger, et on ne saurait plus
 * laquelle sert a joindre la personne.
 *
 * Les coordonnees geographiques ne sont plus a retirer ici : `candidatCreate`
 * ne les porte plus du tout. Elles sont calculees par geocodage a partir de
 * l'adresse, juste apres la creation de la fiche.
 */
export const inscriptionInterimaireSchema = z.object({
  interimaire: candidatCreateSchema.omit({ email: true }),
  compte: compteInscriptionSchema,

  /**
   * Acceptation des conditions generales.
   *
   * Exigee par le schema et non par le seul gabarit : une case cochee dans un
   * navigateur ne prouve rien tant que le serveur ne la reclame pas, et un
   * client qui ne l'enverrait pas obtiendrait sinon un compte sans
   * consentement. La date et la version acceptee sont enregistrees a la
   * creation du compte.
   */
  conditionsAcceptees: z
    .boolean()
    .refine((accepte) => accepte, 'Vous devez accepter les conditions générales'),
});

export type InscriptionInterimaire = z.infer<typeof inscriptionInterimaireSchema>;

/**
 * Ce que le compte connecte voit de lui-meme. Le back-office n'a rien a y
 * lire : son espace, c'est le vivier et les referentiels.
 */
export type EspacePersonnel =
  | { type: 'AGENCE' }
  | { type: 'CLIENT'; valideParLAgence: boolean; client: ClientResume }
  | { type: 'CANDIDAT'; valideParLAgence: boolean; candidat: CandidatResume };
