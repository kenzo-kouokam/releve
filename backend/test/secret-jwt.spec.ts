import { describe, expect, it } from 'vitest';
import { verifierSecretJwt } from '../src/auth/secret-jwt';

/**
 * Le controle qui empeche l'API de demarrer avec un secret public.
 *
 * Pourquoi une suite pour cinq lignes : parce que c'est exactement le genre de
 * garde-fou qu'on retire par commodite un jour ou le demarrage bloque, sans
 * mesurer ce qu'on rouvre. Un secret de signature connu, c'est la possibilite
 * de forger un jeton d'administrateur sans mot de passe et sans trace.
 *
 * Suite pure : aucune base, aucune application. Elle s'execute en quelques
 * millisecondes et n'a pas besoin de l'infrastructure.
 */
describe('verifierSecretJwt', () => {
  const correct = 'K7q2ZLd8vX1nRt4mJ9cWpB6sY0hA3eFgUiOl5rTxQzNv';

  it('accepte un secret suffisamment long', () => {
    expect(verifierSecretJwt(correct)).toBe(correct);
  });

  it('retire les espaces autour', () => {
    expect(verifierSecretJwt(`  ${correct}  `)).toBe(correct);
  });

  it('refuse l absence', () => {
    expect(() => verifierSecretJwt(undefined)).toThrow(/absent/);
    expect(() => verifierSecretJwt('')).toThrow(/absent/);
  });

  /**
   * Le cas qui motive toute la suite : cette valeur est celle du fichier
   * d'exemple, donc elle est publiee dans le depot. Un deploiement qui copie
   * `.env.example` sans le relire demarrait avec elle, et rien ne le signalait.
   */
  it('refuse la valeur d exemple du depot', () => {
    expect(() => verifierSecretJwt('a-remplacer-en-production')).toThrow(/valeur d exemple/);
  });

  it('refuse les placeholders habituels, quelle que soit la casse', () => {
    for (const valeur of ['changeme', 'CHANGEME', 'Secret', 'dev', 'test', 'password']) {
      expect(() => verifierSecretJwt(valeur)).toThrow();
    }
  });

  /**
   * Un secret de 31 caracteres n'est pas refuse parce que 32 serait un seuil
   * normatif, mais parce qu'en dessous la signature HS256 se retrouve hors
   * ligne a partir d'un seul jeton capture.
   */
  it('refuse un secret trop court', () => {
    expect(() => verifierSecretJwt('a'.repeat(31))).toThrow(/trop court/);
    expect(() => verifierSecretJwt('a'.repeat(32))).not.toThrow();
  });

  /** Un secret entoure d'espaces ne doit pas passer le seuil grace a eux. */
  it('mesure la longueur apres nettoyage', () => {
    expect(() => verifierSecretJwt(`  ${'a'.repeat(30)}  `)).toThrow(/trop court/);
  });
});
