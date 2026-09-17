import type { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DELAI_REPONSE_JOURS, DUREE_CONSERVATION_MOIS, type TypeDocument } from '@releve/shared';
import { avec, connecter, jetonDuCourriel, type Session } from './aide';
import { creerApp, prisma, reinitialiser } from './fixtures';
import { ConservationService } from '../src/documents/conservation.service';
import { MailService } from '../src/mail/mail.service';

const JOUR = 24 * 60 * 60 * 1000;

/**
 * La duree de vie d'une piece justificative.
 *
 * Ce que ces tests protegent tient en une phrase : une piece deposee ne reste
 * pas indefiniment, et le silence de la personne ne vaut pas accord pour la
 * garder. Les deux erreurs a exclure sont opposees et aussi graves l'une que
 * l'autre — effacer sans prevenir, et conserver sans jamais redemander.
 */
describe('conservation des pieces justificatives', () => {
  let app: INestApplication;
  let candidat: Session;
  let conservation: ConservationService;

  const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
  const ADRESSE = 'candidat.a@test.example';

  function deposer(type: TypeDocument) {
    return avec(app, candidat)
      .post(`/api/mon-profil/documents/${type}`)
      .attach('fichier', PDF, { filename: 'piece.pdf', contentType: 'application/pdf' });
  }

  /** Rembobine l'horloge d'une piece, faute de pouvoir attendre un an. */
  function vieillir(type: TypeDocument, jours: number) {
    return prisma.documentCandidat.updateMany({
      where: { type },
      data: { conservationJusquAu: new Date(Date.now() - jours * JOUR) },
    });
  }

  beforeAll(async () => {
    app = await creerApp();
    conservation = app.get(ConservationService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(process.env.STOCKAGE_DOCUMENTS!, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await reinitialiser();
    candidat = await connecter(app, ADRESSE);
  });

  describe('echeance', () => {
    it('pose un terme a un an au depot', async () => {
      const depot = await deposer('CV').expect(201);
      const terme = new Date(depot.body.conservationJusquAu);
      const attendu = new Date();
      attendu.setMonth(attendu.getMonth() + DUREE_CONSERVATION_MOIS);

      // A la seconde pres : le depot et le calcul du test ne tombent pas au
      // meme instant, mais ils tombent le meme jour.
      expect(Math.abs(terme.getTime() - attendu.getTime())).toBeLessThan(60_000);
    });

    it('fait repartir le terme quand la piece est remplacee', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 10);

      const remplacement = await deposer('CV').expect(201);

      expect(new Date(remplacement.body.conservationJusquAu).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('relance', () => {
    it('ne releve rien tant que le terme n est pas atteint', async () => {
      await deposer('CV').expect(201);

      const rapport = await conservation.relancer(false);

      expect(rapport.pieces).toBe(0);
    });

    it('ecrit une seule fois pour tout le dossier, quel que soit le nombre de pieces', async () => {
      await deposer('CV').expect(201);
      await deposer('RIB').expect(201);
      await vieillir('CV', 1);
      await vieillir('RIB', 1);

      const rapport = await conservation.relancer(false);

      expect(rapport).toMatchObject({ dossiers: 1, pieces: 2 });

      const courriel = app.get(MailService).dernierPour(ADRESSE);

      expect(courriel?.texte).toContain('CV');
      expect(courriel?.texte).toContain('RIB');
    });

    it('ne relance pas deux fois la meme piece', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);

      await conservation.relancer(false);
      const seconde = await conservation.relancer(false);

      expect(seconde.pieces).toBe(0);
    });

    it('n ecrit rien et ne marque rien en simulation', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);

      const simulation = await conservation.relancer(true);

      expect(simulation).toMatchObject({ pieces: 1, simulation: true });
      expect(
        await prisma.documentCandidat.count({ where: { relanceEnvoyeeLe: { not: null } } }),
      ).toBe(0);
    });
  });

  describe('reponse au lien recu', () => {
    async function relancer(): Promise<string> {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);
      await conservation.relancer(false);

      return jetonDuCourriel(app, ADRESSE, 'conservation');
    }

    it('montre les pieces concernees sans consommer le lien', async () => {
      const jeton = await relancer();

      const premiere = await request(app.getHttpServer())
        .get('/api/conservation')
        .query({ jeton })
        .expect(200);

      expect(premiere.body.pieces).toEqual(['CV']);

      // Un client de messagerie qui precharge les liens ne doit pas bruler la
      // decision de quelqu'un qui n'a encore rien lu.
      await request(app.getHttpServer()).get('/api/conservation').query({ jeton }).expect(200);
    });

    it('prolonge d un an et remet le dossier au calme', async () => {
      const jeton = await relancer();

      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton, decision: 'CONSERVER' })
        .expect(204);

      const piece = await prisma.documentCandidat.findFirstOrThrow({ where: { type: 'CV' } });

      expect(piece.relanceEnvoyeeLe).toBeNull();
      expect(piece.conservationJusquAu.getTime()).toBeGreaterThan(Date.now());
    });

    it('efface sur demande', async () => {
      const jeton = await relancer();

      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton, decision: 'EFFACER' })
        .expect(204);

      expect(await prisma.documentCandidat.count({ where: { type: 'CV' } })).toBe(0);
    });

    it('ne sert qu une fois', async () => {
      const jeton = await relancer();

      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton, decision: 'CONSERVER' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton, decision: 'CONSERVER' })
        .expect(404);
    });

    it('refuse un jeton inconnu sans rien dire de plus', async () => {
      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton: 'inexistant', decision: 'EFFACER' })
        .expect(404);
    });

    /**
     * Une valeur approchante ne doit pas ouvrir : le jeton est compare par son
     * empreinte, pas par ressemblance.
     */
    it('refuse un jeton altere', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);
      await conservation.relancer(false);

      await request(app.getHttpServer())
        .post('/api/conservation')
        .send({ jeton: jetonDuCourriel(app, ADRESSE, 'conservation') + 'x', decision: 'EFFACER' })
        .expect(404);
    });
  });

  describe('silence', () => {
    it('garde la piece tant que le delai de reponse court', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);
      await conservation.relancer(false);

      const rapport = await conservation.purgerSansReponse(false);

      expect(rapport.pieces).toBe(0);
      expect(await prisma.documentCandidat.count({ where: { type: 'CV' } })).toBe(1);
    });

    it('efface une fois le delai passe', async () => {
      await deposer('CV').expect(201);
      await vieillir('CV', 1);
      await conservation.relancer(false);

      await prisma.documentCandidat.updateMany({
        where: { type: 'CV' },
        data: { relanceEnvoyeeLe: new Date(Date.now() - (DELAI_REPONSE_JOURS + 1) * JOUR) },
      });

      const rapport = await conservation.purgerSansReponse(false);

      expect(rapport.pieces).toBe(1);
      expect(await prisma.documentCandidat.count({ where: { type: 'CV' } })).toBe(0);
    });

    it('ne touche jamais a une piece qui n a pas ete relancee', async () => {
      await deposer('CV').expect(201);

      await conservation.purgerSansReponse(false);

      expect(await prisma.documentCandidat.count({ where: { type: 'CV' } })).toBe(1);
    });
  });
});
