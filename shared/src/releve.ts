import { z } from 'zod';
import { statutReleveSchema, type StatutReleve } from './enums';
import { MOTIF_DATE_ISO } from './motifs';
import { paginationQuerySchema } from './pagination';

/**
 * Le releve d'heures est la piece qui declenche l'argent.
 *
 * C'est lui qui fait la paie de l'interimaire et la facture du client : une
 * ligne fausse ici se propage aux deux, et ne se rattrape que par un avoir.
 * D'ou trois partis pris que ce contrat rend non negociables.
 *
 *  1. La semaine est identifiee par son LUNDI, jamais par un jour quelconque.
 *     La contrainte `@@unique([missionId, semaineDu])` du schema Prisma ne
 *     protege de rien si le mobile envoie mardi la ou le back-office envoie
 *     lundi : on obtiendrait deux releves pour la meme semaine travaillee, donc
 *     deux paies. La normalisation se fait ici, pas dans chaque appelant.
 *  2. La ventilation est DISJOINTE. Huit heures de nuit se saisissent en
 *     `heuresNuit: 8`, et surtout pas en `heuresNormales: 8` + `heuresNuit: 8`.
 *     Le total travaille est la somme des quatre compteurs. La convention
 *     inverse est l'erreur classique du domaine : elle double la paie sans que
 *     rien ne paraisse anormal a l'ecran.
 *  3. Un releve vide n'existe pas. Une semaine sans heures n'est pas un releve
 *     a zero, c'est une absence de releve - ou une absence tout court, qui se
 *     traite sur la mission.
 */

/**
 * Plafond absolu sur une semaine, heures exceptionnelles comprises.
 *
 * Le code du travail arrete la duree hebdomadaire a 48 h, et ne laisse aller
 * au-dela que par derogation, dans la limite de 60 h. On refuse donc au-dela de
 * 60 : ce n'est plus une semaine de travail, c'est une faute de frappe.
 */
export const MAX_HEURES_SEMAINE = 60;

/**
 * Au-dela, la saisie passe mais l'ecran alerte.
 *
 * Entre 48 et 60 h la semaine reste saisissable : elle peut etre reelle et
 * derogatoire. Elle merite en revanche une confirmation explicite de qui la
 * saisit, et un controle de l'agence avant validation.
 */
export const SEUIL_ALERTE_HEURES = 48;

/** Indemnites kilometriques : au-dela, c'est une erreur d'unite ou de saisie. */
export const MAX_KILOMETRES_SEMAINE = 2000;

/**
 * Une date civile qui existe reellement.
 *
 * `MOTIF_DATE_ISO` ne verifie que la forme, et "2026-02-31" la respecte. Sans
 * ce controle, le 31 fevrier devient le 3 mars en silence.
 */
function estDateValide(dateIso: string): boolean {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateIso;
}

/**
 * Le lundi de la semaine qui contient cette date.
 *
 * Partagee plutot que dupliquee : le mobile s'en sert pour afficher la semaine
 * courante, l'API pour verifier ce qu'elle recoit. Deux implementations
 * finiraient par diverger sur le dimanche, seul cas piegeux - `getUTCDay()` le
 * numerote 0, et un decalage naif le renverrait au lundi suivant plutot qu'au
 * precedent.
 */
export function lundiDeLaSemaine(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const jour = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (jour === 0 ? 6 : jour - 1));
  return date.toISOString().slice(0, 10);
}

/** Le dimanche qui ferme la semaine : ce qu'on affiche en "du ... au ...". */
export function dimancheDeLaSemaine(dateIso: string): string {
  const lundi = new Date(`${lundiDeLaSemaine(dateIso)}T00:00:00.000Z`);
  lundi.setUTCDate(lundi.getUTCDate() + 6);
  return lundi.toISOString().slice(0, 10);
}

/**
 * La date d'ouverture de semaine, contrainte au lundi.
 *
 * Le refus est prefere a la correction silencieuse : si l'appelant envoie un
 * mercredi, c'est que son calcul de semaine est faux, et le corriger ici
 * masquerait le bug au lieu de le montrer. Le message rappelle la valeur
 * attendue pour que la correction soit immediate.
 */
export const semaineDuSchema = z
  .string()
  .trim()
  .regex(MOTIF_DATE_ISO, 'Semaine invalide (format AAAA-MM-JJ)')
  .refine(estDateValide, "Cette date n'existe pas")
  .refine((valeur) => lundiDeLaSemaine(valeur) === valeur, {
    error: (probleme) =>
      `Une semaine commence un lundi : attendu ${lundiDeLaSemaine(String(probleme.input))}`,
  });

