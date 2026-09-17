/**
 * Les faits juridiques du site, regroupes en un seul endroit.
 *
 * Trois pages les consomment : mentions legales, conditions d'utilisation et
 * politique de confidentialite. Les completer, c'est editer ce fichier et rien
 * d'autre.
 *
 * AVERTISSEMENT — les trois pages sont des *brouillons de structure*. Elles
 * posent les rubriques exigees et disent ce que le code fait reellement ; elles
 * n'ont pas ete relues par un professionnel du droit et ne valent pas conseil
 * juridique. Une agence de travail temporaire a des obligations propres
 * (garantie financiere, mentions du contrat de mission) qui demandent cette
 * relecture avant toute mise en ligne.
 *
 * ETAT ACTUEL — les valeurs ci-dessous sont un **jeu de demonstration**. Aucune
 * ne designe une entreprise reelle : la raison sociale est inventee, le SIRET
 * et le numero de TVA sont des suites de zeros qui ne peuvent appartenir a
 * personne, et les organismes cites sont explicitement fictifs. Elles
 * permettent de montrer les ecrans complets sans rien affirmer de faux sur un
 * editeur existant.
 *
 * POUR UNE VRAIE MISE EN LIGNE — remplacer chaque valeur par le fait reel, puis
 * passer `MENTIONS_DEMONSTRATION` a `false`. Le bandeau disparait alors des
 * trois pages, et c'est le seul geste a faire : rien d'autre ne depend de ce
 * drapeau.
 *
 * Une valeur absente s'affiche « À compléter » sur la page. C'est voulu : un
 * trou visible vaut mieux qu'une valeur plausible et fausse, qui exposerait
 * l'editeur.
 */

import { ADRESSE_CONTACT, DATE_CONDITIONS_LISIBLE } from '@releve/shared';

/** Adresse de l'agence, declaree une seule fois dans le paquet partage. */
export { ADRESSE_CONTACT };

/**
 * Vrai tant que les mentions sont un jeu de demonstration.
 *
 * Commande le bandeau affiche en tete des trois pages legales. Il n'est pas
 * deduit des valeurs — « toutes remplies » ne veut pas dire « toutes vraies »,
 * et une deduction ferait disparaitre l'avertissement a l'instant precis ou on
 * saisit la derniere valeur inventee. Le passage a `false` est donc un geste
 * explicite, qui se relit dans l'historique.
 */
export const MENTIONS_DEMONSTRATION = true;

/**
 * Date de la derniere revision des textes, affichee en pied de chaque page.
 *
 * Reprise du paquet partage et non ecrite ici : c'est la meme revision que
 * celle enregistree avec le consentement, a l'inscription. Deux valeurs
 * separees finiraient par diverger, et la page afficherait alors une date que
 * personne n'a acceptee.
 */
export const DERNIERE_REVISION = DATE_CONDITIONS_LISIBLE;

export interface Mention {
  libelle: string;
  /** Laisser absent tant que l'agence n'a pas fourni la valeur. */
  valeur?: string;
  /** Ce qu'il faut mettre dans `valeur`, affiche sous le champ. */
  precision?: string;
}

/** Identite de l'editeur — article 6 III de la LCEN. */
export const EDITEUR: Mention[] = [
  {
    libelle: 'Raison sociale',
    valeur: 'Relève SAS',
    precision: 'Dénomination exacte figurant au Kbis',
  },
  {
    libelle: 'Forme juridique et capital social',
    valeur: 'Société par actions simplifiée, capital de 10 000 €',
  },
  {
    libelle: 'Siège social',
    valeur: "12 rue de l'Exemple, 44000 Nantes",
    precision: 'Adresse postale complète',
  },
  // Que des zeros, volontairement : la cle de controle est fausse, donc ce
  // numero ne peut correspondre a aucune entreprise existante. Un SIRET
  // plausible en designerait une au hasard.
  { libelle: 'Numéro SIRET', valeur: '000 000 000 00000' },
  { libelle: 'Numéro de TVA intracommunautaire', valeur: 'FR00 000000000' },
  {
    libelle: 'Directeur de la publication',
    valeur: 'La présidence de Relève SAS',
    precision: 'Nom et qualité',
  },
  { libelle: 'Adresse de contact', valeur: ADRESSE_CONTACT },
];

/** Ce qui tient a l'activite reglementee de travail temporaire. */
export const ACTIVITE: Mention[] = [
  {
    libelle: 'Garantie financière (travail temporaire)',
    valeur: "Établissement garant fictif, 12 rue de l'Exemple, 44000 Nantes",
    precision:
      "Organisme garant et adresse. Obligatoire pour une entreprise de travail temporaire — sans elle, l'activité ne peut pas être exercée",
  },
  {
    libelle: 'Déclaration préalable auprès de l’inspection du travail',
    valeur: 'Déclaration fictive n° ETT-0000000',
    precision: 'Référence de la déclaration d’activité d’entreprise de travail temporaire',
  },
  {
    libelle: 'Déclaration de services à la personne',
    valeur: 'Déclaration fictive n° SAP 000 000 000',
    precision: 'Numéro de déclaration, le cas échéant',
  },
  {
    libelle: 'Assurance de responsabilité civile professionnelle',
    valeur: 'Assureur fictif, police n° RCP-0000000',
  },
];

/** Ou tourne le site. */
export const HEBERGEMENT: Mention[] = [
  {
    libelle: 'Hébergeur',
    valeur: "Hébergeur fictif, 12 rue de l'Exemple, 44000 Nantes",
    precision: 'Dénomination, adresse et téléphone',
  },
  {
    libelle: 'Localisation des données',
    valeur: 'France (Union européenne)',
    precision: 'Pays d’hébergement des serveurs',
  },
];

/**
 * Qui repond des traitements, et aupres de qui se plaindre.
 *
 * Les trois dernieres valeurs ne sont pas fictives : elles decrivent ce que le
 * code fait vraiment. La duree des pieces est celle qu'appliquent
 * `conservation:relancer` et `conservation:purger` ; l'absence de sous-traitant
 * autre que l'hebergeur et le service de courriel, comme l'absence de transfert
 * hors UE, se verifient dans le depot.
 */
export const DONNEES: Mention[] = [
  {
    libelle: 'Responsable de traitement',
    valeur: "Relève SAS, identique à l'éditeur",
    precision: "Personne morale, identique à l'éditeur sauf exception",
  },
  {
    libelle: 'Délégué à la protection des données',
    valeur: 'Aucun délégué désigné',
    precision: "Nom et adresse de contact, s'il en existe un",
  },
  {
    libelle: 'Durée de conservation des dossiers candidats',
    valeur: 'Dossier : 2 ans après le dernier contact. Pièces justificatives : 12 mois.',
    precision: 'Durée retenue après le dernier contact, et son point de départ',
  },
  {
    libelle: 'Sous-traitants et destinataires',
    valeur: "Hébergeur et service d'envoi de courriels. Aucun autre destinataire.",
    precision: 'Hébergeur, service d’envoi de courriels, logiciel de paie…',
  },
  {
    libelle: 'Transferts hors Union européenne',
    valeur: 'Aucun',
    precision: 'Aucun, ou la liste des transferts et leur encadrement',
  },
];

/** Recours ouvert a toute personne concernee, quelle que soit l'agence. */
export const AUTORITE_CONTROLE =
  'Commission nationale de l’informatique et des libertés (CNIL) — cnil.fr';
