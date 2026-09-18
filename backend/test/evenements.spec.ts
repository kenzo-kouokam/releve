import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ENTETE_SERVICE } from '@releve/shared';
import { avec, connecter, type Session } from './aide';
import { creerApp, creerCompteDeTest, prisma, reinitialiser, type Jeu } from './fixtures';
import { WebhooksService } from '../src/evenements/webhooks.service';
import { MailService } from '../src/mail/mail.service';

const JETON_SERVICE = 'jeton-de-service-de-test';

/**
 * Le journal des transitions, la proposition cote agence, et les routes que
 * les automatisations rappellent.
 *
 * Ces trois choses se testent ensemble parce qu'elles n'ont de sens qu'ensemble :
 * une relance se calcule sur le journal, le journal se remplit aux transitions,
 * et la transition qui manquait — l'agence qui propose — est precisement celle
 * qui declenche le premier workflow.
 */
describe('evenements et routes internes', () => {
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

  /** Requete machine : pas de session, un secret partage. */
  function interne(chemin: string, jeton: string = JETON_SERVICE) {
    const agent = request(app.getHttpServer());

    return {
      get: () => agent.get(chemin).set(ENTETE_SERVICE, jeton),
      post: () => agent.post(chemin).set(ENTETE_SERVICE, jeton),
    };
  }

  async function publier(surcharge: Record<string, unknown> = {}): Promise<string> {
    const reponse = await avec(app, client).post('/api/missions').send(besoin(surcharge));

    expect(reponse.status).toBe(201);

    return reponse.body.id;
  }

  function journal(missionId: string) {
    return prisma.evenementMission.findMany({
      where: { missionId },
      orderBy: { createdAt: 'asc' },
    });
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

    // Candidate et lieu au meme point : aucune assertion ne depend de la distance.
    await prisma.lieuIntervention.update({
      where: { id: jeu.lieuA },
      data: { latitude: 47.2184, longitude: -1.5536 },
    });

    await prisma.candidat.update({
      where: { id: jeu.candidatA },
      data: { latitude: 47.2184, longitude: -1.5536, rayonKm: 25, statut: 'ACTIF' },
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

    app.get(WebhooksService).viderEmis();
    app.get(MailService).viderBoite();
  });

  /** Dernier evenement d'un type donne, tel qu'il serait parti. */
  function emis(type: string) {
    return app
      .get(WebhooksService)
      .derniersEmis()
      .findLast((evenement) => evenement.event === type);
  }

  describe('journal des transitions', () => {
    it('consigne la publication d une mission', async () => {
      const id = await publier();

      expect(await journal(id)).toMatchObject([{ type: 'mission.publiee' }]);
    });

    it('consigne la candidature spontanee, puis la mission pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      expect((await journal(id)).map((e) => e.type)).toEqual([
        'mission.publiee',
        'proposition.acceptee',
        'mission.pourvue',
      ]);
    });

    it('consigne l annulation', async () => {
      const id = await publier();

      await avec(app, client).post(`/api/missions/${id}/annuler`).expect(201);

      expect((await journal(id)).map((e) => e.type)).toEqual(['mission.publiee', 'mission.annulee']);
    });

    it('note qui a agi, et sous quel role', async () => {
      const id = await publier();
      const [publication] = await journal(id);

      expect(publication).toMatchObject({ auteurRole: 'CLIENT' });
      expect(publication!.auteurId).toBeTruthy();
    });

    /**
     * La frontiere passe a l'interieur de l'evenement, et c'est elle qu'il faut
     * tenir : `propositions` alimente le message Slack de l'agence — Slack est
     * hors UE, rien de nominatif n'y va — la ou les listes de candidats servent
     * a leur ecrire et portent donc prenom et adresse.
     *
     * Le test lit ce qui *serait* parti, l'emetteur etant en sourdine.
     */
    it('garde pseudonyme la liste qui alimente Slack', async () => {
      const id = await publier();

      await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(201);

      const proposition = emis('proposition.envoyee')!;

      expect(proposition.propositions[0]!.candidatRef).toMatch(/^CAN-[0-9A-F]{6}$/);

      const corps = JSON.stringify(proposition.propositions);

      expect(corps).not.toContain('Alice');
      expect(corps).not.toContain('candidat.a@test.example');
      expect(corps).not.toContain(jeu.candidatA);
    });

    /**
     * Ce qui sort pour ecrire se limite au strict necessaire. Le nom de
     * famille, le telephone et l'adresse postale restent dans la plateforme :
     * aucun courriel n'en a besoin, et chacun elargirait ce qui sort sans
     * contrepartie.
     */
    it('ne fait sortir que le prenom et l adresse, jamais plus', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { telephone: '0600000042' },
      });

      await publier();

      const corps = JSON.stringify(emis('mission.publiee'));

      expect(corps).toContain('candidat.a@test.example');
      expect(corps).not.toContain('Aubry');
      expect(corps).not.toContain('0600000042');
      expect(corps).not.toContain(jeu.candidatA);
    });
  });

  describe('l agence propose des candidats', () => {
    it('cree des candidatures ENVOYEE et consigne un seul evenement', async () => {
      const id = await publier();

      const reponse = await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA], message: 'Profil qui correspond' })
        .expect(201);

      expect(reponse.body).toHaveLength(1);
      expect(reponse.body[0].statut).toBe('ENVOYEE');
      expect(reponse.body[0].repondueLe).toBeNull();
      expect(reponse.body[0].score).toBeGreaterThan(0);

      const types = (await journal(id)).map((e) => e.type);

      expect(types).toEqual(['mission.publiee', 'proposition.envoyee']);
    });

    it('un seul evenement quel que soit le nombre de candidats', async () => {
      const id = await publier();

      const deuxieme = await prisma.candidat.create({
        data: {
          agenceId: jeu.agenceA,
          nom: 'Second',
          prenom: 'Profil',
          email: 'second.a@test.example',
          telephone: '0600000009',
          adresse: '1 rue du Test',
          codePostal: '44000',
          ville: 'Nantes',
          statut: 'ACTIF',
          rayonKm: 25,
          latitude: 47.2184,
          longitude: -1.5536,
        },
      });

      await prisma.qualificationCandidat.create({
        data: {
          candidatId: deuxieme.id,
          qualificationId: jeu.qualification,
          obtenueLe: new Date('2018-06-30'),
          verifieeLe: new Date(),
          verifieePar: 'test',
        },
      });

      const reponse = await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA, deuxieme.id] })
        .expect(201);

      expect(reponse.body).toHaveLength(2);

      const evenements = (await journal(id)).filter((e) => e.type === 'proposition.envoyee');

      expect(evenements).toHaveLength(1);
      expect((evenements[0]!.donnees as { propositions: string[] }).propositions).toHaveLength(2);
    });

    it('ignore un candidat deja propose plutot que d echouer', async () => {
      const id = await publier();

      await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(201);

      const second = await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(201);

      expect(second.body).toEqual([]);

      // Rien de nouveau ne s'est produit : aucun second evenement.
      const envoyees = (await journal(id)).filter((e) => e.type === 'proposition.envoyee');

      expect(envoyees).toHaveLength(1);
    });

    it('refuse l envoi entier en nommant le candidat et le motif', async () => {
      const id = await publier();

      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { rayonKm: 1, latitude: 48.8566, longitude: 2.3522 },
      });

      const reponse = await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(400);

      expect(reponse.body.message).toContain('Aubry');
      expect(reponse.body.message).toMatch(/rayon/i);

      expect(await prisma.proposition.count({ where: { missionId: id } })).toBe(0);
    });

    it('n est pas ouverte a l etablissement', async () => {
      const id = await publier();

      await avec(app, client)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(403);
    });

    it('ne laisse pas puiser dans le vivier d une autre agence', async () => {
      const id = await publier();

      await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatB] })
        .expect(404);
    });

    it('refuse une mission deja pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      await avec(app, agence)
        .post(`/api/missions/${id}/propositions`)
        .send({ candidatIds: [jeu.candidatA] })
        .expect(403);
    });
  });

  describe('acces aux routes internes', () => {
    it('refuse sans jeton de service', async () => {
      await request(app.getHttpServer()).get('/api/interne/missions/non-pourvues').expect(401);
    });

    it('refuse un mauvais jeton', async () => {
      await interne('/api/interne/missions/non-pourvues', 'mauvais-jeton').get().expect(401);
    });

    it('n accepte pas un jeton utilisateur a la place', async () => {
      await avec(app, agence).get('/api/interne/missions/non-pourvues').expect(401);
    });
  });

  describe('missions non pourvues', () => {
    it('ne rend rien tant que le seuil n est pas atteint', async () => {
      await publier();

      const reponse = await interne('/api/interne/missions/non-pourvues?seuilMinutes=60')
        .get()
        .expect(200);

      expect(reponse.body).toEqual([]);
    });

    it('rend la mission une fois le seuil franchi, sans donnee personnelle', async () => {
      const id = await publier();

      // On vieillit la publication plutot que d'attendre : c'est la date du
      // dernier mouvement qui decide, et c'est elle qu'on veut eprouver.
      await prisma.evenementMission.updateMany({
        where: { missionId: id },
        data: { createdAt: new Date(Date.now() - 3 * 3600 * 1000) },
      });

      const reponse = await interne('/api/interne/missions/non-pourvues?seuilMinutes=60')
        .get()
        .expect(200);

      expect(reponse.body).toHaveLength(1);
      expect(reponse.body[0].mission.id).toBe(id);
      expect(reponse.body[0].relances).toBe(0);
      expect(reponse.body[0].ouverteDepuisMinutes).toBeGreaterThanOrEqual(180);
      expect(reponse.body[0].mission.commune).toBe('Nantes');
      expect(reponse.body[0].mission.departement).toBe('44');
      expect(JSON.stringify(reponse.body)).not.toContain('Aubry');
    });

    it('ecarte une mission pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      await prisma.evenementMission.updateMany({
        where: { missionId: id },
        data: { createdAt: new Date(Date.now() - 3 * 3600 * 1000) },
      });

      const reponse = await interne('/api/interne/missions/non-pourvues?seuilMinutes=60')
        .get()
        .expect(200);

      expect(reponse.body).toEqual([]);
    });
  });

  describe('relances et escalade', () => {
    async function missionMure(): Promise<string> {
      const id = await publier();

      await prisma.evenementMission.updateMany({
        where: { missionId: id },
        data: { createdAt: new Date(Date.now() - 3 * 3600 * 1000) },
      });

      return id;
    }

    it('enregistre une relance et incremente le compteur', async () => {
      const id = await missionMure();

      const premiere = await interne(`/api/interne/missions/${id}/relances`)
        .post()
        .send({ motif: 'Aucune candidature' })
        .expect(201);

      expect(premiere.body).toMatchObject({ missionId: id, type: 'mission.relancee', relances: 1 });

      const seconde = await interne(`/api/interne/missions/${id}/relances`)
        .post()
        .send({})
        .expect(201);

      expect(seconde.body.relances).toBe(2);
    });

    /**
     * Le point qui evite la boucle : relancer remet le compteur d'attente a
     * zero. Sans cela le workflow relirait la meme mission a chaque passage et
     * relancerait sans fin.
     */
    it('une relance sort la mission de la liste jusqu au prochain seuil', async () => {
      const id = await missionMure();

      await interne(`/api/interne/missions/${id}/relances`).post().send({}).expect(201);

      const reponse = await interne('/api/interne/missions/non-pourvues?seuilMinutes=60')
        .get()
        .expect(200);

      expect(reponse.body).toEqual([]);
    });

    it('enregistre une escalade', async () => {
      const id = await missionMure();

      const reponse = await interne(`/api/interne/missions/${id}/escalade`)
        .post()
        .send({ motif: 'Trois relances sans reponse' })
        .expect(201);

      expect(reponse.body.type).toBe('mission.escaladee');
      expect((await journal(id)).map((e) => e.type)).toContain('mission.escaladee');
    });

    it('refuse de relancer une mission pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      await interne(`/api/interne/missions/${id}/relances`).post().send({}).expect(403);
    });

    it('repond 404 sur une mission inconnue', async () => {
      await interne('/api/interne/missions/00000000-0000-4000-8000-000000000000/relances')
        .post()
        .send({})
        .expect(404);
    });
  });

  describe('urgence', () => {
    it('marque urgente une vacation qui commence dans moins de 48 h', async () => {
      await publier();

      expect(emis('mission.publiee')!.mission.urgente).toBe(true);
    });

    it('ne marque pas urgente une vacation lointaine', async () => {
      const dans10Jours = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      await publier({ dateDebut: dans10Jours, dateFin: dans10Jours });

      expect(emis('mission.publiee')!.mission.urgente).toBe(false);
    });
  });

  describe('candidats designes dans l evenement', () => {
    it('joint les candidats eligibles a la publication, avec de quoi leur ecrire', async () => {
      await publier();

      const evenement = emis('mission.publiee')!;

      expect(evenement.candidatsEligibles).toHaveLength(1);
      expect(evenement.candidatsEligibles[0]).toMatchObject({
        prenom: 'Alice',
        email: 'candidat.a@test.example',
        // Toujours vrai : l'API a deja ecarte ceux qui ont coupe leurs alertes.
        // Le champ reste rendu parce que le workflow filtre dessus.
        notificationsEmail: true,
      });
      expect(evenement.candidatsEligibles[0]!.candidatRef).toMatch(/^CAN-[0-9A-F]{6}$/);
    });

    it('ecarte qui a coupe ses notifications', async () => {
      await prisma.utilisateur.updateMany({
        where: { candidatId: jeu.candidatA },
        data: { notificationsEmail: false },
      });

      await publier();

      expect(emis('mission.publiee')!.candidatsEligibles).toEqual([]);
    });

    it('joint le candidat retenu et ceux a prevenir quand la mission est pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      const evenement = emis('mission.pourvue')!;

      expect(evenement.candidatRetenu).toMatchObject({
        prenom: 'Alice',
        email: 'candidat.a@test.example',
      });
      expect(evenement.candidatRetenu!.candidatRef).toMatch(/^CAN-[0-9A-F]{6}$/);
      // Seul candidat de l'agence : personne d'autre n'attendait.
      expect(evenement.candidatsAPrevenir).toEqual([]);
    });

    it('joint les candidatures qui tombent a l annulation', async () => {
      const id = await publier();

      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(201);
      await avec(app, client).post(`/api/missions/${id}/annuler`).expect(201);

      const aPrevenir = emis('mission.annulee')!.candidatsAPrevenir;

      expect(aPrevenir).toHaveLength(1);
      // Pas de preference ici : la cloture part quoi qu'il arrive.
      expect(aPrevenir[0]!.notificationsEmail).toBeUndefined();
      expect(aPrevenir[0]!.email).toBe('candidat.a@test.example');
    });
  });

  describe('envoi des courriels demande par l automatisation', () => {
    /** La reference telle que l'automatisation la recoit. */
    function reference(): string {
      return emis('mission.publiee')!.candidatsEligibles[0]!.candidatRef;
    }

    it('expedie l alerte urgente aux references designees', async () => {
      const id = await publier();
      const ref = reference();

      const reponse = await interne(`/api/interne/missions/${id}/alertes`)
        .post()
        .send({ type: 'urgente', candidatRefs: [ref] })
        .expect(201);

      expect(reponse.body).toMatchObject({ demandees: 1, envoyees: 1, ignorees: [] });

      const courriel = app.get(MailService).dernierPour('candidat.a@test.example');

      expect(courriel).toBeDefined();
      expect(courriel!.sujet).toContain('pourvoir rapidement');
      expect(courriel!.texte).toContain('48 heures');
    });

    it('ignore une reference inconnue plutot que d echouer', async () => {
      const id = await publier();

      const reponse = await interne(`/api/interne/missions/${id}/alertes`)
        .post()
        .send({ type: 'urgente', candidatRefs: [reference(), 'CAN-000000'] })
        .expect(201);

      expect(reponse.body.envoyees).toBe(1);
      expect(reponse.body.ignorees).toEqual(['CAN-000000']);
    });

    /**
     * La borne par type est une protection : un appelant machine qui connait
     * une reference ne doit pas pouvoir s'en servir pour ecrire a n'importe qui.
     */
    it('refuse de confirmer a quelqu un qui n est pas le candidat retenu', async () => {
      const id = await publier();

      const reponse = await interne(`/api/interne/missions/${id}/alertes`)
        .post()
        .send({ type: 'confirmation', candidatRefs: [reference()] })
        .expect(201);

      expect(reponse.body.envoyees).toBe(0);
      expect(reponse.body.ignorees).toHaveLength(1);
      expect(app.get(MailService).dernierPour('candidat.a@test.example')).toBeUndefined();
    });

    it('confirme au candidat retenu une fois la mission pourvue', async () => {
      const id = await publier();

      const candidature = await avec(app, candidat)
        .post(`/api/missions/${id}/candidatures`)
        .send({})
        .expect(201);

      await avec(app, client)
        .post(`/api/propositions/${candidature.body.id}/valider`)
        .expect(201);

      const evenement = emis('mission.pourvue')!;
      const ref = evenement.candidatRetenu!.candidatRef;

      await interne(`/api/interne/missions/${id}/alertes`)
        .post()
        .send({ type: 'confirmation', candidatRefs: [ref] })
        .expect(201);

      const courriel = app.get(MailService).dernierPour('candidat.a@test.example');

      expect(courriel!.sujet).toContain('confirmee');
      // La reference est citee : c'est elle que la personne rappellera a l'agence.
      expect(courriel!.texte).toContain(evenement.mission.reference);
    });

    it('annonce la cloture a qui a postule sans etre retenu', async () => {
      const id = await publier();

      await avec(app, candidat).post(`/api/missions/${id}/candidatures`).send({}).expect(201);
      await avec(app, client).post(`/api/missions/${id}/annuler`).expect(201);

      const ref = emis('mission.annulee')!.candidatsAPrevenir[0]!.candidatRef;

      await interne(`/api/interne/missions/${id}/alertes`)
        .post()
        .send({ type: 'cloture', candidatRefs: [ref] })
        .expect(201);

      const courriel = app.get(MailService).dernierPour('candidat.a@test.example');

      expect(courriel!.sujet).toContain('annulee');
    });

    it('exige le jeton de service', async () => {
      const id = await publier();

      await request(app.getHttpServer())
        .post(`/api/interne/missions/${id}/alertes`)
        .send({ type: 'urgente', candidatRefs: ['CAN-ABCDEF'] })
        .expect(401);
    });
  });

  describe('balayage des notifications', () => {
    it('se declenche depuis l exterieur, en simulation', async () => {
      await publier();

      const reponse = await interne('/api/interne/notifications/missions')
        .post()
        .send({ simulation: true })
        .expect(201);

      expect(reponse.body).toMatchObject({ simulation: true });
      expect(reponse.body.examines).toBeGreaterThanOrEqual(1);
    });

    it('exige le jeton de service', async () => {
      await request(app.getHttpServer())
        .post('/api/interne/notifications/missions')
        .send({})
        .expect(401);
    });
  });
});
