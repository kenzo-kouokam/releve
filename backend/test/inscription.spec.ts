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
   * Le parcours entreprise a ete retire du site public.
   *
   * Un ESMS est cree par l'agence, apres lecture de sa declaration SAP, de son
   * agrement ou de son arrete d'autorisation. Ce statut decide de ce que la
   * structure a le droit de faire — le laisser auto-declarer sans que personne
   * n'ouvre la piece reviendrait a ne rien verifier. Le test garde la trace de
   * ce retrait : une route rouverte par megarde le ferait echouer.
   */
  it('n expose plus d inscription entreprise', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/inscription/entreprise')
      .send({
        entreprise: { raisonSociale: 'SAAD Les Glycines', siret: '55208131766522' },
        compte: { email: 'direction@glycines.example', motDePasse: MOT_DE_PASSE_INSCRIPTION },
      })
      .expect(404);
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
