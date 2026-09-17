import { z } from 'zod';
import { MOTIF_EMAIL } from './motifs';

/**
 * Le formulaire de contact du site public.
 *
 * Sujets figés plutôt que champ libre : ils servent à router le message chez
 * l'agence, et « Contrat et fiche de paie » ne va pas au même endroit qu'« Une
 * mission en particulier ». Un objet saisi librement ne trierait rien.
 */
export const SUJETS_CONTACT = [
  'Une mission en particulier',
  'Mon dossier candidat',
  'Contrat et fiche de paie',
  'Autre demande',
] as const;

export type SujetContact = (typeof SUJETS_CONTACT)[number];

/**
 * Bornes de longueur sur chaque champ.
 *
 * La route est publique et fait partir un courriel : sans plafond, elle
 * devient un moyen d'expédier un mégaoctet de texte à l'agence à chaque appel.
 * Le minimum sur le message écarte les envois vides d'un robot qui remplit
 * tout ce qu'il trouve.
 */
export const messageContactSchema = z.object({
  prenom: z.string().trim().min(1, 'Prénom requis').max(80),
  nom: z.string().trim().min(1, 'Nom requis').max(80),
  email: z.string().trim().toLowerCase().regex(MOTIF_EMAIL, 'Adresse e-mail invalide').max(160),
  sujet: z.enum(SUJETS_CONTACT),
  message: z
    .string()
    .trim()
    .min(10, 'Décrivez votre demande en quelques mots')
    .max(4000, 'Message trop long : 4000 caractères au plus'),

  /**
   * Piège à robots.
   *
   * Un champ que personne ne voit et que personne ne remplit ; un robot qui
   * remplit tous les champs du formulaire, si.
   *
   * Le schéma l'accepte rempli — c'est délibéré. Le refuser ici rendrait un
   * 400, donc apprendrait à celui qui sonde qu'il existe un champ à laisser
   * vide, et il l'aurait contourné au coup suivant. C'est le service qui
   * tranche : il répond comme si tout s'était bien passé, et n'envoie rien.
   */
  siteWeb: z.string().max(200).optional(),
});

export type MessageContact = z.infer<typeof messageContactSchema>;

/**
 * Adresse par défaut du site.
 *
 * Elle est affichée sur la page contact et sert de destinataire quand le
 * déploiement ne fixe pas `CONTACT_EMAIL`. Déclarée ici pour que la page et
 * l'API désignent la même boîte : deux valeurs séparées donneraient une page
 * qui annonce une adresse et un courriel qui part ailleurs.
 */
export const ADRESSE_CONTACT = 'contact@releve.example';