/**
 * Un compteur d'heures d'une categorie.
 *
 * Deux decimales au plus, comme la colonne `Decimal(6, 2)` en base : accepter
 * une troisieme decimale reviendrait a la laisser arrondir par Postgres, donc a
 * payer autre chose que ce qui a ete saisi et affiche.
 */
function compteurHeures(champ: string) {
  return z.coerce
    .number()
    .min(0, `${champ} : valeur negative impossible`)
    .max(MAX_HEURES_SEMAINE, `${champ} : au-dela de ${MAX_HEURES_SEMAINE} h sur une semaine`)
    .refine(
      (valeur) => Math.abs(valeur * 100 - Math.round(valeur * 100)) < 1e-9,
      `${champ} : deux decimales au maximum`,
    );
}

/** Les quatre compteurs, tels qu'ils sont saisis et tels qu'ils sont rendus. */
export const ventilationHeuresSchema = z.object({
  heuresNormales: compteurHeures('Heures normales').default(0),
  heuresNuit: compteurHeures('Heures de nuit').default(0),
  heuresDimanche: compteurHeures('Heures du dimanche').default(0),
  heuresFeriees: compteurHeures('Heures feriees').default(0),
});

export type VentilationHeures = z.infer<typeof ventilationHeuresSchema>;

/**
 * Le total travaille sur la semaine.
 *
 * Exportee parce que « le total est la somme » est le point 2 de la doctrine
 * ci-dessus : laisser cette regle se reecrire dans chaque ecran est le plus sur
 * moyen de voir apparaitre une variante qui compte les heures de nuit deux fois.
 */
export function totalHeures(ventilation: VentilationHeures): number {
  const total =
    ventilation.heuresNormales +
    ventilation.heuresNuit +
    ventilation.heuresDimanche +
    ventilation.heuresFeriees;
  return Math.round(total * 100) / 100;
}

/**
 * La saisie de l'interimaire, depuis le mobile.
 *
 * La mission et la semaine sont dans le corps et non dans l'URL parce que le
 * geste est un depot, pas la mise a jour d'une ressource deja connue : hors
 * reseau, l'application empile des saisies completes et les rejoue a la
 * reconnexion. L'API traite ce depot en upsert sur le couple (mission, semaine)
 * tant que le releve est SAISI - un rejeu apres coupure ne doit produire ni un
 * doublon, ni un 409 que l'utilisateur ne saurait pas lire.
 */
export const releveCreateSchema = ventilationHeuresSchema
  .extend({
    missionId: z.string().uuid('Mission invalide'),
    semaineDu: semaineDuSchema,
    kilometres: z.coerce
      .number()
      .min(0, 'Kilometres : valeur negative impossible')
      .max(MAX_KILOMETRES_SEMAINE, `Au-dela de ${MAX_KILOMETRES_SEMAINE} km, verifiez la saisie`)
      .refine(
        (valeur) => Math.abs(valeur * 100 - Math.round(valeur * 100)) < 1e-9,
        'Kilometres : deux decimales au maximum',
      )
      .default(0),
    commentaire: z.string().trim().max(1000).optional(),
  })
  .refine((valeurs) => totalHeures(valeurs) > 0, {
    message: 'Un releve sans heures ne se depose pas',
    path: ['heuresNormales'],
  })
  .refine((valeurs) => totalHeures(valeurs) <= MAX_HEURES_SEMAINE, {
    message: `Le total depasse ${MAX_HEURES_SEMAINE} h sur la semaine`,
    path: ['heuresNormales'],
  });

export type ReleveCreate = z.infer<typeof releveCreateSchema>;

/**
 * La correction, tant que le client n'a pas tranche.
 *
 * Ni `missionId` ni `semaineDu` : deplacer un releve d'une semaine a l'autre
 * reviendrait a en creer un second et contournerait la contrainte d'unicite. Le
 * service refuse par ailleurs toute modification passe l'etat SAISI - un releve
 * valide a deja pu partir en facturation.
 */
export const releveUpdateSchema = ventilationHeuresSchema.partial().extend({
  kilometres: z.coerce.number().min(0).max(MAX_KILOMETRES_SEMAINE).optional(),
  commentaire: z.string().trim().max(1000).optional(),
});

