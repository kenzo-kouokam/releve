import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';
import { MailService } from '../src/mail/mail.service';
import { NotificationsMissionsService } from '../src/notifications/notifications-missions.service';

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Ce que la plateforme ecrit a un candidat en dehors de son compte.
 *
 * Deux erreurs opposees a exclure. Se taire quand une mission s'ouvre, et le
 * dossier valide ne sert a rien. Ecrire trop, ou annoncer une mission a
 * quelqu'un dont la candidature sera refusee d'office, et la personne coupe
 * tout — ou se desabonne en classant l'expediteur en indesirable.
 */
describe('notifications du candidat', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let agence: Session;
  let mail: MailService;
  let notifications: NotificationsMissionsService;

  // L'adresse du *compte*, pas celle de la fiche : c'est au compte qu'on
  // ecrit, et le jeu commun leur donne deux valeurs differentes — ce qui est
  // exactement le piege que ce constat evite.
  const ADRESSE_CANDIDAT = 'candidat.a@test.example';

  /** Une mission publiee, a venir, exigeant le diplome du jeu commun. */
  async function publierMission(reference: string, dansJours = 7) {
    const debut = new Date(Date.now() + dansJours * JOUR);

    return prisma.mission.create({
      data: {
        reference,
        agenceId: jeu.agenceA,
        clientId: jeu.clientA,
        lieuId: jeu.lieuA,
        qualificationRequiseId: jeu.qualification,
        statut: 'PUBLIEE',
        dateDebut: debut,
        dateFin: debut,
        heureDebut: '08:00',
        heureFin: '12:00',
        motifRecours: "Remplacement d'un salarie absent",
        tauxHoraire: '13.5000',
        coefficient: '1.950',
      },
      select: { id: true },
    });
  }

  /** Rend la candidate proposable : diplome verifie et un creneau ouvert. */
  async function rendreEligible() {
    await prisma.qualificationCandidat.create({
      data: {
        candidatId: jeu.candidatA,
        qualificationId: jeu.qualification,
        obtenueLe: new Date('2021-06-30'),
        verifieeLe: new Date(),
        verifieePar: 'test',
      },
    });

    for (let jour = 1; jour <= 7; jour += 1) {
      await prisma.disponibilite.create({
        data: {
          candidatId: jeu.candidatA,
          jourSemaine: jour,
          heureDebut: '06:00',
          heureFin: '20:00',
        },
      });
    }
  }

  beforeAll(async () => {
    app = await creerApp();
    mail = app.get(MailService);
    notifications = app.get(NotificationsMissionsService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jeu = await reinitialiser();
    agence = await connecter(app, 'charge.a@test.example');
    mail.viderBoite();
  });

  describe('dossier validé', () => {
    it('écrit au candidat quand l agence le passe actif', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });
      await rendreEligible();

      await avec(app, agence)
        .patch(`/api/candidats/${jeu.candidatA}`)
        .send({ statut: 'ACTIF' })
        .expect(200);

      const courriel = mail.dernierPour(ADRESSE_CANDIDAT);

      expect(courriel?.sujet).toContain('dossier est validé');
      expect(courriel?.texte).toContain('/missions');
    });

    it('n écrit pas quand le candidat était déjà actif', async () => {
      await rendreEligible();

      await avec(app, agence)
        .patch(`/api/candidats/${jeu.candidatA}`)
        .send({ statut: 'ACTIF' })
        .expect(200);

      expect(mail.dernierPour(ADRESSE_CANDIDAT)).toBeUndefined();
    });

    it('n écrit pas à qui a coupé ses notifications', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });
      await prisma.utilisateur.update({
        where: { id: jeu.compteCandidatA },
        data: { notificationsEmail: false },
      });
      await rendreEligible();

      await avec(app, agence)
        .patch(`/api/candidats/${jeu.candidatA}`)
        .send({ statut: 'ACTIF' })
        .expect(200);

      expect(mail.dernierPour(ADRESSE_CANDIDAT)).toBeUndefined();
    });

    /**
     * La date de derniere annonce est posee a la validation : sans elle, le
     * premier balayage deroulerait a un nouvel arrivant tout l'historique des
     * publications.
     */
    it('pose la date de dernière annonce à la validation', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION', missionsNotifieesLe: null },
      });
      await rendreEligible();

      await avec(app, agence)
        .patch(`/api/candidats/${jeu.candidatA}`)
        .send({ statut: 'ACTIF' })
        .expect(200);

      const fiche = await prisma.candidat.findUniqueOrThrow({ where: { id: jeu.candidatA } });

      expect(fiche.missionsNotifieesLe).toBeInstanceOf(Date);
    });
  });

  describe('missions correspondantes', () => {
    beforeEach(async () => {
      await rendreEligible();
    });

    it('annonce une mission publiée pour laquelle le candidat est éligible', async () => {
      await publierMission('M-TEST-0001');

      const rapport = await notifications.notifier(false);

      expect(rapport).toMatchObject({ avertis: 1, missions: 1 });
      expect(mail.dernierPour(ADRESSE_CANDIDAT)?.sujet).toContain('correspond');
    });

    it('ne répète pas la même mission au passage suivant', async () => {
      await publierMission('M-TEST-0002');

      await notifications.notifier(false);
      mail.viderBoite();
      const second = await notifications.notifier(false);

      expect(second.missions).toBe(0);
      expect(mail.dernierPour(ADRESSE_CANDIDAT)).toBeUndefined();
    });

    /**
     * Une vacation dont la date est passee reste publiee tant que personne n'a
     * ete retenu. Elle n'a rien a faire dans une annonce.
     */
    it('passe une mission dont la date est derrière nous', async () => {
      await publierMission('M-TEST-0003', -3);

      expect((await notifications.notifier(false)).missions).toBe(0);
    });

    it('passe une mission à laquelle le candidat a déjà postulé', async () => {
      const mission = await publierMission('M-TEST-0004');

      await prisma.proposition.create({
        data: {
          missionId: mission.id,
          candidatId: jeu.candidatA,
          statut: 'ENVOYEE',
          score: 80,
        },
      });

      expect((await notifications.notifier(false)).missions).toBe(0);
    });

    /**
     * L'eligibilite decide de l'envoi, pas le score : annoncer une mission a
     * quelqu'un dont la candidature sera refusee d'office est pire que de se
     * taire.
     */
    it('passe une mission dont le diplôme n est pas détenu', async () => {
      const autre = await prisma.qualification.create({
        data: { code: 'AVS-TEST', libelle: 'Auxiliaire de vie sociale' },
      });

      const debut = new Date(Date.now() + 7 * JOUR);

      await prisma.mission.create({
        data: {
          reference: 'M-TEST-0005',
          agenceId: jeu.agenceA,
          clientId: jeu.clientA,
          lieuId: jeu.lieuA,
          qualificationRequiseId: autre.id,
          statut: 'PUBLIEE',
          dateDebut: debut,
          dateFin: debut,
          heureDebut: '08:00',
          heureFin: '12:00',
          motifRecours: 'Accroissement temporaire d activite',
          tauxHoraire: '13.5000',
          coefficient: '1.950',
        },
      });

      expect((await notifications.notifier(false)).missions).toBe(0);
    });

    it('n examine pas un candidat qui n est pas actif', async () => {
      await publierMission('M-TEST-0006');
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });

      expect((await notifications.notifier(false)).avertis).toBe(0);
    });

    it('n examine pas un candidat qui a coupé ses notifications', async () => {
      await publierMission('M-TEST-0007');
      await prisma.utilisateur.update({
        where: { id: jeu.compteCandidatA },
        data: { notificationsEmail: false },
      });

      const rapport = await notifications.notifier(false);

      expect(rapport.examines).toBe(0);
      expect(mail.dernierPour(ADRESSE_CANDIDAT)).toBeUndefined();
    });

    it('n envoie rien et n avance aucune date en simulation', async () => {
      await publierMission('M-TEST-0008');

      const simulation = await notifications.notifier(true);

      expect(simulation).toMatchObject({ missions: 1, simulation: true });
      expect(mail.dernierPour(ADRESSE_CANDIDAT)).toBeUndefined();

      // La date n'a pas bouge : le passage reel doit encore trouver la mission.
      expect((await notifications.notifier(false)).missions).toBe(1);
    });
  });

  describe('réglage du compte', () => {
    it('rend le réglage enregistré, et le change', async () => {
      const candidat = await connecter(app, 'candidat.a@test.example');

      const avant = await avec(app, candidat).get('/api/auth/notifications').expect(200);

      expect(avant.body).toEqual({ notificationsEmail: true });

      const apres = await avec(app, candidat)
        .put('/api/auth/notifications')
        .send({ notificationsEmail: false })
        .expect(200);

      expect(apres.body).toEqual({ notificationsEmail: false });
    });

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/auth/notifications').expect(401);
      await request(app.getHttpServer())
        .put('/api/auth/notifications')
        .send({ notificationsEmail: false })
        .expect(401);
    });

    it('refuse une valeur qui n est pas un booléen', async () => {
      const candidat = await connecter(app, 'candidat.a@test.example');

      await avec(app, candidat)
        .put('/api/auth/notifications')
        .send({ notificationsEmail: 'non' })
        .expect(400);
    });
  });
});
