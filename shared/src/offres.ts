import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

/**
 * Deux choses différentes vivent dans ce fichier, et il ne faut jamais les
 * confondre.
 *
 * `MissionVitrine` décrit **nos** missions : celles que les établissements
 * déposent sur Relève. Elles sont publiques, on y postule ici, et l'agence
 * reçoit la candidature.
 *
 * `SuggestionMarche` décrit une offre **France Travail** rapprochée du profil
 * d'un candidat connecté. Ce n'est pas notre offre : elle appartient à un autre
 * employeur, souvent une agence concurrente, et la candidature se fait chez la
 * source. Elle n'est jamais publiée au tout-venant — elle ne s'affiche qu'à un
 * candidat identifié, comme une piste complémentaire.
 *
 * Cette séparation n'est pas cosmétique. Présenter une offre France Travail
 * comme une offre Relève laisserait un candidat attendre une réponse qui ne
 * viendrait jamais, et contreviendrait à la licence de réutilisation, qui
 * interdit de dénaturer le contenu et impose d'en citer la source partout où il
 * est montré.
 */

// ------------------------------------------------------------------ nos missions

/**
 * Mission Relève, telle qu'un visiteur la voit avant de se connecter.
 *
 * Volontairement pauvre en identités. Le nom de l'établissement client n'y
 * figure pas : publier sur le web ouvert quels services d'aide à domicile
 * passent par une agence d'intérim est une information commercialement
 * sensible pour eux, et ils ne l'ont pas autorisée en déposant un besoin. Le
 * candidat connecté, lui, le voit dans son espace.
 */
export interface MissionVitrine {
  id: string;
  reference: string;
  /** Libellé de la qualification requise : « Diplôme d'État d'aide-soignant ». */
  metier: string;
  /** Code de la qualification, pour le filtre. */
  metierCode: string;
  typeLieu: 'DOMICILE_BENEFICIAIRE' | 'ETABLISSEMENT';
  /** Secteur d'intervention, sans adresse : « Domicile - secteur Doulon ». */
  secteur: string;
  ville: string;
  codePostal: string;
  departement: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: string;
  heureFin: string;
  travailNuit: boolean;
  tauxHoraire: number | null;
  description: string | null;
}

/**
 * Contenu des menus déroulants de la vitrine.
 *
 * Construits à partir des missions réellement ouvertes, et non d'une liste
 * figée des cent une divisions françaises : proposer « Cantal » dans un menu
 * qui ne rendrait jamais aucun résultat ferait perdre le visiteur bien plus
 * sûrement qu'un menu court. Les listes s'étoffent d'elles-mêmes à mesure que
 * l'agence couvre de nouveaux territoires.
 */
export interface OptionsVitrine {
  departements: { code: string; libelle: string; missions: number }[];
  villes: { nom: string; departement: string; missions: number }[];
  metiers: { code: string; libelle: string; missions: number }[];
}

export const missionsVitrineQuerySchema = paginationQuerySchema.extend({
  departement: z
    .string()
    .trim()
    .regex(/^(\d{2,3}|2[AB])$/, 'Code département invalide')
    .optional(),
  ville: z.string().trim().min(1).max(120).optional(),
  metier: z.string().trim().min(1).max(40).optional(),
});

export type MissionsVitrineQuery = z.infer<typeof missionsVitrineQuerySchema>;

// ------------------------------------------------- annonces partenaire France Travail

/**
 * Annonce diffusée par France Travail, présentée au candidat validé.
 *
 * Ce n'est pas une mission Relève, et rien dans l'affichage ne doit le laisser
 * croire : elle appartient à un autre employeur — souvent une agence
 * concurrente — et **on n'y postule pas depuis la plateforme**. Aucun lien de
 * candidature n'est donc exposé, pas même vers la source : le candidat lit
 * l'annonce, et s'il veut avancer, il parle à Relève.
 *
 * Le mot « partenaire » désigne France Travail, dont la plateforme est
 * partenaire déclarée au titre de la licence de réutilisation — l'API elle-même
 * s'appelle `api.francetravail.io/partenaire`. Il ne désigne pas l'employeur de
 * l'annonce, avec qui Relève n'a aucun accord. C'est pourquoi la source reste
 * nommée sur chaque annonce : sans elle, le mot deviendrait faux.
 *
 * Réservée aux candidats dont l'agence a validé le dossier. Montrer le marché à
 * quelqu'un qui ne peut pas encore être placé serait lui ouvrir une porte
 * fermée.
 */
export interface AnnoncePartenaire {
  id: string;
  /** Nommée sur chaque annonce : obligation de licence, et garante du mot « partenaire ». */
  source: string;
  intitule: string;
  entreprise: string | null;
  communeNom: string | null;
  departement: string | null;
  codePostal: string | null;
  /** Libellé d'origine (« Horaire de 14.0 Euros »), affiché tel quel. */
  salaireLibelle: string | null;
  typeContratLibelle: string | null;
  dureeTravailLibelle: string | null;
  experienceExigee: boolean;
  experienceLibelle: string | null;
  nombrePostes: number;
  publieeLe: string;
  /** La licence impose d'afficher la date de dernière actualisation. */
  actualiseeLe: string | null;
  /**
   * Distance depuis le domicile du candidat, quand elle est mesurable. Sert au
   * tri « les plus proches », jamais à filtrer : le catalogue reste entier.
   */
  distanceKm: number | null;
  /** Vraie quand la distance part du centre de la commune, pas d'une adresse. */
  distanceApprochee: boolean;
}

