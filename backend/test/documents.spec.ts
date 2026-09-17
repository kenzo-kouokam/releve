import type { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TAILLE_MAX_DOCUMENT, TYPES_DOCUMENT } from '@releve/shared';
import { avec, connecter, type Session } from './aide';
import { creerApp, creerCompteDeTest, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * Les pieces justificatives d'un dossier candidat.
 *
 * Ce que ces tests protegent n'est pas le televersement — il marche ou il ne
 * marche pas — mais les trois regles qui, si elles cedaient, exposeraient une
 * piece d'identite : seul l'interesse depose et retire, l'agence lit sans
 * modifier, et personne ne voit le dossier d'une autre agence.
 */
describe('pieces justificatives', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let candidat: Session;
  let agence: Session;
  let agenceAutre: Session;

  /** Un PDF minimal mais valide : l'API n'inspecte que le type annonce. */
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

  function deposer(session: Session, type: string, contenu = PDF, nom = 'cv.pdf') {
    return avec(app, session)
      .post(`/api/mon-profil/documents/${type}`)
      .attach('fichier', contenu, { filename: nom, contentType: 'application/pdf' });
  }

  beforeAll(async () => {
    app = await creerApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    // Le stockage de test est jetable : le laisser derriere soi ferait grossir
    // le depot d'un fichier a chaque execution.
    await rm(process.env.STOCKAGE_DOCUMENTS!, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jeu = await reinitialiser();
    candidat = await connecter(app, 'candidat.a@test.example');
    agence = await connecter(app, 'charge.a@test.example');
    agenceAutre = await connecter(app, 'admin.b@test.example');
  });

  describe('dossier', () => {
    it('annonce une ligne par piece attendue, meme vide', async () => {
      const reponse = await avec(app, candidat).get('/api/mon-profil/documents').expect(200);

      expect(reponse.body).toHaveLength(TYPES_DOCUMENT.length);
      expect(reponse.body.every((ligne: { document: unknown }) => ligne.document === null)).toBe(
        true,
      );
      expect(reponse.body[0]).toHaveProperty('motif');
    });

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/mon-profil/documents').expect(401);
    });
  });

  describe('depot', () => {
    it('enregistre une piece et la rend visible dans le dossier', async () => {
      const depot = await deposer(candidat, 'CV').expect(201);

      expect(depot.body.type).toBe('CV');
      expect(depot.body.nomOrigine).toBe('cv.pdf');
      expect(depot.body.verifieLe).toBeNull();

      const dossier = await avec(app, candidat).get('/api/mon-profil/documents').expect(200);
      const ligne = dossier.body.find((element: { type: string }) => element.type === 'CV');

      expect(ligne.document.id).toBe(depot.body.id);
    });

    it('remplace la piece du meme type au lieu d en accumuler', async () => {
      await deposer(candidat, 'RIB', PDF, 'ancien.pdf').expect(201);
      await deposer(candidat, 'RIB', PDF, 'nouveau.pdf').expect(201);

      const lignes = await prisma.documentCandidat.findMany({
        where: { candidatId: jeu.candidatA, type: 'RIB' },
      });

      expect(lignes).toHaveLength(1);
      expect(lignes[0]!.nomOrigine).toBe('nouveau.pdf');
    });

    it('annule la verification quand la piece est remplacee', async () => {
      await deposer(candidat, 'DIPLOME').expect(201);

      await prisma.documentCandidat.updateMany({
        where: { candidatId: jeu.candidatA, type: 'DIPLOME' },
        data: { verifieLe: new Date() },
      });

      const remplacement = await deposer(candidat, 'DIPLOME').expect(201);

      expect(remplacement.body.verifieLe).toBeNull();
    });

    it('refuse un format hors liste blanche', async () => {
      await avec(app, candidat)
        .post('/api/mon-profil/documents/CV')
        .attach('fichier', Buffer.from('MZ'), {
          filename: 'programme.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(400);
    });

    it('refuse un fichier vide', async () => {
      await deposer(candidat, 'CV', Buffer.alloc(0)).expect(400);
    });

    it('refuse un type de piece inconnu', async () => {
      await deposer(candidat, 'PASSEPORT').expect(400);
    });

    it('refuse un fichier au-dela du plafond', async () => {
      // Multer coupe a la limite declaree : la requete n'aboutit pas, ce qui est
      // le comportement voulu — le contenu ne traverse meme pas le reseau en
      // entier.
      await deposer(candidat, 'CV', Buffer.alloc(TAILLE_MAX_DOCUMENT + 1024, 0x41)).expect(
        (res) => {
          expect(res.status).toBeGreaterThanOrEqual(400);
        },
      );
    });

    it('refuse le personnel de l agence, qui ne depose pas a la place des gens', async () => {
      await avec(app, agence)
        .post('/api/mon-profil/documents/CV')
        .attach('fichier', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' })
        .expect(403);
    });
  });

  describe('telechargement', () => {
    it('sert son propre document au candidat', async () => {
      const depot = await deposer(candidat, 'CV').expect(201);

      const reponse = await avec(app, candidat)
        .get(`/api/mon-profil/documents/${depot.body.id}/contenu`)
        .expect(200);

      expect(reponse.headers['content-disposition']).toContain('attachment');
      expect(Buffer.from(reponse.body).equals(PDF)).toBe(true);
    });

    it('laisse l agence lire la piece de son candidat, pour la verifier', async () => {
      const depot = await deposer(candidat, 'NIR').expect(201);

      await avec(app, agence)
        .get(`/api/candidats/${jeu.candidatA}/documents/${depot.body.id}/contenu`)
        .expect(200);
    });

    it('refuse a une autre agence le dossier d un candidat qui n est pas le sien', async () => {
      await deposer(candidat, 'NIR').expect(201);

      await avec(app, agenceAutre).get(`/api/candidats/${jeu.candidatA}/documents`).expect(404);
    });

    it('refuse un document qui appartient a quelqu un d autre', async () => {
      const depot = await deposer(candidat, 'CV').expect(201);

      // Le jeu commun n'a qu'un compte candidat : le second est cree ici, avec
      // le meme mot de passe et une adresse deja confirmee.
      await creerCompteDeTest('candidat.b@test.example', 'CANDIDAT', {
        candidatId: jeu.candidatB,
      });

      const autre = await connecter(app, 'candidat.b@test.example');

      await avec(app, autre).get(`/api/mon-profil/documents/${depot.body.id}/contenu`).expect(404);
    });
  });

  describe('retrait', () => {
    it('retire la piece et la fait disparaitre du dossier', async () => {
      const depot = await deposer(candidat, 'CV').expect(201);

      const apres = await avec(app, candidat)
        .delete(`/api/mon-profil/documents/${depot.body.id}`)
        .expect(200);

      const ligne = apres.body.find((element: { type: string }) => element.type === 'CV');

      expect(ligne.document).toBeNull();
      expect(await prisma.documentCandidat.count({ where: { id: depot.body.id } })).toBe(0);
    });

    it('refuse a l agence de retirer une piece a la place de la personne', async () => {
      const depot = await deposer(candidat, 'CV').expect(201);

      await avec(app, agence).delete(`/api/mon-profil/documents/${depot.body.id}`).expect(403);
    });
  });

  describe('completude', () => {
    it('compte les pieces manquantes tant que le dossier est incomplet', async () => {
      const avant = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      expect(avant.body.manques.some((m: { cle: string }) => m.cle === 'documents')).toBe(true);
    });

    it('ne reclame plus les pieces quand elles sont toutes deposees', async () => {
      for (const type of TYPES_DOCUMENT) {
        await deposer(candidat, type).expect(201);
      }

      const apres = await avec(app, candidat).get('/api/mon-profil/completude').expect(200);

      expect(apres.body.manques.some((m: { cle: string }) => m.cle === 'documents')).toBe(false);
    });
  });
});
