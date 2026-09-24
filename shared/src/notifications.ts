import { z } from 'zod';

/**
 * Ce que la plateforme écrit à un candidat, au-delà de son compte.
 *
 * Deux familles à ne pas confondre, parce qu'elles n'obéissent pas à la même
 * règle :
 *
 * - les courriels **transactionnels** — confirmation d'adresse,
 *   réinitialisation, fin de conservation des pièces — portent une obligation
 *   ou une conséquence irréversible. Ils partent toujours. Les taire parce
 *   qu'une case est décochée ferait effacer des documents sans prévenir ;
 * - les courriels **de service** — dossier validé, missions correspondantes —
 *   rendent service sans rien engager. Ceux-là se coupent depuis « Mon compte ».
 *
 * Seule la seconde famille passe par la préférence ci-dessous.
 */
export const preferencesNotificationSchema = z.object({
  notificationsEmail: z.boolean(),
});

export type PreferencesNotification = z.infer<typeof preferencesNotificationSchema>;

/**
 * Nombre de missions listées dans un courriel de correspondance.
 *
 * Cinq, pas la liste entière. Un courriel qui déroule trente offres ne se lit
 * pas : il se classe. Les mieux classées suffisent à faire revenir la personne
 * sur la plateforme, où elle voit le reste.
 */
export const MISSIONS_PAR_COURRIEL = 5;

/** Ce qu'une mission occupe dans le courriel de correspondance. */
export interface MissionAnnoncee {
  id: string;
  client: string;
  lieu: string;
  /** Date de début au format ISO. */
  dateDebut: string;
  heureDebut: string;
  heureFin: string;
  tauxHoraire: number | null;
  /** Score de correspondance sur 100, tel qu'il apparaît dans l'application. */
  score: number;
}

/** Résultat d'un balayage de notification, rendu par la ligne de commande. */
export interface RapportNotifications {
  /** Candidats examinés : actifs, notifications activées. */
  examines: number;
  /** Candidats à qui un courriel est parti. */
  avertis: number;
  /** Missions annoncées, toutes personnes confondues. */
  missions: number;
  /** Vrai quand rien n'a été envoyé ni écrit. */
  simulation: boolean;
}
