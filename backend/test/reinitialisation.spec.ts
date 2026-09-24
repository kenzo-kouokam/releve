import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connecter, jetonDuCourriel } from './aide';
import { creerApp, MOT_DE_PASSE, prisma, reinitialiser } from './fixtures';
import { MailService } from '../src/mail/mail.service';

const ADRESSE = 'charge.a@test.example';
const NOUVEAU = 'MotDePasseRetrouve2026';

/**
 * Mot de passe oublie.
 *
 * Deux garanties a tenir en meme temps, et elles tirent en sens contraire. Il
 * faut qu'on puisse reprendre la main sur son compte sans appeler personne ; et
 * il faut que ce formulaire, ouvert a tous les vents, n'apprenne a personne qui
 * est inscrit — sur une plateforme d'aide a domicile, l'etre revele qu'on
 * cherche des missions.
 */
describe('reinitialisation du mot de passe', () => {
  let app: INestApplication;
  let mail: MailService;

  beforeAll(async () => {
    app = await creerApp();
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await reinitialiser();
    mail.viderBoite();
  });

  async function demander(email = ADRESSE): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/auth/mot-de-passe/oublie')
      .send({ email })
      .expect(204);
  }

  function poser(jeton: string, nouveau = NOUVEAU) {
    return request(app.getHttpServer())
      .post('/api/auth/mot-de-passe/reinitialiser')
      .send({ jeton, nouveau });
  }

  describe('la demande', () => {
    it('envoie un lien exploitable', async () => {
      await demander();

      const courriel = mail.dernierPour(ADRESSE);

      expect(courriel).toBeDefined();
      expect(courriel!.sujet).toMatch(/reinitialiser/i);

      const jeton = jetonDuCourriel(app, ADRESSE, 'reinitialisation');
      expect(courriel!.html).toContain(jeton);
    });

    /** Le lien ouvre un compte existant : il vit une heure, pas deux jours. */
    it('emet un lien de courte duree', async () => {
      await demander();

      const jeton = await prisma.jetonUsageUnique.findFirstOrThrow({
        where: { usage: 'REINITIALISATION_MOT_DE_PASSE' },
      });

      const heures = (jeton.expireLe.getTime() - jeton.createdAt.getTime()) / 3_600_000;

      expect(heures).toBeLessThanOrEqual(1);
    });

    it('ne stocke jamais le jeton en clair', async () => {
      await demander();

      const jeton = jetonDuCourriel(app, ADRESSE, 'reinitialisation');
      const ligne = await prisma.jetonUsageUnique.findFirstOrThrow();

      expect(ligne.empreinte).not.toBe(jeton);
      expect(ligne.empreinte).toHaveLength(64);
    });

    /**
     * Le point sensible de tout le parcours. Repondre differemment selon que
     * l'adresse existe ferait de ce formulaire public un annuaire des inscrits.
     */
    it('repond pareil pour une adresse inconnue, et n envoie rien', async () => {
      await demander('personne@nulle-part.example');

      expect(mail.dernierPour('personne@nulle-part.example')).toBeUndefined();
    });

    it('n envoie rien a un compte desactive', async () => {
      await prisma.utilisateur.updateMany({
        where: { email: ADRESSE },
        data: { actif: false },
      });

      await demander();

      expect(mail.dernierPour(ADRESSE)).toBeUndefined();
    });

    it('invalide le lien precedent quand on en redemande un', async () => {
      await demander();
      const premier = jetonDuCourriel(app, ADRESSE, 'reinitialisation');

      await demander();
      const second = jetonDuCourriel(app, ADRESSE, 'reinitialisation');

      expect(second).not.toBe(premier);

      await poser(premier).expect(400);
      await poser(second).expect(204);
    });
  });

  describe('la pose du nouveau mot de passe', () => {
    it('remplace l ancien', async () => {
      await demander();

      await poser(jetonDuCourriel(app, ADRESSE, 'reinitialisation')).expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: ADRESSE, motDePasse: MOT_DE_PASSE })
        .expect(401);

      await connecter(app, ADRESSE, NOUVEAU);
    });

    /** Un lien qui resterait utilisable serait une porte ouverte dans une boite mail. */
    it('ne fonctionne qu une seule fois', async () => {
      await demander();

      const jeton = jetonDuCourriel(app, ADRESSE, 'reinitialisation');

      await poser(jeton).expect(204);
      await poser(jeton, 'EncoreUnAutre2026').expect(400);
    });

    it('refuse un lien perime', async () => {
      await demander();

      const jeton = jetonDuCourriel(app, ADRESSE, 'reinitialisation');

      await prisma.jetonUsageUnique.updateMany({
        data: { expireLe: new Date(Date.now() - 1000) },
      });

      await poser(jeton).expect(400);
    });

    it('refuse un jeton invente', async () => {
      await poser('jeton-qui-n-a-jamais-existe').expect(400);
    });

    it('refuse un mot de passe trop court', async () => {
      await demander();

      const reponse = await poser(
        jetonDuCourriel(app, ADRESSE, 'reinitialisation'),
        'court',
      ).expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('nouveau');
    });

    /**
     * Le cas qui compte vraiment : la reinitialisation sert aussi apres un vol.
     * Laisser vivre les sessions ouvertes laisserait le voleur connecte apres
     * la reprise de main, et la mesure ne servirait a rien.
     */
    it('ferme toutes les sessions en cours', async () => {
      const session = await connecter(app, ADRESSE);

      await request(app.getHttpServer())
        .post('/api/auth/rafraichir')
        .send({ jetonRafraichissement: session.rafraichissement })
        .expect(200);

      await demander();
      await poser(jetonDuCourriel(app, ADRESSE, 'reinitialisation')).expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/rafraichir')
        .send({ jetonRafraichissement: session.rafraichissement })
        .expect(401);
    });

    it('avertit par courriel que le mot de passe a change', async () => {
      await demander();

      // Le jeton est relu avant de vider la boite : sinon le lien disparait
      // avec elle, et c'est le test qui echoue, pas le code.
      const jeton = jetonDuCourriel(app, ADRESSE, 'reinitialisation');
      mail.viderBoite();

      await poser(jeton).expect(204);

      const avis = mail.dernierPour(ADRESSE);

      expect(avis).toBeDefined();
      expect(avis!.sujet).toMatch(/modifie/i);
      expect(avis!.texte).not.toContain(NOUVEAU);
    });

    it('n ouvre aucune session au passage', async () => {
      await demander();

      const reponse = await poser(jetonDuCourriel(app, ADRESSE, 'reinitialisation')).expect(204);

      expect(reponse.body).toEqual({});
      expect(reponse.headers['set-cookie']).toBeUndefined();
    });
  });

  /**
   * Un lien ne doit valoir que pour ce qu'il a ete emis. Sans cette separation,
   * un lien de confirmation intercepte permettrait de changer un mot de passe,
   * et inversement.
   */
  describe('cloisonnement des deux usages', () => {
    it('refuse un jeton de confirmation sur la reinitialisation', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send({
          interimaire: {
            nom: 'Moreau',
            prenom: 'Julie',
            telephone: '0612349999',
            adresse: '4 rue des Lilas',
            codePostal: '44200',
            ville: 'Nantes',
            rayonKm: 25,
            permisB: false,
            vehicule: false,
          },
          compte: { email: 'croisee@test.example', motDePasse: 'MotDePasseCroise2026' },
          conditionsAcceptees: true,
        })
        .expect(201);

      const confirmation = jetonDuCourriel(app, 'croisee@test.example', 'verification');

      await poser(confirmation).expect(400);
    });

    it('refuse un jeton de reinitialisation sur la confirmation', async () => {
      await demander();

      const reinit = jetonDuCourriel(app, ADRESSE, 'reinitialisation');

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: reinit })
        .expect(400);
    });

    /**
     * Les deux parcours peuvent courir en parallele sans se marcher dessus :
     * demander un mot de passe ne doit pas annuler une confirmation en attente,
     * qui repond a une autre question.
     */
    it('n annule pas une confirmation en attente', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send({
          interimaire: {
            nom: 'Dubois',
            prenom: 'Karim',
            telephone: '0612340000',
            adresse: '9 rue des Ormes',
            codePostal: '44300',
            ville: 'Nantes',
            rayonKm: 15,
            permisB: false,
            vehicule: false,
          },
          compte: { email: 'parallele@test.example', motDePasse: 'MotDePasseParallele2026' },
          conditionsAcceptees: true,
        })
        .expect(201);

      const confirmation = jetonDuCourriel(app, 'parallele@test.example', 'verification');

      await demander('parallele@test.example');

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: confirmation })
        .expect(200);
    });
  });

  /**
   * Le clic prouve la possession de l'adresse : exactement ce que la
   * confirmation etablit. Sans cela, quelqu'un qui a oublie son mot de passe
   * *et* neglige de confirmer resterait enferme dehors — son lien de
   * confirmation n'ouvrant qu'une session, dont on ne peut rien faire sans
   * l'ancien mot de passe.
   */
  it('confirme l adresse au passage quand elle ne l etait pas', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/inscription/interimaire')
      .send({
        interimaire: {
          nom: 'Bernard',
          prenom: 'Lea',
          telephone: '0612341111',
          adresse: '3 rue des Chenes',
          codePostal: '44100',
          ville: 'Nantes',
          rayonKm: 10,
          permisB: false,
          vehicule: false,
        },
        compte: { email: 'jamais.confirmee@test.example', motDePasse: 'MotDePasseJamais2026' },
        conditionsAcceptees: true,
      })
      .expect(201);

    await demander('jamais.confirmee@test.example');
    await poser(jetonDuCourriel(app, 'jamais.confirmee@test.example', 'reinitialisation')).expect(
      204,
    );

    await connecter(app, 'jamais.confirmee@test.example', NOUVEAU);
  });
});
