import { vi } from 'vitest';

/**
 * Un banc d'essai pour le relais BFF, sans monter Nitro.
 *
 * Le relais est la piece la plus sensible du front : c'est lui qui detient les
 * jetons et compose l'en-tete `Authorization`, de sorte qu'aucun jeton n'existe
 * cote page — rien a voler par XSS. Il n'avait aucun test, au motif qu'il
 * faudrait un serveur pour l'eprouver. C'est faux : ses regles sont du calcul,
 * et h3 n'est pas ce qu'on cherche a verifier.
 *
 * Les auxiliaires de h3 sont donc remplaces par des implementations minuscules
 * adossees a un evenement de pacotille, qui note ce qui a ete pose. Ce qui est
 * teste reste entier : la marge retiree au cookie d'acces, la deduplication du
 * rafraichissement, la reecriture de l'en-tete entrant, le statut relaye.
 */

export interface CookiePose {
  nom: string;
  valeur: string;
  options: Record<string, unknown>;
}

export interface Banc {
  /** L'evenement passe aux fonctions du relais. */
  event: EvenementFactice;
  /** Les cookies poses, dans l'ordre. */
  poses: CookiePose[];
  /** Les cookies supprimes, dans l'ordre. */
  effaces: { nom: string; options: Record<string, unknown> }[];
  /** Le dernier statut de reponse pose. */
  statut: number | null;
  /** Les appels sortants vers l'API, dans l'ordre. */
  appels: { url: string; options: Record<string, unknown> }[];
  /** Ce que le prochain `$fetch` doit rendre, ou lever si c'est une Error. */
  reponse: unknown;
  /** Corps binaire rendu par `readRawBody`. */
  corpsBrut: Buffer | undefined;
  /** Parametres de requete rendus par `getQuery`. */
  requete: Record<string, string>;
  /** Parametre de route rendu par `getRouterParam`. */
  chemin: string;
}

interface EvenementFactice {
  method: string;
  node: { req: { headers: Record<string, string | undefined> } };
}

/**
 * Charge un module du relais avec les globales de Nitro en place.
 *
 * Reimporte a chaque appel : `rafraichirSession` garde une table des echanges
 * en cours dans la portee du module, et un cache la ferait fuir d'un test a
 * l'autre — precisement l'etat que la deduplication est censee gerer.
 */
export async function charger<T>(
  chemin: string,
  depart: Partial<Banc> = {},
): Promise<{ module: T; banc: Banc }> {
  vi.resetModules();
  vi.unstubAllGlobals();

  const banc: Banc = {
    event: {
      method: 'GET',
      node: { req: { headers: {} } },
    },
    poses: [],
    effaces: [],
    statut: null,
    appels: [],
    reponse: null,
    corpsBrut: undefined,
    requete: {},
    chemin: '',
    ...depart,
  };

  /** Les cookies presents dans l'en-tete entrant, relus a chaque acces. */
  const entrants = (): Map<string, string> => {
    const table = new Map<string, string>();

    for (const morceau of (banc.event.node.req.headers.cookie ?? '').split(';')) {
      const separateur = morceau.indexOf('=');

      if (separateur > 0) {
        table.set(morceau.slice(0, separateur).trim(), morceau.slice(separateur + 1).trim());
      }
    }

    return table;
  };

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn);
  vi.stubGlobal('useRuntimeConfig', () => ({ apiBase: 'http://api.test/api' }));

  vi.stubGlobal('getCookie', (_event: unknown, nom: string) => entrants().get(nom));

  vi.stubGlobal(
    'setCookie',
    (_event: unknown, nom: string, valeur: string, options: Record<string, unknown>) => {
      banc.poses.push({ nom, valeur, options });
    },
  );

  vi.stubGlobal('deleteCookie', (_event: unknown, nom: string, options: Record<string, unknown>) => {
    banc.effaces.push({ nom, options });
  });

  vi.stubGlobal('setResponseStatus', (_event: unknown, statut: number) => {
    banc.statut = statut;
  });

  vi.stubGlobal('readRawBody', async () => banc.corpsBrut);
  vi.stubGlobal('getQuery', () => banc.requete);
  vi.stubGlobal('getRouterParam', () => banc.chemin);
  vi.stubGlobal(
    'getRequestHeader',
    (_event: unknown, nom: string) => banc.event.node.req.headers[nom.toLowerCase()],
  );

  const repondre = async (url: string, options: Record<string, unknown> = {}) => {
    banc.appels.push({ url, options });

    if (banc.reponse instanceof Error) {
      throw banc.reponse;
    }

    return banc.reponse;
  };

  const fetchFactice = Object.assign(repondre, {
    raw: async (url: string, options: Record<string, unknown> = {}) => {
      const donnees = await repondre(url, options);

      return { status: 200, _data: donnees };
    },
  });

  vi.stubGlobal('$fetch', fetchFactice);

  // Nitro auto-importe `server/utils/**` : une route y accede sans `import`.
  // On reproduit cela en posant les vraies fonctions comme globales — les
  // vraies, et non des doublures, pour que le 401 deconnecte pour de bon et
  // que ce fichier ne teste pas une imitation du relais.
  if (!chemin.endsWith('/session')) {
    const utils = await import('../server/utils/session');

    for (const [nom, valeur] of Object.entries(utils)) {
      vi.stubGlobal(nom, valeur);
    }
  }

  const module = (await import(/* @vite-ignore */ chemin)) as T;

  return { module, banc };
}

/** Une erreur telle que `$fetch` la leve : un statut et un corps. */
export function erreurApi(statut: number, data?: unknown): Error {
  return Object.assign(new Error(`HTTP ${statut}`), { status: statut, data });
}

/** Pose un en-tete cookie entrant, comme le navigateur l'enverrait. */
export function avecCookies(banc: Banc, cookies: Record<string, string>): void {
  banc.event.node.req.headers.cookie = Object.entries(cookies)
    .map(([nom, valeur]) => `${nom}=${valeur}`)
    .join('; ');
}
