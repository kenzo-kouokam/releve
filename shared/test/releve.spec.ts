import { describe, expect, it } from 'vitest';
import {
  dimancheDeLaSemaine,
  lundiDeLaSemaine,
  releveContestationSchema,
  releveCreateSchema,
  semaineDuSchema,
  totalHeures,
} from '../src/releve';

describe('lundiDeLaSemaine', () => {
  it('rend le lundi lui-meme sans le deplacer', () => {
    expect(lundiDeLaSemaine('2026-09-14')).toBe('2026-09-14');
  });

  it('recule un jour de semaine sur son lundi', () => {
    expect(lundiDeLaSemaine('2026-09-17')).toBe('2026-09-14');
  });

  // Le cas piegeux : getUTCDay() numerote le dimanche 0, et un decalage naif
  // le renverrait au lundi suivant. Une semaine de paie se fermerait alors sur
  // la suivante, et les heures du dimanche changeraient de bulletin.
  it('rattache le dimanche a la semaine qui s acheve, pas a la suivante', () => {
    expect(lundiDeLaSemaine('2026-09-20')).toBe('2026-09-14');
  });

  it('franchit un changement de mois et d annee', () => {
    expect(lundiDeLaSemaine('2027-01-01')).toBe('2026-12-28');
  });
});

describe('dimancheDeLaSemaine', () => {
  it('ferme la semaine six jours apres son lundi', () => {
    expect(dimancheDeLaSemaine('2026-09-14')).toBe('2026-09-20');
    expect(dimancheDeLaSemaine('2026-09-17')).toBe('2026-09-20');
  });
});

describe('semaineDuSchema', () => {
  it('accepte un lundi', () => {
    expect(semaineDuSchema.safeParse('2026-09-14').success).toBe(true);
  });

  // Sans ce refus, deux saisies de la meme semaine passeraient la contrainte
  // @@unique([missionId, semaineDu]) et produiraient deux paies.
  it('refuse un jour qui n est pas un lundi, en disant lequel attendre', () => {
    const resultat = semaineDuSchema.safeParse('2026-09-17');

    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.message).toContain('2026-09-14');
  });

  it('refuse une date bien formee qui n existe pas', () => {
    expect(semaineDuSchema.safeParse('2026-02-31').success).toBe(false);
  });
});

describe('totalHeures', () => {
  it('somme les quatre compteurs sans trainer de flottant', () => {
    expect(
      totalHeures({
        heuresNormales: 7.35,
        heuresNuit: 0.1,
        heuresDimanche: 0.2,
        heuresFeriees: 0,
      }),
    ).toBe(7.65);
  });
});

describe('releveCreateSchema', () => {
  const base = {
    missionId: '3f7c1b6e-6b1a-4c2e-9d85-2f4a1c8e7b30',
    semaineDu: '2026-09-14',
  };

  it('remplit les compteurs absents a zero', () => {
    const resultat = releveCreateSchema.safeParse({ ...base, heuresNormales: 35 });

    expect(resultat.success).toBe(true);
    expect(resultat.data?.heuresNuit).toBe(0);
    expect(resultat.data?.kilometres).toBe(0);
  });

  it('coerce les chaines rendues par un champ de formulaire', () => {
    const resultat = releveCreateSchema.safeParse({ ...base, heuresNormales: '35.5' });

    expect(resultat.success).toBe(true);
    expect(resultat.data?.heuresNormales).toBe(35.5);
  });

  // Une semaine a zero heure n'est pas un releve : c'est une absence, et elle
  // se traite sur la mission.
  it('refuse un releve dont le total est nul', () => {
    const resultat = releveCreateSchema.safeParse(base);

    expect(resultat.success).toBe(false);
  });

  it('accepte une semaine derogatoire sous le plafond de 60 h', () => {
    const resultat = releveCreateSchema.safeParse({
      ...base,
      heuresNormales: 44,
      heuresNuit: 8,
      heuresDimanche: 7,
    });

    expect(resultat.success).toBe(true);
  });

  it('refuse un total au-dela du plafond legal absolu', () => {
    const resultat = releveCreateSchema.safeParse({
      ...base,
      heuresNormales: 40,
      heuresNuit: 15,
      heuresDimanche: 10,
    });

    expect(resultat.success).toBe(false);
  });

  // La colonne est un Decimal(6, 2) : une troisieme decimale serait arrondie
  // par Postgres, et on paierait autre chose que ce qui a ete affiche.
  it('refuse une troisieme decimale', () => {
    expect(releveCreateSchema.safeParse({ ...base, heuresNormales: 7.255 }).success).toBe(false);
    expect(releveCreateSchema.safeParse({ ...base, heuresNormales: 7.25 }).success).toBe(true);
  });

  it('refuse une valeur negative', () => {
    expect(releveCreateSchema.safeParse({ ...base, heuresNormales: -2 }).success).toBe(false);
  });
});

describe('releveContestationSchema', () => {
  it('refuse une contestation sans motif substantiel', () => {
    expect(releveContestationSchema.safeParse({ motif: 'non' }).success).toBe(false);
  });

  it('accepte un motif circonstancie', () => {
    const resultat = releveContestationSchema.safeParse({
      motif: 'Jeudi 17 : intervention annulee par la famille, 3 h non effectuees.',
    });

    expect(resultat.success).toBe(true);
  });
});
