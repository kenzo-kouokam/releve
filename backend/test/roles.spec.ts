import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';

describe('gardes de role', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let admin: Session;
  let charge: Session;
  let candidat: Session;

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
    admin = await connecter(app, 'admin.a@test.example');
    charge = await connecter(app, 'charge.a@test.example');
    candidat = await connecter(app, 'candidat.a@test.example');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('routes publiques', () => {
    it('laisse passer la sonde de sante sans jeton', async () => {
      // Un superviseur externe doit pouvoir l'interroger.
      await request(app.getHttpServer()).get('/api/sante').expect(200);
    });

    it('laisse passer la connexion sans jeton', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: 'inconnu@test.example', motDePasse: 'PeuImporteVraiment' })
        .expect(401);
    });
  });

  describe('back-office', () => {
    it('ouvre le vivier et les clients aux deux roles d agence', async () => {
      await avec(app, admin).get('/api/candidats').expect(200);
      await avec(app, charge).get('/api/candidats').expect(200);
      await avec(app, admin).get('/api/clients').expect(200);
      await avec(app, charge).get('/api/clients').expect(200);
    });

    it('les ferme au candidat', async () => {
      await avec(app, candidat).get('/api/candidats').expect(403);
      await avec(app, candidat).get('/api/clients').expect(403);
      await avec(app, candidat)
        .patch(`/api/candidats/${jeu.candidatA}`)
        .send({ rayonKm: 1 })
        .expect(403);
    });
  });

  describe('administration', () => {
    it('reserve la gestion des comptes a l administrateur', async () => {
      await avec(app, admin).get('/api/utilisateurs').expect(200);
      await avec(app, charge).get('/api/utilisateurs').expect(403);
      await avec(app, candidat).get('/api/utilisateurs').expect(403);
    });

    it('reserve l ecriture du referentiel a l administrateur', async () => {
      const qualification = {
        code: 'AVS',
        libelle: 'Auxiliaire de vie sociale',
      };

      await avec(app, charge).post('/api/qualifications').send(qualification).expect(403);
      await avec(app, admin).post('/api/qualifications').send(qualification).expect(201);
    });

    it('ouvre la lecture du referentiel a tout compte authentifie', async () => {
      // Le candidat en a besoin pour lire une mission ; rien de nominatif dedans.
      await avec(app, candidat).get('/api/qualifications').expect(200);
    });
  });

  describe('compte sans agence', () => {
    it('refuse une route de back-office au compte candidat avant meme le 404', async () => {
      // La garde de role passe avant l'extraction de l'agence : le candidat
      // n'atteint jamais le code qui exigerait un agenceId.
      const reponse = await avec(app, candidat).get('/api/candidats').expect(403);

      expect(reponse.body.message).toContain('Role insuffisant');
    });
  });

  it('refuse un jeton illisible', async () => {
    await request(app.getHttpServer())
      .get('/api/candidats')
      .set('Authorization', 'Bearer pas.un.jeton')
      .expect(401);
  });

  it('refuse un en-tete au mauvais schema', async () => {
    await request(app.getHttpServer())
      .get('/api/candidats')
      .set('Authorization', `Basic ${admin.jeton}`)
      .expect(401);
  });
});
