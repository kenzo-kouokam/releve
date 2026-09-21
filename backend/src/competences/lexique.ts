/**
 * Le vocabulaire metier cherche dans les offres France Travail.
 *
 * ## Pourquoi une liste, et pas une extraction pure
 *
 * L'API expose bien un champ `competences`, structure et propre. Il est
 * presque toujours vide : sur l'echantillon de reference
 * (`backend/donnees/offres-echantillon.json`, 102 offres reelles), **deux
 * offres** le renseignent. Le signal est ailleurs — dans le corps de l'annonce,
 * ecrit en prose par l'employeur ou son agence.
 *
 * Extraire des n-grammes de ces descriptions ne donne pas des competences. Les
 * expressions les plus frequentes du corpus sont « parking gratuit », « piste
 * cyclable principale » et « fortes valeurs humaines » : de l'argumentaire de
 * recrutement, recopie d'une annonce a l'autre. Proposer cela a un
 * etablissement qui redige son besoin serait pire que de ne rien proposer.
 *
 * ## Le partage retenu
 *
 * Le **vocabulaire** est ici, en clair, versionne, discutable en revue. Les
 * **frequences** viennent entierement de la donnee publique : une entree qu'on
 * ne lit dans aucune offre active n'entre pas au referentiel, et le classement
 * propose a l'etablissement est celui du marche, pas le notre.
 *
 * C'est donc une lecture assistee du corpus, et il faut la nommer comme telle
 * plutot que de laisser croire a une decouverte automatique. Le jour ou l'API
 * renseignera `competences` pour de bon, le lexique deviendra un filet de
 * securite au lieu d'une source — `reconstruire()` lit deja les deux.
 *
 * ## Comment ajouter une entree
 *
 * Les `variantes` sont comparees au texte **normalise** : minuscules, sans
 * accents, tout ce qui n'est ni lettre ni chiffre ramene a une espace. Elles
 * s'ecrivent donc deja sous cette forme — « aide a la toilette », jamais « aide
 * à la toilette ». Une variante d'un seul mot court est a eviter : « change »
 * se lit dans « rien ne change », et une competence fantome coute plus cher
 * qu'une competence manquante.
 */

export interface EntreeLexique {
  /** Libelle d'affichage, tel qu'il sera coche par l'etablissement. */
  libelle: string;
  /** Formulations cherchees dans le texte normalise des offres. */
  variantes: readonly string[];
  /** Metiers ou l'entree a un sens. Une entree peut valoir pour les deux. */
  romes: readonly string[];
}

/** Aide-soignant. */
const SOINS = 'J1501';

/** Accompagnant educatif et social. */
const ACCOMPAGNEMENT = 'K1302';

const LES_DEUX = [SOINS, ACCOMPAGNEMENT] as const;

