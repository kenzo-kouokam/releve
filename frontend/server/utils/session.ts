import type { H3Event } from 'h3';
import type { ReponseConnexion } from '@releve/shared';

export const COOKIE_ACCES = 'releve_acces';
export const COOKIE_SESSION = 'releve_session';

/**
 * Marge retiree a la duree de vie du cookie d'acces.
 *
 * Le cookie doit disparaitre du navigateur un peu avant que le jeton ne soit
 * refuse par l'API : c'est son absence qui declenche le rafraichissement. S'il
 * survivait au jeton, l'utilisateur prendrait un 401 au lieu d'etre prolonge.
 */
const MARGE_SECONDES = 30;

function optionsCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // `secure` casserait le developpement en http ; en production le site est
    // servi en https et le cookie ne doit pas voyager en clair.
    secure: !import.meta.dev,
    path: '/',
  };
}

export function poserCookies(event: H3Event, reponse: ReponseConnexion): void {
  setCookie(event, COOKIE_ACCES, reponse.jeton, {
    ...optionsCookie(),
    maxAge: Math.max(1, reponse.expireDans - MARGE_SECONDES),
  });

  setCookie(event, COOKIE_SESSION, reponse.jetonRafraichissement, {
    ...optionsCookie(),
    maxAge: reponse.rafraichissementExpireDans,
  });

  // Les appels internes du rendu serveur reprennent les en-tetes de la requete
  // entrante : sans cette mise a jour, ils repartiraient avec l'ancien jeton.
  reecrireCookiesEntrants(event, {
    [COOKIE_ACCES]: reponse.jeton,
    [COOKIE_SESSION]: reponse.jetonRafraichissement,
  });
}

export function effacerCookies(event: H3Event): void {
  deleteCookie(event, COOKIE_ACCES, optionsCookie());
  deleteCookie(event, COOKIE_SESSION, optionsCookie());
  reecrireCookiesEntrants(event, { [COOKIE_ACCES]: null, [COOKIE_SESSION]: null });
}

function reecrireCookiesEntrants(event: H3Event, valeurs: Record<string, string | null>): void {
  const entrants = new Map<string, string>();

  for (const morceau of (event.node.req.headers.cookie ?? '').split(';')) {
    const separateur = morceau.indexOf('=');
    if (separateur > 0) {
      entrants.set(morceau.slice(0, separateur).trim(), morceau.slice(separateur + 1).trim());
    }
  }

  for (const [nom, valeur] of Object.entries(valeurs)) {
    if (valeur === null) {
      entrants.delete(nom);
    } else {
      entrants.set(nom, valeur);
    }
  }

  event.node.req.headers.cookie = [...entrants].map(([n, v]) => `${n}=${v}`).join('; ');
}

/**
 * Rafraichissements en cours ou tout juste termines, indexes par jeton de session.
 *
 * Le jeton est a usage unique : deux appels concurrents produiraient deux
 * echanges, et l'API y verrait un rejeu. L'entree est donc partagee pendant
 * l'appel, puis conservee brievement - une requete partie avant la rotation
 * arrive souvent apres elle, avec l'ancien jeton en poche.
 */
const enCours = new Map<string, Promise<ReponseConnexion | null>>();

const RETENTION_MS = 10_000;

export async function rafraichirSession(
  event: H3Event,
  jetonSession: string,
): Promise<ReponseConnexion | null> {
  let promesse = enCours.get(jetonSession);

  if (!promesse) {
    const config = useRuntimeConfig();

    promesse = $fetch<ReponseConnexion>(`${config.apiBase}/auth/rafraichir`, {
      method: 'POST',
      body: { jetonRafraichissement: jetonSession },
    }).catch(() => null);

    enCours.set(jetonSession, promesse);
    setTimeout(() => enCours.delete(jetonSession), RETENTION_MS).unref?.();
  }

  const reponse = await promesse;

  // Chaque appelant pose les cookies sur sa propre reponse : celui qui a
  // declenche l'echange n'est pas forcement celui que le navigateur attend.
  if (reponse) {
    poserCookies(event, reponse);
  } else {
    effacerCookies(event);
  }

  return reponse;
}

/**
 * Renvoie l'erreur de l'API telle quelle, statut et corps compris.
 *
 * On ne la reemballe pas dans un `createError` : les formulaires affichent les
 * messages de validation champ par champ, et une enveloppe supplementaire
 * obligerait chaque page a connaitre la forme du relais.
 */
export function relayerErreur(event: H3Event, cause: unknown): unknown {
  const erreur = cause as { status?: number; statusCode?: number; data?: unknown };
  const statut = erreur.status ?? erreur.statusCode ?? 502;

  if (statut === 401) {
    effacerCookies(event);
  }

  setResponseStatus(event, statut);

  return erreur.data ?? { message: 'API injoignable' };
}
