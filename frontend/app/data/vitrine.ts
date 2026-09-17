/**
 * Contenu des pages vitrine.
 *
 * Regroupe ici plutot que disperse dans six gabarits : ce sont les seuls textes
 * du front qu'une personne non technique aura a relire et a reecrire.
 *
 * Deux avertissements valables pour tout le fichier.
 *
 * 1. Le canvas decrit un chargement de documents — NIR, CV, diplomes, piece
 *    d'identite, RIB — que l'API ne sait pas faire : ni modele de fichier, ni
 *    route de televersement. Les textes repris ici decrivent donc le parcours
 *    reel. Une vitrine qui promet un televersement inexistant produit des
 *    inscriptions decues et des demandes au support.
 * 2. Les chiffres du canvas (« 12 missions ouvertes », « 48 h », « 17–21 € »)
 *    et ses coordonnees sont des exemples. Ils ne sont pas repris : publies tels
 *    quels, ce seraient de fausses annonces, dont une sur la remuneration. Les
 *    emplacements existent, il n'y manque que les valeurs de l'agence.
 */

import { ADRESSE_CONTACT } from '@releve/shared';

/** Slogan du canvas, repris en accroche sur chaque page vitrine. */
export const ACCROCHE = 'Le soin, sans attendre';

/**
 * Adresse de l'agence.
 *
 * Reprise du paquet partage : c'est elle que l'API prend pour destinataire du
 * formulaire de contact, sauf si le deploiement fixe `CONTACT_EMAIL`. Deux
 * valeurs separees donneraient une page qui annonce une adresse et un courriel
 * qui part ailleurs.
 */
export { ADRESSE_CONTACT };

/**
 * Chiffres de l'en-tete d'accueil.
 *
 * Volontairement vide : le bloc ne s'affiche que s'il est rempli. Le canvas y
 * proposait « 12 missions ouvertes pres de Lyon », « 48 h de delai moyen » et
 * « 17–21 € brut horaire » — a remplacer par les chiffres reels de l'agence,
 * pas a publier tels quels.
 */
export const CHIFFRES_CLES: readonly { valeur: string; libelle: string }[] = [];

/**
 * Missions de l'encart d'accueil.
 *
 * `GET /missions` exige une session : un visiteur ne peut pas voir les vraies
 * offres. Le canvas resout la meme difficulte en affichant des exemples
 * explicitement etiquetes — c'est ce que fait l'encart, badge compris.
 */
export const MISSIONS_EXEMPLE = [
  { initiales: 'LT', nom: 'Les Tilleuls (SAAD)', lieu: 'Lyon 3e', taux: '13,50 €/h', horaires: '06:45-14:15' },
  { initiales: 'DP', nom: 'Domicile Plus (SAAD)', lieu: 'Villeurbanne', taux: '12,20 €/h', horaires: '08:00-11:00' },
  { initiales: 'MA', nom: "Maison d'Alix (SAAD)", lieu: 'Lyon 7e', taux: '13,90 €/h', horaires: '08:00-12:00' },
] as const;

/** Les trois etapes de l'accueil. */
export const ETAPES = [
  {
    n: '1',
    titre: 'Créez votre compte',
    corps:
      "Identité, téléphone, adresse et rayon de déplacement. Un lien de confirmation part vers votre adresse mail : il est valable 48 heures et ne sert qu'une fois.",
  },
  {
    n: '2',
    titre: 'Complétez votre dossier',
    corps:
      "Disponibilités, diplômes et expérience professionnelle. L'agence vérifie chaque déclaration sur pièce avant qu'elle ne compte.",
  },
  {
    n: '3',
    titre: 'Candidatez en un clic',
    corps:
      'Filtrez les missions par proximité, par date ou par rémunération. Le contrat, la paie et les déclarations sont gérés par l’agence.',
  },
] as const;

/**
 * Ce que contient un dossier candidat.
 *
 * Remplace la liste de documents du canvas, qui enumerait des fichiers a
 * televerser. Ce sont les elements que la fiche porte vraiment, et la colonne
 * de droite dit qui les etablit — la difference entre une declaration et une
 * verification est tout le sujet de cette plateforme.
 */
export const DOSSIER = [
  { libelle: 'Coordonnées et adresse', etat: 'Déclarées par vous', verifie: false },
  { libelle: 'Rayon de déplacement', etat: 'Déclaré par vous', verifie: false },
  { libelle: 'Disponibilités hebdomadaires', etat: 'Déclarées par vous', verifie: false },
  { libelle: 'Diplômes', etat: "Vérifiés par l'agence", verifie: true },
  { libelle: 'Expérience professionnelle', etat: "Vérifiée par l'agence", verifie: true },
] as const;

/** Ce que l'agence prend en charge — activite d'agence, pas fonction logicielle. */
export const PRISE_EN_CHARGE = [
  "Déclaration préalable à l'embauche (URSSAF)",
  'Contrat de mission et avenants',
  'Fiches de paie et versement des acomptes',
  'Assurance et couverture pendant la mission',
] as const;

