import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer, estChiffre, lireCle } from '../src/documents/coffre';

/**
 * Le chiffrement des pieces justificatives.
 *
 * Suite pure : aucune base, aucune application, aucun fichier. Ce qui est
 * verifie ici est le coffre lui-meme — que le contenu revienne intact, qu'il ne
 * se lise pas sur le disque, et qu'une alteration soit **refusee** plutot que
 * rendue. Le parcours complet, du depot au telechargement, a sa propre suite.
 */
describe('coffre a documents', () => {
  const cle = randomBytes(32);
  const piece = Buffer.from(
    '%PDF-1.7 carte nationale d identite 1850712345678 Sophie Marchand',
    'utf8',
  );

  it('rend exactement ce qui a ete chiffre', () => {
    expect(dechiffrer(chiffrer(piece, cle), cle).equals(piece)).toBe(true);
  });

  /**
   * Le test qui dit pourquoi tout ceci existe : le contenu ne doit pas se lire
   * dans le fichier. Une sauvegarde qui traine, un disque mal efface, et c'est
   * la seule chose qui reste entre la piece et celui qui l'ouvre.
   */
  it('ne laisse rien lire du contenu', () => {
    const enveloppe = chiffrer(piece, cle);

    expect(enveloppe.includes(Buffer.from('Sophie Marchand'))).toBe(false);
    expect(enveloppe.includes(Buffer.from('1850712345678'))).toBe(false);
    expect(enveloppe.includes(Buffer.from('%PDF'))).toBe(false);
  });

  /**
   * Deux chiffrements du meme fichier ne se ressemblent pas, parce que le
   * vecteur d'initialisation est tire au hasard a chaque fois. Sans cela, deux
   * candidats deposant la meme piece produiraient deux fichiers identiques —
   * et comparer des octets suffirait a le deduire sans dechiffrer.
   */
  it('produit un resultat different a chaque ecriture', () => {
    expect(chiffrer(piece, cle).equals(chiffrer(piece, cle))).toBe(false);
  });

  it('se reconnait a sa marque', () => {
    expect(estChiffre(chiffrer(piece, cle))).toBe(true);
    expect(estChiffre(piece)).toBe(false);
  });

  /**
   * Un fichier depose avant la mise en place du coffre reste lisible. C'est ce
   * qui permet d'activer le chiffrement sans interrompre le service ni tout
   * migrer d'un bloc, serveur arrete.
   */
  it('laisse passer un fichier anterieur au chiffrement', () => {
    expect(dechiffrer(piece, cle).equals(piece)).toBe(true);
  });

  /**
   * GCM authentifie en plus de chiffrer, et c'est la raison de l'avoir choisi :
   * un octet retourne sur le disque doit produire une erreur, pas un contenu
   * faux. Un mode sans authentification rendrait ici des octets alteres sans
   * que rien ne le signale.
   */
  it('refuse un fichier altere', () => {
    const enveloppe = chiffrer(piece, cle);

    enveloppe[enveloppe.length - 1] ^= 0xff;

    expect(() => dechiffrer(enveloppe, cle)).toThrow();
  });

  it('refuse un fichier tronque', () => {
    const enveloppe = chiffrer(piece, cle);

    expect(() => dechiffrer(enveloppe.subarray(0, 20), cle)).toThrow(/tronque/);
  });

  it('refuse une autre cle', () => {
    expect(() => dechiffrer(chiffrer(piece, cle), randomBytes(32))).toThrow();
  });

  /**
   * La cle est lue au demarrage, et un refus y est preferable a un repli : se
   * rabattre sur du clair laisserait tourner la version dangereuse en croyant
   * l'inverse.
   */
  describe('lecture de la cle', () => {
    it('accepte 32 octets en base64', () => {
      const brute = randomBytes(32);

      expect(lireCle(brute.toString('base64')).equals(brute)).toBe(true);
    });

    it('ignore les espaces autour', () => {
      const brute = randomBytes(32);

      expect(lireCle(`  ${brute.toString('base64')}  `).equals(brute)).toBe(true);
    });

    it('refuse l absence', () => {
      expect(() => lireCle(undefined)).toThrow(/absent/);
      expect(() => lireCle('')).toThrow(/absent/);
    });

    it('refuse une cle de la mauvaise taille', () => {
      expect(() => lireCle(randomBytes(16).toString('base64'))).toThrow(/32 octets/);
      expect(() => lireCle(randomBytes(64).toString('base64'))).toThrow(/32 octets/);
    });
  });
});
