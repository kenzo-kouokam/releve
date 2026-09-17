/**
 * Preparation des offres publiques.
 *
 * Tout ce fichier est volontairement sans dependance : ni base, ni reseau, ni
 * Nest. Ce sont les regles metier de la preparation, et elles doivent pouvoir
 * se tester sur une chaine de caracteres, pas sur un jeu d'integration.
 *
 * Deux lectures cohabitent ici, et il faut les garder distinctes.
 *
 * L'affichage republie l'annonce telle que l'employeur l'a ecrite : la licence
 * de reutilisation France Travail impose de restituer le contenu sans le
 * denaturer, donc rien n'est reformule et rien n'est retire — sauf les
 * coordonnees du recruteur, explicitement exclues de la reutilisation.
 *
 * La statistique, elle, a besoin de regrouper : l'intitule ramene au
 * referentiel ROME, le salaire converti en taux horaire, et une empreinte qui
 * reconnait les republications. Ces valeurs derivees sont calculees ici et
 * portees par la meme ligne, mais elles ne remplacent jamais l'original.
 */

/** Heures mensuelles de reference pour un temps plein (35 h hebdomadaires). */
const HEURES_PAR_MOIS = 151.67;

/** Mois payes par defaut quand le libelle annuel n'en precise pas. */
const MOIS_PAR_AN = 12;

/**
 * Garde-fous : au-dela, c'est une erreur de lecture, pas un salaire.
 * Le SMIC horaire brut sert de plancher plausible, avec une marge vers le bas
 * pour les libelles anciens.
 */
const TAUX_HORAIRE_MIN = 8;
const TAUX_HORAIRE_MAX = 120;

/**
 * Offre telle que l'API la renvoie.
 *
 * Le champ `contact` existe dans la reponse et n'est volontairement pas declare
 * ici : la licence de reutilisation exclut les donnees de contact, et un champ
 * absent du type est un champ qu'on ne peut pas recopier par distraction.
 */
export interface OffreBrute {
  id: string;
  intitule?: string;
  description?: string;
  appellationlibelle?: string;
  romeCode?: string;
  romeLibelle?: string;
  entreprise?: { nom?: string; description?: string };
  lieuTravail?: {
    libelle?: string;
    commune?: string;
    codePostal?: string;
    latitude?: number;
    longitude?: number;
  };
  salaire?: { libelle?: string };
  experienceExige?: string;
  experienceLibelle?: string;
  qualificationLibelle?: string;
  secteurActiviteLibelle?: string;
  competences?: { code?: string; libelle?: string; exigence?: string }[];
  contexteTravail?: { horaires?: string[]; conditionsExercice?: string[] };
  dureeTravailLibelle?: string;
  dureeTravailLibelleConverti?: string;
  natureContrat?: string;
  typeContratLibelle?: string;
  alternance?: boolean;
  nombrePostes?: number;
  dateCreation?: string;
  dateActualisation?: string;
  typeContrat?: string;
  origineOffre?: { origine?: string; urlOrigine?: string };
}

/**
 * Offre prete a etre enregistree.
 *
 * Une seule ligne porte les deux usages. L'affichage lit `intitule`,
 * `description` et les libelles d'origine ; la statistique lit
 * `intituleNormalise`, `tauxHoraire` et `empreinte`. Deux tables auraient
 * demande de garder deux copies synchronisees de la meme annonce, pour le seul
 * benefice de separer deux lectures qui ne se genent pas.
 */
export interface OffrePreparee {
  id: string;
  romeCode: string | null;
  romeLibelle: string | null;

  /** Tel que l'employeur l'a ecrit. C'est ce qui s'affiche. */
  intitule: string;
  /** Ramene a l'appellation du referentiel, pour regrouper. Jamais affiche. */
  intituleNormalise: string;
  description: string | null;

  entreprise: string | null;
  entrepriseDescription: string | null;

  /**
   * Null quand le lieu n'est pas situable ("France entiere", et quelques
   * offres sans code postal). L'annonce reste publiable — elle sort seulement
   * des agregats departementaux.
   */
  departement: string | null;
  /** Nom lisible, tire du libelle du lieu : "74 - Thenes" donne "Thenes". */
  communeNom: string | null;
  /** Code INSEE, que l'API range sous `lieuTravail.commune`. */
  communeCode: string | null;
  codePostal: string | null;
  latitude: number | null;
  longitude: number | null;

  tauxHoraire: number | null;
  salaireLibelle: string | null;

  experienceExigee: boolean;
  experienceLibelle: string | null;
  qualificationLibelle: string | null;
  secteurActiviteLibelle: string | null;
  competences: { code: string | null; libelle: string; exigence: string | null }[];
  horaires: string[];
  conditionsExercice: string[];

