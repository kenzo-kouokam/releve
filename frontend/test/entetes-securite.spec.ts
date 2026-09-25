import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';

/**
 * Les en-tetes de securite poses sur toutes les reponses du front.
 *
 * Nitro sert ici les pages **et** le relais `/bff`, donc un seul intergiciel
 * couvre les deux. Aucune de ces valeurs n'etait envoyee avant l'audit, et
 * chacune tient en une ligne pour une difference reelle — raison de plus pour
 * qu'une refonte de `nuxt.config` ne les fasse pas disparaitre en silence.
 *
 * Ce fichier est donc un filet, pas une demonstration : il ne prouve pas que la
 * politique est bonne, il empeche qu'elle soit perdue.
 */

type Intergiciel = { default: (event: H3Event) => void };

/** Charge l'intergiciel et rend les en-tetes qu'il pose. */
async function poser(): Promise<Record<string, string>> {
  vi.resetModules();
  vi.unstubAllGlobals();

  const entetes: Record<string, string> = {};

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn);
  vi.stubGlobal('setResponseHeader', (_event: unknown, nom: string, valeur: string) => {
    entetes[nom] = valeur;
  });

  const module = (await import('../server/middleware/entetes-securite')) as Intergiciel;

  module.default({} as H3Event);

  return entetes;
}

/** Une directive de la politique de contenu, par son nom. */
function directive(politique: string, nom: string): string | undefined {
  return politique
    .split(';')
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau === nom || morceau.startsWith(`${nom} `));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('en-tetes posees sur chaque reponse', () => {
  /**
   * Un document televerse ne doit jamais etre requalifie en HTML par le
   * navigateur : c'est exactement ce qui transforme une piece jointe en page
   * executee, et ce site en recoit par definition.
   */
  it('interdit la requalification du type de contenu', async () => {
    expect((await poser())['X-Content-Type-Options']).toBe('nosniff');
  });

  /**
   * L'URL de confirmation d'adresse porte un jeton dans sa requete. Sans cette
   * regle, elle partirait dans l'en-tete `Referer` de la premiere ressource
   * tierce chargee par la page — le jeton dans les journaux d'un tiers.
   */
  it('retient le referent vers les domaines tiers', async () => {
    expect((await poser())['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('refuse l affichage dans une iframe, des deux facons', async () => {
    const entetes = await poser();

    expect(entetes['X-Frame-Options']).toBe('DENY');
    expect(directive(entetes['Content-Security-Policy']!, 'frame-ancestors')).toBe(
      "frame-ancestors 'none'",
    );
  });

  it('refuse les interfaces que le site n utilise pas', async () => {
    const politique = (await poser())['Permissions-Policy']!;

    for (const interface_ of ['camera', 'microphone', 'geolocation']) {
      expect(politique).toContain(`${interface_}=()`);
    }
  });
});

describe('politique de contenu', () => {
  it('est posee hors developpement', async () => {
    // `import.meta.dev` est absent hors de Nuxt : l'intergiciel se comporte
    // comme en production, ce qui est le sens le moins dangereux.
    expect((await poser())['Content-Security-Policy']).toBeDefined();
  });

  it('impose https pour un an', async () => {
    expect((await poser())['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it.each([
    ["default-src", "default-src 'self'"],
    ['object-src', "object-src 'none'"],
    ['base-uri', "base-uri 'self'"],
    ['form-action', "form-action 'self'"],
    ['connect-src', "connect-src 'self'"],
  ])('verrouille %s', async (nom, attendu) => {
    const politique = (await poser())['Content-Security-Policy']!;

    expect(directive(politique, nom)).toBe(attendu);
  });

  /**
   * La limite de cette politique, ecrite noir sur blanc plutot que sous-entendue.
   *
   * `'unsafe-inline'` reste sur les scripts : Nuxt injecte la charge utile
   * d'hydratation en ligne, et une politique stricte demanderait un nonce
   * propage dans tout le rendu. Cette politique arrete donc le XSS qui charge
   * son code ailleurs, pas celui qui l'ecrit sur place.
   *
   * Le test fige cet etat au lieu de le taire : si quelqu'un retire un jour
   * `'unsafe-inline'`, il echoue, et c'est le bon moment pour verifier que
   * l'hydratation fonctionne encore.
   */
  it('tolere encore le script en ligne, exigence de l hydratation Nuxt', async () => {
    const politique = (await poser())['Content-Security-Policy']!;

    expect(directive(politique, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
  });

  /**
   * `connect-src 'self'` est la directive qui compte le plus ici : c'est elle
   * qui empeche un script injecte d'expedier un dossier candidat vers un
   * domaine tiers. Le relais `/bff` etant sur la meme origine, la restreindre
   * ne coute rien au fonctionnement du site.
   */
  it('n autorise aucun domaine tiers a recevoir des donnees', async () => {
    const politique = (await poser())['Content-Security-Policy']!;

    expect(directive(politique, 'connect-src')).not.toContain('http');
  });

  it('n ouvre les domaines tiers que pour les polices', async () => {
    const politique = (await poser())['Content-Security-Policy']!;
    const domaines = [...politique.matchAll(/https:\/\/[\w.-]+/g)].map((m) => m[0]);

    expect([...new Set(domaines)].sort()).toEqual([
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ]);
  });
});
