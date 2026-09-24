import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import request from 'supertest';
import { creerApp, prisma, reinitialiser } from './fixtures';

/**
 * Seule suite qui laisse la limitation de debit active. Elle tourne en dernier
 * (nom de fichier) pour ne pas consommer le quota des autres : le throttler
 * compte par adresse, et toutes les suites partagent la boucle locale.
 *
 * Les compteurs vivent maintenant dans Redis pour etre partages entre les
 * instances de l'API. Consequence pour cette suite : ils **survivent au
 * processus**. Sans le menage ci-dessous, relancer les tests dans la minute
 * qui suit retrouverait le quota deja consomme, et l'echec ressemblerait a une
 * regression alors que ce serait la trace de l'execution precedente.
 *
 * Le prefixe des cles porte le nom de la base — `passerelle_test` ici — donc
 * ce menage ne touche jamais aux compteurs du poste de developpement.
 */
describe('limitation de debit', () => {
  let app: INestApplication;

  async function viderCompteurs(): Promise<void> {
    const url = process.env.REDIS_URL;

    if (!url) {
      return;
    }

    const client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });

    try {
      await client.connect();

      const base = new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '') || 'defaut';
      const cles = await client.keys(`${base}:debit:*`);

      if (cles.length) {
        await client.del(...cles);
      }
    } catch {
      // Redis absent : le stockage bascule de lui-meme en memoire, et il n'y a
      // alors rien a nettoyer. Ce n'est pas une raison de faire echouer la suite.
    } finally {
      client.disconnect();
    }
  }

  beforeAll(async () => {
    await viderCompteurs();
    app = await creerApp(true);
    await reinitialiser();
  });

  afterAll(async () => {
    await viderCompteurs();
    await app.close();
    await prisma.$disconnect();
  });

  it('refuse la onzieme tentative de connexion dans la minute', async () => {
    const tenter = () =>
      request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: 'inconnu@test.example', motDePasse: 'PeuImporteVraiment' });

    const codes: number[] = [];

    for (let i = 0; i < 12; i += 1) {
      codes.push((await tenter()).status);
    }

    // Dix essais passent (et echouent en 401), les suivants sont coupes net.
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  /**
   * Le plafond est propre a chaque route, pas commun a toutes.
   *
   * `connexion` vient d'etre sature par le test precedent. L'inscription
   * partage le meme limiteur nomme mais pas la meme cle — la cle inclut le
   * chemin — donc elle doit continuer de repondre. Sans cette verification, un
   * compteur trop large passerait inapercu : tout serait simplement « plus
   * sur », jusqu'au jour ou dix tentatives de connexion ratees empecheraient
   * quelqu'un d'autre de creer son dossier.
   */
  it('ne fait pas deborder une route sur l autre', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/api/auth/inscription/etablissement')
      .send({});

    expect(reponse.status).not.toBe(429);
  });
});