  dureeTravailLibelle: string | null;
  natureContrat: string | null;
  typeContrat: string | null;
  typeContratLibelle: string | null;
  alternance: boolean;
  nombrePostes: number;

  publieeLe: Date;
  /**
   * Date de derniere modification chez la source. La licence impose de
   * l'afficher, et elle sert aussi a ne pas reecrire une ligne inchangee.
   */
  actualiseeLe: Date | null;
  /** Lien vers l'annonce d'origine, exige par la licence. */
  urlOrigine: string | null;

  empreinte: string;
}

/**
 * Ramene un libelle de salaire a un taux horaire.
 *
 * L'API renvoie du texte libre, et huit formes differentes sur un echantillon
 * de cent cinquante offres : "Horaire de 15.0 Euros", "Mensuel de 1800.0 Euros
 * a 2000.0 Euros sur 12.0 mois", "Annuel de 24000.0 Euros", parfois suivi d'un
 * commentaire ("selon convention, diplome et anciennete").
 *
 * Sur une fourchette, on retient le milieu : le bas serait systematiquement
 * pessimiste pour une suggestion de taux, le haut systematiquement optimiste.
 *
 * Renvoie null des que le libelle n'est pas exploitable. Une offre sans salaire
 * lisible doit disparaitre du calcul, pas y entrer avec une valeur inventee.
 */
export function tauxHoraireDepuisLibelle(libelle: string | null | undefined): number | null {
  if (!libelle) {
    return null;
  }

  const texte = libelle.toLowerCase();

  // Les nombres sont ecrits "15.0" ou "1 800,50" selon les offres.
  const nombres = [...texte.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)/g)]
    .map((trouve) => Number(trouve[1]!.replace(/\s/g, '').replace(',', '.')))
    .filter((valeur) => Number.isFinite(valeur) && valeur > 0);

  if (!nombres.length) {
    return null;
  }

  const base = texte.startsWith('horaire')
    ? 'horaire'
    : texte.startsWith('mensuel')
      ? 'mensuel'
      : texte.startsWith('annuel')
        ? 'annuel'
        : null;

  if (!base) {
    return null;
  }

  // "sur 12.0 mois" est un nombre de mois, pas un montant : il ne doit pas
  // entrer dans la moyenne de la fourchette.
  const mois = /sur\s+(\d+(?:[.,]\d+)?)\s*mois/.exec(texte);
  const moisPayes = mois ? Number(mois[1]!.replace(',', '.')) : null;

  let montants = nombres;

  if (moisPayes !== null) {
    const index = montants.lastIndexOf(moisPayes);
    if (index >= 0) {
      montants = [...montants.slice(0, index), ...montants.slice(index + 1)];
    }
  }

  // Un commentaire libre ("prime segur + 200 euros") ajoute des nombres qui ne
  // sont pas le salaire : on ne garde que ce qui precede le premier separateur.
  const separateur = texte.search(/\s[-–]\s|,\s*selon|\(/);
  if (separateur > 0) {
    const avant = texte.slice(0, separateur);
    const gardes = [...avant.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)/g)]
      .map((trouve) => Number(trouve[1]!.replace(/\s/g, '').replace(',', '.')))
      .filter((valeur) => Number.isFinite(valeur) && valeur > 0 && valeur !== moisPayes);

    if (gardes.length) {
      montants = gardes;
    }
  }

  if (!montants.length) {
    return null;
  }

  // Milieu de fourchette : avec un seul montant, c'est ce montant.
  const moyenne = montants.reduce((somme, valeur) => somme + valeur, 0) / montants.length;

  // Le nombre de mois payes change le total annuel, jamais le taux horaire :
  // une annee de travail fait le meme nombre d'heures qu'on la paie en douze
  // ou en treize fois.
  const horaire =
    base === 'horaire'
      ? moyenne
      : base === 'mensuel'
        ? moyenne / HEURES_PAR_MOIS
        : moyenne / (MOIS_PAR_AN * HEURES_PAR_MOIS);

  if (horaire < TAUX_HORAIRE_MIN || horaire > TAUX_HORAIRE_MAX) {
    return null;
  }

  return Math.round(horaire * 100) / 100;
}

/**
 * Departement a partir des donnees de lieu.
 *
 * Le libelle est de la forme "85 - Chaize-Giraud", mais le code postal est plus
 * sur quand il est present. Les DOM tiennent sur trois chiffres, et la Corse
 * s'ecrit 2A / 2B dans le libelle alors que le code postal dit 20.
 */
