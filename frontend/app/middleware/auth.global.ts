import { ROLES_AGENCE, type RoleUtilisateur } from '@releve/shared';

/**
 * Tout est ferme par defaut. Une page ouverte se declare explicitement dans
 * PAGES_OUVERTES : c'est le sens le moins dangereux, un ecran ajoute sans y
 * penser reste protege.
 */
const PAGES_OUVERTES = new Set([
  '/bienvenue',
  '/connexion',
  '/inscription',
  '/inscription/interimaire',
  '/inscription/etablissement',
  // Ouvertes par necessite : on y arrive depuis un courriel, donc sans
  // session. La premiere en cree meme une.
  '/verification',
  '/mot-de-passe-oublie',
  '/reinitialisation',
]);

/**
 * Pages vitrine : lisibles par tout le monde, connecte ou non.
 *
 * Elles se distinguent de PAGES_OUVERTES sur un point precis. Une page ouverte
 * est un guichet — connexion, inscription, reinitialisation : une session deja
 * ouverte n'y a rien a faire, et le middleware renvoie donc vers l'espace du
 * profil. Une page vitrine est de la lecture : renvoyer un candidat connecte
 * qui ouvre les mentions legales serait absurde, et pour cette page-la
 * juridiquement discutable.
 */
const PAGES_VITRINE = new Set([
  '/accueil',
  '/fonctionnement',
  '/a-propos',
  '/faq',
  '/contact',
  '/mentions-legales',
  '/conditions-utilisation',
  '/politique-confidentialite',
  // Pas de la vitrine, mais la meme regle : on y arrive par un lien recu apres
  // un an sans nouvelles, donc le plus souvent sans session — et renvoyer vers
  // son tableau de bord quelqu'un qui *est* connecte lui ferait perdre la
  // decision qu'on lui demande de prendre.
  '/conservation',
]);

/**
 * Sections vitrine déclarées en préfixe.
 *
 * `PAGES_VITRINE` fait des égalités exactes, ce qui ne saurait pas couvrir une
 * page portant un identifiant. `/offres` n'en a plus aujourd'hui, mais la
 * rubrique est appelée à s'étoffer d'une fiche par mission, et l'oubli se
 * remarquerait mal : la page s'afficherait, puis renverrait vers le formulaire
 * de connexion pour une annonce pourtant publique.
 *
 * À ne pas confondre avec `/missions`, qui porte les missions vues depuis
 * l'espace d'un candidat connecté.
 */
const SECTIONS_VITRINE = ['/offres'] as const;

function vitrine(chemin: string): boolean {
  return (
    PAGES_VITRINE.has(chemin) ||
    SECTIONS_VITRINE.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))
  );
}

/**
 * Pages communes aux deux profils externes : leur fiche et leur mot de passe.
 * Le reste du site est le back-office de l'agence, et l'API le refuserait de
 * toute facon — autant ne pas afficher un ecran qui se videra.
 */
const PAGES_EXTERNES = new Set(['/mon-espace', '/mon-compte']);

/**
 * Sections propres a chaque profil externe, issues des ecrans Figma. Elles sont
 * declarees en prefixes parce que plusieurs portent un identifiant
 * (`/missions/:id`, `/etablissement/candidats/:id`), qu'un Set d'egalites ne
 * saurait pas couvrir.
 */
const SECTIONS_PAR_ROLE: Partial<Record<RoleUtilisateur, readonly string[]>> = {
  CANDIDAT: [
    '/tableau-de-bord',
    '/missions',
    '/suivi',
    '/candidature',
    '/mon-profil',
    // Annonces partenaire : le marche collecte sur France Travail. Reserve au
    // candidat, et l'API le referme une seconde fois sur le dossier valide.
    '/annonces',
  ],
  CLIENT: ['/etablissement'],
};

