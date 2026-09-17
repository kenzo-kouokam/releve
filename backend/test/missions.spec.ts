import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, creerCompteDeTest, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * Le parcours complet, de la publication a la mission confirmee.
 *
 * C'est la boucle qui fait le produit : l'etablissement depose un besoin,
 * l'interimaire le voit et postule, l'etablissement retient quelqu'un, et la
 * mission apparait dans le suivi du candidat. Chaque etape est verifiee avec
 * les trois profils, parce que c'est la seule partie du projet ou ils se
 * croisent sur le meme objet.
 */
describe('missions et candidatures', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let agence: Session;
  let client: Session;
  let candidat: Session;
  let clientAutreAgence: Session;

  /** Corps minimal d'une mission valide, date au lendemain. */
  function besoin(surcharge: Record<string, unknown> = {}) {
    const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

    return {
      lieuId: jeu.lieuA,
      qualificationRequiseId: jeu.qualification,
      dateDebut: demain,
      dateFin: demain,
      heureDebut: '07:00',
      heureFin: '14:00',
      motifRecours: "Remplacement d'un salarie absent",
      tauxHoraire: 14.5,
      ...surcharge,
    };
  }

  async function publier(surcharge: Record<string, unknown> = {}): Promise<string> {
    const reponse = await avec(app, client).post('/api/missions').send(besoin(surcharge));

    expect(reponse.status).toBe(201);

    return reponse.body.id;
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

    // Deux comptes clients : un dans chaque agence, pour verifier le
    // cloisonnement dans les deux sens.
    await creerCompteDeTest('client.a@test.example', 'CLIENT', { clientId: jeu.clientA });
    await creerCompteDeTest('client.b@test.example', 'CLIENT', { clientId: jeu.clientB });

    agence = await connecter(app, 'charge.a@test.example');
    client = await connecter(app, 'client.a@test.example');
    candidat = await connecter(app, 'candidat.a@test.example');
    clientAutreAgence = await connecter(app, 'client.b@test.example');
  });

  /** Donne au candidat A le diplome exige, verifie par l'agence. */
  async function diplomer(expireLe: Date | null = null): Promise<void> {
    await prisma.qualificationCandidat.create({
      data: {
        candidatId: jeu.candidatA,
        qualificationId: jeu.qualification,
        obtenueLe: new Date('2019-06-30'),
        verifieeLe: new Date(),
        verifieePar: 'test',
        expireLe,
      },
    });
  }

  describe('publication', () => {
    it('numerote la mission et la publie d emblee', async () => {
      const reponse = await avec(app, client).post('/api/missions').send(besoin()).expect(201);

      expect(reponse.body.reference).toMatch(/^M-\d{4}-0001$/);
      expect(reponse.body.statut).toBe('PUBLIEE');
      expect(reponse.body.client.id).toBe(jeu.clientA);
      expect(reponse.body.dureeHeures).toBe(7);
      expect(reponse.body.travailNuit).toBe(false);
    });

    it('incremente la reference sans trou', async () => {
      await publier();
      const seconde = await avec(app, client).post('/api/missions').send(besoin()).expect(201);

      expect(seconde.body.reference).toMatch(/^M-\d{4}-0002$/);
    });

    it('deduit le travail de nuit des horaires', async () => {
      const reponse = await avec(app, client)
        .post('/api/missions')
        .send(besoin({ heureDebut: '20:00', heureFin: '07:00' }))
        .expect(201);

      expect(reponse.body.travailNuit).toBe(true);
      expect(reponse.body.dureeHeures).toBe(11);
    });

    it('refuse un lieu qui appartient a un autre client', async () => {
      const ailleurs = await prisma.lieuIntervention.create({
        data: {
          clientId: jeu.clientB,
          type: 'DOMICILE_BENEFICIAIRE',
          libelle: 'Domicile B',
          adresse: '9 rue B',
          codePostal: '35000',
          ville: 'Rennes',
        },
      });

      await avec(app, client)
        .post('/api/missions')
        .send(besoin({ lieuId: ailleurs.id }))
        .expect(404);
    });

    it('refuse une qualification qui n existe pas au referentiel', async () => {
      const reponse = await avec(app, client)
        .post('/api/missions')
        .send(besoin({ qualificationRequiseId: '00000000-0000-4000-8000-000000000000' }))
        .expect(404);

      expect(reponse.body.message).toMatch(/qualification/i);
    });

    it('refuse une date de fin anterieure au debut', async () => {
      const reponse = await avec(app, client)
        .post('/api/missions')
        .send(besoin({ dateFin: '2020-01-01' }))
        .expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('dateFin');
    });

    it('refuse un client que l agence n a pas encore valide', async () => {
      await prisma.client.update({ where: { id: jeu.clientA }, data: { actif: false } });

      const reponse = await avec(app, client).post('/api/missions').send(besoin()).expect(403);

      expect(reponse.body.message).toMatch(/valide/i);
    });

    it('interdit au candidat de publier', async () => {
      await avec(app, candidat).post('/api/missions').send(besoin()).expect(403);
    });

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/missions').expect(401);
    });
  });

  describe('visibilite', () => {
    it('montre la mission publiee au candidat de la meme agence', async () => {
      await publier();

      const reponse = await avec(app, candidat).get('/api/missions').expect(200);

      expect(reponse.body.total).toBe(1);
    });

    it('ne montre rien au client d une autre agence', async () => {
      const id = await publier();

      const liste = await avec(app, clientAutreAgence).get('/api/missions').expect(200);
      expect(liste.body.total).toBe(0);

      // 404 et non 403 : un identifiant hors perimetre ne doit pas se confirmer.
      await avec(app, clientAutreAgence).get(`/api/missions/${id}`).expect(404);
    });

    it('cache les consignes d acces au candidat non retenu', async () => {
      await prisma.lieuIntervention.update({
        where: { id: jeu.lieuA },
        data: { consignes: 'Code portail 1234' },
      });

      const id = await publier();

      const vueCandidat = await avec(app, candidat).get(`/api/missions/${id}`).expect(200);
      expect(vueCandidat.body.consignes).toBeNull();

      const vueAgence = await avec(app, agence).get(`/api/missions/${id}`).expect(200);
      expect(vueAgence.body.consignes).toBe('Code portail 1234');
    });

    it('annonce des prerequis reellement verifies', async () => {
      const id = await publier();

      const avant = await avec(app, candidat).get(`/api/missions/${id}`).expect(200);
      expect(avant.body.prerequis[0].verifie).toBe(false);

      await diplomer();

      const apres = await avec(app, candidat).get(`/api/missions/${id}`).expect(200);
      expect(apres.body.prerequis[0].verifie).toBe(true);
      expect(apres.body.dejaPostule).toBe(false);
    });
  });

  /**
   * Le lieu non localise, traite a la source.
   *
   * Sans coordonnees, la distance n'est mesurable pour personne : la porte
   * ecarte le vivier entier, l'etablissement voit un classement vide, et depuis
   * que la candidature traverse la meme porte, le candidat se voit refuser pour
   * une erreur qui n'est pas la sienne. Le refus a la publication traite la
   * cause plutot que le symptome.
   */
  describe('lieu non localise', () => {
    it('refuse de publier une mission sur un lieu sans coordonnees', async () => {
      await prisma.lieuIntervention.update({
        where: { id: jeu.lieuA },
        data: { latitude: null, longitude: null },
      });

      const reponse = await avec(app, client).post('/api/missions').send(besoin());

      expect(reponse.status).toBe(400);
      expect(reponse.body.message).toMatch(/localisee/i);
      // Le message nomme l'adresse fautive et dit vers qui se tourner : les
      // lieux se corrigent depuis le back-office, pas depuis l'espace client.
      expect(reponse.body.message).toMatch(/2 rue A/);
      expect(reponse.body.message).toMatch(/agence/i);

      expect(await prisma.mission.count()).toBe(0);
    });

    it('publie normalement des que le lieu est localise', async () => {
      const id = await publier();

      expect(id).toBeDefined();
      expect(await prisma.mission.count()).toBe(1);
    });
  });

  describe('candidature', () => {
    it('refuse un candidat sans le diplome exige, avec le motif', async () => {
      const id = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(403);

      expect(reponse.body.message).toMatch(/DEAS/);
    });

    it('refuse un diplome expire', async () => {
      await diplomer(new Date('2020-01-01'));
      const id = await publier();

      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(403);
    });

    it('refuse un profil que l agence n a pas valide', async () => {
      await diplomer();
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });

      const id = await publier();
      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(403);

      expect(reponse.body.message).toMatch(/valide/i);
    });

    /**
     * La porte de la candidature est celle du classement, et c'est le point.
     *
     * Elle ne verifiait ici que le statut et le diplome. Une intervenante hors
     * de son rayon pouvait donc postuler, obtenir un score, apparaitre chez
     * l'etablissement — et rester introuvable dans le classement de l'agence,
     * qui l'ecartait. Trois ecrans, trois verites.
     */
    it('refuse une mission au-dela du rayon declare, en chiffrant l ecart', async () => {
      await diplomer();

      // Le lieu part a Rennes, la candidate reste a Nantes avec 15 km de rayon.
      await prisma.lieuIntervention.update({
        where: { id: jeu.lieuA },
        data: { latitude: 48.1173, longitude: -1.6778 },
      });

      await prisma.candidat.update({ where: { id: jeu.candidatA }, data: { rayonKm: 15 } });

      const id = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(403);

      expect(reponse.body.message).toMatch(/rayon/i);
      // Le motif chiffre l'ecart plutot que de dire « non » : la personne sait
      // de combien elargir son rayon, ou qu'il n'y a rien a en attendre.
      expect(reponse.body.message).toMatch(/\d+ km/);

      const posees = await prisma.proposition.count({ where: { candidatId: jeu.candidatA } });
      expect(posees).toBe(0);
    });

    it('refuse une mission sur une periode ou le candidat s est declare absent', async () => {
      await diplomer();

      const demain = new Date(Date.now() + 24 * 3600 * 1000);

      await prisma.indisponibilite.create({
        data: { candidatId: jeu.candidatA, du: demain, au: demain },
      });

      const id = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(403);

      expect(reponse.body.message).toMatch(/absence/i);
    });

    it('signale au candidat les missions hors de son rayon dans sa liste', async () => {
      await diplomer();
      await prisma.candidat.update({ where: { id: jeu.candidatA }, data: { rayonKm: 15 } });

      const proche = await publier();

      await prisma.lieuIntervention.update({
        where: { id: jeu.lieuA },
        data: { latitude: 48.1173, longitude: -1.6778 },
      });

      const reponse = await avec(app, candidat)
        .get('/api/missions')
        .query({ statut: 'PUBLIEE' })
        .expect(200);

      const ligne = reponse.body.donnees.find((m: { id: string }) => m.id === proche);

      // La mission reste dans la liste : la masquer priverait la personne de
      // l'information qui lui permettrait d'agir sur son rayon.
      expect(ligne).toBeDefined();
      expect(ligne.horsRayon).toBe(true);
      expect(ligne.distanceKm).toBeGreaterThan(15);
    });

    it('enregistre la candidature comme deja acceptee par l interesse', async () => {
      await diplomer();
      const id = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({ message: 'Disponible des 6h45.' })
        .expect(201);

      expect(reponse.body.statut).toBe('ACCEPTEE_CANDIDAT');
      expect(reponse.body.message).toBe('Disponible des 6h45.');
      expect(reponse.body.candidat.initiales).toBe('AA');
      expect(reponse.body.repondueLe).not.toBeNull();
    });

    it('refuse une seconde candidature a la meme mission', async () => {
      await diplomer();
      const id = await publier();

      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(201);
      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(409);
    });

    it('remonte la candidature a l etablissement, pas aux autres', async () => {
      await diplomer();
      const id = await publier();
      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(201);

      const vueClient = await avec(app, client).get('/api/propositions').expect(200);
      expect(vueClient.body.total).toBe(1);
      expect(vueClient.body.donnees[0].candidat.nom).toBe('Aubry');

      const vueAutre = await avec(app, clientAutreAgence).get('/api/propositions').expect(200);
      expect(vueAutre.body.total).toBe(0);
    });
  });

  describe('validation', () => {
    async function candidaturePosee(): Promise<{ missionId: string; propositionId: string }> {
      await diplomer();
      const missionId = await publier();

      const reponse = await avec(app, candidat)
        .post(`/api/missions/${missionId}/candidatures`)
        .send({})
        .expect(201);

      return { missionId, propositionId: reponse.body.id };
    }

    it('pourvoit la mission et retient le candidat', async () => {
      const { missionId, propositionId } = await candidaturePosee();

      const reponse = await avec(app, client)
        .post(`/api/propositions/${propositionId}/valider`)
        .expect(201);

      expect(reponse.body.statut).toBe('VALIDEE_CLIENT');
      // La reponse doit deja porter la mission pourvue, pas son etat d'avant :
      // l'ecran de l'etablissement s'en sert sans recharger.
      expect(reponse.body.mission.statut).toBe('VALIDEE');

      const mission = await prisma.mission.findUniqueOrThrow({ where: { id: missionId } });
      expect(mission.statut).toBe('VALIDEE');
      expect(mission.candidatRetenuId).toBe(jeu.candidatA);
    });

    it('ecarte les autres candidatures de la meme mission', async () => {
      const { missionId, propositionId } = await candidaturePosee();

      // Une seconde candidature, posee directement pour rester concis.
      const autre = await prisma.proposition.create({
        data: { missionId, candidatId: jeu.candidatB, statut: 'ACCEPTEE_CANDIDAT' },
      });

      await avec(app, client).post(`/api/propositions/${propositionId}/valider`).expect(201);

      const ecartee = await prisma.proposition.findUniqueOrThrow({ where: { id: autre.id } });
      expect(ecartee.statut).toBe('REFUSEE_CLIENT');
      expect(ecartee.motifRefus).toMatch(/pourvue/i);
    });

    it('refuse de pourvoir deux fois la meme mission', async () => {
      const { propositionId } = await candidaturePosee();

      await avec(app, client).post(`/api/propositions/${propositionId}/valider`).expect(201);
      await avec(app, client).post(`/api/propositions/${propositionId}/valider`).expect(409);
    });

    it('interdit au candidat de valider sa propre candidature', async () => {
      const { propositionId } = await candidaturePosee();

      await avec(app, candidat).post(`/api/propositions/${propositionId}/valider`).expect(403);
    });

    it('laisse le candidat se retirer', async () => {
      const { propositionId } = await candidaturePosee();

      const reponse = await avec(app, candidat)
        .post(`/api/propositions/${propositionId}/refuser`)
        .send({ motif: 'Plus disponible' })
        .expect(201);

      expect(reponse.body.statut).toBe('REFUSEE_CANDIDAT');
    });

    it('sert la mission confirmee au suivi du candidat', async () => {
      const { propositionId } = await candidaturePosee();

      const avantValidation = await avec(app, candidat)
        .get('/api/propositions/courante')
        .expect(200);
      expect(avantValidation.body).toEqual({});

      await avec(app, client).post(`/api/propositions/${propositionId}/valider`).expect(201);

      const apres = await avec(app, candidat).get('/api/propositions/courante').expect(200);
      expect(apres.body.mission.statut).toBe('VALIDEE');
      expect(apres.body.statut).toBe('VALIDEE_CLIENT');
    });

    it('donne au candidat retenu l acces aux consignes', async () => {
      await prisma.lieuIntervention.update({
        where: { id: jeu.lieuA },
        data: { consignes: 'Code portail 1234' },
      });

      const { missionId, propositionId } = await candidaturePosee();
      await avec(app, client).post(`/api/propositions/${propositionId}/valider`).expect(201);

      const reponse = await avec(app, candidat).get(`/api/missions/${missionId}`).expect(200);
      expect(reponse.body.consignes).toBe('Code portail 1234');
    });
  });

  describe('annulation et tableau de bord', () => {
    it('libere les candidatures en attente', async () => {
      await diplomer();
      const missionId = await publier();
      await avec(app, candidat)
        .post(`/api/missions/${missionId}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client).post(`/api/missions/${missionId}/annuler`).expect(201);

      const propositions = await prisma.proposition.findMany({ where: { missionId } });
      expect(propositions[0]?.statut).toBe('EXPIREE');
    });

    it('refuse de modifier une mission deja pourvue', async () => {
      await diplomer();
      const missionId = await publier();
      const candidature = await avec(app, candidat)
        .post(`/api/missions/${missionId}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client).post(`/api/propositions/${candidature.body.id}/valider`).expect(201);

      await avec(app, client)
        .patch(`/api/missions/${missionId}`)
        .send({ heureDebut: '08:00' })
        .expect(403);
    });

    it('compte les missions actives et les candidatures a trancher', async () => {
      await diplomer();
      const missionId = await publier();
      await publier();
      await avec(app, candidat)
        .post(`/api/missions/${missionId}/candidatures`)
        .send({})
        .expect(201);

      const reponse = await avec(app, client).get('/api/missions/resume').expect(200);

      expect(reponse.body).toEqual({ actives: 2, candidaturesRecues: 1, aConfirmer: 1 });
    });
  });
});