/** Le parcours detaille de la page « Comment ça marche ». */
export const PARCOURS = [
  {
    n: '1',
    titre: 'Inscription',
    corps:
      'Prénom, nom, téléphone, adresse, rayon de déplacement et mot de passe. Aucune donnée de santé ne vous est demandée.',
  },
  {
    n: '2',
    titre: "Confirmation de l'adresse",
    corps:
      "Un lien part vers votre adresse mail. Tant qu'il n'est pas ouvert, la connexion est refusée : c'est cette adresse qui vous identifie.",
  },
  {
    n: '3',
    titre: 'Secteur et disponibilités',
    corps:
      "Votre adresse est localisée pour mesurer les distances, et votre rayon décide des missions qui vous sont proposées. Au-delà, une mission est écartée, pas seulement moins bien classée.",
  },
  {
    n: '4',
    titre: 'Diplômes et expérience',
    corps:
      "Vous déclarez, l'agence vérifie sur justificatif. Tant qu'un diplôme n'est pas vérifié, il ne vous rend éligible à aucune mission.",
  },
  {
    n: '5',
    titre: 'Recherche et candidature',
    corps:
      'Filtres par proximité, date et rémunération. Le détail de chaque mission précise la date, les horaires, la rémunération indicative, le lieu et les prérequis.',
  },
  {
    n: '6',
    titre: 'Mission',
    corps:
      "L'établissement retient une candidature, l'agence établit le contrat. La mission confirmée apparaît dans votre suivi.",
  },
] as const;

/** Les trois positionnements de la page « À propos ». */
export const VALEURS = [
  {
    titre: 'Un seul métier',
    corps:
      "Nous ne plaçons que des profils de l'aide à domicile, ce qui permet de qualifier chaque mission sérieusement.",
  },
  {
    titre: 'Réactivité',
    corps:
      "Les missions qui commencent aujourd'hui ou demain sont signalées comme urgentes et pourvues dans la journée quand c'est possible.",
  },
  {
    titre: 'Transparence',
    corps:
      'Rémunération indicative, horaires, tâches et prérequis sont affichés avant la candidature. Pas de surprise à l’arrivée.',
  },
] as const;

/**
 * Questions frequentes.
 *
 * Les reponses du canvas decrivaient le televersement de documents, leurs
 * formats et leur suppression « de nos serveurs ». Elles sont remplacees par le
 * fonctionnement reel : declaration, verification par l'agence, rayon.
 */
export const QUESTIONS = [
  {
    question: 'Comment compléter mon dossier candidat ?',
    reponse:
      "Depuis votre espace, page « Mon profil » : coordonnées et secteur, rayon de déplacement, disponibilités hebdomadaires, diplômes et expérience. Chaque élément renseigné fait monter votre taux de complétude, affiché sur votre tableau de bord.",
  },
  {
    question: "Pourquoi mon diplôme n'est-il pas pris en compte ?",
    reponse:
      "Un diplôme déclaré ne compte qu'une fois vérifié par l'agence sur justificatif. Tant qu'il ne l'est pas, il ne vous rend éligible à aucune mission. La même règle vaut pour l'expérience professionnelle.",
  },
  {
    question: 'Pourquoi certaines missions ne me sont-elles pas proposées ?',
    reponse:
      "Une mission située au-delà de votre rayon de déplacement est écartée. Une adresse que nous n'arrivons pas à localiser produit le même effet : votre profil signale alors « adresse non localisée ».",
  },
  {
    question: 'Où suivre mes candidatures ?',
    reponse:
      'Votre tableau de bord récapitule vos candidatures envoyées, celles en attente de réponse et vos missions confirmées. La page « Suivi » affiche le détail de la prochaine mission confirmée.',
  },
  {
    question: 'Puis-je candidater avec un dossier incomplet ?',
    reponse:
      "La candidature est refusée si le diplôme exigé par la mission n'est pas vérifié dans votre dossier. Le motif exact vous est affiché, pour que vous sachiez ce qui manque.",
  },
  {
    question: 'Quelles données de santé conservez-vous ?',
    reponse:
      "Aucune. L'agence enregistre seulement si vous êtes déployable, jamais pourquoi. La visite médicale et la vaccination sont constatées sur pièce par l'agence, elles ne sont jamais déclarées par vous.",
  },
] as const;

/**
 * Coordonnees de la page contact.
 *
 * Seule l'adresse mail est reelle — c'est celle que l'ecran d'inscription donne
 * deja aux etablissements. Le canvas proposait en plus un numero de telephone
 * et des horaires d'ouverture : a ajouter ici quand l'agence les aura fournis.
 */
export const COORDONNEES = [
  { libelle: 'Adresse mail', valeur: ADRESSE_CONTACT },
] as const;

/**
 * Les sujets du formulaire de contact vivent dans `@releve/shared` : l'API les
 * valide, donc un sujet ajoute ici seul serait refuse a l'envoi.
 */