/** L'annonce entière. Toujours sans chemin de candidature. */
export interface AnnoncePartenaireDetail extends AnnoncePartenaire {
  description: string | null;
  entrepriseDescription: string | null;
  romeCode: string | null;
  romeLibelle: string | null;
  qualificationLibelle: string | null;
  secteurActiviteLibelle: string | null;
  competences: { code: string | null; libelle: string; exigence: string | null }[];
  horaires: string[];
  conditionsExercice: string[];
  natureContrat: string | null;
}

/**
 * Tri proposé au candidat.
 *
 * `PROCHES` par défaut quand son adresse est connue : sur un catalogue national
 * de deux mille annonces, l'ordre de publication n'apprend rien à quelqu'un qui
 * cherche autour de chez lui. Le repli est `RECENTES`, qui ne demande aucune
 * coordonnée.
 */
export const triAnnoncesSchema = z.enum(['PROCHES', 'RECENTES', 'TAUX_DECROISSANT']);
export type TriAnnonces = z.infer<typeof triAnnoncesSchema>;

/**
 * Booléen lu depuis une chaîne de requête.
 *
 * `z.coerce.boolean()` ne convient pas : il applique `Boolean()`, et toute
 * chaîne non vide est vraie — y compris `'false'`. Le piège est silencieux, et
 * c'est ce qui le rend coûteux : le filtre s'applique quand on le croit inactif,
 * sans erreur ni journal.
 *
 * Seules les formes explicitement fausses le sont ; tout le reste suit la
 * lecture naturelle d'une case cochée.
 */
const booleenDeRequete = z
  .union([z.boolean(), z.string()])
  .transform((valeur) =>
    typeof valeur === 'boolean'
      ? valeur
      : !['false', '0', '', 'off'].includes(valeur.toLowerCase()),
  );

export const annoncesQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(2).max(120).optional(),
  departement: z
    .string()
    .trim()
    .regex(/^(\d{2,3}|2[AB])$/, 'Code département invalide')
    .optional(),
  rome: z
    .string()
    .trim()
    .regex(/^[A-Z]\d{4}$/, 'Code ROME invalide')
    .optional(),
  /**
   * Restreint au rayon de déplacement déclaré. Faux par défaut : le candidat a
   * demandé à voir **tout** le marché, et c'est à lui de refermer la focale.
   *
   * Surtout pas `z.coerce.boolean()` ici. Une chaîne de requête ne transporte
   * que du texte, et `Boolean('false')` vaut `true` — le filtre se serait
   * appliqué en permanence, sans erreur ni message : le candidat aurait vu
   * trente-quatre annonces là où le catalogue en compte deux mille, et rien
   * n'aurait signalé l'écart.
   */
  monRayon: booleenDeRequete.default(false),
  tri: triAnnoncesSchema.default('PROCHES'),
});

export type AnnoncesQuery = z.infer<typeof annoncesQuerySchema>;

/** Métiers présents dans le catalogue, pour le menu déroulant. */
export interface OptionsAnnonces {
  departements: { code: string; annonces: number }[];
  metiers: { romeCode: string; libelle: string; annonces: number }[];
  /** Total des annonces en ligne, filtres compris ou non. */
  total: number;
}

/**
 * Pourquoi le catalogue est fermé, quand il l'est.
 *
 * `DOSSIER_NON_VALIDE` est le cas voulu : tant que l'agence n'a pas validé le
 * dossier, le candidat ne voit pas le marché. L'encart le dit, plutôt que de
 * rester vide — un écran muet passerait pour une panne.
 */
export const motifAnnoncesSchema = z.enum(['DOSSIER_NON_VALIDE']);
export type MotifAnnonces = z.infer<typeof motifAnnoncesSchema>;

/**
 * Mention de source des annonces partenaire.
 *
 * Elle vit dans le paquet partagé parce que plusieurs endroits la disent :
 * l'encart du tableau de bord, la page de catalogue, la fiche d'une annonce et
 * les mentions légales. Cinq copies finiraient par diverger, et c'est la page
 * publique qui aurait tort.
 */
export const MENTION_SOURCE_FRANCE_TRAVAIL =
  'Annonces diffusées par France Travail et présentées au titre de la licence de réutilisation de la base d’offres d’emploi. Relève n’est pas l’employeur de ces postes et ne reçoit pas de candidature pour eux.';

/** Ce que l'encart propose à la place d'un bouton « Postuler ». */
export const INVITATION_CONTACT_ANNONCES =
  'Ces annonces montrent ce que cherche le secteur autour de vous. Pour être placé par Relève, parlez de votre projet à votre chargé de recrutement.';
