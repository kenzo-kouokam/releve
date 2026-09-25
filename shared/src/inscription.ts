import { z } from 'zod';
import { candidatCreateSchema, type CandidatResume } from './candidat';
import { type ClientResume } from './client';
import { typeClientSchema } from './enums';
import { lieuCreateSchema } from './lieu';
import { MOTIF_EMAIL, MOTIF_TELEPHONE } from './motifs';
import { siretValide } from './siret';
import { motDePasseSchema } from './utilisateur';

/**
 * Inscription en ligne.
 *
 * **Deux parcours publics**, et c'est une correction. L'etablissement ne
 * pouvait pas ouvrir de compte lui-meme : l'agence le creait depuis le
 * back-office, ce qui supposait un premier contact hors ligne pour la moindre
 * annonce. Une structure qui cherche un remplacant pour demain matin n'appelle
 * pas une agence pour qu'elle lui ouvre un compte — elle va voir ailleurs.
 *
 * L'objection qui avait fait ecarter ce parcours reste entiere : aucun de ces
 * etablissements n'exerce sans autorisation, et laisser une structure se
 * declarer autorisee sans que personne n'ouvre la piece reviendrait a ne rien
 * verifier du tout. Elle ne justifiait pourtant pas d'interdire l'inscription,
 * seulement de ne rien lui accorder.
 *
 * **C'est donc le meme principe des deux cotes** : une inscription ouvre un
 * compte, elle ne rend personne operationnel.
 *
 * - l'interimaire arrive `EN_VERIFICATION` — se declarer aide-soignant ne
 *   suffit pas a etre envoye chez quelqu'un ;
 * - l'etablissement arrive **inactif** — il voit son espace, suit son dossier,
 *   et ne peut deposer aucun besoin tant que l'agence n'a pas lu son
 *   autorisation.
 *
 * Dans les deux cas la verification porte sur une piece, pas sur une
 * declaration, et dans les deux cas c'est l'agence qui tranche.
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

/**
 * Inscription d'un établissement.
 *
 * **Ce formulaire ne demande pas l'autorisation, et c'est délibéré.** La
 * première version réclamait le numéro FINESS et la référence de l'arrêté dès
 * la saisie, au motif que l'agence en aurait besoin pour activer. L'argument ne
 * tient pas : ces deux valeurs ne sont vérifiées par rien à ce moment-là, donc
 * les saisir ne prouve rien — un numéro tapé au clavier n'est pas une pièce
 * lue. Elles n'ajoutaient que deux champs administratifs devant quelqu'un qui
 * cherche un remplaçant pour demain matin, et elles étaient rédigées pour le
 * seul EHPAD alors que trois régimes coexistent : un hôpital et une clinique
 * n'ont pas d'arrêté conjoint à produire, mais une autorisation d'activité de
 * soins.
 *
 * Rien n'est relâché pour autant. `clients.service` continue d'exiger les trois
 * champs — statut juridique, FINESS, référence d'autorisation — **au moment de
 * l'activation**, et c'est l'agence qui les saisit en ouvrant la pièce. Le
 * contrôle a retrouvé l'endroit où il mord : là où quelqu'un lit, pas là où
 * quelqu'un déclare.
 *
 * Le **type d'établissement** reste demandé, lui, parce qu'il décide de la
 * pièce à réclamer ensuite. C'est une question à laquelle on répond sans avoir
 * de documents devant soi.
 *
 * Un premier lieu d'intervention est créé dans la foulée. Sans lui, un
 * établissement activé ne pourrait toujours pas publier : une mission se
 * rattache à un lieu, et l'obliger à en créer un avant son premier besoin
 * ajouterait une étape au moment précis où il est pressé.
 */
export const inscriptionEtablissementSchema = z.object({
  etablissement: z.object({
    raisonSociale: z.string().trim().min(1, 'La raison sociale est obligatoire').max(160),
    siret: z
      .string()
      .trim()
      .transform((valeur) => valeur.replace(/\s/g, ''))
      .refine(siretValide, 'SIRET invalide (14 chiffres, clé de contrôle incorrecte)'),

    // EHPAD, hôpital ou clinique. Sans valeur par défaut : voir `clientCreate`.
    type: typeClientSchema,

    contactNom: z.string().trim().min(1, 'Le nom du contact est obligatoire').max(120),
    contactTel: z.string().trim().regex(MOTIF_TELEPHONE, 'Numéro de téléphone invalide'),
  }),

  /**
   * Le site où les intérimaires viendront travailler.
   *
   * Le type sépare le service ordinaire de l'unité qui suppose une formation
   * particulière — unité protégée d'EHPAD, service spécialisé d'hôpital. C'est
   * ce qui permettra de l'exiger là où elle est requise.
   */
  lieu: lieuCreateSchema.pick({
    type: true,
    libelle: true,
    adresse: true,
    codePostal: true,
    ville: true,
  }),

  compte: compteInscriptionSchema,

  conditionsAcceptees: z
    .boolean()
    .refine((accepte) => accepte, 'Vous devez accepter les conditions générales'),
});

export type InscriptionEtablissement = z.infer<typeof inscriptionEtablissementSchema>;