export type ReleveUpdate = z.infer<typeof releveUpdateSchema>;

/** Le client valide : c'est ce geste qui ouvre la facturation. */
export const releveValidationSchema = z.object({
  commentaire: z.string().trim().max(1000).optional(),
});

export type ReleveValidation = z.infer<typeof releveValidationSchema>;

/**
 * Le client conteste, et dit pourquoi.
 *
 * Le motif est obligatoire et substantiel : une contestation ouvre un litige
 * sur des heures travaillees, et c'est cette phrase qu'on relira en cas de
 * reclamation. Un refus sans motif n'est opposable a personne.
 */
export const releveContestationSchema = z.object({
  motif: z.string().trim().min(10, 'Precisez ce qui est conteste').max(500, 'Motif trop long'),
});

export type ReleveContestation = z.infer<typeof releveContestationSchema>;

export const releveListQuerySchema = paginationQuerySchema.extend({
  statut: statutReleveSchema.optional(),
  missionId: z.string().uuid().optional(),
  candidatId: z.string().uuid().optional(),
  /** Bornes sur la semaine, pour un export de paie ou de facturation. */
  depuis: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
  jusqua: z.string().trim().regex(MOTIF_DATE_ISO).optional(),
});

export type ReleveListQuery = z.infer<typeof releveListQuerySchema>;

/** Ce qu'une carte de liste affiche, sans requete supplementaire. */
export interface ReleveResume {
  id: string;
  statut: StatutReleve;

  semaineDu: string;
  /** Le dimanche de cloture, calcule par le serveur pour l'affichage. */
  semaineAu: string;

  heuresNormales: number;
  heuresNuit: number;
  heuresDimanche: number;
  heuresFeriees: number;
  /** Somme des quatre compteurs. Rendue pour que personne ne la recalcule. */
  totalHeures: number;
  kilometres: number;

  saisiLe: string;
  valideLe: string | null;
  commentaire: string | null;

  mission: {
    id: string;
    reference: string;
    clientRaisonSociale: string;
    lieuLibelle: string;
    ville: string;
  };

  /**
   * Ce releve peut-il encore etre corrige par l'interimaire ?
   *
   * Rendu par le serveur plutot que deduit du statut par le front, pour la meme
   * raison que `horsRayon` sur une mission : c'est la meme regle qui decide de
   * l'affichage du bouton et du refus au PATCH. Deux copies finiraient par
   * diverger, et on ouvrirait un formulaire que l'API rejette a l'envoi.
   */
  modifiable: boolean;
  /** Le total sort de l'ordinaire et appelle un controle avant validation. */
  alerteDuree: boolean;
}

export interface ReleveDetail extends ReleveResume {
  candidat: { id: string; nom: string; prenom: string };
  /** Renseigne quand le statut est CONTESTE. */
  motifContestation: string | null;
  validePar: string | null;
  /** Renseigne une fois le releve porte sur une facture : il est alors fige. */
  factureId: string | null;
  factureNumero: string | null;
}

/**
 * Une semaine que l'interimaire doit encore saisir.
 *
 * C'est l'ecran d'accueil du mobile, et la raison pour laquelle il ne se
 * construit pas a partir de la liste des releves : ce qu'on cherche a montrer,
 * ce sont precisement les semaines pour lesquelles il n'existe pas de releve.
 * Le serveur croise donc les missions travaillees et les releves deposes, et
 * rend les trous.
 */
export interface SemaineASaisir {
  missionId: string;
  reference: string;
  clientRaisonSociale: string;
  lieuLibelle: string;
  ville: string;

  semaineDu: string;
  semaineAu: string;

  /** Heures prevues au planning de la mission : la valeur pre-remplie a l'ecran. */
  heuresPrevues: number;
  /** Nombre de vacations prevues sur la semaine, pour situer la saisie. */
  joursTravailles: number;

  /**
   * Un releve existe deja pour cette semaine, en brouillon ou conteste.
   *
   * `null` quand la semaine est vierge. C'est ce champ qui distingue « a
   * saisir » de « a corriger », et qui donne l'identifiant a employer pour un
   * PATCH plutot qu'un POST.
   */
  releveId: string | null;
  statut: StatutReleve | null;
}

/** Compteurs du tableau de bord, calcules en une requete. */
export interface ResumeReleves {
  aSaisir: number;
  enAttenteValidation: number;
  contestes: number;
  /** Total des heures validees sur le mois en cours. */
  heuresValideesMois: number;
}
