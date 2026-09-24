import { z } from 'zod';
import { MOTIF_EMAIL } from './motifs';

/**
 * Verification de l'adresse e-mail.
 *
 * Tant qu'une inscription ouvrait une session dans la foulee, l'adresse saisie
 * n'etait qu'une chaine de caracteres : rien n'obligeait a la posseder. Sur une
 * plateforme ou l'adresse est l'identifiant de connexion *et* le canal par
 * lequel une mission se decroche, s'inscrire avec celle d'un tiers lui donnait
 * un compte a son nom sans qu'il en sache rien.
 *
 * Le parcours devient donc : inscription -> mail -> clic -> session. Le lien
 * est la seule chose qui ouvre l'acces, et il atterrit sur l'espace du profil
 * concerne.
 */

/** Le lien recu par mail. Le jeton est opaque : sa forme n'engage pas le front. */
export const verificationConfirmeSchema = z.object({
  jeton: z.string().trim().min(1, 'Lien de verification incomplet'),
});

export type VerificationConfirme = z.infer<typeof verificationConfirmeSchema>;

/**
 * Renvoi du lien. On ne demande que l'adresse : exiger le mot de passe
 * bloquerait quelqu'un qui vient justement de s'inscrire et n'a rien pu
 * confirmer.
 */
export const verificationRenvoiSchema = z.object({
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide'),
});

export type VerificationRenvoi = z.infer<typeof verificationRenvoiSchema>;

/**
 * Reponse a une inscription. Volontairement pauvre : aucune session, aucun
 * jeton, et rien sur le compte cree. Elle sert a afficher « consultez votre
 * boite mail », pas a prouver que le compte existe.
 */
export interface ReponseInscription {
  email: string;
  verificationRequise: true;
}

/**
 * Code porte par le 403 d'une connexion dont le mot de passe est bon mais
 * l'adresse non confirmee. Le front s'en sert pour proposer le renvoi du lien
 * plutot qu'un « identifiants invalides » qui enverrait la personne chercher
 * une faute de frappe inexistante.
 */
/**
 * Duree de vie du lien de confirmation d'adresse, en heures.
 *
 * Declaree ici plutot que dans le seul backend : la politique de
 * confidentialite annonce cette duree, et une valeur recopiee a la main y
 * derive. C'est deja arrive — la page annoncait 48 heures pour le lien de
 * reinitialisation, qui n'en vit qu'une.
 *
 * `VERIFICATION_EXPIRE_HEURES` la surcharge par deploiement ; la page, elle,
 * affiche cette valeur de reference.
 */
export const VERIFICATION_EXPIRE_HEURES = 48;

export const CODE_EMAIL_NON_VERIFIE = 'EMAIL_NON_VERIFIE';

/**
 * Ou deposer la personne une fois son adresse confirmee.
 *
 * Le choix se fait sur le role et nulle part ailleurs : un interimaire atterrit
 * sur sa fiche, qu'il doit completer pour devenir proposable ; une entreprise
 * sur son espace, d'ou elle suit la validation de son SIRET et depose ses
 * besoins. Les deux parcours divergent des la premiere seconde, autant que ce
 * soit ecrit une seule fois et partage par le front et les tests.
 */
export const DESTINATION_APRES_VERIFICATION = {
  CANDIDAT: '/mon-profil',
  CLIENT: '/mon-espace',
  ADMIN_AGENCE: '/',
  CHARGE_RECRUTEMENT: '/',
} as const;
