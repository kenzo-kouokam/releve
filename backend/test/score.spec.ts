import { describe, expect, it } from 'vitest';
import {
  calculerScore,
  couvertureDisponibilite,
  distanceKm,
  dureeMinutes,
  motifsExclusion,
  type BesoinAPourvoir,
  type ProfilAEvaluer,
} from '../src/matching/score';
import type { ExperienceEvaluee } from '../src/matching/experience';

/**
 * Le bareme, teste seul.
 *
 * Aucune base, aucun reseau : ce fichier verifie la regle de calcul, pas son
 * cablage. C'est ce qui permet de discuter un poids ou une decroissance sans
 * monter un environnement, et de savoir immediatement ce qu'un changement casse.
 */

/** Une mission de reference : demain, 07:00-14:00, a Nantes. */
function besoin(surcharge: Partial<BesoinAPourvoir> = {}): BesoinAPourvoir {
  return {
    // Un lundi, pour que le jour de la semaine soit previsible.
    dateDebut: new Date('2026-09-14T00:00:00Z'),
    dateFin: new Date('2026-09-14T00:00:00Z'),
    heureDebut: '07:00',
    heureFin: '14:00',
    latitude: 47.2184,
    longitude: -1.5536,
    ...surcharge,
  };
}

/** Une date située N mois en arrière, pour écrire des durées lisibles. */
function ilYAMois(mois: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - mois);

  return date;
}

/** Un poste toujours occupé, relevant du diplôme exigé sauf mention contraire. */
function poste(surcharge: Partial<ExperienceEvaluee> = {}): ExperienceEvaluee {
  return {
    debutLe: ilYAMois(24),
    finLe: null,
    quotitePourcent: 100,
    qualifiante: true,
    ...surcharge,
  };
}

/** Un profil eligible : actif, diplome, sur place, disponible tout le creneau. */
function profil(surcharge: Partial<ProfilAEvaluer> = {}): ProfilAEvaluer {
  return {
    statut: 'ACTIF',
    rayonKm: 20,
    latitude: 47.2184,
    longitude: -1.5536,
    diplomeValide: true,
    experiences: [],
    creneaux: [
      { jourSemaine: 1, heureDebut: '07:00', heureFin: '14:00', valideDu: null, valideAu: null },
    ],
    absences: [],
    engagements: [],
    ...surcharge,
  };
}

describe('duree et distance', () => {
  it('compte une vacation de jour', () => {
    expect(dureeMinutes('07:00', '14:00')).toBe(420);
  });

  it('compte une vacation qui franchit minuit', () => {
    expect(dureeMinutes('20:00', '07:00')).toBe(660);
  });

  it('mesure une distance connue', () => {
    // Nantes centre -> Reze, environ 5 km a vol d'oiseau.
    const km = distanceKm(47.2184, -1.5536, 47.1836, -1.5494);

    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(6);
  });

  it('ne devine pas une distance quand un point manque', () => {
    expect(distanceKm(47.2, -1.5, null, null)).toBeNull();
  });
});

