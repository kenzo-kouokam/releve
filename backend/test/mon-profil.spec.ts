import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * L'espace personnel de l'interimaire.
 *
 * L'enjeu n'est pas ce qu'il peut faire, mais ce qu'il ne peut pas : se rendre
 * actif, se declarer un diplome verifie, ou toucher la fiche d'un autre. Chaque
 * garde-fou a son test.
 */
describe('mon profil', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let candidat: Session;
  let agence: Session;

  beforeAll(async () => {
    app = await creerApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jeu = await reinitialiser();
    candidat = await connecter(app, 'candidat.a@test.example');
    agence = await connecter(app, 'charge.a@test.example');
  });

  describe('lecture', () => {
    it('sert sa propre fiche au candidat', async () => {
      const reponse = await avec(app, candidat).get('/api/mon-profil').expect(200);

      expect(reponse.body.id).toBe(jeu.candidatA);
      expect(reponse.body.nom).toBe('Aubry');
    });

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/mon-profil').expect(401);
    });

    it('refuse le personnel de l agence, qui a ses propres routes', async () => {
      await avec(app, agence).get('/api/mon-profil').expect(403);
    });
  });

  describe('completude', () => {
    it('enumere ce qui manque pour devenir proposable', async () => {
      const reponse = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      const cles = reponse.body.manques.map((m: { cle: string }) => m.cle);

      // La fixture est localisee mais n'a ni diplome, ni creneau, ni parcours.
      expect(cles).toContain('diplome');
      expect(cles).toContain('disponibilites');
      expect(cles).not.toContain('adresse');
      expect(reponse.body.pourcentage).toBeLessThan(100);
    });

    it('progresse quand le profil se complete', async () => {
      const avant = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      await avec(app, candidat)
        .put('/api/mon-profil/disponibilites')
        .send({
          disponibilites: [
            { jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00', recurrente: true },
          ],
        })
        .expect(200);

      const apres = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      expect(apres.body.pourcentage).toBeGreaterThan(avant.body.pourcentage);
    });

    it('reclame une experience declaree, sans en faire un blocage', async () => {
      const reponse = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      const cles = reponse.body.manques.map((m: { cle: string }) => m.cle);

      expect(cles).toContain('experience');
    });
  });

  describe('modification', () => {
    it('met a jour le secteur et la mobilite', async () => {
      const reponse = await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ rayonKm: 45, vehicule: true, ville: 'Reze' })
        .expect(200);

      expect(reponse.body.rayonKm).toBe(45);
      expect(reponse.body.vehicule).toBe(true);
      expect(reponse.body.ville).toBe('Reze');
    });

    /** Se rendre actif soi-meme viderait la verification de son sens. */
    it('ignore une tentative de se rendre actif', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });

      const reponse = await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ statut: 'ACTIF', rayonKm: 30 })
        .expect(200);

      expect(reponse.body.statut).toBe('EN_VERIFICATION');
      expect(reponse.body.rayonKm).toBe(30);
    });

    /**
     * La propriete la plus importante de ce fichier.
     *
     * Les coordonnees sont la seule donnee du profil qui ne peut pas etre
     * declarative : la composante « zone » du bareme ne lit rien d'autre, donc
     * les accepter en entree laisserait n'importe qui se placer a cote du lieu
     * d'une mission et remonter en tete de tous les classements — sans mentir
     * sur quoi que ce soit de verifiable.
     */
    it('ignore des coordonnees envoyees a la main', async () => {
      const avant = await prisma.candidat.findUniqueOrThrow({ where: { id: jeu.candidatA } });

      // Un point a Paris, volontairement tres loin de celui de la fixture :
      // s'il etait retenu, la candidate se retrouverait a cote de n'importe
      // quelle mission parisienne et remonterait en tete de son classement.
      await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ latitude: 48.8566, longitude: 2.3522, rayonKm: 30 })
        .expect(200);

      const apres = await prisma.candidat.findUniqueOrThrow({ where: { id: jeu.candidatA } });

      expect(apres.latitude).toBe(avant.latitude);
      expect(apres.longitude).toBe(avant.longitude);
      // Le reste de la requete passe : ce n'est pas un rejet, c'est un filtre.
      expect(apres.rayonKm).toBe(30);
    });

    it('n accepte pas une aptitude medicale auto-declaree', async () => {
      await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ vaccinationVerifiee: true })
        .expect(200);

      const fiche = await prisma.candidat.findUniqueOrThrow({ where: { id: jeu.candidatA } });
      expect(fiche.vaccinationVerifiee).toBe(false);
    });

    it('refuse un rayon hors bornes', async () => {
      const reponse = await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ rayonKm: 500 })
        .expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('rayonKm');
    });

    it('refuse un numero de telephone mal forme', async () => {
      await avec(app, candidat).patch('/api/mon-profil').send({ telephone: 'allo' }).expect(400);
    });
  });

  describe('disponibilites', () => {
    it('enregistre les creneaux declares', async () => {
      const reponse = await avec(app, candidat)
        .put('/api/mon-profil/disponibilites')
        .send({
          disponibilites: [
            { jourSemaine: 1, heureDebut: '07:00', heureFin: '12:00' },
            { jourSemaine: 3, heureDebut: '14:00', heureFin: '19:00' },
          ],
        })
        .expect(200);

      expect(reponse.body.disponibilites).toHaveLength(2);
    });

    /** La regle du back-office s'applique telle quelle : pas de recouvrement. */
    it('refuse deux creneaux qui se chevauchent', async () => {
      await avec(app, candidat)
        .put('/api/mon-profil/disponibilites')
        .send({
          disponibilites: [
            { jourSemaine: 1, heureDebut: '07:00', heureFin: '12:00' },
            { jourSemaine: 1, heureDebut: '11:00', heureFin: '15:00' },
          ],
        })
        .expect(400);
    });
  });

  describe('diplomes', () => {
    it('declare un diplome, non verifie', async () => {
      const reponse = await avec(app, candidat)
        .post('/api/mon-profil/diplomes')
        .send({ qualificationId: jeu.qualification, obtenueLe: '2020-06-30' })
        .expect(201);

      const declare = reponse.body.qualificationsDetail[0];

      expect(declare.code).toBe('DEAS');
      expect(declare.verifieeLe).toBeNull();
    });

    it('permet de retirer un diplome tant qu il n est pas verifie', async () => {
      await avec(app, candidat)
        .post('/api/mon-profil/diplomes')
        .send({ qualificationId: jeu.qualification })
        .expect(201);

      const reponse = await avec(app, candidat)
        .delete(`/api/mon-profil/diplomes/${jeu.qualification}`)
        .expect(200);

      expect(reponse.body.qualificationsDetail).toHaveLength(0);
    });

    /**
     * Une qualification verifiee engage des missions passees : la faire
     * disparaitre effacerait la trace du controle de l'agence.
     */
    it('refuse de retirer un diplome deja verifie', async () => {
      await prisma.qualificationCandidat.create({
        data: {
          candidatId: jeu.candidatA,
          qualificationId: jeu.qualification,
          verifieeLe: new Date(),
          verifieePar: 'agence',
        },
      });

      const reponse = await avec(app, candidat)
        .delete(`/api/mon-profil/diplomes/${jeu.qualification}`)
        .expect(403);

      expect(reponse.body.message).toMatch(/agence/i);
    });

    it('ne touche jamais la fiche d un autre candidat', async () => {
      await avec(app, candidat)
        .post('/api/mon-profil/diplomes')
        .send({ qualificationId: jeu.qualification })
        .expect(201);

      const autre = await prisma.qualificationCandidat.count({
        where: { candidatId: jeu.candidatB },
      });

      expect(autre).toBe(0);
    });
  });

  /**
   * L'experience professionnelle.
   *
   * Meme architecture que les diplomes, et les memes garde-fous : ce qui
   * compte dans le score n'est jamais ce que la personne declare, c'est ce que
   * l'agence a constate.
   */
  describe('experience', () => {
    const poste = {
      employeur: 'SAAD Les Glycines',
      intitule: 'Auxiliaire de vie',
      debutLe: '2020-03-01',
      finLe: '2023-06-30',
      quotitePourcent: 80,
    };

    it('declare un poste, qui nait non verifie', async () => {
      const reponse = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send(poste)
        .expect(201);

      expect(reponse.body.experiences).toHaveLength(1);
      expect(reponse.body.experiences[0].employeur).toBe('SAAD Les Glycines');
      expect(reponse.body.experiences[0].verifieeLe).toBeNull();
      // 40 mois a 80 % : la quotite est appliquee, pas seulement stockee.
      expect(reponse.body.experiences[0].dureeMois).toBeCloseTo(32, 0);
    });

    it('marque un poste toujours occupe comme en cours', async () => {
      const reponse = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send({ ...poste, finLe: undefined })
        .expect(201);

      expect(reponse.body.experiences[0].enCours).toBe(true);
      expect(reponse.body.experiences[0].finLe).toBeNull();
    });

    it('refuse une date de fin anterieure au debut', async () => {
      await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send({ ...poste, debutLe: '2023-06-30', finLe: '2020-03-01' })
        .expect(400);
    });

    it('refuse une experience qui commence dans le futur', async () => {
      await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send({ ...poste, debutLe: '2099-01-01', finLe: undefined })
        .expect(400);
    });

    it('ne permet pas de se declarer verifie', async () => {
      const reponse = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send({ ...poste, verifieeLe: new Date().toISOString(), verifieePar: 'moi-meme' })
        .expect(201);

      expect(reponse.body.experiences[0].verifieeLe).toBeNull();
      expect(reponse.body.experiences[0].verifieePar).toBeNull();
    });

    it('retire un poste que l agence n a pas encore vu', async () => {
      const cree = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send(poste)
        .expect(201);

      const reponse = await avec(app, candidat)
        .delete(`/api/mon-profil/experiences/${cree.body.experiences[0].id}`)
        .expect(200);

      expect(reponse.body.experiences).toHaveLength(0);
    });

    it('refuse de retirer un poste verifie par l agence', async () => {
      const cree = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send(poste)
        .expect(201);

      const experienceId = cree.body.experiences[0].id;

      await prisma.experienceProfessionnelle.update({
        where: { id: experienceId },
        data: { verifieeLe: new Date(), verifieePar: 'charge.a@test.example' },
      });

      const reponse = await avec(app, candidat)
        .delete(`/api/mon-profil/experiences/${experienceId}`)
        .expect(403);

      expect(reponse.body.message).toMatch(/agence/i);
    });

    it('laisse l agence verifier, et elle seule', async () => {
      const cree = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send(poste)
        .expect(201);

      const reponse = await avec(app, agence)
        .patch(`/api/candidats/${jeu.candidatA}/experiences/${cree.body.experiences[0].id}`)
        .send({ verifiee: true })
        .expect(200);

      expect(reponse.body.experiences[0].verifieeLe).not.toBeNull();
      // On trace qui a constate : en cas de contestation d'un classement,
      // c'est cette ligne qui justifie les points attribues.
      expect(reponse.body.experiences[0].verifieePar).toBe('charge.a@test.example');
    });

    it('ne laisse pas agir sur l experience d un autre candidat', async () => {
      const cree = await avec(app, candidat)
        .post('/api/mon-profil/experiences')
        .send(poste)
        .expect(201);

      // L'identifiant est valide, mais il n'appartient pas a la fiche visee :
      // sans le filtre croise, il suffirait de le deviner pour agir ailleurs.
      await avec(app, agence)
        .delete(`/api/candidats/${jeu.candidatB}/experiences/${cree.body.experiences[0].id}`)
        .expect(404);

      const restantes = await prisma.experienceProfessionnelle.count({
        where: { candidatId: jeu.candidatA },
      });

      expect(restantes).toBe(1);
    });
  });
});
