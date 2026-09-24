import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleUtilisateur } from '@releve/shared';

/**
 * La matrice d'acces du middleware de navigation.
 *
 * Pourquoi ce fichier existe alors que l'API tranche de toute facon : parce que
 * ce que l'API refuse, elle le refuse *apres* que l'ecran s'est affiche. Entre
 * les deux, un candidat a pu lire le titre d'une page du back-office, et un
 * charge de recrutement a pu lire « Je candidate a cette mission ». Le
 * middleware est la premiere porte, et jusqu'ici elle n'avait aucune couverture
 * automatisee — seulement un script d'audit lance a la main.
 *
 * Le middleware est un module Nuxt : il appelle `defineNuxtRouteMiddleware`,
 * `useSession` et `navigateTo` comme des globales auto-importees. On les pose
 * soi-meme avant de l'importer, ce qui evite de monter Nuxt pour eprouver une
 * fonction pure de bout en bout.
 */

type Session = { role: RoleUtilisateur } | null;

/** La derniere destination demandee par le middleware, ou `undefined`. */
let redirection: string | undefined;

/**
 * Charge le middleware avec une session donnee.
 *
 * Reimporte a chaque fois : le module lit ses globales au moment ou il
 * s'evalue, et un cache de module figerait la premiere session posee.
 */
async function middlewareAvec(session: Session) {
  vi.resetModules();
  redirection = undefined;

  vi.stubGlobal('defineNuxtRouteMiddleware', (fn: unknown) => fn);
  vi.stubGlobal('navigateTo', (cible: string) => {
    redirection = cible;

    return cible;
  });
  vi.stubGlobal('useSession', () => ({
    utilisateur: { value: session },
    // La session est deja resolue dans ces cas : `rafraichir` ne doit rien
    // changer, seulement ne pas exploser.
    rafraichir: async () => undefined,
  }));

  const module = await import('../app/middleware/auth.global');

  return module.default as (to: { path: string }) => Promise<string | undefined>;
}

/** Ou atterrit-on en demandant `chemin` avec cette session ? */
async function atterrissage(session: Session, chemin: string): Promise<string> {
  const middleware = await middlewareAvec(session);

  await middleware({ path: chemin });

  // Pas de redirection : la page demandee s'affiche telle quelle.
  return redirection ?? chemin;
}