export const LEXIQUE_METIER: readonly EntreeLexique[] = [
  // ------------------------------------------------------------ soins du corps
  {
    libelle: "Soins d'hygiène et de confort",
    variantes: ['soins d hygiene', 'hygiene et de confort', 'soins de confort'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Aide à la toilette',
    variantes: ['aide a la toilette', 'toilette complete', 'toilette au lit', 'realisation des toilettes'],
    romes: LES_DEUX,
  },
  {
    libelle: "Aide à l'habillage et au déshabillage",
    variantes: ['habillage', 'deshabillage'],
    romes: LES_DEUX,
  },
  {
    libelle: "Change et soins d'élimination",
    variantes: ['changes', 'protection anatomique', 'soins d elimination'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Nursing',
    variantes: ['nursing'],
    romes: [SOINS],
  },

  // ------------------------------------------------------- lever et mobilité
  {
    libelle: 'Aide au lever et au coucher',
    variantes: ['aide au lever', 'lever et le coucher', 'lever et au coucher', 'couchers'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Transferts et mobilisation',
    variantes: ['transferts', 'mobilisation du patient', 'mobilisation des residents'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Utilisation du lève-personne',
    variantes: ['leve personne', 'verticalisateur', 'rail de transfert'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Aide à la marche et prévention des chutes',
    variantes: ['aide a la marche', 'prevention des chutes', 'risque de chute'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Gestes et postures, manutention des personnes',
    variantes: ['gestes et postures', 'manutention des personnes', 'manutention de personnes'],
    romes: LES_DEUX,
  },

  // ------------------------------------------------------------- alimentation
  {
    libelle: 'Aide à la prise des repas',
    variantes: ['aide aux repas', 'aide a la prise des repas', 'prise des repas', 'aide au repas'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Distribution et service des repas',
    variantes: ['distribution des repas', 'service des repas', 'service du petit dejeuner'],
    romes: LES_DEUX,
  },
  {
    libelle: "Surveillance de l'hydratation et de la dénutrition",
    variantes: ['hydratation', 'denutrition', 'surveillance alimentaire'],
    romes: [SOINS],
  },

  // -------------------------------------------------------- surveillance clinique
  {
    libelle: 'Prise des constantes',
    variantes: ['prise des constantes', 'parametres vitaux', 'constantes vitales', 'prise de tension'],
    romes: [SOINS],
  },
  {
    libelle: "Surveillance de l'état général",
    variantes: ['surveillance de l etat', 'observation clinique', 'surveiller l etat de sante'],
    romes: [SOINS],
  },
  {
    libelle: 'Prévention des escarres',
    variantes: ['escarres', 'prevention d escarre'],
    romes: [SOINS],
  },
  {
    libelle: 'Prise en charge de la douleur',
    variantes: ['prise en charge de la douleur', 'evaluation de la douleur'],
    romes: [SOINS],
  },
  {
    libelle: 'Aide à la prise des traitements préparés',
    variantes: ['distribution des medicaments', 'aide a la prise des traitements', 'aide a la prise de medicaments'],
    romes: [SOINS],
  },

  // ---------------------------------------------------------- accompagnement
  {
    libelle: 'Accompagnement des troubles cognitifs',
    variantes: ['troubles cognitifs', 'alzheimer', 'maladies neurodegeneratives', 'troubles du comportement'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Travail en unité protégée',
    variantes: ['unite protegee', 'unite de vie protegee', 'uhr', 'pasa'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Accompagnement de fin de vie',
    variantes: ['fin de vie', 'soins palliatifs', 'accompagnement palliatif'],
    romes: [SOINS],
  },
  {
    libelle: "Stimulation de l'autonomie",
    variantes: ['maintien de l autonomie', 'stimulation de l autonomie', 'preserver l autonomie'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Animation et activités adaptées',
    variantes: ['animation', 'activites adaptees', 'ateliers therapeutiques'],
    romes: [ACCOMPAGNEMENT],
  },
  {
    libelle: 'Accompagnement aux actes de la vie quotidienne',
    variantes: ['actes de la vie quotidienne', 'vie quotidienne', 'gestes du quotidien'],
    romes: [ACCOMPAGNEMENT],
  },
  {
    libelle: "Participation au projet d'accompagnement personnalisé",
    variantes: ['projet d accompagnement personnalise', 'projet de vie', 'projet personnalise'],
    romes: [ACCOMPAGNEMENT],
  },

  // ------------------------------------------------------------ transmissions
  {
    libelle: 'Transmissions écrites et orales',
    variantes: ['transmissions', 'transmission des informations', 'relais aupres de l equipe'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Saisie sur logiciel de soins',
    variantes: ['dossier de soins informatise', 'netsoins', 'titan', 'logiciel de soins'],
    romes: [SOINS],
  },
  {
    libelle: 'Traçabilité des soins',
    variantes: ['tracabilite'],
    romes: [SOINS],
  },

  // --------------------------------------------------------------- hygiène des locaux
  {
    libelle: "Respect des protocoles d'hygiène",
    variantes: ['protocoles d hygiene', 'regles d hygiene', 'precautions standard', 'normes d hygiene'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Bionettoyage et désinfection du matériel',
    variantes: ['bionettoyage', 'desinfection du materiel', 'entretien du materiel'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Réfection des lits et gestion du linge',
    variantes: ['refection des lits', 'gestion du linge', 'entretien du linge'],
    romes: LES_DEUX,
  },
  {
    libelle: "Entretien de l'environnement du résident",
    variantes: ['entretien de la chambre', 'entretien de l environnement', 'entretien des locaux'],
    romes: LES_DEUX,
  },

  // ----------------------------------------------------------- relation et équipe
  {
    libelle: 'Travail en équipe pluridisciplinaire',
    variantes: ['equipe pluridisciplinaire', 'travail en equipe', 'equipe soignante'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Relation avec les familles',
    variantes: ['les familles', 'entourage familial'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Accueil du résident',
    variantes: ['accueil du resident', 'accueil des residents', 'accueil des nouveaux residents'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Écoute et bienveillance',
    variantes: ['bienveillance', 'ecoute active', 'qualites relationnelles'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Discrétion et secret professionnel',
    variantes: ['secret professionnel', 'discretion professionnelle', 'confidentialite'],
    romes: LES_DEUX,
  },

  // -------------------------------------------------------------- organisation
  {
    libelle: 'Travail de nuit',
    variantes: ['travail de nuit', 'poste de nuit', 'horaires de nuit'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Travail en week-end et jours fériés',
    variantes: ['week end', 'jours feries', 'un week end sur deux'],
    romes: LES_DEUX,
  },
  {
    libelle: 'Gestion des situations urgentes',
    variantes: ['situation d urgence', 'gestion des urgences', 'donner l alerte'],
    romes: [SOINS],
  },
];

/**
 * Garde-fou : deux entrees ne doivent pas porter le meme libelle.
 *
 * Un doublon creerait deux lignes du referentiel que rien ne distingue a
 * l'ecran, et l'etablissement en cocherait une au hasard. La verification est
 * faite au chargement du module plutot qu'en test : une liste editee a la main
 * merite d'echouer au demarrage, pas seulement en integration.
 */
const libelles = new Set(LEXIQUE_METIER.map((entree) => entree.libelle));

if (libelles.size !== LEXIQUE_METIER.length) {
  throw new Error('LEXIQUE_METIER : deux entrees portent le meme libelle');
}
