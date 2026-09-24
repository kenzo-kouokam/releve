import { describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import type { ReponseConnexion } from '@releve/shared';
import { avecCookies, charger, erreurApi, type Banc } from './aide-bff';

/**
 * Les cookies de session et le rafraichissement, cote relais.
 *
 * C'est ici que vivent les jetons. Le navigateur n'en voit aucun — ils sont
 * `httpOnly` et composes en en-tete `Authorization` par Nitro —, donc une
 * faille XSS sur une page ne donne rien a voler. Encore faut-il que les cookies
 * soient poses avec les bonnes options, et que le rafraichissement ne se
 * declenche pas deux fois : le jeton de session est a usage unique, et deux
 * echanges concurrents sont un rejeu du point de vue de l'API.
 */

interface ModuleSession {
  COOKIE_ACCES: string;
  COOKIE_SESSION: string;
  poserCookies: (event: H3Event, reponse: ReponseConnexion) => void;
  effacerCookies: (event: H3Event) => void;
  rafraichirSession: (event: H3Event, jeton: string) => Promise<ReponseConnexion | null>;
  relayerErreur: (event: H3Event, cause: unknown) => unknown;
}

const CHEMIN = '../server/utils/session';

function connexion(surcharge: Partial<ReponseConnexion> = {}): ReponseConnexion {
  return {
    jeton: 'acces-neuf',
    expireDans: 900,
    jetonRafraichissement: 'session-neuve',
    rafraichissementExpireDans: 2_592_000,
    ...surcharge,
  } as ReponseConnexion;
}

const ouvrir = (depart?: Partial<Banc>) => charger<ModuleSession>(CHEMIN, depart);

describe('cookies de session', () => {
  it('pose les deux cookies', async () => {
    const { module, banc } = await ouvrir();

    module.poserCookies(banc.event as unknown as H3Event, connexion());

    expect(banc.poses.map((c) => c.nom)).toEqual([module.COOKIE_ACCES, module.COOKIE_SESSION]);
    expect(banc.poses[0]!.valeur).toBe('acces-neuf');
    expect(banc.poses[1]!.valeur).toBe('session-neuve');
  });

  /**
   * Le cookie d'acces doit disparaitre du navigateur un peu avant que le jeton
   * ne soit refuse par l'API : c'est son absence qui declenche la prolongation.
   * S'il survivait au jeton, la personne prendrait un 401 au lieu d'etre
   * prolongee — une deconnexion inexplicable en plein travail.
   */
  it('retire une marge de trente secondes au cookie d acces', async () => {
    const { module, banc } = await ouvrir();

    module.poserCookies(banc.event as unknown as H3Event, connexion({ expireDans: 900 }));

    expect(banc.poses[0]!.options.maxAge).toBe(870);
  });

  it('ne descend jamais sous une seconde, meme sur un jeton tres court', async () => {
    const { module, banc } = await ouvrir();

    // 10 - 30 serait negatif : un maxAge negatif supprime le cookie, et la
    // session serait perdue a l'instant meme ou elle s'ouvre.
    module.poserCookies(banc.event as unknown as H3Event, connexion({ expireDans: 10 }));

    expect(banc.poses[0]!.options.maxAge).toBe(1);
  });

  it('laisse au cookie de session sa duree entiere', async () => {
    const { module, banc } = await ouvrir();

    module.poserCookies(
      banc.event as unknown as H3Event,
      connexion({ rafraichissementExpireDans: 2_592_000 }),
    );

    expect(banc.poses[1]!.options.maxAge).toBe(2_592_000);
  });

  it('rend les deux cookies inaccessibles au JavaScript de la page', async () => {
    const { module, banc } = await ouvrir();

    module.poserCookies(banc.event as unknown as H3Event, connexion());

    for (const cookie of banc.poses) {
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.sameSite).toBe('lax');
      expect(cookie.options.path).toBe('/');
    }
  });

  it('exige https hors developpement', async () => {
    const { module, banc } = await ouvrir();

    module.poserCookies(banc.event as unknown as H3Event, connexion());

    // `import.meta.dev` est absent hors de Nuxt : le relais se comporte alors
    // comme en production, ce qui est le sens le moins dangereux.
    for (const cookie of banc.poses) {
      expect(cookie.options.secure).toBe(true);
    }
  });

  /**
   * Le rendu serveur rappelle le relais avec les en-tetes de la requete
   * entrante. Sans cette reecriture, ces appels repartiraient avec l'ancien
   * jeton — celui que la rotation vient d'invalider.
   */
  it('met a jour l en-tete cookie entrant, pour le rendu serveur', async () => {
    const { module, banc } = await ouvrir();

    avecCookies(banc, { releve_acces: 'vieux', releve_session: 'vieille' });
    module.poserCookies(banc.event as unknown as H3Event, connexion());

    const entrant = banc.event.node.req.headers.cookie ?? '';

    expect(entrant).toContain('releve_acces=acces-neuf');
    expect(entrant).toContain('releve_session=session-neuve');
    expect(entrant).not.toContain('vieux');
  });

  it('ne touche pas aux autres cookies du navigateur', async () => {
    const { module, banc } = await ouvrir();

    avecCookies(banc, { theme: 'sombre', releve_acces: 'vieux' });
    module.poserCookies(banc.event as unknown as H3Event, connexion());

    expect(banc.event.node.req.headers.cookie).toContain('theme=sombre');
  });

  it('efface les deux cookies, et eux seuls', async () => {
    const { module, banc } = await ouvrir();

    avecCookies(banc, { theme: 'sombre', releve_acces: 'a', releve_session: 's' });
    module.effacerCookies(banc.event as unknown as H3Event);

    expect(banc.effaces.map((c) => c.nom)).toEqual([module.COOKIE_ACCES, module.COOKIE_SESSION]);

    const entrant = banc.event.node.req.headers.cookie ?? '';

    expect(entrant).toContain('theme=sombre');
    expect(entrant).not.toContain('releve_acces');
    expect(entrant).not.toContain('releve_session');
  });
});