/**
 * Les memes sections, vues depuis l'agence : elles lui sont fermees aussi.
 *
 * Elles etaient ouvertes aux comptes internes, au motif que l'API tranche de
 * toute facon. C'est vrai pour les donnees, et faux pour ce qui s'affiche
 * autour. Un charge de recrutement qui tapait `/missions/:id` lisait « Je
 * candidate a cette mission », et `/suivi` lui parlait de « vos candidatures » ;
 * `/annonces` faisait pire, puisque l'API repond 403 a un compte non candidat
 * et que l'ecran traduisait ce refus en « les annonces sont momentanement
 * indisponibles » — un message qui accuse une panne la ou il n'y a qu'une porte
 * fermee.
 *
 * Aucun ecran de l'agence ne mene ici : sa navigation tient en Vivier, Clients,
 * Tension et Comptes, et les liens vers `/missions` partent tous de l'espace
 * candidat. Fermer ne retire donc rien, et evite d'avoir a maintenir deux
 * redactions par ecran pour un chemin que personne n'emprunte.
 *
 * La liste se deduit de `SECTIONS_PAR_ROLE` plutot que d'etre recopiee : une
 * section ajoutee a un profil externe sera fermee a l'agence sans que personne
 * ait a y penser.
 */
const SECTIONS_EXTERNES: readonly string[] = Object.values(SECTIONS_PAR_ROLE).flat();

function reserveeAuxExternes(chemin: string): boolean {
  return SECTIONS_EXTERNES.some(
    (prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`),
  );
}

/** Page d'atterrissage apres connexion, par profil externe. */
const ACCUEILS_EXTERNES: Partial<Record<RoleUtilisateur, string>> = {
  // Le canvas fait du tableau de bord la premiere page de l'espace candidat :
  // il recapitule ce qui manque au dossier, ce que l'ecran des missions ne dit
  // pas.
  CANDIDAT: '/tableau-de-bord',
  CLIENT: '/etablissement',
};

function estInterne(role: RoleUtilisateur): boolean {
  return (ROLES_AGENCE as readonly RoleUtilisateur[]).includes(role);
}

function sectionAutorisee(role: RoleUtilisateur, chemin: string): boolean {
  return (SECTIONS_PAR_ROLE[role] ?? []).some(
    (prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`),
  );
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { utilisateur, rafraichir } = useSession();
  const ouverte = PAGES_OUVERTES.has(to.path);

  // Les jetons sont httpOnly : le middleware ne peut pas les lire. C'est donc
  // l'API qui tranche, via /auth/moi, et le resultat reste en memoire pour les
  // navigations suivantes.
  if (!utilisateur.value) {
    await rafraichir();
  }

  // Une page vitrine s'affiche telle quelle. La session est tout de meme lue :
  // c'est elle qui decide de la coque — un candidat connecte qui ouvre la FAQ
  // reste dans son espace, avec sa barre laterale, plutot que de se voir
  // proposer de se connecter.
  if (vitrine(to.path)) {
    return;
  }

  if (!utilisateur.value) {
    if (ouverte) return;

    // La racine est le vivier de l'agence : un visiteur y arrive par le nom de
    // domaine, pas pour un back-office. Il est conduit a la vitrine, et non a
    // un formulaire de connexion qu'il n'a pas demande.
    return navigateTo(to.path === '/' ? '/accueil' : '/connexion');
  }

  const role = utilisateur.value.role;
  const interne = estInterne(role);
  const accueil = interne ? '/' : (ACCUEILS_EXTERNES[role] ?? '/mon-espace');

  if (ouverte) {
    return navigateTo(accueil);
  }

  if (interne) {
    // `/mon-compte` reste ouvert : c'est le mot de passe de la personne, pas un
    // espace externe, et la barre de l'agence y conduit.
    return reserveeAuxExternes(to.path) ? navigateTo(accueil) : undefined;
  }

  if (!PAGES_EXTERNES.has(to.path) && !sectionAutorisee(role, to.path)) {
    return navigateTo(accueil);
  }
});
