import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { MOT_DE_PASSE } from './fixtures';

export interface Session {
  jeton: string;
  rafraichissement: string;
}

export async function connecter(
  app: INestApplication,
  email: string,
  motDePasse: string = MOT_DE_PASSE,
): Promise<Session> {
  const reponse = await request(app.getHttpServer())
    .post('/api/auth/connexion')
    .send({ email, motDePasse })
    .expect(200);

  return {
    jeton: reponse.body.jeton,
    rafraichissement: reponse.body.jetonRafraichissement,
  };
}

/** Raccourci de lisibilite : `avec(app, session).get(...)`. */
export function avec(app: INestApplication, session: Session) {
  const agent = request(app.getHttpServer());
  const entete = `Bearer ${session.jeton}`;

  return {
    get: (chemin: string) => agent.get(chemin).set('Authorization', entete),
    post: (chemin: string) => agent.post(chemin).set('Authorization', entete),
    patch: (chemin: string) => agent.patch(chemin).set('Authorization', entete),
    put: (chemin: string) => agent.put(chemin).set('Authorization', entete),
    delete: (chemin: string) => agent.delete(chemin).set('Authorization', entete),
  };
}

/**
 * Recupere le jeton de verification tel que la personne le recoit.
 *
 * On relit le courriel reellement emis plutot que d'appeler le service
 * d'emission : c'est la seule facon de prouver que le lien part, qu'il est
 * complet, et que sa forme correspond a ce que la page attend. Un test qui
 * fabriquerait son propre jeton laisserait passer un courriel vide.
 */
export function jetonDuCourriel(
  app: INestApplication,
  destinataire: string,
  page: 'verification' | 'reinitialisation' | 'conservation' = 'verification',
): string {
  const courriel = app.get(MailService).dernierPour(destinataire);

  if (!courriel) {
    throw new Error(`Aucun courriel emis a ${destinataire}`);
  }

  const lien = new RegExp(`https?://\\S*/${page}\\?jeton=([\\w.~-]+)`).exec(courriel.texte);

  if (!lien) {
    throw new Error(`Le courriel a ${destinataire} ne porte aucun lien vers /${page}`);
  }

  return decodeURIComponent(lien[1]!);
}

/** Deroule le parcours reel : le lien du courriel ouvre la session. */
export async function confirmerAdresse(
  app: INestApplication,
  destinataire: string,
): Promise<Session> {
  const reponse = await request(app.getHttpServer())
    .post('/api/auth/verification/confirmer')
    .send({ jeton: jetonDuCourriel(app, destinataire) })
    .expect(200);

  return {
    jeton: reponse.body.jeton,
    rafraichissement: reponse.body.jetonRafraichissement,
  };
}