const VISITEUR: Session = null;
const CANDIDAT: Session = { role: 'CANDIDAT' };
const CLIENT: Session = { role: 'CLIENT' };
const AGENCE: Session = { role: 'ADMIN_AGENCE' };
const CHARGE: Session = { role: 'CHARGE_RECRUTEMENT' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Les pages vitrine, lisibles par tout le monde.
 *
 * Elles se distinguent des pages ouvertes sur un point : une page ouverte est
 * un guichet — connexion, inscription — dont une session deja etablie n'a rien
 * a faire. Une page vitrine est de la lecture, et renvoyer un candidat connecte
 * qui ouvre les mentions legales serait absurde.
 */
const VITRINE = [
  '/accueil',
  '/fonctionnement',
  '/a-propos',
  '/faq',
  '/contact',
  '/offres',
  '/mentions-legales',
  '/conditions-utilisation',
  '/politique-confidentialite',
  '/conservation',
];

describe('middleware de navigation', () => {
  describe('visiteur sans session', () => {
    it.each(VITRINE)('laisse lire %s', async (chemin) => {
      expect(await atterrissage(VISITEUR, chemin)).toBe(chemin);
    });

    it.each([
      '/connexion',
      '/inscription',
      '/inscription/interimaire',
      '/inscription/etablissement',
      '/mot-de-passe-oublie',
      '/verification',
      '/reinitialisation',
    ])('laisse atteindre le guichet %s', async (chemin) => {
      expect(await atterrissage(VISITEUR, chemin)).toBe(chemin);
    });

    it.each([
      '/tableau-de-bord',
      '/mon-espace',
      '/mon-compte',
      '/mon-profil',
      '/etablissement',
      '/clients',
      '/missions',
      '/comptes',
      '/tension',
      '/annonces',
      '/suivi',
      '/besoins',
      '/besoins/abc-123',
    ])('ferme %s', async (chemin) => {
      expect(await atterrissage(VISITEUR, chemin)).toBe('/connexion');
    });

    /**
     * La racine est le vivier de l'agence. Un visiteur y arrive par le nom de
     * domaine, pas pour un back-office : il est conduit a la vitrine, et non a
     * un formulaire de connexion qu'il n'a pas demande.
     */
    it('conduit la racine vers la vitrine, pas vers la connexion', async () => {
      expect(await atterrissage(VISITEUR, '/')).toBe('/accueil');
    });
  });

  describe('candidat', () => {
    it.each(['/tableau-de-bord', '/missions', '/suivi', '/mon-profil', '/annonces'])(
      'laisse %s',
      async (chemin) => {
        expect(await atterrissage(CANDIDAT, chemin)).toBe(chemin);
      },
    );

    it.each(['/missions/abc-123', '/candidature/abc-123'])(
      'laisse la page a identifiant %s',
      async (chemin) => {
        expect(await atterrissage(CANDIDAT, chemin)).toBe(chemin);
      },
    );

    it.each(['/mon-espace', '/mon-compte'])('laisse la page commune %s', async (chemin) => {
      expect(await atterrissage(CANDIDAT, chemin)).toBe(chemin);
    });

    it.each(['/', '/clients', '/comptes', '/tension', '/etablissement', '/besoins'])(
      'renvoie %s vers son tableau de bord',
      async (chemin) => {
        expect(await atterrissage(CANDIDAT, chemin)).toBe('/tableau-de-bord');
      },
    );

    it('renvoie le guichet de connexion vers son espace', async () => {
      expect(await atterrissage(CANDIDAT, '/connexion')).toBe('/tableau-de-bord');
    });

    it('laisse lire la vitrine sans le sortir de son espace', async () => {
      expect(await atterrissage(CANDIDAT, '/faq')).toBe('/faq');
    });
  });

  describe('etablissement', () => {
    it.each(['/etablissement', '/etablissement/publier', '/etablissement/candidats/abc'])(
      'laisse %s',
      async (chemin) => {
        expect(await atterrissage(CLIENT, chemin)).toBe(chemin);
      },
    );

    it.each([
      '/',
      '/tableau-de-bord',
      '/clients',
      '/missions',
      '/annonces',
      '/connexion',
      '/besoins',
    ])(
      'renvoie %s vers son accueil',
      async (chemin) => {
        expect(await atterrissage(CLIENT, chemin)).toBe('/etablissement');
      },
    );
  });

  /**
   * Le sens le moins evident, et celui qui a ete corrige en dernier.
   *
   * Les comptes internes traversaient tout, au motif que l'API tranche de toute
   * facon. C'est vrai pour les donnees, et faux pour ce qui s'affiche autour :
   * `/missions/:id` proposait « Je candidate a cette mission » a un charge de
   * recrutement, et `/annonces` traduisait un 403 en « les annonces sont
   * momentanement indisponibles » — un message qui accuse une panne la ou il
   * n'y a qu'une porte fermee.
   */
  describe('agence', () => {
    it.each(['/', '/clients', '/tension', '/comptes', '/besoins', '/besoins/abc-123'])(
      'laisse son back-office %s',
      async (chemin) => {
        expect(await atterrissage(AGENCE, chemin)).toBe(chemin);
      },
    );

    it.each(['/mon-compte', '/mon-espace'])('laisse la page de compte %s', async (chemin) => {
      expect(await atterrissage(AGENCE, chemin)).toBe(chemin);
    });

    it.each([
      '/tableau-de-bord',
      '/missions',
      '/missions/abc-123',
      '/suivi',
      '/mon-profil',
      '/annonces',
      '/candidature/abc',
      '/etablissement',
      '/etablissement/publier',
    ])('ferme la section externe %s', async (chemin) => {
      expect(await atterrissage(AGENCE, chemin)).toBe('/');
    });

    it('applique la meme regle a un charge de recrutement', async () => {
      expect(await atterrissage(CHARGE, '/suivi')).toBe('/');
      expect(await atterrissage(CHARGE, '/clients')).toBe('/clients');
    });

    it('laisse lire la vitrine', async () => {
      expect(await atterrissage(AGENCE, '/mentions-legales')).toBe('/mentions-legales');
    });
  });

  /**
   * L'invariant qui protege les ecrans a venir.
   *
   * Tout est ferme par defaut : une page ajoutee sans y penser reste protegee.
   * C'est le sens le moins dangereux, et le test le fige sur un chemin qui
   * n'existe pas — donc que personne n'a declare nulle part.
   */
  it('ferme par defaut un chemin inconnu', async () => {
    expect(await atterrissage(VISITEUR, '/ecran-ajoute-demain')).toBe('/connexion');
    expect(await atterrissage(CANDIDAT, '/ecran-ajoute-demain')).toBe('/tableau-de-bord');
    expect(await atterrissage(CLIENT, '/ecran-ajoute-demain')).toBe('/etablissement');
  });
});
