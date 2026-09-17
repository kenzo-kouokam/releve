import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * Le cloisonnement multi-agence est la regle dont une regression coute le plus
 * cher : elle ne casse rien de visible, elle fait fuiter. Chaque route qui
 * touche a une donnee d'agence est donc verifiee dans les deux sens.
 */
describe('cloisonnement multi-agence', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let a: Session;
  let b: Session;

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
    a = await connecter(app, 'admin.a@test.example');
    b = await connecter(app, 'admin.b@test.example');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('candidats', () => {
    it('ne liste que les candidats de son agence', async () => {
      const listeA = await avec(app, a).get('/api/candidats').expect(200);
      const listeB = await avec(app, b).get('/api/candidats').expect(200);

      expect(listeA.body.donnees.map((c: { nom: string }) => c.nom)).toEqual(['Aubry']);
      expect(listeB.body.donnees.map((c: { nom: string }) => c.nom)).toEqual(['Bernard']);
    });

    it('repond 404 et non 403 sur le candidat d une autre agence', async () => {
      // 404 delibere : un 403 confirmerait que l'identifiant existe.
      await avec(app, b).get(`/api/candidats/${jeu.candidatA}`).expect(404);
      await avec(app, a).get(`/api/candidats/${jeu.candidatA}`).expect(200);
    });

    it('refuse toutes les ecritures croisees', async () => {
      await avec(app, b).patch(`/api/candidats/${jeu.candidatA}`).send({ rayonKm: 1 }).expect(404);
      await avec(app, b)
        .put(`/api/candidats/${jeu.candidatA}/disponibilites`)
        .send({ disponibilites: [] })
        .expect(404);
      await avec(app, b)
        .post(`/api/candidats/${jeu.candidatA}/indisponibilites`)
        .send({ du: '2026-10-01', au: '2026-10-02' })
        .expect(404);
      await avec(app, b)
        .post(`/api/candidats/${jeu.candidatA}/qualifications`)
        .send({ qualificationId: jeu.qualification })
        .expect(404);
    });

    it('cree le candidat dans l agence du jeton, pas ailleurs', async () => {
      const cree = await avec(app, b)
        .post('/api/candidats')
        .send({
          nom: 'Test',
          prenom: 'Cloison',
          email: 'cloison@test.example',
          telephone: '0612340099',
          adresse: '9 rue X',
          codePostal: '35000',
          ville: 'Rennes',
        })
        .expect(201);

      const enregistre = await prisma.candidat.findUniqueOrThrow({
        where: { id: cree.body.id },
        select: { agenceId: true },
      });

      expect(enregistre.agenceId).toBe(jeu.agenceB);
    });
  });

  describe('clients et lieux', () => {
    it('ne liste que ses clients', async () => {
      const listeA = await avec(app, a).get('/api/clients').expect(200);

      expect(listeA.body.donnees.map((c: { raisonSociale: string }) => c.raisonSociale)).toEqual([
        'SAAD A',
      ]);
    });

    it('refuse la lecture et l ecriture croisees', async () => {
      await avec(app, b).get(`/api/clients/${jeu.clientA}`).expect(404);
      await avec(app, b).patch(`/api/clients/${jeu.clientA}`).send({ actif: false }).expect(404);
      await avec(app, b)
        .post(`/api/clients/${jeu.clientA}/lieux`)
        .send({
          type: 'DOMICILE_BENEFICIAIRE',
          libelle: 'Intrusion',
          adresse: '1 rue Z',
          codePostal: '35000',
          ville: 'Rennes',
        })
        .expect(404);
    });

    it('refuse un lieu adresse via le mauvais client de la meme agence', async () => {
      // Sans ce filtre, un identifiant de lieu devine permettrait de modifier
      // celui d'un autre client.
      const autre = await avec(app, a)
        .post('/api/clients')
        .send({
          raisonSociale: 'Autre A',
          siret: '35600000000048',
          statutReglementaire: 'DECLARE_SAP',
          numeroSap: 'SAP356000000',
        })
        .expect(201);

      await avec(app, a)
        .patch(`/api/clients/${autre.body.id}/lieux/${jeu.lieuA}`)
        .send({ libelle: 'Detourne' })
        .expect(404);

      await avec(app, a)
        .patch(`/api/clients/${jeu.clientA}/lieux/${jeu.lieuA}`)
        .send({ libelle: 'Legitime' })
        .expect(200);
    });
  });

  describe('comptes', () => {
    it('ne voit que les comptes de son perimetre', async () => {
      const listeB = await avec(app, b).get('/api/utilisateurs').expect(200);

      expect(listeB.body.donnees.map((u: { email: string }) => u.email)).toEqual([
        'admin.b@test.example',
      ]);
    });

    it('inclut les comptes externes via leur rattachement', async () => {
      // Le compte candidat n'a pas d'agenceId : il est rattrape par la relation.
      const listeA = await avec(app, a).get('/api/utilisateurs').expect(200);
      const emails = listeA.body.donnees.map((u: { email: string }) => u.email);

      expect(emails).toContain('candidat.a@test.example');
      expect(emails).not.toContain('admin.b@test.example');
    });

    it('refuse de creer un compte sur le client d une autre agence', async () => {
      await avec(app, b)
        .post('/api/utilisateurs')
        .send({
          email: 'intrus@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CLIENT',
          clientId: jeu.clientA,
        })
        .expect(404);
    });

    it('refuse de modifier ou reinitialiser un compte d une autre agence', async () => {
      await avec(app, b)
        .patch(`/api/utilisateurs/${jeu.chargeA}`)
        .send({ actif: false })
        .expect(404);
      await avec(app, b)
        .post(`/api/utilisateurs/${jeu.chargeA}/mot-de-passe`)
        .send({ motDePasse: 'MotDePasseValide2026' })
        .expect(404);
    });
  });

  describe('referentiel partage', () => {
    it('reste visible des deux agences : un DEAS est un DEAS partout', async () => {
      const vuA = await avec(app, a).get('/api/qualifications').expect(200);
      const vuB = await avec(app, b).get('/api/qualifications').expect(200);

      expect(vuA.body.map((q: { code: string }) => q.code)).toEqual(['DEAS']);
      expect(vuB.body.map((q: { code: string }) => q.code)).toEqual(['DEAS']);
    });
  });

  it('ferme tout sans jeton', async () => {
    const agent = request(app.getHttpServer());

    await agent.get('/api/candidats').expect(401);
    await agent.get('/api/clients').expect(401);
    await agent.get('/api/utilisateurs').expect(401);
    await agent.get('/api/qualifications').expect(401);
  });
});
