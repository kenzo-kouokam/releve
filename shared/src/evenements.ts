import { z } from 'zod';

/**
 * Le contrat entre l'API et les automatisations.
 *
 * Il tient en trois pièces, et c'est volontaire : un nom d'événement, une
 * charge utile qui ne porte aucune donnée personnelle, et des routes internes
 * que seul un appelant machine peut atteindre.
 *
 * Le sens de circulation compte. L'API **émet** quand une transition métier a
 * eu lieu — elle ne demande rien, elle raconte. L'automatisation **rappelle**
 * l'API quand elle veut écrire. Aucun outil extérieur ne touche la base : si
 * n8n disparaît, la plateforme continue de fonctionner à l'identique, et il ne
 * manque que les messages Slack.
 */

/**
 * Les transitions qui sortent de la plateforme.
 *
 * La liste est fermée, et c'est ce qui la rend utilisable : un workflow qui
 * aiguille sur un nom d'événement doit pouvoir compter sur son orthographe.
 * Ajouter un événement est une modification de contrat, pas un détail
 * d'implémentation — d'où la constante plutôt qu'une chaîne écrite à la main
 * dans chaque service.
 */
export const TYPES_EVENEMENT = [
  'mission.publiee',
  'proposition.envoyee',
  'proposition.acceptee',
  'mission.pourvue',
  'mission.annulee',
  'mission.relancee',
  'mission.escaladee',
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

/**
 * En deçà, une mission est urgente.
 *
 * Deux jours : c'est le délai sous lequel un remplacement ne peut plus attendre
 * le récapitulatif du lendemain.
 */
export const SEUIL_URGENCE_HEURES = 48;

/**
 * La mission, telle qu'elle sort.
 *
 * Ni le nom du client final, ni l'adresse exacte du lieu d'intervention : la
 * commune et le département suffisent à rédiger un message Slack, et ils ne
 * désignent personne. L'adresse précise reste dans l'application, derrière
 * l'authentification.
 */
export interface MissionEvenement {
  id: string;
  reference: string;
  /**
   * Vrai quand la vacation commence dans moins de {@link SEUIL_URGENCE_HEURES}.
   *
   * Calculé par l'API et non déduit des dates par le consommateur : le seuil
   * est une règle métier, et deux workflows qui le recalculeraient chacun de
   * leur côté finiraient par ne plus s'accorder sur ce qui est urgent.
   */
  urgente: boolean;
  /** Code de la qualification exigée — « AES », « ADVF »… */
  qualification: string;
  commune: string;
  /** Deux premiers caractères du code postal. Suffit à router une alerte. */
  departement: string;
  /** Dates au format ISO court, `AAAA-MM-JJ`. */
  dateDebut: string;
  dateFin: string;
  heureDebut: string;
  heureFin: string;
  tauxHoraire: number | null;
  /**
   * Lien vers la mission dans l'application.
   *
   * Construit à partir de `APP_URL`, donc du front. C'est le seul endroit où
   * l'automatisation touche à l'interface : un message Slack sans lien oblige
   * à retrouver la mission à la main.
   */
  lienApp: string;
}

/**
 * Un candidat concerné par l'événement.
 *
 * `candidatRef` est une référence pseudonyme, dérivée de l'identifiant par
 * HMAC : stable d'un message à l'autre — on peut donc suivre une même personne
 * à travers plusieurs événements — mais elle ne permet pas de remonter à
 * l'identité sans le secret. C'est la condition qui rend acceptable l'envoi
 * vers des outils hébergés hors UE.
 */
export interface PropositionEvenement {
  id: string;
  candidatRef: string;
  score: number | null;
}

// Rien de nominatif ici, volontairement : cette liste finit dans un salon
// Slack. Voir {@link CandidatVise} pour la frontière.

/**
 * Un candidat que l'événement désigne, avec de quoi lui écrire.
 *
 * Le prénom et l'adresse sortent, et c'est un choix assumé : l'automatisation
 * est hébergée avec l'application, sur la même machine, dans le même
 * `docker-compose`. Lui transmettre une adresse n'est pas un transfert vers un
 * tiers — contrairement à Slack et Airtable, hébergés hors UE, vers lesquels
 * rien de nominatif ne part jamais.
 *
 * La frontière passe donc à l'intérieur de l'événement, et il faut la tenir :
 * ces listes-ci servent à écrire aux candidats, {@link PropositionEvenement}
 * sert à alimenter Slack. La première porte des adresses, la seconde reste
 * pseudonyme. Les confondre ferait fuiter un nom dans un salon d'équipe.
 *
 * Le strict nécessaire à un envoi, et rien de plus : ni nom de famille, ni
 * téléphone, ni adresse postale, ni date de naissance.
 */
export interface CandidatVise {
  candidatRef: string;
  prenom: string;
  email: string;

  /**
   * Préférence de notification de la personne.
   *
   * Renseignée sur les seuls candidats éligibles, où elle vaut toujours `true`
   * — l'API a déjà écarté ceux qui ont coupé leurs alertes. Le champ est
   * conservé parce que le workflow filtre dessus : le retirer casserait un
   * nœud qui, sinon, fonctionne.
   *
   * Absente des listes de clôture, et c'est voulu : apprendre que la mission
   * pour laquelle on s'est porté candidat est pourvue n'est pas un service
   * rendu mais la suite de sa propre démarche. Ce message part toujours.
   */
  notificationsEmail?: boolean;
}

/** Ce que reçoit l'automatisation, quel que soit l'événement. */
export interface EvenementSortant {
  event: TypeEvenement;
  /** Horodatage de la transition, ISO complet. */
  occurredAt: string;
  /** Identifiant de cet envoi précis, pour que le consommateur déduplique. */
  deliveryId: string;
  mission: MissionEvenement;
  /** Vide pour les événements qui ne concernent aucune candidature. */
  propositions: PropositionEvenement[];

  /**
   * Candidats éligibles à la mission, déjà filtrés sur leur préférence de
   * notification. Renseigné à la publication ; vide ailleurs.
   */
  candidatsEligibles: CandidatVise[];

  /** Candidat retenu. Renseigné quand la mission est pourvue, nul ailleurs. */
  candidatRetenu: CandidatVise | null;

  /**
   * Candidats dont la candidature en cours vient de tomber — mission pourvue
   * par quelqu'un d'autre, ou annulée. Le candidat retenu n'y figure pas.
   */
  candidatsAPrevenir: CandidatVise[];
}

/**
 * En-têtes de l'émission.
 *
 * Nommés une fois ici plutôt que réécrits des deux côtés : l'émetteur et le
 * workflow qui vérifie la signature doivent s'accorder au caractère près, et
 * une faute de frappe sur un en-tête produit un rejet silencieux.
 */
export const ENTETE_EVENEMENT = 'X-Releve-Event';
export const ENTETE_LIVRAISON = 'X-Releve-Delivery';
export const ENTETE_SIGNATURE = 'X-Releve-Signature';
export const ENTETE_SERVICE = 'X-Service-Token';

// ------------------------------------------------------------------ routes internes

/**
 * Les missions qu'une automatisation peut relancer.
 *
 * Le seuil est passé par l'appelant et non figé côté API : la démonstration
 * tourne avec une minute, l'exploitation avec une journée, et ce n'est pas à
 * l'API d'arbitrer entre les deux.
 */
export const missionsNonPourvuesQuerySchema = z.object({
  seuilMinutes: z.coerce.number().int().min(1).max(60 * 24 * 30).default(1440),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

export type MissionsNonPourvuesQuery = z.infer<typeof missionsNonPourvuesQuerySchema>;

/** Une mission ouverte, vue par l'automatisation qui décide de relancer. */
export interface MissionNonPourvue {
  mission: MissionEvenement;
  /** Candidatures en attente d'une décision de l'établissement. */
  candidaturesEnAttente: number;
  /** Relances déjà enregistrées. C'est ce compteur qui déclenche l'escalade. */
  relances: number;
  /**
   * Dernier mouvement pris en compte pour le seuil : publication ou relance.
   * ISO complet, pour que le workflow puisse afficher « ouverte depuis… ».
   */
  depuisLe: string;
  /** Minutes écoulées depuis `depuisLe`, calculées côté API. */
  ouverteDepuisMinutes: number;
}

/**
 * Corps d'une relance ou d'une escalade.
 *
 * `motif` est libre et facultatif : il est réaffiché dans le journal de la
 * mission, où il explique à l'agence pourquoi un message est parti.
 */
export const relanceCreateSchema = z.object({
  motif: z.string().trim().max(500).optional(),
});

export type RelanceCreate = z.infer<typeof relanceCreateSchema>;

/** Ce que rend une relance ou une escalade enregistrée. */
export interface RelanceEnregistree {
  missionId: string;
  type: Extract<TypeEvenement, 'mission.relancee' | 'mission.escaladee'>;
  /** Nombre de relances après celle-ci. */
  relances: number;
  enregistreeLe: string;
}

/**
 * Déclenchement du balayage de notification depuis l'extérieur.
 *
 * Le balayage existait déjà en ligne de commande. Cette route ne le
 * réimplémente pas : elle appelle le même service, pour qu'un ordonnanceur qui
 * ne peut pas lancer un binaire sur l'hôte — n8n, par exemple — puisse quand
 * même le déclencher.
 */
export const balayageNotificationsSchema = z.object({
  simulation: z.boolean().default(false),
});

export type BalayageNotifications = z.infer<typeof balayageNotificationsSchema>;

/**
 * Les envois que l'automatisation demande à l'API.
 *
 * C'est l'autre moitié du parti pris : l'événement sort sans adresse, et quand
 * n8n a décidé qui prévenir — après son plafond anti-spam, sa déduplication,
 * son horaire — il rend la main. L'API compose et expédie. Les gabarits
 * restent au même endroit que tous les autres courriels de la plateforme,
 * plutôt que d'être réécrits dans un workflow.
 */
export const TYPES_ALERTE = ['urgente', 'cloture', 'confirmation'] as const;

export type TypeAlerte = (typeof TYPES_ALERTE)[number];

/**
 * Chaque type borne son propre destinataire possible, et c'est une protection
 * autant qu'une commodité : `confirmation` ne peut viser que le candidat
 * retenu, `cloture` que ceux dont la candidature vient de tomber, `urgente`
 * que les éligibles. Une référence hors de cet ensemble est ignorée — un
 * appelant machine ne doit pas pouvoir se servir de cette route pour écrire à
 * qui il veut.
 */
export const alerteCreateSchema = z.object({
  type: z.enum(TYPES_ALERTE),
  candidatRefs: z
    .array(z.string().regex(/^CAN-[0-9A-F]{6}$/, 'Reference candidat invalide'))
    .min(1, 'Au moins une reference')
    .max(200, 'Deux cents references au plus par appel'),
});

export type AlerteCreate = z.infer<typeof alerteCreateSchema>;

/** Ce que rend un envoi demandé. */
export interface AlerteEnvoyee {
  missionId: string;
  type: TypeAlerte;
  /** Références reçues, doublons retirés. */
  demandees: number;
  /** Courriels effectivement partis. */
  envoyees: number;
  /**
   * Références qui ne correspondaient à personne dans l'ensemble autorisé pour
   * ce type — périmées, ou hors sujet. Rendues pour que le workflow le voie
   * plutôt que de croire à un envoi complet.
   */
  ignorees: string[];
}
