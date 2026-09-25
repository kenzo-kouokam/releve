import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { ThrottlerRedisStorage } from '../src/auth/throttler-redis.storage';

/**
 * Le compteur de debit partage.
 *
 * Ce qui est verifie ici n'est pas que la limitation existe — `debit.spec.ts`
 * s'en charge de bout en bout — mais qu'elle **compte au bon endroit**. Tant
 * que le compteur vivait dans le processus, deux instances de l'API doublaient
 * chaque plafond sans que rien ne le signale : le comportement restait correct
 * vu d'une machine, et faux vu du service.
 *
 * D'ou le test central : deux instances distinctes du stockage, comme deux
 * replicas, doivent se partager un seul compteur.
 *
 * Une base de noms a part — `verif_debit` — pour ne marcher ni sur les
 * compteurs de l'application ni sur ceux de la suite d'integration.
 */
describe('ThrottlerRedisStorage', () => {
  const URL_REDIS = process.env.REDIS_URL;
  const URL_BASE = 'postgresql://u:p@localhost:5434/verif_debit';
  const PREFIXE = 'verif_debit:debit:';

  /** Sans Redis, il n'y a rien a prouver : le stockage se replie en memoire. */
  const siRedis = URL_REDIS ? it : it.skip;

  let stockage: ThrottlerRedisStorage;
  let menage: Redis | null = null;

  /** Une cle differente par test : les compteurs survivent au processus. */
  const cle = (nom: string) => `${nom}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    stockage = new ThrottlerRedisStorage(URL_REDIS, URL_BASE);
    menage = URL_REDIS ? new Redis(URL_REDIS, { maxRetriesPerRequest: 1 }) : null;
  });

  afterAll(async () => {
    if (menage) {
      const cles = await menage.keys(`${PREFIXE}*`);

      if (cles.length) {
        await menage.del(...cles);
      }

      menage.disconnect();
    }

    await stockage.fermer();
  });

  siRedis('compte les passages et rend la duree restante en secondes', async () => {
    const k = cle('passages');

    const premier = await stockage.increment(k, 10_000, 5, 10_000, 'defaut');

    expect(premier.totalHits).toBe(1);
    expect(premier.isBlocked).toBe(false);
    // La duree entrante est en millisecondes, celle rendue en secondes.
    expect(premier.timeToExpire).toBeGreaterThan(0);
    expect(premier.timeToExpire).toBeLessThanOrEqual(10);

    const second = await stockage.increment(k, 10_000, 5, 10_000, 'defaut');

    expect(second.totalHits).toBe(2);
  });

  siRedis('bloque au dela du plafond', async () => {
    const k = cle('plafond');

    for (let i = 0; i < 3; i += 1) {
      const rendu = await stockage.increment(k, 10_000, 3, 5_000, 'defaut');

      expect(rendu.isBlocked).toBe(false);
    }

    const debordement = await stockage.increment(k, 10_000, 3, 5_000, 'defaut');

    expect(debordement.isBlocked).toBe(true);
    expect(debordement.timeToBlockExpire).toBeGreaterThan(0);
  });

  /**
   * Le test qui justifie tout le fichier.
   *
   * Deux instances du stockage, comme deux replicas derriere un repartiteur de
   * charge. Avec le stockage memoire, chacune compterait pour elle et le
   * plafond de deux en vaudrait quatre.
   */
  siRedis('partage le compteur entre deux instances', async () => {
    const k = cle('partage');
    const autre = new ThrottlerRedisStorage(URL_REDIS, URL_BASE);

    try {
      const a = await stockage.increment(k, 10_000, 2, 5_000, 'connexion');
      const b = await autre.increment(k, 10_000, 2, 5_000, 'connexion');

      expect(a.totalHits).toBe(1);
      expect(b.totalHits).toBe(2);

      const c = await autre.increment(k, 10_000, 2, 5_000, 'connexion');

      expect(c.isBlocked).toBe(true);
    } finally {
      await autre.fermer();
    }
  });

  /** Deux limiteurs nommes ne se volent pas leur quota. */
  siRedis('separe les limiteurs', async () => {
    const k = cle('limiteurs');

    await stockage.increment(k, 10_000, 5, 5_000, 'defaut');
    const connexion = await stockage.increment(k, 10_000, 5, 5_000, 'connexion');

    expect(connexion.totalHits).toBe(1);
  });

  /**
   * Le repli. Une URL qui ne mene nulle part ne doit pas faire echouer la
   * requete : la limitation redevient locale a l'instance, elle ne disparait
   * pas et ne ferme rien.
   */
  it('se replie en memoire quand Redis est injoignable', async () => {
    const sansRedis = new ThrottlerRedisStorage(undefined, URL_BASE);

    const rendu = await sansRedis.increment('repli', 10_000, 2, 5_000, 'defaut');

    expect(rendu.totalHits).toBe(1);
    expect(rendu.isBlocked).toBe(false);

    await sansRedis.fermer();
  });
});
