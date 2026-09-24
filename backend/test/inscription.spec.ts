import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avec, confirmerAdresse, connecter, type Session } from './aide';
import { VERSION_CONDITIONS } from '@releve/shared';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';

const MOT_DE_PASSE_INSCRIPTION = 'MotDePasseInscrit2026';

function interimaire(surcharge: Record<string, unknown> = {}) {
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
      vehicule: true,
      ...surcharge,
    },
    compte: { email: 'julie.moreau@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
    conditionsAcceptees: true,
  };
}

/**
 * Un etablissement qui s'inscrit lui-meme.
 *
 * Aucune piece d'autorisation ici, et c'est le fond du parcours : le formulaire
 * public ne demande que ce a quoi on repond sans documents. Le FINESS et la
 * reference de l'autorisation se saisissent a l'activation, par l'agence, en
 * ouvrant la piece.
 *
 * Le SIRET porte une cle de controle : celui-ci est valide, sans quoi le schema
 * le refuserait avant meme d'atteindre le service.
 */
function etablissement(surcharge: Record<string, unknown> = {}) {
  return {
    etablissement: {
      raisonSociale: 'EHPAD Les Glycines',
      siret: '55208131766522',
      type: 'EHPAD',
      contactNom: 'Directrice',
      contactTel: '0240009988',
      ...surcharge,
    },
    lieu: {
      type: 'ETABLISSEMENT',
      libelle: 'Les Glycines - hebergement',
      adresse: '7 rue des Glycines',
      codePostal: '44300',
      ville: 'Nantes',
    },
    compte: { email: 'direction@glycines.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
    conditionsAcceptees: true,
  };
}

/**
 * Les deux parcours d'inscription publics.
 *
 * Ce qui est verifie ici n'est pas "le formulaire marche" mais les invariants
 * du lot : une inscription n'ouvre aucun acces tant que l'adresse n'est pas
 * confirmee, elle n'accorde aucun droit sur le metier de l'agence, et elle ne
 * rend personne operationnel sans validation.
 */
describe('inscription des deux profils', () => {
  let app: INestApplication;
  let jeu: Jeu;

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /**
   * L'inscription d'un etablissement.
   *
   * Ce que ces tests protegent tient en une phrase : **ouvrir l'inscription
   * n'accorde rien**. La fiche nait inactive, et le controle qui l'empeche de
   * publier existait deja — c'est celui qui s'applique aux structures que
   * l'agence desactive. Un EHPAD auto-declare autorise se trouve donc dans
   * exactement la meme situation.
   */
  describe('etablissement', () => {
    it('cree le compte, la fiche et le premier lieu', async () => {
      const reponse = await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send(etablissement())
        .expect(201);

      expect(reponse.body).toEqual({
        email: 'direction@glycines.example',
        verificationRequise: true,
      });

      const client = await prisma.client.findUniqueOrThrow({
        where: { siret: '55208131766522' },
        include: { lieux: true, utilisateurs: true },
      });

      expect(client.actif).toBe(false);
      expect(client.type).toBe('EHPAD');
      // L'absence est la garantie, pas un oubli : la fiche nait sans
      // autorisation documentee, donc dans un etat que l'agence ne peut pas
      // activer sans avoir lu quelque chose.
      expect(client.statutJuridique).toBeNull();
      expect(client.numeroFiness).toBeNull();
      expect(client.lieux).toHaveLength(1);
      expect(client.lieux[0]!.type).toBe('ETABLISSEMENT');
      expect(client.utilisateurs[0]!.role).toBe('CLIENT');
    });

    /** Le consentement est ecrit avec sa version, comme cote interimaire. */
    it('enregistre le consentement date et versionne', async () => {
      const compte = await prisma.utilisateur.findUniqueOrThrow({
        where: { email: 'direction@glycines.example' },
      });

      expect(compte.conditionsVersion).toBe(VERSION_CONDITIONS);
      expect(compte.conditionsAccepteesLe).not.toBeNull();
    });

    /**
     * Le verrou, verifie de bout en bout : le compte se connecte, voit son
     * espace, et se heurte a un refus des qu'il tente de deposer un besoin.
     */
    it('ne peut pas deposer de besoin tant que l agence n a pas active', async () => {
      await confirmerAdresse(app, 'direction@glycines.example');

      const session = await connecter(
        app,
        'direction@glycines.example',
        MOT_DE_PASSE_INSCRIPTION,
      );

      const espace = await avec(app, session).get('/api/auth/mon-espace').expect(200);

      expect(espace.body.type).toBe('CLIENT');
      expect(espace.body.valideParLAgence).toBe(false);

      const lieu = await prisma.lieuIntervention.findFirstOrThrow({
        where: { client: { siret: '55208131766522' } },
        select: { id: true },
      });

      const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

      await avec(app, session)
        .post('/api/missions')
        .send({
          lieuId: lieu.id,
          qualificationRequiseId: jeu.qualification,
          dateDebut: demain,
          dateFin: demain,
          heureDebut: '07:00',
          heureFin: '14:00',
          motifRecours: "Remplacement d'un salarie absent",
        })
        .expect(403);
    });

    /**
     * L'activation appartient a l'agence, et a elle seule — et elle ne peut pas
     * se faire les mains vides.
     *
     * C'est ici que se rattrape ce que le formulaire public ne demande plus :
     * activer sans statut juridique, sans FINESS et sans reference
     * d'autorisation est refuse. Le controle n'a pas disparu du parcours, il a
     * ete deplace la ou quelqu'un a la piece sous les yeux.
     */
    it('laisse deposer une fois l agence passee par la', async () => {
      const client = await prisma.client.findUniqueOrThrow({
        where: { siret: '55208131766522' },
        select: { id: true },
      });

      const agence = await connecter(app, 'admin.a@test.example');

      await avec(app, agence).patch(`/api/clients/${client.id}`).send({ actif: true }).expect(400);

      await avec(app, agence)
        .patch(`/api/clients/${client.id}`)
        .send({
          actif: true,
          statutJuridique: 'PRIVE_NON_LUCRATIF',
          numeroFiness: '440009988',
          arreteReference: 'ARR-2023-0451',
        })
        .expect(200);

      // Le geocodage est coupe pendant les tests (`GEOCODAGE_ACTIF=false`), donc
      // le lieu cree a l'inscription n'a pas de point — et une mission dont le
      // lieu n'est pas situe est refusee, puisque la distance ne serait alors
      // mesurable pour personne. On le situe a la main : ce qui est verifie ici
      // est le verrou d'activation, pas la disponibilite de la BAN.
      await prisma.lieuIntervention.updateMany({
        where: { clientId: client.id },
        data: { latitude: 47.2184, longitude: -1.5536 },
      });

      const session = await connecter(
        app,
        'direction@glycines.example',
        MOT_DE_PASSE_INSCRIPTION,
      );

      const lieu = await prisma.lieuIntervention.findFirstOrThrow({
        where: { clientId: client.id },
        select: { id: true },
      });

      const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

      await avec(app, session)
        .post('/api/missions')
        .send({
          lieuId: lieu.id,
          qualificationRequiseId: jeu.qualification,
          dateDebut: demain,
          dateFin: demain,
          heureDebut: '07:00',
          heureFin: '14:00',
          motifRecours: "Remplacement d'un salarie absent",
        })
        .expect(201);
    });

    /**
     * Le SIRET est unique sur toute la base : deux agences du meme reseau ne
     * doivent pas ouvrir deux fiches pour le meme etablissement.
     */
    it('refuse un etablissement deja enregistre', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send({
          ...etablissement(),
          compte: { email: 'autre@glycines.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(409);
    });

    /**
     * Le type est la seule chose d'administratif que le formulaire reclame, et
     * il n'est pas devinable : c'est lui qui dit a l'agence quelle piece
     * ouvrir. Une inscription sans type produirait une fiche que personne ne
     * saurait instruire.
     */
    it('refuse une inscription sans type d etablissement', async () => {
      const { type: _type, ...sansType } = etablissement().etablissement;

      await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send({
          ...etablissement(),
          etablissement: { ...sansType, siret: '11122233300002' },
          compte: { email: 'sans.type@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(400);

      expect(await prisma.utilisateur.count({ where: { email: 'sans.type@test.example' } })).toBe(
        0,
      );
    });

    /** Les trois familles passent par le meme guichet. */
    it('accepte une clinique comme un EHPAD', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send({
          ...etablissement({
            raisonSociale: 'Clinique du Parc',
            siret: '98765432100007',
            type: 'CLINIQUE',
          }),
          compte: { email: 'direction@parc.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(201);

      const client = await prisma.client.findUniqueOrThrow({
        where: { siret: '98765432100007' },
        select: { type: true, actif: true },
      });

      expect(client.type).toBe('CLINIQUE');
      expect(client.actif).toBe(false);
    });

    it('refuse un SIRET dont la cle de controle est fausse', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send({
          ...etablissement({ siret: '55208131766523' }),
          compte: { email: 'siret.faux@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(400);
    });

    it('exige l acceptation des conditions, comme l autre parcours', async () => {
      const { conditionsAcceptees: _ignore, ...sansCase } = etablissement();

      await request(app.getHttpServer())
        .post('/api/auth/inscription/etablissement')
        .send({
          ...sansCase,
          etablissement: { ...sansCase.etablissement, siret: '73282932000074' },
          compte: { email: 'sans.conditions@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(400);
    });
  });

  /**
   * Le consentement aux conditions generales.
   *
   * Exige par le schema partage, donc par l'API et pas seulement par la case du
   * formulaire : un client qui ne l'enverrait pas obtiendrait sinon un compte
   * sans consentement, et rien dans la base ne dirait qu'il en manque un.
   */
  describe('conditions generales', () => {
    it('refuse une inscription sans acceptation', async () => {
      const { conditionsAcceptees: _ignore, ...sansCase } = interimaire();

      await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send({ ...sansCase, compte: { ...sansCase.compte, email: 'sans.case@test.example' } })
        .expect(400);

      expect(await prisma.utilisateur.count({ where: { email: 'sans.case@test.example' } })).toBe(
        0,
      );
    });

    it('refuse une case decochee envoyee telle quelle', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send({
          ...interimaire(),
          compte: { email: 'refus@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
          conditionsAcceptees: false,
        })
        .expect(400);
    });

    it('enregistre la date et la version acceptee', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send({
          ...interimaire(),
          compte: { email: 'consentie@test.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
        })
        .expect(201);

      const compte = await prisma.utilisateur.findUniqueOrThrow({
        where: { email: 'consentie@test.example' },
        select: { conditionsAccepteesLe: true, conditionsVersion: true },
      });

      expect(compte.conditionsAccepteesLe).toBeInstanceOf(Date);
      expect(compte.conditionsVersion).toBe(VERSION_CONDITIONS);
    });
  });

  describe('interimaire', () => {
    let session: Session;

    it('cree une fiche en verification, sans ouvrir de session', async () => {
      const reponse = await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send(interimaire())
        .expect(201);

      expect(reponse.body).toEqual({
        email: 'julie.moreau@test.example',
        verificationRequise: true,
      });

      const candidat = await prisma.candidat.findUniqueOrThrow({
        where: { email: 'julie.moreau@test.example' },
      });

      // Se declarer aide-soignant ne suffit pas a partir en mission : l'agence
      // voit les diplomes avant que la fiche devienne proposable. C'est un
      // verrou distinct de la confirmation d'adresse, et les deux tiennent.
      expect(candidat.statut).toBe('EN_VERIFICATION');
    });

    it('ouvre la session au clic sur le lien recu', async () => {
      session = await confirmerAdresse(app, 'julie.moreau@test.example');

      const moi = await avec(app, session).get('/api/auth/moi').expect(200);

      expect(moi.body.role).toBe('CANDIDAT');
      expect(moi.body.candidatId).not.toBeNull();
      expect(moi.body.agenceId).toBeNull();
    });

    it('montre sa fiche et son etat de validation dans son espace', async () => {
      const reponse = await avec(app, session).get('/api/auth/mon-espace').expect(200);

      expect(reponse.body.type).toBe('CANDIDAT');
      expect(reponse.body.valideParLAgence).toBe(false);
      expect(reponse.body.candidat.prenom).toBe('Julie');
    });

    it('exige un numero de telephone joignable', async () => {
      const donnees = interimaire({ telephone: 'allo' });
      donnees.compte.email = 'sans-telephone@test.example';

      const reponse = await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send(donnees)
        .expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('interimaire.telephone');
    });

    it('refuse un mot de passe trop court', async () => {
      const donnees = interimaire();
      donnees.compte.email = 'court@test.example';
      donnees.compte.motDePasse = 'trop-court';

      const reponse = await request(app.getHttpServer())
        .post('/api/auth/inscription/interimaire')
        .send(donnees)
        .expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('compte.motDePasse');
    });

    /**
     * Le vrai risque du lot : ouvrir l'inscription au public, c'est ouvrir une
     * porte sur le vivier si les gardes ne tiennent pas.
     */
    describe('cloisonnement des permissions', () => {
      it('n ouvre aucun acces au vivier', async () => {
        await avec(app, session).get('/api/candidats').expect(403);
      });

      it('n ouvre aucun acces au referentiel client', async () => {
        await avec(app, session).get('/api/clients').expect(403);
      });

      it('n ouvre aucun acces a la gestion des comptes', async () => {
        await avec(app, session).get('/api/utilisateurs').expect(403);
      });

      it('ne permet pas de lire la fiche d un autre candidat', async () => {
        await avec(app, session).get(`/api/candidats/${jeu.candidatA}`).expect(403);
      });

      it('laisse changer son propre mot de passe', async () => {
        await avec(app, session)
          .post('/api/auth/mot-de-passe')
          .send({ ancien: MOT_DE_PASSE_INSCRIPTION, nouveau: 'NouveauMotDePasse2026' })
          .expect(204);
      });
    });
  });

  describe('parcours distincts', () => {
    it('donne un espace vide au personnel de l agence', async () => {
      const admin = await connecter(app, 'admin.a@test.example');
      const reponse = await avec(app, admin).get('/api/auth/mon-espace').expect(200);

      expect(reponse.body.type).toBe('AGENCE');
    });

    it('exige une session pour consulter son espace', async () => {
      await request(app.getHttpServer()).get('/api/auth/mon-espace').expect(401);
    });
  });
});
