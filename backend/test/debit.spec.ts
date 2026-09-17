import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { creerApp, prisma, reinitialiser } from './fixtures';

/**
 * Seule suite qui laisse la limitation de debit active. Elle tourne en dernier
 * (nom de fichier) pour ne pas consommer le quota des autres : le throttler
 * compte par adresse, et toutes les suites partagent la boucle locale.
 */
describe('limitation de debit', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await creerApp(true);
    await reinitialiser();
  });

  afterAll(async () => {
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
});
