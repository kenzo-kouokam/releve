import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, MOT_DE_PASSE, prisma, reinitialiser, type Jeu } from './fixtures';
import { MailService } from '../src/mail/mail.service';

/**
 * Les garde-fous d'administration protegent contre deux accidents : se
 * verrouiller dehors, et promouvoir un acces externe en acces interne.
 */
describe('gestion des comptes', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let admin: Session;

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
    admin = await connecter(app, 'admin.a@test.example');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('creation', () => {
    it('rattache un compte interne a l agence de son createur', async () => {
      const cree = await avec(app, admin)
        .post('/api/utilisateurs')
        .send({
          email: 'nouveau@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CHARGE_RECRUTEMENT',
        })
        .expect(201);

      expect(cree.body.agenceId).toBe(jeu.agenceA);
      expect(cree.body.clientId).toBeNull();
      expect(cree.body.derniereCnx).toBeNull();
    });

    it('laisse le nouveau compte se connecter', async () => {
      await connecter(app, 'nouveau@test.example', 'MotDePasseValide2026');
    });

    it('refuse un mot de passe trop court', async () => {
      const reponse = await avec(app, admin)
        .post('/api/utilisateurs')
        .send({ email: 'court@test.example', motDePasse: 'court', role: 'CHARGE_RECRUTEMENT' })
        .expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('motDePasse');
    });

    it('refuse un compte interne portant un rattachement', async () => {
      await avec(app, admin)
        .post('/api/utilisateurs')
        .send({
          email: 'incoherent@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CHARGE_RECRUTEMENT',
          clientId: jeu.clientA,
        })
        .expect(400);
    });

    it('refuse un compte externe sans rattachement', async () => {
      await avec(app, admin)
        .post('/api/utilisateurs')
        .send({
          email: 'sansclient@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CLIENT',
        })
        .expect(400);
    });

    it('refuse une adresse deja prise', async () => {
      await avec(app, admin)
        .post('/api/utilisateurs')
        .send({
          email: 'charge.a@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CHARGE_RECRUTEMENT',
        })
        .expect(409);
    });

    it('refuse un second compte pour le meme candidat', async () => {
      await avec(app, admin)
        .post('/api/utilisateurs')
        .send({
          email: 'doublon@test.example',
          motDePasse: 'MotDePasseValide2026',
          role: 'CANDIDAT',
          candidatId: jeu.candidatA,
        })
        .expect(409);
    });
  });

  describe('garde-fous', () => {
    it('empeche un administrateur de se desactiver', async () => {
      const reponse = await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.adminA}`)
        .send({ actif: false })
        .expect(400);

      expect(reponse.body.message).toContain('son propre compte');
    });

    it('empeche un administrateur de changer son propre role', async () => {
      await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.adminA}`)
        .send({ role: 'CHARGE_RECRUTEMENT' })
        .expect(400);
    });

    it('refuse de promouvoir un compte externe au back-office', async () => {
      // Ce serait une escalade de privileges deguisee en changement de role.
      const reponse = await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.compteCandidatA}`)
        .send({ role: 'ADMIN_AGENCE' })
        .expect(400);

      expect(reponse.body.message).toContain('compte client ou candidat');
    });

    it('autorise en revanche la desactivation d un compte externe', async () => {
      const reponse = await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.compteCandidatA}`)
        .send({ actif: false })
        .expect(200);

      expect(reponse.body.actif).toBe(false);
    });

    it('refuse de retrograder le dernier administrateur actif', async () => {
      // Cas reel : l'administrateur a ete desactive en base mais son jeton court
      // encore. Sans ce garde-fou l'agence se retrouverait sans aucun acces.
      const promu = await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.chargeA}`)
        .send({ role: 'ADMIN_AGENCE' })
        .expect(200);

      expect(promu.body.role).toBe('ADMIN_AGENCE');

      await prisma.utilisateur.update({ where: { id: jeu.adminA }, data: { actif: false } });

      const reponse = await avec(app, admin)
        .patch(`/api/utilisateurs/${jeu.chargeA}`)
        .send({ role: 'CHARGE_RECRUTEMENT' })
        .expect(400);

      expect(reponse.body.message).toContain('dernier administrateur actif');

      await prisma.utilisateur.update({ where: { id: jeu.adminA }, data: { actif: true } });
    });
  });

  describe('mots de passe', () => {
    it('refuse la connexion d un compte desactive, sans le dire', async () => {
      await prisma.utilisateur.update({ where: { id: jeu.chargeA }, data: { actif: false } });

      const reponse = await avec(app, admin).get('/api/utilisateurs').expect(200);
      expect(reponse.body.total).toBeGreaterThan(0);

      const echec = await avec(app, admin)
        .post('/api/auth/connexion')
        .send({ email: 'charge.a@test.example', motDePasse: MOT_DE_PASSE });

      expect(echec.status).toBe(401);
      // Meme message que pour un mot de passe faux : on ne revele pas l'etat du compte.
      expect(echec.body.message).toBe('Identifiants invalides');

      await prisma.utilisateur.update({ where: { id: jeu.chargeA }, data: { actif: true } });
    });

    it('reinitialise depuis l administration et invalide l ancien', async () => {
      await avec(app, admin)
        .post(`/api/utilisateurs/${jeu.chargeA}/mot-de-passe`)
        .send({ motDePasse: 'MotDePasseReinitialise1' })
        .expect(201);

      await avec(app, admin)
        .post('/api/auth/connexion')
        .send({ email: 'charge.a@test.example', motDePasse: MOT_DE_PASSE })
        .expect(401);

      await connecter(app, 'charge.a@test.example', 'MotDePasseReinitialise1');
    });

    it('exige le mot de passe actuel pour un changement par l interesse', async () => {
      const session = await connecter(app, 'charge.a@test.example', 'MotDePasseReinitialise1');

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MauvaisMotDePasse', nouveau: 'EncoreUnAutre2026' })
        .expect(401);

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MotDePasseReinitialise1', nouveau: 'MotDePasseReinitialise1' })
        .expect(400);

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MotDePasseReinitialise1', nouveau: 'MotDePasseFinal2026' })
        .expect(204);

      await connecter(app, 'charge.a@test.example', 'MotDePasseFinal2026');
    });
  });

  /**
   * Un mot de passe qui change sans que son proprietaire le sache, c'est
   * exactement ce que fait quelqu'un qui vient de prendre le compte. Le
   * courriel est le seul moment ou la personne peut s'en apercevoir.
   */
  describe('avertissement par courriel', () => {
    let mail: MailService;

    beforeAll(() => {
      mail = app.get(MailService);
    });

    beforeEach(() => {
      mail.viderBoite();
    });

    it('previent l interesse quand il change son propre mot de passe', async () => {
      const session = await connecter(app, 'charge.a@test.example', 'MotDePasseFinal2026');

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MotDePasseFinal2026', nouveau: 'MotDePasseAvertit2026' })
        .expect(204);

      const courriel = mail.dernierPour('charge.a@test.example');

      expect(courriel).toBeDefined();
      expect(courriel!.sujet).toMatch(/modifie/i);
      expect(courriel!.texte).toMatch(/sessions ont ete fermees/i);
      expect(courriel!.texte).toMatch(/compte est probablement compromis/i);
    });

    /** Un courriel garde une trace permanente : le mot de passe n'y figure jamais. */
    it('ne fait jamais figurer le mot de passe dans le message', async () => {
      const session = await connecter(app, 'charge.a@test.example', 'MotDePasseAvertit2026');

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MotDePasseAvertit2026', nouveau: 'MotDePasseSecret2026' })
        .expect(204);

      const courriel = mail.dernierPour('charge.a@test.example');

      expect(courriel!.texte).not.toContain('MotDePasseAvertit2026');
      expect(courriel!.texte).not.toContain('MotDePasseSecret2026');
      expect(courriel!.html).not.toContain('MotDePasseSecret2026');
    });

    it('dit que l operation vient de l agence quand c est une reinitialisation', async () => {
      await avec(app, admin)
        .post(`/api/utilisateurs/${jeu.chargeA}/mot-de-passe`)
        .send({ motDePasse: 'MotDePasseParAgence2026' })
        .expect(201);

      const courriel = mail.dernierPour('charge.a@test.example');

      expect(courriel).toBeDefined();
      expect(courriel!.sujet).toMatch(/reinitialise/i);
      expect(courriel!.texte).toMatch(/votre agence/i);
      expect(courriel!.texte).not.toContain('MotDePasseParAgence2026');
    });

    /** Un mot de passe refuse n'a rien change : avertir serait un faux signal. */
    it('n envoie rien quand le changement echoue', async () => {
      const session = await connecter(app, 'charge.a@test.example', 'MotDePasseParAgence2026');

      await avec(app, session)
        .post('/api/auth/mot-de-passe')
        .send({ ancien: 'MauvaisMotDePasse2026', nouveau: 'PeuImporte2026' })
        .expect(401);

      expect(mail.dernierPour('charge.a@test.example')).toBeUndefined();
    });
  });
});
