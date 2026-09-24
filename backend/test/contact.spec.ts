import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADRESSE_CONTACT } from '@releve/shared';
import { creerApp, prisma, reinitialiser } from './fixtures';
import { MailService } from '../src/mail/mail.service';

/**
 * Le formulaire de contact du site public.
 *
 * Une route ouverte qui fait partir un courriel se transforme vite en robinet
 * a spam. Ce que ces tests protegent : elle n'accepte que ce qu'elle doit,
 * elle n'usurpe jamais l'expediteur, et elle ne laisse pas croire qu'un
 * message est parti quand il ne l'est pas.
 */
describe('formulaire de contact', () => {
  let app: INestApplication;
  let mail: MailService;

  const demande = {
    prenom: 'Dirimo',
    nom: 'Dev',
    email: 'dirimo.dev@test.example',
    sujet: 'Contrat et fiche de paie',
    message: 'Bonjour, je teste pour ma fiche de paie. Bonne journee !',
  };

  function envoyer(corps: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/contact').send(corps);
  }

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

  it('relaie le message a la boite de l agence, sans session', async () => {
    await envoyer(demande).expect(202);

    const courriel = mail.dernierPour(ADRESSE_CONTACT);

    expect(courriel).toBeDefined();
    expect(courriel!.sujet).toContain('Contrat et fiche de paie');
    expect(courriel!.texte).toContain('je teste pour ma fiche de paie');
    expect(courriel!.texte).toContain('Dirimo Dev');
  });

  /**
   * L'adresse saisie ne devient jamais l'expediteur : elle part en `replyTo`.
   * Usurper l'expediteur ferait rejeter le message par n'importe quel relais
   * qui verifie SPF, et ouvrirait le site a l'envoi de courrier au nom de
   * n'importe qui.
   */
  it('met l adresse saisie en reponse, jamais en expediteur', async () => {
    await envoyer(demande).expect(202);

    expect(mail.dernierPour(ADRESSE_CONTACT)!.repondreA).toBe(demande.email);
  });

  describe('ce qu elle refuse', () => {
    it('refuse une adresse invalide', async () => {
      await envoyer({ ...demande, email: 'pas-une-adresse' }).expect(400);
      expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
    });

    it('refuse un message vide ou trop court', async () => {
      await envoyer({ ...demande, message: 'bonjour' }).expect(400);
      expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
    });

    it('refuse un message au-dela du plafond', async () => {
      await envoyer({ ...demande, message: 'a'.repeat(4001) }).expect(400);
      expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
    });

    /** Sujets figes : ils servent a router le message chez l'agence. */
    it('refuse un sujet hors de la liste', async () => {
      await envoyer({ ...demande, sujet: 'Offre de referencement' }).expect(400);
      expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
    });

    it('refuse un nom manquant', async () => {
      await envoyer({ ...demande, nom: '   ' }).expect(400);
      expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
    });
  });

  /**
   * Le piege a robots rend 202 sans rien envoyer. Repondre « refuse »
   * apprendrait a celui qui sonde qu'il existe un champ a laisser vide.
   */
  it('avale sans envoyer quand le piege est rempli', async () => {
    await envoyer({ ...demande, siteWeb: 'https://spam.example' }).expect(202);

    expect(mail.dernierPour(ADRESSE_CONTACT)).toBeUndefined();
  });

  it('n enregistre rien en base', async () => {
    await envoyer(demande).expect(202);

    // Aucun modele ne porte les messages de contact : le verifier tient a ce
    // qu'aucune table ne grossit. Le compte des utilisateurs sert de temoin le
    // plus proche — une route publique qui creerait un compte serait grave.
    const avant = await prisma.utilisateur.count();

    await envoyer(demande).expect(202);

    expect(await prisma.utilisateur.count()).toBe(avant);
  });
});