describe('couverture des disponibilites', () => {
  it('couvre entierement un creneau identique', () => {
    expect(couvertureDisponibilite(profil(), besoin())).toBe(1);
  });

  it('couvre partiellement un creneau plus court', () => {
    const partiel = profil({
      creneaux: [
        { jourSemaine: 1, heureDebut: '07:00', heureFin: '12:00', valideDu: null, valideAu: null },
      ],
    });

    // Cinq heures sur sept.
    expect(couvertureDisponibilite(partiel, besoin())).toBeCloseTo(5 / 7, 3);
  });

  it('ne couvre rien le mauvais jour de la semaine', () => {
    const mardi = profil({
      creneaux: [
        { jourSemaine: 2, heureDebut: '07:00', heureFin: '14:00', valideDu: null, valideAu: null },
      ],
    });

    expect(couvertureDisponibilite(mardi, besoin())).toBe(0);
  });

  /**
   * Le cas qui casse les implementations naives : une vacation 20:00-07:00
   * appartient a deux jours civils, et la disponibilite du lendemain matin
   * compte.
   */
  it('recolle les deux moities d une vacation de nuit', () => {
    const nuit = profil({
      creneaux: [
        { jourSemaine: 1, heureDebut: '20:00', heureFin: '00:00', valideDu: null, valideAu: null },
        { jourSemaine: 2, heureDebut: '00:00', heureFin: '07:00', valideDu: null, valideAu: null },
      ],
    });

    const vacation = besoin({ heureDebut: '20:00', heureFin: '07:00' });

    expect(couvertureDisponibilite(nuit, vacation)).toBeCloseTo(1, 2);
  });

  it('ne compte pas deux fois deux creneaux qui se recouvrent', () => {
    const doublon = profil({
      creneaux: [
        { jourSemaine: 1, heureDebut: '07:00', heureFin: '12:00', valideDu: null, valideAu: null },
        { jourSemaine: 1, heureDebut: '09:00', heureFin: '14:00', valideDu: null, valideAu: null },
      ],
    });

    expect(couvertureDisponibilite(doublon, besoin())).toBe(1);
  });

  it('ignore un creneau hors de sa periode de validite', () => {
    const perime = profil({
      creneaux: [
        {
          jourSemaine: 1,
          heureDebut: '07:00',
          heureFin: '14:00',
          valideDu: null,
          valideAu: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    });

    expect(couvertureDisponibilite(perime, besoin())).toBe(0);
  });
});

describe('porte d eligibilite', () => {
  it('laisse passer un profil complet', () => {
    expect(motifsExclusion(profil(), besoin())).toEqual([]);
  });

  it('ecarte un profil non valide par l agence', () => {
    const motifs = motifsExclusion(profil({ statut: 'EN_VERIFICATION' }), besoin());

    expect(motifs.map((m) => m.cle)).toContain('statut');
  });

  it('ecarte un diplome non detenu ou expire', () => {
    const motifs = motifsExclusion(profil({ diplomeValide: false }), besoin());

    expect(motifs.map((m) => m.cle)).toContain('diplome');
  });

  it('ecarte une absence declaree sur la periode', () => {
    const absent = profil({
      absences: [{ du: new Date('2026-09-10T00:00:00Z'), au: new Date('2026-09-20T00:00:00Z') }],
    });

    expect(motifsExclusion(absent, besoin()).map((m) => m.cle)).toContain('indisponible');
  });

  it('ecarte quelqu un deja retenu sur la meme periode', () => {
    const pris = profil({
      engagements: [
        {
          dateDebut: new Date('2026-09-14T00:00:00Z'),
          dateFin: new Date('2026-09-14T00:00:00Z'),
          heureDebut: '08:00',
          heureFin: '12:00',
        },
      ],
    });

    expect(motifsExclusion(pris, besoin()).map((m) => m.cle)).toContain('deja-engage');
  });

  it('ecarte au-dela du rayon declare, en le chiffrant', () => {
    // Rennes, a une centaine de kilometres de Nantes.
    const loin = profil({ latitude: 48.1173, longitude: -1.6778, rayonKm: 20 });
    const motif = motifsExclusion(loin, besoin()).find((m) => m.cle === 'hors-rayon');

    expect(motif).toBeDefined();
    expect(motif?.libelle).toMatch(/rayon de 20 km/);
  });

  /**
   * Sans coordonnees, la distance vaudrait zero dans une implementation naive,
   * et la fiche remonterait en tete du classement. On ecarte en le disant.
   */
  it('ecarte une fiche sans coordonnees plutot que de la croire sur place', () => {
    const sansAdresse = profil({ latitude: null, longitude: null });

    expect(motifsExclusion(sansAdresse, besoin()).map((m) => m.cle)).toContain('sans-adresse');
  });
});

describe('score', () => {
  it('donne le maximum a un profil parfait', () => {
    // Le profil « ideal » porte desormais cinq ans de terrain verifie : sans
    // experience, la composante qui pese le plus reste a zero, et c'est le
    // propos du bareme.
    const score = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(60) })] }),
      besoin(),
    );

    expect(score.total).toBe(100);
    expect(score.composantes).toHaveLength(3);
  });

  it('decompose toujours le total en trois lignes explicables', () => {
    const score = calculerScore(profil(), besoin());

    expect(score.composantes.map((c) => c.cle)).toEqual(['experience', 'zone', 'disponibilite']);
    expect(score.composantes.reduce((somme, c) => somme + c.points, 0)).toBe(score.total);

    for (const composante of score.composantes) {
      expect(composante.explication.length).toBeGreaterThan(10);
      expect(composante.points).toBeLessThanOrEqual(composante.sur);
    }
  });

  it('fait decroitre la note de zone avec la distance', () => {
    const proche = calculerScore(profil(), besoin());
    const lointain = calculerScore(profil({ latitude: 47.1836, longitude: -1.5494 }), besoin());

    const noteProche = proche.composantes.find((c) => c.cle === 'zone')?.points ?? 0;
    const noteLointaine = lointain.composantes.find((c) => c.cle === 'zone')?.points ?? 0;

    expect(noteLointaine).toBeLessThan(noteProche);
  });

  it('penalise une disponibilite partielle a proportion', () => {
    const partiel = profil({
      creneaux: [
        { jourSemaine: 1, heureDebut: '07:00', heureFin: '12:00', valideDu: null, valideAu: null },
      ],
    });

    const note = calculerScore(partiel, besoin()).composantes.find(
      (c) => c.cle === 'disponibilite',
    );

    expect(note?.points).toBe(Math.round(25 * (5 / 7)));
    expect(note?.explication).toMatch(/71 %/);
  });

  it('ne donne aucun point d experience a un profil qui n en declare pas', () => {
    const note = calculerScore(profil(), besoin()).composantes.find((c) => c.cle === 'experience');

    // Le diplome ne rapporte plus rien : la porte d'eligibilite l'exige deja de
    // tout le monde, donc lui attribuer des points ajouterait la meme constante
    // a chaque candidat classe, sans en departager aucun.
    expect(note?.points).toBe(0);
    expect(note?.explication).toMatch(/Aucune experience/);
  });

  it('classe devant celui qui a le plus de terrain verifie', () => {
    const debutant = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(6) })] }),
      besoin(),
    );

    const aguerri = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(48) })] }),
      besoin(),
    );

    expect(aguerri.total).toBeGreaterThan(debutant.total);
  });

  it('plafonne l experience a cinq ans', () => {
    const cinqAns = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(60) })] }),
      besoin(),
    );

    const vingtAns = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(240) })] }),
      besoin(),
    );

    const points = (score: typeof cinqAns): number =>
      score.composantes.find((c) => c.cle === 'experience')?.points ?? 0;

    expect(points(cinqAns)).toBe(40);
    expect(points(vingtAns)).toBe(40);
  });

  it('ne compte une experience hors referentiel que pour moitie', () => {
    const metier = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(30) })] }),
      besoin(),
    );

    const horsMetier = calculerScore(
      profil({ experiences: [poste({ debutLe: ilYAMois(30), qualifiante: false })] }),
      besoin(),
    );

    const points = (score: typeof metier): number =>
      score.composantes.find((c) => c.cle === 'experience')?.points ?? 0;

    expect(points(horsMetier)).toBeCloseTo(points(metier) / 2, 0);
    expect(horsMetier.composantes.find((c) => c.cle === 'experience')?.explication).toMatch(
      /moitie/,
    );
  });
});
