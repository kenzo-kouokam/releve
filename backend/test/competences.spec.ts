import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { avec, connecter, type Session } from './aide';
import { creerApp, creerCompteDeTest, prisma, reinitialiser, type Jeu } from './fixtures';
import { CompetencesService } from '../src/competences/competences.service';

/**
 * Le referentiel de competences, de la collecte au classement.
 *
 * Il tient sur une idee simple : ce qu'un EHPAD attend d'un aide-soignant
 * s'apprend en lisant ce que les EHPAD ecrivent dans leurs annonces. Les
 * lignes sont donc agregees depuis les offres France Travail deja collectees,
 * jamais saisies — et c'est ce que verifie la premiere partie de cette suite.
 *
 * Les suivantes verifient les quatre usages : rediger une mission, declarer un
 * profil, departager au classement, chercher par mots-cles.
 */
describe('referentiel de competences', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let agence: Session;
  let candidat: Session;

  const DEMAIN = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  /**
   * Une offre France Travail telle que la collecte l'enregistre.
   *
   * Le champ `competences` est vide par defaut, comme il l'est presque toujours
   * dans la realite : sur l'echantillon de reference, deux offres sur cent deux
   * le renseignent. C'est cette absence qui justifie le lexique.
   */
  let compteur = 0;

  async function offre(surcharge: Record<string, unknown> = {}): Promise<void> {
    compteur += 1;

    await prisma.offreCollectee.create({
      data: {
        id: `OFFRE-TEST-${compteur}`,
        romeCode: 'J1501',
        intitule: 'Aide soignant (F/H)',
        intituleNormalise: 'aide soignant',
        description: null,
        publieeLe: new Date(),
        empreinte: `empreinte-${compteur}`,
        ...surcharge,
      },
    });
  }

  /** Reconstruit le referentiel comme le fait `pnpm cli competences`. */
  async function reconstruire() {
    return app.get(CompetencesService).reconstruire();
  }

  async function idDe(libelle: string): Promise<string> {
    const ligne = await prisma.competence.findFirstOrThrow({ where: { libelle } });

    return ligne.id;
  }

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
    await prisma.offreCollectee.deleteMany({});
    compteur = 0;

    agence = await connecter(app, 'admin.a@test.example');
    candidat = await connecter(app, 'candidat.a@test.example');
  });

  // ------------------------------------------------------------ agregation

  describe('agregation depuis les offres', () => {
    it('tire une competence du texte d une annonce', async () => {
      await offre({ description: 'Vous assurez les soins d hygiene et de confort des residents.' });

      const rapport = await reconstruire();

      expect(rapport.offresLues).toBe(1);
      expect(rapport.nouvelles).toBeGreaterThan(0);

      const ligne = await prisma.competence.findFirst({
        where: { libelle: "Soins d'hygiène et de confort" },
        include: { metiers: true },
      });

      expect(ligne).not.toBeNull();
      expect(ligne!.metiers[0]!.romeCode).toBe('J1501');
      expect(ligne!.metiers[0]!.occurrences).toBe(1);
    });

    /**
     * Le point qui evite de mesurer le style redactionnel plutot que le marche :
     * une annonce bavarde ne doit pas peser comme plusieurs etablissements.
     */
    it('ne compte une competence qu une fois par offre', async () => {
      await offre({
        description:
          'Soins d hygiene, soins d hygiene et de confort, hygiene et de confort au quotidien.',
      });

      await reconstruire();

      const ligne = await prisma.competence.findFirstOrThrow({
        where: { libelle: "Soins d'hygiène et de confort" },
        include: { metiers: true },
      });

      expect(ligne.metiers[0]!.occurrences).toBe(1);
    });

    it('additionne les offres, metier par metier', async () => {
      await offre({ description: 'Prevention des escarres.' });
      await offre({ description: 'Prevention des escarres au quotidien.' });
      await offre({ romeCode: 'K1302', description: 'Accompagnement aux actes de la vie quotidienne.' });

      await reconstruire();

      const escarres = await prisma.competence.findFirstOrThrow({
        where: { libelle: 'Prévention des escarres' },
        include: { metiers: true },
      });

      expect(escarres.metiers).toHaveLength(1);
      expect(escarres.metiers[0]!.occurrences).toBe(2);
    });

    /** Une entree ne vaut que pour les metiers ou elle a un sens. */
    it('ignore une entree hors de son metier', async () => {
      await offre({ romeCode: 'J1501', description: 'Animation et activites adaptees.' });

      await reconstruire();

      // « Animation » est reservee a l'accompagnant : elle ne doit pas remonter
      // sur une annonce d'aide-soignant.
      expect(await prisma.competence.count({ where: { libelle: 'Animation et activités adaptées' } })).toBe(
        0,
      );
    });

    it('prend le champ structure tel que la source le donne', async () => {
      await offre({
        competences: [{ code: 'C-1', libelle: 'Manipulation d equipement medical' }],
      });

      await reconstruire();

      const ligne = await prisma.competence.findFirstOrThrow({
        where: { libelle: 'Manipulation d equipement medical' },
      });

      expect(ligne.code).toBe('C-1');
    });

    /** Les employeurs ecrivent la meme chose de six facons. */
    it('dedoublonne les graphies d un meme libelle', async () => {
      await offre({ competences: [{ libelle: 'Aide à la toilette' }] });
      await offre({ competences: [{ libelle: 'AIDE  A LA   TOILETTE' }] });

      await reconstruire();

      const lignes = await prisma.competence.findMany({
        where: { cle: 'aide a la toilette' },
        include: { metiers: true },
      });

      expect(lignes).toHaveLength(1);
      expect(lignes[0]!.metiers[0]!.occurrences).toBe(2);
    });

    it('rejoue sans rien dupliquer', async () => {
      await offre({ description: 'Prevention des escarres.' });

      const premier = await reconstruire();
      const second = await reconstruire();

      expect(second.competences).toBe(premier.competences);
      expect(second.nouvelles).toBe(0);
      expect(await prisma.competence.count()).toBe(premier.competences);
    });

    /**
     * Supprimer reecrirait l'histoire : une mission de l'an dernier a bien exige
     * cette competence-la, et un profil l'a bien declaree.
     */
    it('fait retomber a zero sans supprimer ce qui disparait du marche', async () => {
      await offre({ description: 'Prevention des escarres.' });
      await reconstruire();

      await prisma.offreCollectee.deleteMany({});
      await offre({ description: 'Refection des lits.' });

      const rapport = await reconstruire();

      expect(rapport.retombeesAZero).toBeGreaterThan(0);

      const escarres = await prisma.competence.findFirstOrThrow({
        where: { libelle: 'Prévention des escarres' },
        include: { metiers: true },
      });

      expect(escarres.metiers[0]!.occurrences).toBe(0);
    });

    it('ignore les offres expirees', async () => {
      await offre({ description: 'Prevention des escarres.', statut: 'EXPIREE' });

      const rapport = await reconstruire();

      expect(rapport.offresLues).toBe(0);
      expect(await prisma.competence.count()).toBe(0);
    });
  });

  // ------------------------------------------------------------ lecture

  describe('lecture du referentiel', () => {
    beforeEach(async () => {
      await offre({ description: 'Soins d hygiene et de confort. Prevention des escarres.' });
      await offre({ description: 'Soins d hygiene et de confort.' });
      await offre({ romeCode: 'K1302', description: 'Projet d accompagnement personnalise.' });
      await reconstruire();
    });

    it('classe par ce que le marche demande le plus', async () => {
      const reponse = await avec(app, agence).get('/api/competences?rome=J1501').expect(200);

      expect(reponse.body[0].libelle).toBe("Soins d'hygiène et de confort");
      expect(reponse.body[0].occurrences).toBe(2);
    });

    it('ne rend que les competences du metier demande', async () => {
      const reponse = await avec(app, agence).get('/api/competences?rome=K1302').expect(200);

      const libelles = reponse.body.map((c: { libelle: string }) => c.libelle);

      expect(libelles).toContain("Participation au projet d'accompagnement personnalisé");
      expect(libelles).not.toContain('Prévention des escarres');
    });

    it('cherche par mot-cle, sans accent ni casse', async () => {
      const reponse = await avec(app, agence).get('/api/competences?recherche=ESCARRE').expect(200);

      expect(reponse.body).toHaveLength(1);
      expect(reponse.body[0].libelle).toBe('Prévention des escarres');
    });

    it('respecte la limite demandee', async () => {
      const reponse = await avec(app, agence).get('/api/competences?limite=1').expect(200);

      expect(reponse.body).toHaveLength(1);
    });

    it('refuse un code ROME mal forme', async () => {
      await avec(app, agence).get('/api/competences?rome=ZZZ').expect(400);
    });

    /** Aucune donnee nominative, mais pas de lecture anonyme pour autant. */
    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/competences').expect(401);
    });

    it('s ouvre au candidat, qui doit declarer les siennes', async () => {
      await avec(app, candidat).get('/api/competences').expect(200);
    });
  });

  // ------------------------------------------------------------ usages

  describe('redaction d une mission', () => {
    let toilette: string;
    let escarres: string;

    beforeEach(async () => {
      await offre({ description: 'Aide a la toilette. Prevention des escarres.' });
      await reconstruire();

      toilette = await idDe('Aide à la toilette');
      escarres = await idDe('Prévention des escarres');
    });

    it('attache les competences attendues et les rend dans le detail', async () => {
      const creee = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [
              { competenceId: toilette, indispensable: false },
              { competenceId: escarres, indispensable: true },
            ],
          }),
        )
        .expect(201);

      const detail = await avec(app, agence).get(`/api/missions/${creee.body.id}`).expect(200);

      // L'indispensable en premier : c'est ce qu'un candidat doit lire d'abord.
      expect(detail.body.competences[0]).toMatchObject({
        libelle: 'Prévention des escarres',
        indispensable: true,
      });
      expect(detail.body.competences).toHaveLength(2);
    });

    it('se passe tres bien de competences', async () => {
      const creee = await avec(app, agence)
        .post('/api/missions')
        .send(besoin({ clientId: jeu.clientA }))
        .expect(201);

      const detail = await avec(app, agence).get(`/api/missions/${creee.body.id}`).expect(200);

      expect(detail.body.competences).toEqual([]);
    });

    /**
     * Sans ce controle, la cle etrangere leverait une P2003 rendue en 500 : une
     * faute de saisie passerait pour une panne du serveur.
     */
    it('refuse une competence inconnue du referentiel, en la nommant', async () => {
      const inconnue = '99999999-9999-4999-8999-999999999999';

      const reponse = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [{ competenceId: inconnue, indispensable: false }],
          }),
        )
        .expect(400);

      expect(reponse.body.message).toContain(inconnue);
    });

    it('refuse deux fois la meme competence', async () => {
      await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [
              { competenceId: toilette, indispensable: false },
              { competenceId: toilette, indispensable: true },
            ],
          }),
        )
        .expect(400);
    });

    it('remplace la liste a la modification, sans la completer', async () => {
      const creee = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [{ competenceId: toilette, indispensable: false }],
          }),
        )
        .expect(201);

      await avec(app, agence)
        .patch(`/api/missions/${creee.body.id}`)
        .send({ competences: [{ competenceId: escarres, indispensable: true }] })
        .expect(200);

      const detail = await avec(app, agence).get(`/api/missions/${creee.body.id}`).expect(200);

      expect(detail.body.competences).toHaveLength(1);
      expect(detail.body.competences[0].libelle).toBe('Prévention des escarres');
    });

    it('efface la liste quand on la passe vide', async () => {
      const creee = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [{ competenceId: toilette, indispensable: false }],
          }),
        )
        .expect(201);

      await avec(app, agence)
        .patch(`/api/missions/${creee.body.id}`)
        .send({ competences: [] })
        .expect(200);

      const detail = await avec(app, agence).get(`/api/missions/${creee.body.id}`).expect(200);

      expect(detail.body.competences).toEqual([]);
    });
  });

  describe('declaration par le candidat', () => {
    let toilette: string;
    let escarres: string;

    beforeEach(async () => {
      await offre({ description: 'Aide a la toilette. Prevention des escarres.' });
      await reconstruire();

      toilette = await idDe('Aide à la toilette');
      escarres = await idDe('Prévention des escarres');
    });

    it('declare depuis son espace', async () => {
      const reponse = await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ competences: [toilette, escarres] })
        .expect(200);

      expect(reponse.body.competences).toHaveLength(2);
      expect(reponse.body.competences.map((c: { libelle: string }) => c.libelle)).toContain(
        'Aide à la toilette',
      );
    });

    it('remplace sa liste, sans la completer', async () => {
      await avec(app, candidat).patch('/api/mon-profil').send({ competences: [toilette] }).expect(200);

      const reponse = await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ competences: [escarres] })
        .expect(200);

      expect(reponse.body.competences).toHaveLength(1);
      expect(reponse.body.competences[0].libelle).toBe('Prévention des escarres');
    });

    it('refuse une competence inconnue', async () => {
      await avec(app, candidat)
        .patch('/api/mon-profil')
        .send({ competences: ['99999999-9999-4999-8999-999999999999'] })
        .expect(400);
    });
  });

  describe('recherche de profils par mots-cles', () => {
    let toilette: string;
    let escarres: string;

    beforeEach(async () => {
      await offre({ description: 'Aide a la toilette. Prevention des escarres.' });
      await reconstruire();

      toilette = await idDe('Aide à la toilette');
      escarres = await idDe('Prévention des escarres');

      await prisma.competenceCandidat.createMany({
        data: [
          { candidatId: jeu.candidatA, competenceId: toilette },
          { candidatId: jeu.candidatA, competenceId: escarres },
        ],
      });
    });

    it('trouve un profil par une competence', async () => {
      const reponse = await avec(app, agence)
        .get(`/api/candidats?competences=${toilette}`)
        .expect(200);

      expect(reponse.body.donnees.map((c: { id: string }) => c.id)).toEqual([jeu.candidatA]);
    });

    /**
     * Conjonctif, et c'est le point : cocher deux cases cherche quelqu'un qui
     * sait faire les deux, pas la reunion de deux viviers.
     */
    it('exige toutes les competences demandees', async () => {
      const autre = await prisma.candidat.create({
        data: {
          agenceId: jeu.agenceA,
          nom: 'Partielle',
          prenom: 'Profil',
          email: 'partielle.a@test.example',
          telephone: '0600000021',
          adresse: '3 rue du Test',
          codePostal: '44000',
          ville: 'Nantes',
          statut: 'ACTIF',
          rayonKm: 25,
          competences: { create: [{ competenceId: toilette }] },
        },
      });

      const large = await avec(app, agence).get(`/api/candidats?competences=${toilette}`).expect(200);
      const stricte = await avec(app, agence)
        .get(`/api/candidats?competences=${toilette},${escarres}`)
        .expect(200);

      expect(large.body.donnees.map((c: { id: string }) => c.id).sort()).toEqual(
        [jeu.candidatA, autre.id].sort(),
      );
      expect(stricte.body.donnees.map((c: { id: string }) => c.id)).toEqual([jeu.candidatA]);
    });

    it('ne franchit pas la frontiere entre agences', async () => {
      const autreAgence = await connecter(
        app,
        await creerCompteDeTest('cherche.b@test.example', 'ADMIN_AGENCE', {
          agenceId: jeu.agenceB,
        }).then(() => 'admin.b@test.example'),
      );

      const reponse = await avec(app, autreAgence)
        .get(`/api/candidats?competences=${toilette}`)
        .expect(200);

      expect(reponse.body.donnees).toEqual([]);
    });
  });

  describe('poids au classement', () => {
    let toilette: string;

    beforeEach(async () => {
      await offre({ description: 'Aide a la toilette.' });
      await reconstruire();

      toilette = await idDe('Aide à la toilette');

      // Le vivier du jeu commun n'est pas eligible d'office : la porte exige un
      // diplome verifie et une distance mesurable. On la franchit ici, puisque
      // ce sont les competences qu'on veut observer.
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
    });

    /**
     * Le cablage de bout en bout : ce que l'etablissement coche et ce que
     * l'intervenant declare se rencontrent bien dans le score. Le bareme
     * lui-meme est verifie sans base dans `score.spec.ts`.
     */
    it('departage deux profils identiques sur leurs competences', async () => {
      await prisma.competenceCandidat.create({
        data: { candidatId: jeu.candidatA, competenceId: toilette },
      });

      const mission = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [{ competenceId: toilette, indispensable: true }],
          }),
        )
        .expect(201);

      const classement = await avec(app, agence)
        .get(`/api/missions/${mission.body.id}/candidats`)
        .expect(200);

      const retenu = classement.body.retenus.find(
        (ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA,
      );

      const ligne = retenu.score.composantes.find(
        (c: { cle: string }) => c.cle === 'competences',
      );

      expect(ligne).toBeDefined();
      expect(ligne.points).toBe(20);
    });

    /** Une competence est declarative : elle ne ferme jamais une porte. */
    it('n ecarte pas un profil qui ne declare rien', async () => {
      const mission = await avec(app, agence)
        .post('/api/missions')
        .send(
          besoin({
            clientId: jeu.clientA,
            competences: [{ competenceId: toilette, indispensable: true }],
          }),
        )
        .expect(201);

      const classement = await avec(app, agence)
        .get(`/api/missions/${mission.body.id}/candidats`)
        .expect(200);

      expect(
        classement.body.retenus.some(
          (ligne: { candidat: { id: string } }) => ligne.candidat.id === jeu.candidatA,
        ),
      ).toBe(true);
    });
  });
});
