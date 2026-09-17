import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';

interface Creneau {
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
}

const creneau = (jourSemaine: number, heureDebut: string, heureFin: string): Creneau => ({
  jourSemaine,
  heureDebut,
  heureFin,
});

/**
 * Le calcul de chevauchement est teste unitairement dans @releve/shared.
 * Ici on verifie qu'il est bien branche sur la route, et que le remplacement du
 * planning fait ce qu'il annonce.
 */
describe('disponibilites', () => {
  let app: INestApplication;
  let jeu: Jeu;
  let session: Session;

  const planning = (disponibilites: Creneau[]) =>
    avec(app, session)
      .put(`/api/candidats/${jeu.candidatA}/disponibilites`)
      .send({ disponibilites });

  beforeAll(async () => {
    app = await creerApp();
    jeu = await reinitialiser();
    session = await connecter(app, 'charge.a@test.example');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('enregistre un planning valide et le renvoie trie', async () => {
    const reponse = await planning([
      creneau(4, '14:00', '20:00'),
      creneau(1, '07:00', '13:00'),
    ]).expect(200);

    expect(
      reponse.body.disponibilites.map((c: Creneau) => [c.jourSemaine, c.heureDebut, c.heureFin]),
    ).toEqual([
      [1, '07:00', '13:00'],
      [4, '14:00', '20:00'],
    ]);
  });

  it('remplace l integralite du planning', async () => {
    const reponse = await planning([creneau(2, '09:00', '11:00')]).expect(200);

    expect(reponse.body.disponibilites).toHaveLength(1);
  });

  it('accepte un planning vide', async () => {
    const reponse = await planning([]).expect(200);

    expect(reponse.body.disponibilites).toEqual([]);
  });

  it('refuse deux creneaux qui se chevauchent, en nommant les deux', async () => {
    const reponse = await planning([
      creneau(1, '07:00', '13:00'),
      creneau(1, '12:00', '18:00'),
    ]).expect(400);

    expect(reponse.body.erreurs.map((e: { champ: string }) => e.champ)).toEqual([
      'disponibilites.0',
      'disponibilites.1',
    ]);
  });

  it('accepte deux creneaux bord a bord', async () => {
    await planning([creneau(1, '07:00', '12:00'), creneau(1, '12:00', '18:00')]).expect(200);
  });

  describe('travail de nuit', () => {
    it('accepte une nuit qui traverse minuit', async () => {
      // 20:00 - 07:00 est un poste de nuit en etablissement, pas une erreur.
      await planning([creneau(1, '20:00', '07:00')]).expect(200);
    });

    it('refuse une nuit qui mord sur le creneau du lendemain', async () => {
      await planning([creneau(1, '20:00', '07:00'), creneau(2, '06:00', '12:00')]).expect(400);
    });

    it('refuse une nuit du dimanche qui mord sur le lundi matin', async () => {
      // La semaine reboucle : c'est le cas qu'une implementation naive rate.
      await planning([creneau(7, '20:00', '07:00'), creneau(1, '06:00', '12:00')]).expect(400);
    });

    it('accepte cette meme nuit si le lundi commence plus tard', async () => {
      await planning([creneau(7, '20:00', '07:00'), creneau(1, '08:00', '12:00')]).expect(200);
    });
  });

  describe('saisies invalides', () => {
    it('refuse un creneau de duree nulle', async () => {
      await planning([creneau(3, '09:00', '09:00')]).expect(400);
    });

    it('refuse une heure hors format', async () => {
      await planning([creneau(3, '25:00', '09:00')]).expect(400);
    });

    it('refuse un jour hors semaine', async () => {
      await planning([creneau(0, '07:00', '09:00')]).expect(400);
      await planning([creneau(8, '07:00', '09:00')]).expect(400);
    });
  });

  describe('indisponibilites', () => {
    it('refuse une periode dont la fin precede le debut', async () => {
      await avec(app, session)
        .post(`/api/candidats/${jeu.candidatA}/indisponibilites`)
        .send({ du: '2026-10-10', au: '2026-10-01' })
        .expect(400);
    });

    it('enregistre puis supprime une periode', async () => {
      const ajout = await avec(app, session)
        .post(`/api/candidats/${jeu.candidatA}/indisponibilites`)
        .send({ du: '2026-10-01', au: '2026-10-10', motif: 'Conges' })
        .expect(201);

      expect(ajout.body.indisponibilites).toHaveLength(1);
      const periode = ajout.body.indisponibilites[0];
      expect([periode.du, periode.au, periode.motif]).toEqual([
        '2026-10-01',
        '2026-10-10',
        'Conges',
      ]);

      const retrait = await avec(app, session)
        .delete(`/api/candidats/${jeu.candidatA}/indisponibilites/${periode.id}`)
        .expect(200);

      expect(retrait.body.indisponibilites).toEqual([]);
    });
  });
});
