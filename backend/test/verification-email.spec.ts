import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, confirmerAdresse, jetonDuCourriel } from './aide';
import { creerApp, prisma, reinitialiser } from './fixtures';
import { MailService } from '../src/mail/mail.service';

const MOT_DE_PASSE = 'MotDePasseInscrit2026';
const ADRESSE = 'nouvelle.inscrite@test.example';

function inscription(email = ADRESSE) {
  return {
    interimaire: {
      nom: 'Moreau',
      prenom: 'Julie',
      telephone: '0612349999',
      adresse: '4 rue des Lilas',
      codePostal: '44200',
      ville: 'Nantes',
      rayonKm: 25,
      permisB: true,
      vehicule: false,
    },
    compte: { email, motDePasse: MOT_DE_PASSE },
    conditionsAcceptees: true,
  };
}

/**
 * Confirmation de l'adresse e-mail.
 *
 * Ce que cette suite protege tient en une phrase : le lien recu par courriel
 * est la seule chose qui transforme une inscription en acces. Tout le reste en
 * decoule — il ne sert qu'une fois, il perime, il ne dit rien a qui ne le
 * possede pas, et le formulaire de renvoi ne doit pas devenir un moyen de
 * savoir qui est inscrit.
 */
describe('verification de l adresse e-mail', () => {
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

  async function sInscrire(email = ADRESSE): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/auth/inscription/interimaire')
      .send(inscription(email))
      .expect(201);
  }

  describe('le courriel', () => {
    it('part a l adresse declaree, avec un lien exploitable', async () => {
      await sInscrire();

      const courriel = mail.dernierPour(ADRESSE);

      expect(courriel).toBeDefined();
      expect(courriel!.sujet).toMatch(/confirmez/i);

      // Le lien figure dans les deux versions : une messagerie qui bloque le
      // HTML laisserait sinon la personne sans aucun moyen d'entrer.
      const jeton = jetonDuCourriel(app, ADRESSE);
      expect(courriel!.html).toContain(jeton);
      expect(jeton.length).toBeGreaterThan(20);
    });

    it('ne stocke jamais le jeton en clair', async () => {
      await sInscrire();

      const jeton = jetonDuCourriel(app, ADRESSE);
      const lignes = await prisma.jetonUsageUnique.findMany();

      expect(lignes).toHaveLength(1);
      expect(lignes[0]!.empreinte).not.toBe(jeton);
      expect(lignes[0]!.empreinte).toHaveLength(64);
    });
  });

  describe('la confirmation', () => {
    it('ouvre une session et marque l adresse confirmee', async () => {
      await sInscrire();

      const session = await confirmerAdresse(app, ADRESSE);

      expect(session.jeton).toBeTruthy();

      const compte = await prisma.utilisateur.findUniqueOrThrow({ where: { email: ADRESSE } });
      expect(compte.emailVerifieLe).not.toBeNull();
    });

    /** Un lien qui resterait utilisable serait un mot de passe permanent dans une boite mail. */
    it('ne fonctionne qu une seule fois', async () => {
      await sInscrire();

      const jeton = jetonDuCourriel(app, ADRESSE);

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton })
        .expect(400);
    });

    it('refuse un lien perime', async () => {
      await sInscrire();

      const jeton = jetonDuCourriel(app, ADRESSE);

      await prisma.jetonUsageUnique.updateMany({
        data: { expireLe: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton })
        .expect(400);
    });

    it('refuse un jeton invente', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: 'jeton-qui-n-a-jamais-existe' })
        .expect(400);
    });

    /**
     * Les trois refus doivent etre indiscernables : distinguer « inconnu » de
     * « deja consomme » apprendrait a qui tatonne qu'une valeur a existe.
     */
    it('donne le meme message quel que soit le motif du refus', async () => {
      await sInscrire();

      const jeton = jetonDuCourriel(app, ADRESSE);
      await confirmerAdresse(app, ADRESSE);

      const consomme = await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton })
        .expect(400);

      const inconnu = await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: 'autre-chose-entierement' })
        .expect(400);

      expect(consomme.body.message).toBe(inconnu.body.message);
    });
  });

  describe('la connexion', () => {
    it('est refusee tant que l adresse n est pas confirmee', async () => {
      await sInscrire();

      const reponse = await request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: ADRESSE, motDePasse: MOT_DE_PASSE })
        .expect(403);

      expect(reponse.body.code).toBe('EMAIL_NON_VERIFIE');
    });

    /**
     * Le point sensible. Le refus « adresse non confirmee » ne doit sortir
     * qu'apres un mot de passe valide : sinon il annonce l'existence du compte
     * a n'importe qui, et le soin pris ailleurs a rendre les echecs
     * indiscernables ne sert plus a rien.
     */
    it('ne trahit pas l existence du compte quand le mot de passe est faux', async () => {
      await sInscrire();

      const reponse = await request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: ADRESSE, motDePasse: 'MauvaisMotDePasse2026' })
        .expect(401);

      expect(reponse.body.code).toBeUndefined();
      expect(reponse.body.message).toBe('Identifiants invalides');
    });

    it('passe une fois l adresse confirmee', async () => {
      await sInscrire();
      await confirmerAdresse(app, ADRESSE);

      await request(app.getHttpServer())
        .post('/api/auth/connexion')
        .send({ email: ADRESSE, motDePasse: MOT_DE_PASSE })
        .expect(200);
    });
  });

  describe('le renvoi du lien', () => {
    it('emet un nouveau lien et invalide le precedent', async () => {
      await sInscrire();

      const premier = jetonDuCourriel(app, ADRESSE);

      await request(app.getHttpServer())
        .post('/api/auth/verification/renvoyer')
        .send({ email: ADRESSE })
        .expect(204);

      const second = jetonDuCourriel(app, ADRESSE);
      expect(second).not.toBe(premier);

      // Un lien intercepte ne doit pas survivre a la demande d'un nouveau.
      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: premier })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/auth/verification/confirmer')
        .send({ jeton: second })
        .expect(200);
    });

    /** Ce formulaire est public : une reponse qui varierait en ferait un testeur d'adresses. */
    it('repond pareil pour une adresse inconnue, et n envoie rien', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/verification/renvoyer')
        .send({ email: 'personne@nulle-part.example' })
        .expect(204);

      expect(mail.dernierPour('personne@nulle-part.example')).toBeUndefined();
    });

    it('repond pareil pour une adresse deja confirmee, et n envoie rien', async () => {
      await sInscrire();
      await confirmerAdresse(app, ADRESSE);
      mail.viderBoite();

      await request(app.getHttpServer())
        .post('/api/auth/verification/renvoyer')
        .send({ email: ADRESSE })
        .expect(204);

      expect(mail.dernierPour(ADRESSE)).toBeUndefined();
    });
  });

  /**
   * Confirmer son adresse ne rend operationnel de rien : c'est le second
   * verrou, celui de l'agence, qui decide. Les deux ne doivent pas se
   * confondre.
   */
  describe('ce que la confirmation n accorde pas', () => {
    it('laisse la fiche en verification et le vivier ferme', async () => {
      await sInscrire();

      const session = await confirmerAdresse(app, ADRESSE);

      const candidat = await prisma.candidat.findUniqueOrThrow({ where: { email: ADRESSE } });
      expect(candidat.statut).toBe('EN_VERIFICATION');

      await avec(app, session).get('/api/candidats').expect(403);
      await avec(app, session).get('/api/utilisateurs').expect(403);
    });
  });
});
