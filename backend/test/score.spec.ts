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
import { SEUIL_EXERCICE_PREALABLE_HEURES } from '@releve/shared';

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
    // Sans compétence attendue par défaut : c'est le cas le plus courant, et
    // celui où le barème se rabat sur `POIDS_SANS_COMPETENCES`.
    competences: [],
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
    // Au-dessus du seuil d'exercice prealable, pour que ce profil reste
    // eligible par defaut : les cas de ce fichier eprouvent la zone, les
    // creneaux et le score, pas cette porte-la, qui a ses propres cas plus bas.
    heuresExercice: SEUIL_EXERCICE_PREALABLE_HEURES,
    competences: [],
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

  it('ecarte une duree d exercice inferieure au seuil', () => {
    const debutant = profil({ heuresExercice: 1200 });
    const motifs = motifsExclusion(debutant, besoin());

    expect(motifs.map((m) => m.cle)).toContain('experience');
  });

  it('laisse passer pile au seuil', () => {
    const pile = profil({ heuresExercice: SEUIL_EXERCICE_PREALABLE_HEURES });

    expect(motifsExclusion(pile, besoin()).map((m) => m.cle)).not.toContain('experience');
  });

  /**
   * Le libelle part directement au candidat : `postuler` reprend les motifs tels
   * quels dans le message de refus. Il doit donc chiffrer l'ecart — c'est la
   * seule chose qui rende le refus actionnable — et nommer ce qui manque.
   */
  it('chiffre ce qui manque dans le libelle', () => {
    const motifs = motifsExclusion(profil({ heuresExercice: 1200 }), besoin());
    const libelle = motifs.find((m) => m.cle === 'experience')?.libelle ?? '';

    expect(libelle).toMatch(/1\s?200/);
    expect(libelle).toMatch(/3\s?214/);
    // 3214 - 1200
    expect(libelle).toMatch(/2\s?014/);
  });

  it('cumule le manque d experience et l absence de diplome', () => {
    const motifs = motifsExclusion(
      profil({ diplomeValide: false, heuresExercice: 0 }),
      besoin(),
    );
    const cles = motifs.map((m) => m.cle);

    expect(cles).toContain('diplome');
    expect(cles).toContain('experience');
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

  it('decompose toujours le total en lignes explicables', () => {
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

/**
 * La composante « compétences ».
 *
 * Elle compare deux listes puisées dans le même référentiel : ce que
 * l'établissement a coché en déposant son besoin, et ce que l'intervenant a
 * déclaré savoir faire. C'est la seule composante dont le poids se déplace —
 * quand la mission ne demande rien, ses vingt points retournent aux trois
 * autres.
 */
describe('competences', () => {
  const TOILETTE = '11111111-1111-4111-8111-111111111111';
  const LEVE_PERSONNE = '22222222-2222-4222-8222-222222222222';
  const UNITE_PROTEGEE = '33333333-3333-4333-8333-333333333333';

  /** Le même profil, la même mission, seules les compétences changent. */
  function avec(
    attendues: { id: string; indispensable: boolean }[],
    detenues: string[],
  ): ReturnType<typeof calculerScore> {
    return calculerScore(profil({ competences: detenues }), besoin({ competences: attendues }));
  }

  it('ne rend aucune ligne quand la mission ne demande rien', () => {
    const score = calculerScore(profil(), besoin());

    expect(score.composantes.map((c) => c.cle)).not.toContain('competences');
  });

  /**
   * Le point qui justifie `POIDS_SANS_COMPETENCES`. Sans redistribution, un
   * profil parfait plafonnerait à 80 sur une mission muette, et deux
   * classements cesseraient d'être comparables sans que rien ne le dise.
   */
  it('redistribue ses points quand la mission ne demande rien', () => {
    const muette = calculerScore(profil({ experiences: [poste()] }), besoin());
    const exigeante = avec([{ id: TOILETTE, indispensable: false }], [TOILETTE]);

    const zoneMuette = muette.composantes.find((c) => c.cle === 'zone')!;
    const zoneExigeante = exigeante.composantes.find((c) => c.cle === 'zone')!;

    expect(zoneMuette.sur).toBe(35);
    expect(zoneExigeante.sur).toBe(30);

    // Les deux totaux restent sur 100 : c'est tout l'objet de la manoeuvre.
    expect(muette.composantes.reduce((somme, c) => somme + c.sur, 0)).toBe(100);
    expect(exigeante.composantes.reduce((somme, c) => somme + c.sur, 0)).toBe(100);
  });

  it('donne tous les points a qui detient tout', () => {
    const score = avec(
      [
        { id: TOILETTE, indispensable: true },
        { id: LEVE_PERSONNE, indispensable: false },
      ],
      [TOILETTE, LEVE_PERSONNE, UNITE_PROTEGEE],
    );

    const ligne = score.composantes.find((c) => c.cle === 'competences')!;

    expect(ligne.points).toBe(20);
    expect(ligne.sur).toBe(20);
  });

  it('n en donne aucun a qui n en detient aucune', () => {
    const score = avec([{ id: TOILETTE, indispensable: false }], []);

    expect(score.composantes.find((c) => c.cle === 'competences')!.points).toBe(0);
  });

  /**
   * Une indispensable pese le double d'une souhaitee. Les deux profils
   * detiennent une competence sur deux : c'est laquelle qui les departage.
   */
  it('fait peser une indispensable le double d une souhaitee', () => {
    const attendues = [
      { id: TOILETTE, indispensable: true },
      { id: LEVE_PERSONNE, indispensable: false },
    ];

    const tientLIndispensable = avec(attendues, [TOILETTE]);
    const tientLAccessoire = avec(attendues, [LEVE_PERSONNE]);

    const points = (score: ReturnType<typeof calculerScore>) =>
      score.composantes.find((c) => c.cle === 'competences')!.points;

    expect(points(tientLIndispensable)).toBe(13);
    expect(points(tientLAccessoire)).toBe(7);
  });

  /**
   * Une competence est declarative : personne ne la verifie. Elle ne doit donc
   * jamais fermer une porte que la verification de l'agence laisse ouverte.
   */
  it('n ecarte jamais personne, meme sur une indispensable manquante', () => {
    const score = avec([{ id: TOILETTE, indispensable: true }], []);

    expect(motifsExclusion(profil({ competences: [] }), besoin({ competences: [{ id: TOILETTE, indispensable: true }] }))).toEqual([]);
    expect(score.total).toBeGreaterThan(0);
  });

  it('dit combien d indispensables sont tenues', () => {
    const score = avec(
      [
        { id: TOILETTE, indispensable: true },
        { id: UNITE_PROTEGEE, indispensable: true },
        { id: LEVE_PERSONNE, indispensable: false },
      ],
      [TOILETTE, LEVE_PERSONNE],
    );

    const ligne = score.composantes.find((c) => c.cle === 'competences')!;

    expect(ligne.explication).toBe('2 competence(s) sur 3 attendue(s), dont 1 sur 2 indispensable(s)');
  });

  it('ne parle pas d indispensables quand il n y en a pas', () => {
    const score = avec([{ id: TOILETTE, indispensable: false }], [TOILETTE]);

    expect(score.composantes.find((c) => c.cle === 'competences')!.explication).toBe(
      '1 competence(s) sur 1 attendue(s)',
    );
  });
});