export function departementDepuisLieu(lieu: OffreBrute['lieuTravail']): string | null {
  const parLibelle = /^\s*(\d{2,3}|2[AB])\s*-/.exec(lieu?.libelle ?? '');

  if (parLibelle) {
    return parLibelle[1]!.toUpperCase();
  }

  const codePostal = (lieu?.codePostal ?? '').trim();

  if (/^\d{5}$/.test(codePostal)) {
    return codePostal.startsWith('97') || codePostal.startsWith('98')
      ? codePostal.slice(0, 3)
      : codePostal.slice(0, 2);
  }

  return null;
}

/**
 * Nom lisible de la commune.
 *
 * Piege du format : `lieuTravail.commune` contient le code INSEE ("74280"), pas
 * le nom. Le nom n'existe que dans le libelle, derriere le numero de
 * departement : "74 - Thenes". Afficher le champ `commune` tel quel mettrait un
 * code a la place d'une ville sur chaque annonce.
 *
 * Certains libelles n'ont pas de prefixe departemental ("France entiere") : il
 * n'y a alors pas de commune a en tirer, et c'est bien null qu'il faut rendre.
 */
export function communeDepuisLieu(lieu: OffreBrute['lieuTravail']): string | null {
  const libelle = (lieu?.libelle ?? '').trim();
  const apresNumero = /^\s*(?:\d{2,3}|2[AB])\s*-\s*(.+)$/.exec(libelle);

  return apresNumero ? apresNumero[1]!.trim() || null : null;
}

/**
 * Ramene l'intitule a l'appellation du referentiel ROME.
 *
 * Les employeurs ecrivent "Aide soignant (F/H)", "AIDE SOIGNANT H/F - URGENT",
 * "Aide-soignant(e) de nuit". Regrouper sur ces chaines est impossible ; le
 * referentiel, lui, est stable. On ne garde le titre libre que si l'API n'a pas
 * su le rattacher.
 */
