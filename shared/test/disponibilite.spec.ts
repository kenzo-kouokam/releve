import { describe, expect, it } from 'vitest';
import {
  chevauchements,
  disponibilitesRemplaceSchema,
  type Disponibilite,
} from '../src/disponibilite';

const creneau = (jourSemaine: number, heureDebut: string, heureFin: string): Disponibilite => ({
  jourSemaine,
  heureDebut,
  heureFin,
  recurrente: true,
});

describe('chevauchements', () => {
  it('accepte deux creneaux disjoints le meme jour', () => {
    expect(chevauchements([creneau(1, '07:00', '12:00'), creneau(1, '14:00', '20:00')])).toEqual(
      [],
    );
  });

  it('signale les deux creneaux qui se recouvrent', () => {
    expect(chevauchements([creneau(1, '07:00', '13:00'), creneau(1, '12:00', '18:00')])).toEqual([
      0, 1,
    ]);
  });

  it('tolere deux creneaux bord a bord', () => {
    // 12:00 comme fin de l'un et debut de l'autre : l'intervalle est ouvert a
    // droite, sinon toute journee coupee en deux serait refusee.
    expect(chevauchements([creneau(1, '07:00', '12:00'), creneau(1, '12:00', '18:00')])).toEqual(
      [],
    );
  });

  it('ne confond pas deux jours differents', () => {
    expect(chevauchements([creneau(1, '07:00', '13:00'), creneau(2, '07:00', '13:00')])).toEqual(
      [],
    );
  });

  describe('creneaux de nuit', () => {
    it('accepte une nuit qui ne mord pas sur le creneau du lendemain', () => {
      expect(chevauchements([creneau(1, '20:00', '07:00'), creneau(2, '08:00', '12:00')])).toEqual(
        [],
      );
    });

    it('detecte une nuit qui mord sur le lendemain matin', () => {
      expect(chevauchements([creneau(1, '20:00', '07:00'), creneau(2, '06:00', '12:00')])).toEqual([
        0, 1,
      ]);
    });

    it('reboucle du dimanche soir au lundi matin', () => {
      // Le cas qui casse une implementation naive : la semaine est circulaire.
      expect(chevauchements([creneau(7, '20:00', '07:00'), creneau(1, '06:00', '12:00')])).toEqual([
        0, 1,
      ]);
    });

    it('laisse passer le dimanche soir si le lundi commence apres', () => {
      expect(chevauchements([creneau(7, '20:00', '07:00'), creneau(1, '08:00', '12:00')])).toEqual(
        [],
      );
    });
  });

  it('ne designe que les creneaux fautifs', () => {
    expect(
      chevauchements([
        creneau(3, '07:00', '09:00'),
        creneau(4, '10:00', '14:00'),
        creneau(4, '13:00', '16:00'),
      ]),
    ).toEqual([1, 2]);
  });
});

describe('disponibilitesRemplaceSchema', () => {
  it('accepte un planning vide', () => {
    expect(disponibilitesRemplaceSchema.safeParse({ disponibilites: [] }).success).toBe(true);
  });

  it('refuse un creneau de duree nulle', () => {
    const resultat = disponibilitesRemplaceSchema.safeParse({
      disponibilites: [creneau(3, '09:00', '09:00')],
    });

    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.path).toEqual(['disponibilites', 0, 'heureFin']);
  });

  it('refuse une heure hors format', () => {
    expect(
      disponibilitesRemplaceSchema.safeParse({ disponibilites: [creneau(3, '25:00', '09:00')] })
        .success,
    ).toBe(false);
  });

  it('refuse un jour hors de la semaine', () => {
    expect(
      disponibilitesRemplaceSchema.safeParse({ disponibilites: [creneau(8, '07:00', '09:00')] })
        .success,
    ).toBe(false);
  });

  it('refuse une fin de validite anterieure au debut', () => {
    const resultat = disponibilitesRemplaceSchema.safeParse({
      disponibilites: [
        { ...creneau(1, '07:00', '09:00'), valideDu: '2026-05-10', valideAu: '2026-05-01' },
      ],
    });

    expect(resultat.success).toBe(false);
  });

  it('remonte le chevauchement comme une erreur de validation', () => {
    const resultat = disponibilitesRemplaceSchema.safeParse({
      disponibilites: [creneau(1, '07:00', '13:00'), creneau(1, '12:00', '18:00')],
    });

    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.map((i) => i.message)).toContain(
      'Ce creneau en chevauche un autre',
    );
  });
});