/**
 * La deduplication du rafraichissement.
 *
 * Le jeton de session est a usage unique. Une page qui lance six appels au
 * chargement, tous sans cookie d'acces, declencherait six echanges — et l'API,
 * qui detecte le rejeu d'un jeton deja consomme, revoquerait la session
 * entiere. L'utilisateur serait deconnecte par le simple fait d'avoir ouvert
 * une page. C'est le defaut que cette table d'echanges en cours previent, et le
 * test le plus important de ce fichier.
 */
describe('rafraichissement de session', () => {
  it('n echange qu une fois pour deux demandes simultanees', async () => {
    const { module, banc } = await ouvrir({ reponse: connexion() });

    const [a, b] = await Promise.all([
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
    ]);

    expect(banc.appels).toHaveLength(1);
    expect(banc.appels[0]!.url).toBe('http://api.test/api/auth/rafraichir');
    expect(a).toEqual(b);
  });

  it('pose les cookies pour chaque appelant, pas seulement le premier', async () => {
    const { module, banc } = await ouvrir({ reponse: connexion() });

    await Promise.all([
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
    ]);

    // Deux appelants, deux paires de cookies : celui qui a declenche l'echange
    // n'est pas forcement celui dont la reponse part au navigateur.
    expect(banc.poses).toHaveLength(4);
  });

  it('reutilise l echange termine, le temps qu une requete en retard arrive', async () => {
    const { module, banc } = await ouvrir({ reponse: connexion() });

    await module.rafraichirSession(banc.event as unknown as H3Event, 'session-1');
    await module.rafraichirSession(banc.event as unknown as H3Event, 'session-1');

    expect(banc.appels).toHaveLength(1);
  });

  it('echange separement deux sessions differentes', async () => {
    const { module, banc } = await ouvrir({ reponse: connexion() });

    await Promise.all([
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-2'),
    ]);

    expect(banc.appels).toHaveLength(2);
  });

  it('transmet le jeton de session dans le corps', async () => {
    const { module, banc } = await ouvrir({ reponse: connexion() });

    await module.rafraichirSession(banc.event as unknown as H3Event, 'session-1');

    expect(banc.appels[0]!.options).toMatchObject({
      method: 'POST',
      body: { jetonRafraichissement: 'session-1' },
    });
  });

  it('efface les cookies et rend null quand l API refuse', async () => {
    const { module, banc } = await ouvrir({ reponse: erreurApi(401) });

    const resultat = await module.rafraichirSession(banc.event as unknown as H3Event, 'perimee');

    expect(resultat).toBeNull();
    expect(banc.effaces.map((c) => c.nom)).toEqual([module.COOKIE_ACCES, module.COOKIE_SESSION]);
    expect(banc.poses).toHaveLength(0);
  });

  it('ne laisse pas une panne de l API remonter en exception', async () => {
    const { module, banc } = await ouvrir({ reponse: new Error('ECONNREFUSED') });

    await expect(
      module.rafraichirSession(banc.event as unknown as H3Event, 'session-1'),
    ).resolves.toBeNull();
  });
});

/**
 * Le relais des erreurs.
 *
 * L'erreur de l'API repart telle quelle, statut et corps compris, plutot que
 * reemballee : les formulaires affichent les messages de validation champ par
 * champ, et une enveloppe supplementaire obligerait chaque page a connaitre la
 * forme du relais.
 */
describe('relais des erreurs', () => {
  it('reprend le statut de l API', async () => {
    const { module, banc } = await ouvrir();

    module.relayerErreur(banc.event as unknown as H3Event, erreurApi(422));

    expect(banc.statut).toBe(422);
  });

  it('rend le corps de l API sans y toucher', async () => {
    const { module, banc } = await ouvrir();
    const corps = { erreurs: [{ champ: 'siret', message: 'SIRET invalide' }] };

    const rendu = module.relayerErreur(banc.event as unknown as H3Event, erreurApi(400, corps));

    expect(rendu).toEqual(corps);
  });

  /**
   * Un 401 veut dire que le jeton ne vaut plus rien. Le garder en cookie
   * enfermerait la personne dans une boucle : chaque appel repartirait avec un
   * jeton refuse, et rien ne declencherait la prolongation, qui se declenche
   * justement sur l'absence du cookie.
   */
  it('efface les cookies sur un 401', async () => {
    const { module, banc } = await ouvrir();

    module.relayerErreur(banc.event as unknown as H3Event, erreurApi(401));

    expect(banc.effaces.map((c) => c.nom)).toEqual([module.COOKIE_ACCES, module.COOKIE_SESSION]);
  });

  it.each([400, 403, 404, 409, 422, 500])('ne deconnecte pas sur un %i', async (statut) => {
    const { module, banc } = await ouvrir();

    module.relayerErreur(banc.event as unknown as H3Event, erreurApi(statut));

    expect(banc.effaces).toHaveLength(0);
  });

  it('repond 502 quand l API est injoignable', async () => {
    const { module, banc } = await ouvrir();

    const rendu = module.relayerErreur(banc.event as unknown as H3Event, new Error('ECONNREFUSED'));

    expect(banc.statut).toBe(502);
    expect(rendu).toEqual({ message: 'API injoignable' });
  });

  it('accepte aussi bien `status` que `statusCode`', async () => {
    const { module, banc } = await ouvrir();

    module.relayerErreur(banc.event as unknown as H3Event, { statusCode: 418, data: null });

    expect(banc.statut).toBe(418);
  });
});
