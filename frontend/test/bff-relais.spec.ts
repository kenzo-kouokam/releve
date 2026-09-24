import { describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import { avecCookies, charger, erreurApi, type Banc } from './aide-bff';

/**
 * Le relais fourre-tout `/bff/**`.
 *
 * Tout ce que le navigateur demande a l'API passe par ici. Le navigateur ne
 * parle qu'a son propre domaine ; c'est Nitro qui detient le jeton et compose
 * l'en-tete `Authorization`. Deux consequences voulues : aucun jeton n'existe
 * cote page, donc rien a voler par XSS, et l'API n'a pas a ouvrir CORS.
 *
 * Ce fichier verrouille ce contrat. Le point le plus sensible n'est pas que le
 * jeton soit bien ajoute — c'est qu'il ne vienne **que** du cookie.
 */

type Relais = { default: (event: H3Event) => Promise<unknown> };

const CHEMIN = '../server/routes/bff/[...chemin]';

const ouvrir = (depart?: Partial<Banc>) => charger<Relais>(CHEMIN, depart);

/** Les en-tetes envoyes a l'API lors du dernier appel. */
function entetesSortantes(banc: Banc): Record<string, string> {
  return (banc.appels[0]?.options.headers ?? {}) as Record<string, string>;
}

describe('composition du jeton', () => {
  it('compose l en-tete Authorization a partir du cookie', async () => {
    const { module, banc } = await ouvrir({ reponse: { ok: true } });

    avecCookies(banc, { releve_acces: 'jeton-abc' });
    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc).Authorization).toBe('Bearer jeton-abc');
  });

  it('n envoie aucun jeton quand il n y a pas de cookie', async () => {
    const { module, banc } = await ouvrir({ reponse: { ok: true } });

    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc).Authorization).toBeUndefined();
  });

  /**
   * Le point de securite de tout le relais.
   *
   * Les en-tetes sortantes sont construites de zero, jamais recopiees depuis la
   * requete entrante. Une page compromise — ou un appel force depuis un autre
   * onglet — ne peut donc pas glisser son propre `Authorization` et se faire
   * passer pour quelqu'un d'autre : seul le cookie `httpOnly`, que le
   * JavaScript de la page ne peut pas lire, decide de l'identite.
   */
  it('ignore un Authorization fourni par le navigateur', async () => {
    const { module, banc } = await ouvrir({ reponse: { ok: true } });

    banc.event.node.req.headers.authorization = 'Bearer jeton-vole';
    avecCookies(banc, { releve_acces: 'jeton-legitime' });

    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc).Authorization).toBe('Bearer jeton-legitime');
  });

  it('n invente pas de jeton a partir d un en-tete seul', async () => {
    const { module, banc } = await ouvrir({ reponse: { ok: true } });

    banc.event.node.req.headers.authorization = 'Bearer jeton-vole';

    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc).Authorization).toBeUndefined();
  });
});

