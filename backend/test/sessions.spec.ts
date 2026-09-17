import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { avec, connecter } from './aide';
import { creerApp, MOT_DE_PASSE, prisma, reinitialiser, type Jeu } from './fixtures';

/**
 * La session revocable est ce qui rattrape la faiblesse du JWT : sans elle,
 * desactiver un compte ne coupe rien avant l'expiration du jeton.
 */
describe('sessions revocables', () => {
  let app: INestApplication;
  let jeu: Jeu;

  const rafraichir = (jetonRafraichissement: string) =>
    request(app.getHttpServer()).post('/api/auth/rafraichir').send({ jetonRafraichissement });

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('emet deux jetons de natures differentes', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/api/auth/connexion')
      .send({ email: 'admin.a@test.example', motDePasse: MOT_DE_PASSE })
      .expect(200);

    // L'acces est un JWT (trois segments) ; le rafraichissement est opaque.
    expect(reponse.body.jeton.split('.')).toHaveLength(3);
    expect(reponse.body.jetonRafraichissement).not.toContain('.');
    expect(reponse.body.rafraichissementExpireDans).toBeGreaterThan(reponse.body.expireDans);
  });

  it('ne stocke jamais le jeton en clair', async () => {
    const session = await connecter(app, 'admin.a@test.example');

    const enBase = await prisma.jetonRafraichissement.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { empreinte: true },
    });

    expect(enBase?.empreinte).toHaveLength(64);
    expect(enBase?.empreinte).not.toBe(session.rafraichissement);
  });

  it('renouvelle le jeton de rafraichissement a chaque echange', async () => {
    const session = await connecter(app, 'admin.a@test.example');
    const suite = await rafraichir(session.rafraichissement).expect(200);

    expect(suite.body.jetonRafraichissement).not.toBe(session.rafraichissement);

    await avec(app, { jeton: suite.body.jeton, rafraichissement: '' })
      .get('/api/auth/moi')
      .expect(200);
  });

  it('tolere un rejeu immediat : c est une requete concurrente, pas un vol', async () => {
    // Un chargement de page lance plusieurs requetes ; celle qui arrive juste
    // apres la rotation porte encore l'ancien jeton.
    const session = await connecter(app, 'admin.a@test.example');

    await rafraichir(session.rafraichissement).expect(200);
    await rafraichir(session.rafraichissement).expect(200);
  });

  it('coupe la famille sur un rejeu tardif', async () => {
    const session = await connecter(app, 'admin.a@test.example');
    const suite = await rafraichir(session.rafraichissement).expect(200);

    // On vieillit l'usage au-dela du sursis de 30 s plutot que d'attendre.
    await prisma.jetonRafraichissement.updateMany({
      where: { utiliseLe: { not: null } },
      data: { utiliseLe: new Date(Date.now() - 60_000) },
    });

    const rejeu = await rafraichir(session.rafraichissement).expect(401);
    expect(rejeu.body.message).toContain('compromise');

    // Le successeur legitime tombe aussi : on coupe la session entiere.
    await rafraichir(suite.body.jetonRafraichissement).expect(401);
  });

  it('ferme la session a la deconnexion', async () => {
    const session = await connecter(app, 'admin.a@test.example');

    await request(app.getHttpServer())
      .post('/api/auth/deconnexion')
      .send({ jetonRafraichissement: session.rafraichissement })
      .expect(204);

    await rafraichir(session.rafraichissement).expect(401);
  });

  it('coupe les sessions quand un administrateur desactive le compte', async () => {
    const admin = await connecter(app, 'admin.a@test.example');
    const cible = await connecter(app, 'charge.a@test.example');

    await rafraichir(cible.rafraichissement).expect(200);

    // On reprend le jeton courant apres cette rotation.
    const courant = (await connecter(app, 'charge.a@test.example')).rafraichissement;

    await avec(app, admin)
      .patch(`/api/utilisateurs/${jeu.chargeA}`)
      .send({ actif: false })
      .expect(200);

    await rafraichir(courant).expect(401);

    await avec(app, admin)
      .patch(`/api/utilisateurs/${jeu.chargeA}`)
      .send({ actif: true })
      .expect(200);
  });

  it('coupe toutes les sessions quand le mot de passe change', async () => {
    const posteA = await connecter(app, 'charge.a@test.example');
    const posteB = await connecter(app, 'charge.a@test.example');

    await avec(app, posteA)
      .post('/api/auth/mot-de-passe')
      .send({ ancien: MOT_DE_PASSE, nouveau: 'MotDePasseChange2026' })
      .expect(204);

    // Y compris celle qui a fait la demande : apres un vol de session, la
    // mesure ne servirait a rien si la session du voleur survivait.
    await rafraichir(posteA.rafraichissement).expect(401);
    await rafraichir(posteB.rafraichissement).expect(401);

    await connecter(app, 'charge.a@test.example', 'MotDePasseChange2026');
  });

  it('refuse un jeton de rafraichissement inconnu', async () => {
    await rafraichir('jeton-invente-de-toutes-pieces').expect(401);
  });
});