export function normaliserIntitule(offre: OffreBrute): string {
  const referentiel = offre.appellationlibelle?.trim() || offre.romeLibelle?.trim();

  if (referentiel) {
    // "Aide-soignant / Aide-soignante" : la forme masculin/feminin du
    // referentiel n'apporte rien a un regroupement.
    return referentiel.split('/')[0]!.trim();
  }

  return (offre.intitule ?? '')
    .replace(/\s*\((?:f\s*\/\s*h|h\s*\/\s*f)\)\s*/gi, ' ')
    .replace(/\s+(?:f\s*\/\s*h|h\s*\/\s*f)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Signature de dedoublonnage.
 *
 * Les agences republient la meme offre sous un nouvel identifiant : cinq cas
 * sur cent cinquante dans l'echantillon. Les compter separement gonflerait la
 * tension mesuree, qui est precisement ce qu'on veut mesurer juste.
 */
export function empreinteOffre(offre: {
  intituleNormalise: string;
  entreprise: string | null;
  commune: string | null;
  romeCode: string | null;
}): string {
  return [
    offre.romeCode ?? '—',
    offre.intituleNormalise,
    offre.entreprise ?? '—',
    offre.commune ?? '—',
  ]
    .map((partie) =>
      partie
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    )
    .join('|');
}

/** Texte utile, ou null : une chaine vide en base ne vaut pas mieux qu'un trou. */
function texte(valeur: string | null | undefined): string | null {
  return valeur?.trim() || null;
}

/**
 * Prepare une offre brute pour l'enregistrement.
 *
 * Ne renvoie null que si l'annonce est inexploitable telle quelle : sans
 * identifiant, sans titre ou sans date de publication, il n'y a ni quoi
 * afficher ni quoi mettre a jour.
 *
 * Tout le reste est conserve, y compris ce qui ne sert pas au barometre. Une
 * offre "France entiere" n'a pas de departement : elle sort des agregats
 * departementaux, elle ne sort pas du site. La version precedente l'ecartait,
 * ce qui etait juste pour une statistique et faux pour une republication.
 */
export function preparerOffre(brute: OffreBrute): OffrePreparee | null {
  const publiee = brute.dateCreation ? new Date(brute.dateCreation) : null;

  // L'appellation du referentiel sert de titre de repli quand l'employeur n'en
  // a pas saisi. Ce n'est pas denaturer l'annonce : il n'y a rien a respecter
  // quand il n'y a rien d'ecrit, et une offre sans aucun titre serait
  // inaffichable.
  const intituleNormalise = normaliserIntitule(brute);
  const intitule = texte(brute.intitule) ?? intituleNormalise;

  if (!brute.id || !intitule || !publiee || Number.isNaN(publiee.getTime())) {
    return null;
  }

  const actualisee = brute.dateActualisation ? new Date(brute.dateActualisation) : null;
  const romeCode = texte(brute.romeCode);
  const communeNom = communeDepuisLieu(brute.lieuTravail);
  const entreprise = texte(brute.entreprise?.nom);

  return {
    id: brute.id,
    romeCode,
    romeLibelle: texte(brute.romeLibelle),

    intitule,
    intituleNormalise: intituleNormalise || intitule,
    description: texte(brute.description),

    entreprise,
    entrepriseDescription: texte(brute.entreprise?.description),

    departement: departementDepuisLieu(brute.lieuTravail),
    communeNom,
    communeCode: texte(brute.lieuTravail?.commune),
    codePostal: texte(brute.lieuTravail?.codePostal),
    latitude: brute.lieuTravail?.latitude ?? null,
    longitude: brute.lieuTravail?.longitude ?? null,

    tauxHoraire: tauxHoraireDepuisLibelle(brute.salaire?.libelle),
    salaireLibelle: texte(brute.salaire?.libelle),

    // "D" signifie debutant accepte ; "E" et "S" exigent de l'experience.
    experienceExigee: ['E', 'S'].includes((brute.experienceExige ?? '').toUpperCase()),
    experienceLibelle: texte(brute.experienceLibelle),
    qualificationLibelle: texte(brute.qualificationLibelle),
    secteurActiviteLibelle: texte(brute.secteurActiviteLibelle),
    competences: (brute.competences ?? [])
      .filter((competence) => texte(competence.libelle))
      .map((competence) => ({
        code: texte(competence.code),
        libelle: competence.libelle!.trim(),
        exigence: texte(competence.exigence),
      })),
    horaires: (brute.contexteTravail?.horaires ?? []).map((ligne) => ligne.trim()).filter(Boolean),
    conditionsExercice: (brute.contexteTravail?.conditionsExercice ?? [])
      .map((ligne) => ligne.trim())
      .filter(Boolean),

    dureeTravailLibelle: texte(brute.dureeTravailLibelle),
    natureContrat: texte(brute.natureContrat),
    typeContrat: texte(brute.typeContrat),
    typeContratLibelle: texte(brute.typeContratLibelle),
    alternance: brute.alternance ?? false,
    nombrePostes: Math.max(1, brute.nombrePostes ?? 1),

    publieeLe: publiee,
    actualiseeLe: actualisee && !Number.isNaN(actualisee.getTime()) ? actualisee : null,
    urlOrigine: texte(brute.origineOffre?.urlOrigine),

    empreinte: empreinteOffre({ intituleNormalise, entreprise, commune: communeNom, romeCode }),
  };
}

export interface ResultatNettoyage {
  offres: OffrePreparee[];
  recues: number;
  /** Inexploitables : sans identifiant, sans titre ou sans date. */
  ecartees: number;
  /** Republications reperees. Comptees, plus supprimees — voir ci-dessous. */
  doublons: number;
  /** Retenues mais hors agregats departementaux : lieu non situable. */
  sansDepartement: number;
  sansSalaire: number;
}

/**
 * Prepare un lot.
 *
 * Les republications ne sont plus retirees, et c'est le changement important.
 * La licence de reutilisation demande de restituer les offres mises a
 * disposition : en supprimer une parce qu'une agence concurrente publie la
 * meme, c'est amputer le catalogue d'annonces qui existent bel et bien.
 *
 * Elles restent comptees, parce que le barometre, lui, doit continuer a n'en
 * voir qu'une — il dedoublonne desormais sur `empreinte` au moment du calcul.
 * C'est d'ailleurs plus juste qu'avant : le tri par lot ne voyait pas deux
 * republications arrivees dans deux imports differents, et le barometre les
 * comptait deux fois.
 */
export function preparerLot(brutes: OffreBrute[]): ResultatNettoyage {
  const offres: OffrePreparee[] = [];
  const empreintesVues = new Set<string>();
  let ecartees = 0;
  let doublons = 0;

  for (const brute of brutes) {
    const offre = preparerOffre(brute);

    if (!offre) {
      ecartees += 1;
      continue;
    }

    if (empreintesVues.has(offre.empreinte)) {
      doublons += 1;
    } else {
      empreintesVues.add(offre.empreinte);
    }

    offres.push(offre);
  }

  return {
    offres,
    recues: brutes.length,
    ecartees,
    doublons,
    sansDepartement: offres.filter((offre) => offre.departement === null).length,
    sansSalaire: offres.filter((offre) => offre.tauxHoraire === null).length,
  };
}
