import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, creerCompteDeTest, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * Le classement, branche sur la base.
 *
 * Le bareme lui-meme est verifie dans `score.spec.ts`, sans base. Ici on
 * verifie le cablage : qui a le droit de voir le classement, quel vivier est
 * examine, et que le score atterrit bien sur la candidature.
 */
describe('classement des candidats', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let agence: Session;
  let client: Session;
  let candidat: Session;

  const DEMAIN = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  function besoin(surcharge: Record<string, unknown> = {}) {
    return {
      lieuId: jeu.lieuA,
      qualificationRequiseId: jeu.qualification,
      dateDebut: DEMAIN,
      dateFin: DEMAIN,
      heureDebut: '07:00',
      heureFin: '14:00',
      motifRecours: "Remplacement d'un salarie absent",
      tauxHoraire: 14.5,
      ...surcharge,
    };
  }

  beforeAll(async () => {
    app = await creerApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jeu = await reinitialiser();

    await creerCompteDeTest('client.a@test.example', 'CLIENT', { clientId: jeu.clientA });

    // Le lieu et la candidate sont places au meme endroit : la distance ne
    // brouille pas les assertions sur les autres composantes.
    await prisma.lieuIntervention.update({
      where: { id: jeu.lieuA },
      data: { latitude: 47.2184, longitude: -1.5536 },
    });

    await prisma.candidat.update({
      where: { id: jeu.candidatA },
      data: { latitude: 47.2184, longitude: -1.5536, rayonKm: 25 },
    });

    await prisma.qualificationCandidat.create({
      data: {
        candidatId: jeu.candidatA,
        qualificationId: jeu.qualification,
        obtenueLe: new Date('2016-06-30'),
        verifieeLe: new Date(),
        verifieePar: 'test',
      },
    });

    agence = await connecter(app, 'charge.a@test.example');
    client = await connecter(app, 'client.a@test.example');
    candidat = await connecter(app, 'candidat.a@test.example');
  });

  async function publier(surcharge: Record<string, unknown> = {}): Promise<string> {
    const reponse = await avec(app, client).post('/api/missions').send(besoin(surcharge));

    expect(reponse.status).toBe(201);

    return reponse.body.id;
  }

  describe('acces', () => {
    it('sert le classement au personnel de l agence', async () => {
      const id = await publier();

      const reponse = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      expect(reponse.body.missionId).toBe(id);
      expect(reponse.body.examines).toBeGreaterThan(0);
    });

    it('le sert aussi a l etablissement concerne', async () => {
      const id = await publier();

      await avec(app, client).get(`/api/missions/${id}/candidats`).expect(200);
    });

    /** Un candidat n'a pas a savoir qui d'autre est sur les rangs. */
    it('le refuse au candidat', async () => {
      const id = await publier();

      await avec(app, candidat).get(`/api/missions/${id}/candidats`).expect(403);
    });
  });

  describe('classement', () => {
    it('retient la candidate eligible et explique son score', async () => {
      const id = await publier();

      const reponse = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      const retenue = reponse.body.retenus.find(
        (ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA,
      );

      expect(retenue).toBeDefined();
      expect(retenue.distanceKm).toBe(0);
      expect(retenue.score.composantes).toHaveLength(3);
      expect(retenue.score.total).toBeGreaterThan(0);

      // Le total est bien la somme de ses composantes : un score qui ne se
      // reconstitue pas n'est pas explicable.
      const somme = retenue.score.composantes.reduce(
        (cumul: number, composante: { points: number }) => cumul + composante.points,
        0,
      );
      expect(somme).toBe(retenue.score.total);
    });

    /**
     * La propriete centrale de la composante « experience ».
     *
     * Une experience declaree et non controlee ne doit rien rapporter, sinon
     * il suffirait de s'inventer cinq ans de terrain pour remonter en tete.
     * C'est le meme invariant que sur les diplomes, verifie ici de bout en
     * bout parce que le filtre vit dans la requete Prisma, pas dans le bareme.
     */
    it('ne compte pas une experience que l agence n a pas verifiee', async () => {
      const poste = await prisma.experienceProfessionnelle.create({
        data: {
          candidatId: jeu.candidatA,
          qualificationId: jeu.qualification,
          employeur: 'SAAD Les Glycines',
          intitule: 'Auxiliaire de vie',
          debutLe: new Date('2018-01-01T00:00:00.000Z'),
          quotitePourcent: 100,
        },
      });

      const id = await publier();

      const avantVerification = await avec(app, agence)
        .get(`/api/missions/${id}/candidats`)
        .expect(200);

      const points = (corps: {
        retenus: {
          candidat: { id: string };
          score: { composantes: { cle: string; points: number }[] };
        }[];
      }): number =>
        corps.retenus
          .find((ligne) => ligne.candidat.id === jeu.candidatA)!
          .score.composantes.find((c) => c.cle === 'experience')!.points;

      expect(points(avantVerification.body)).toBe(0);

      await prisma.experienceProfessionnelle.update({
        where: { id: poste.id },
        data: { verifieeLe: new Date(), verifieePar: 'agence' },
      });

      const apres = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      // Plus de cinq ans de terrain sur le diplome exige : la composante est au
      // maximum.
      expect(points(apres.body)).toBe(40);
    });

    it('ne compte qu a moitie une experience hors du metier exige', async () => {
      await prisma.experienceProfessionnelle.create({
        data: {
          candidatId: jeu.candidatA,
          // Sans rattachement au referentiel : un poste qui dit quelque chose
          // de la personne au travail, rien de ce metier-ci.
          qualificationId: null,
          employeur: 'Supermarche',
          intitule: 'Hotesse de caisse',
          debutLe: new Date('2018-01-01T00:00:00.000Z'),
          quotitePourcent: 100,
          verifieeLe: new Date(),
          verifieePar: 'agence',
        },
      });

      const id = await publier();
      const reponse = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      const composante = reponse.body.retenus
        .find((ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA)
        .score.composantes.find((c: { cle: string }) => c.cle === 'experience');

      // Huit ans hors metier, ramenes a quatre : en dessous du plafond de cinq.
      expect(composante.points).toBeGreaterThan(0);
      expect(composante.points).toBeLessThan(40);
      expect(composante.explication).toMatch(/moitie/);
    });

    it('ecarte, avec le motif, un profil sans le diplome exige', async () => {
      await prisma.qualificationCandidat.deleteMany({ where: { candidatId: jeu.candidatA } });

      const id = await publier();
      const reponse = await avec(app, agence)
        .get(`/api/missions/${id}/candidats?ecartes=true`)
        .expect(200);

      expect(reponse.body.retenus).toHaveLength(0);

      const ecartee = reponse.body.ecartes.find(
        (ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA,
      );

      expect(ecartee.motifs.map((m: { cle: string }) => m.cle)).toContain('diplome');
    });

    it('ecarte un profil hors de son rayon, en chiffrant l ecart', async () => {
      // Rennes, a une centaine de kilometres.
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { latitude: 48.1173, longitude: -1.6778, rayonKm: 20 },
      });

      const id = await publier();
      const reponse = await avec(app, agence)
        .get(`/api/missions/${id}/candidats?ecartes=true`)
        .expect(200);

      const ecartee = reponse.body.ecartes.find(
        (ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA,
      );

      expect(ecartee.motifs.map((m: { cle: string }) => m.cle)).toContain('hors-rayon');
    });

    it('cache les ecartes tant qu on ne les demande pas', async () => {
      await prisma.qualificationCandidat.deleteMany({ where: { candidatId: jeu.candidatA } });

      const id = await publier();
      const reponse = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      expect(reponse.body.ecartes).toHaveLength(0);
      expect(reponse.body.examines).toBeGreaterThan(0);
    });

    /** Le vivier examine est celui de l'agence de la mission, pas le global. */
    it('n examine pas le vivier d une autre agence', async () => {
      const id = await publier();

      const reponse = await avec(app, agence).get(`/api/missions/${id}/candidats`).expect(200);

      const identifiants = [
        ...reponse.body.retenus.map((l: { candidat: { id: string } }) => l.candidat.id),
      ];

      expect(identifiants).not.toContain(jeu.candidatB);
    });
  });

  describe('score fige sur la candidature', () => {
    it('enregistre le score et sa decomposition au moment de postuler', async () => {
      const id = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      expect(reponse.body.score).toBeGreaterThan(0);
      expect(reponse.body.detailScore.composantes).toHaveLength(3);

      const enBase = await prisma.proposition.findFirstOrThrow({ where: { missionId: id } });
      expect(Number(enBase.score)).toBe(reponse.body.score);
    });

    /**
     * Le score ne doit pas bouger apres coup : sinon la decision de
     * l'etablissement devient incomprehensible a posteriori.
     */
    it('ne recalcule pas le score quand le candidat change ses disponibilites', async () => {
      const id = await publier();

      const avant = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await prisma.disponibilite.deleteMany({ where: { candidatId: jeu.candidatA } });

      const apres = await avec(app, client).get(`/api/propositions/${avant.body.id}`).expect(200);

      expect(apres.body.score).toBe(avant.body.score);
    });
  });

  describe('distance rendue au candidat', () => {
    it('chiffre la distance entre le candidat et le lieu', async () => {
      await publier();

      const reponse = await avec(app, candidat).get('/api/missions?statut=PUBLIEE').expect(200);

      expect(reponse.body.donnees[0].distanceKm).toBe(0);
    });

    it('ne rend aucune distance a l agence, qui n a pas de position', async () => {
      await publier();

      const reponse = await avec(app, agence).get('/api/missions').expect(200);

      expect(reponse.body.donnees[0].distanceKm).toBeNull();
    });
  });
});
