import { z } from 'zod';
import { MOTIF_EMAIL } from './motifs';
import { motDePasseSchema } from './utilisateur';

/**
 * Mot de passe oublie.
 *
 * Jusqu'ici, quelqu'un qui perdait son mot de passe dependait d'un
 * administrateur : celui-ci le reinitialisait a la main, puis le communiquait
 * de vive voix. Tenable a trois comptes, intenable des qu'une agence en compte
 * cent — et bloquant un dimanche soir, quand personne ne repond.
 *
 * Le parcours reprend a l'identique celui de la confirmation d'adresse : un
 * lien recu par courriel, a usage unique, qui prouve la possession de
 * l'adresse. Ce n'est pas une coincidence — c'est la meme preuve, et donc le
 * meme mecanisme.
 */

/** Demande de lien. Seule l'adresse est demandee : on a justement oublie le reste. */
export const motDePasseOublieSchema = z.object({
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
});

export type MotDePasseOublie = z.infer<typeof motDePasseOublieSchema>;

/**
 * Pose du nouveau mot de passe.
 *
 * Aucun champ « ancien mot de passe » : c'est precisement ce qui manque. La
 * preuve d'identite est le jeton, qui ne peut venir que de la boite mail du
 * titulaire.
 */
export const motDePasseReinitialisationSchema = z.object({
  jeton: z.string().trim().min(1, 'Lien de reinitialisation incomplet'),
  nouveau: motDePasseSchema,
});

export type MotDePasseReinitialisation = z.infer<typeof motDePasseReinitialisationSchema>;

/**
 * Duree de vie du lien de reinitialisation, bien plus courte que celle d'une
 * confirmation d'adresse : ce lien-ci permet de prendre la main sur un compte
 * existant, pas seulement d'activer un compte vide. Une boite mail consultee
 * par quelqu'un d'autre reste dangereuse moins longtemps.
 */
export const REINITIALISATION_EXPIRE_HEURES = 1;