describe('transmission de la requete', () => {
  it('compose l URL a partir du chemin demande', async () => {
    const { module, banc } = await ouvrir({ reponse: null, chemin: 'missions/abc/candidats' });

    await module.default(banc.event as unknown as H3Event);

    expect(banc.appels[0]!.url).toBe('http://api.test/api/missions/abc/candidats');
  });

  it('transmet la methode et les parametres de requete', async () => {
    const { module, banc } = await ouvrir({
      reponse: null,
      chemin: 'candidats',
      requete: { statut: 'ACTIF', limite: '20' },
    });

    banc.event.method = 'GET';
    await module.default(banc.event as unknown as H3Event);

    expect(banc.appels[0]!.options).toMatchObject({
      method: 'GET',
      query: { statut: 'ACTIF', limite: '20' },
    });
  });

  it.each(['GET', 'HEAD'])('n envoie pas de corps en %s', async (methode) => {
    const { module, banc } = await ouvrir({ reponse: null, corpsBrut: Buffer.from('parasite') });

    banc.event.method = methode;
    await module.default(banc.event as unknown as H3Event);

    expect(banc.appels[0]!.options.body).toBeUndefined();
  });

  /**
   * Le corps est lu en binaire, jamais decode en UTF-8.
   *
   * Un depot de piece justificative passe par ce relais. Une conversion en
   * chaine corromprait le PDF sans rien signaler : le fichier arriverait
   * entier, de la bonne taille, et illisible. C'est le genre de defaut qu'on
   * ne decouvre qu'au moment ou quelqu'un essaie d'ouvrir la piece.
   */
  it('transmet un corps binaire sans y toucher', async () => {
    // Des octets qui ne forment pas de l'UTF-8 valide : un decodage les
    // remplacerait par U+FFFD et la comparaison echouerait.
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x80]);
    const { module, banc } = await ouvrir({ reponse: null, corpsBrut: pdf });

    banc.event.method = 'POST';
    await module.default(banc.event as unknown as H3Event);

    const envoye = banc.appels[0]!.options.body as Buffer;

    expect(Buffer.isBuffer(envoye)).toBe(true);
    expect(envoye.equals(pdf)).toBe(true);
  });

  it('reprend le content-type du navigateur, pour un envoi de fichier', async () => {
    const { module, banc } = await ouvrir({ reponse: null });

    banc.event.method = 'POST';
    banc.event.node.req.headers['content-type'] = 'multipart/form-data; boundary=xyz';

    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc)['content-type']).toBe('multipart/form-data; boundary=xyz');
  });

  it('retombe sur du JSON quand le navigateur ne dit rien', async () => {
    const { module, banc } = await ouvrir({ reponse: null });

    banc.event.method = 'POST';
    await module.default(banc.event as unknown as H3Event);

    expect(entetesSortantes(banc)['content-type']).toBe('application/json');
  });
});

describe('transmission de la reponse', () => {
  it('rend le corps de l API', async () => {
    const { module, banc } = await ouvrir({ reponse: { donnees: [1, 2, 3] } });

    const rendu = await module.default(banc.event as unknown as H3Event);

    expect(rendu).toEqual({ donnees: [1, 2, 3] });
  });

  it('reprend le statut de l API', async () => {
    const { module, banc } = await ouvrir({ reponse: { ok: true } });

    await module.default(banc.event as unknown as H3Event);

    expect(banc.statut).toBe(200);
  });

  it('rend null plutot que undefined sur une reponse vide', async () => {
    // `undefined` ferait pendre la reponse cote Nitro : une 204 doit etre une
    // 204, pas une attente.
    const { module, banc } = await ouvrir({ reponse: undefined });

    await expect(module.default(banc.event as unknown as H3Event)).resolves.toBeNull();
  });

  it('relaie une erreur de l API avec son statut et son corps', async () => {
    const corps = { erreurs: [{ champ: 'email', message: 'Adresse deja utilisee' }] };
    const { module, banc } = await ouvrir({ reponse: erreurApi(409, corps) });

    const rendu = await module.default(banc.event as unknown as H3Event);

    expect(banc.statut).toBe(409);
    expect(rendu).toEqual(corps);
  });

  it('deconnecte quand l API repond 401', async () => {
    const { module, banc } = await ouvrir({ reponse: erreurApi(401) });

    avecCookies(banc, { releve_acces: 'perime' });
    await module.default(banc.event as unknown as H3Event);

    expect(banc.effaces.map((c) => c.nom)).toEqual(['releve_acces', 'releve_session']);
  });

  it('repond 502 sans exploser quand l API est injoignable', async () => {
    const { module, banc } = await ouvrir({ reponse: new Error('ECONNREFUSED') });

    const rendu = await module.default(banc.event as unknown as H3Event);

    expect(banc.statut).toBe(502);
    expect(rendu).toEqual({ message: 'API injoignable' });
  });
});
