import { describe, expect, it } from 'vitest';
import type { ExercicePrealable, ExperienceResume } from '@releve/shared';
import {
  choixPoste,
  enHeures,
  heuresEnAttente,
  HORS_SECTEUR,
  partExercice,
  periodesSeRecouvrent,
  SECTEUR,
  versRattachement,
} from '../app/utils/exercice';

/**
 * Ce que les ecrans font de la duree d'exercice prealable.
 *
 * Le calcul lui-meme vit au serveur et a ses propres tests ; ici on eprouve la
 * couche qui le donne a lire. Elle a l'air anodine et ne l'est pas : c'est elle
 * qui decide si un candidat comprend qu'il lui manque une piece ou qu'il lui
 * manque des annees, et si un poste part hors secteur en silence.
 */

function bilan(surcharge: Partial<ExercicePrealable> = {}): ExercicePrealable {
  return {
    heuresVerifiees: 4000,
    heuresDeclarees: 4000,
    seuilHeures: 3214,
    seuilAtteint: true,
    heuresManquantes: 0,
    ...surcharge,
  };
}

function poste(surcharge: Partial<ExperienceResume> = {}): ExperienceResume {
  return {
    id: 'poste-1',
    employeur: 'EHPAD des Lilas',
    intitule: 'Aide-soignante',
    qualificationId: 'deas',
    qualificationLibelle: "Diplôme d'État d'aide-soignant",
    exerciceMetier: false,
    compteDansExercice: true,
    debutLe: '2022-01-01',
    finLe: null,
    quotitePourcent: 100,
    description: null,
    verifieeLe: '2026-01-01T00:00:00.000Z',
    verifieePar: 'agence',
    dureeMois: 48,
    dureeHeures: 6428,
    enCours: true,
    ...surcharge,
  };
}

describe('mise en forme des heures', () => {
  it('groupe les milliers', () => {
    // L'espace de groupement de `fr-FR` est insecable : on compare sur les
    // chiffres plutot que sur un caractere invisible.
    expect(enHeures(3214).replace(/[^0-9h]/g, '')).toBe('3214h');
  });

  it('ne coupe pas le nombre de son unite', () => {
    // Ni espace ordinaire ni retour a la ligne entre « 3 214 » et « h » : c'est
    // une espace insecable fine (U+202F), nommee par son code pour rester
    // visible dans un diff.
    const rendu = enHeures(3214);

    expect(rendu.endsWith(String.fromCharCode(0x202f) + 'h')).toBe(true);
    expect(rendu).not.toMatch(/\d h$/);
  });

  it('rend zero lisible', () => {
    expect(enHeures(0)).toMatch(/^0/);
  });
});

describe('remplissage de la jauge', () => {
  it('donne la part atteinte', () => {
    expect(partExercice(bilan({ heuresVerifiees: 1607 }))).toBe(50);
  });

  /**
   * Borne a 100 : quelqu'un avec quatorze mille heures n'a pas besoin qu'on lui
   * dise qu'il en a 435 %, il a besoin de voir que c'est acquis. Une jauge qui
   * deborde son conteneur est aussi un defaut d'affichage bien reel.
   */
  it('ne depasse jamais cent', () => {
    expect(partExercice(bilan({ heuresVerifiees: 13994 }))).toBe(100);
  });

  it('rend zero plutot que NaN quand le bilan manque', () => {
    expect(partExercice(undefined)).toBe(0);
    expect(partExercice(null)).toBe(0);
  });

  it('rend zero plutot qu une division par zero', () => {
    expect(partExercice(bilan({ seuilHeures: 0 }))).toBe(0);
  });
});

describe('heures en attente de verification', () => {
  /**
   * La distinction n'est pas cosmetique : ces heures-la manquent en *piece*,
   * pas en terrain. Le candidat qui les voit sait qu'il n'a rien de plus a
   * faire qu'attendre l'agence.
   */
  it('mesure l ecart entre declare et verifie', () => {
    expect(heuresEnAttente(bilan({ heuresVerifiees: 1000, heuresDeclarees: 4000 }))).toBe(3000);
  });

  it('ne rend jamais de negatif', () => {
    expect(heuresEnAttente(bilan({ heuresVerifiees: 4000, heuresDeclarees: 1000 }))).toBe(0);
  });

  it('rend zero quand le bilan manque', () => {
    expect(heuresEnAttente(undefined)).toBe(0);
  });
});

describe('recouvrement des periodes', () => {
  /**
   * Deux postes menes en parallele comptent chacun leurs heures sur leur ligne,
   * mais le total est plafonne au temps reellement ecoule. Sans la phrase que
   * ce booleen declenche, l'ecran affiche « 4 681 h » et « 6 437 h » au-dessus
   * d'un total de « 6 437 h », et donne l'impression de compter faux.
   */
  it('se declenche quand la somme des lignes depasse le total', () => {
    const lignes = [poste({ dureeHeures: 4681 }), poste({ id: 'p2', dureeHeures: 6437 })];

    expect(periodesSeRecouvrent(bilan({ heuresVerifiees: 6437 }), lignes)).toBe(true);
  });

  it('reste muet quand les lignes s additionnent', () => {
    const lignes = [poste({ dureeHeures: 2000 }), poste({ id: 'p2', dureeHeures: 2000 })];

    expect(periodesSeRecouvrent(bilan({ heuresVerifiees: 4000 }), lignes)).toBe(false);
  });

  it('tolere une heure d ecart, qui n est qu un arrondi', () => {
    const lignes = [poste({ dureeHeures: 2000 }), poste({ id: 'p2', dureeHeures: 2001 })];

    expect(periodesSeRecouvrent(bilan({ heuresVerifiees: 4000 }), lignes)).toBe(false);
  });

  it('ignore les lignes qui ne comptent pas dans la duree', () => {
    // Une hotesse de caisse verifiee ne doit pas declencher l'avertissement :
    // ses heures n'entrent pas dans le total, leur absence n'est pas un
    // recouvrement.
    const lignes = [
      poste({ dureeHeures: 4000 }),
      poste({ id: 'caisse', dureeHeures: 5000, compteDansExercice: false }),
    ];

    expect(periodesSeRecouvrent(bilan({ heuresVerifiees: 4000 }), lignes)).toBe(false);
  });

  it('ignore les lignes non verifiees', () => {
    const lignes = [
      poste({ dureeHeures: 4000 }),
      poste({ id: 'attente', dureeHeures: 5000, verifieeLe: null }),
    ];

    expect(periodesSeRecouvrent(bilan({ heuresVerifiees: 4000 }), lignes)).toBe(false);
  });

  it('reste muet sans bilan ni lignes', () => {
    expect(periodesSeRecouvrent(undefined, [])).toBe(false);
    expect(periodesSeRecouvrent(bilan(), undefined)).toBe(false);
  });
});

/**
 * Le menu a trois reponses, et leur traduction est le point sensible.
 *
 * « Aucun / hors referentiel » etait la premiere option, donc preselectionnee :
 * un poste declare sans y toucher partait hors secteur en silence. Onze mille
 * heures d'aide-soignant ont ainsi compte pour zero, et le candidat s'est
 * retrouve ecarte de toute mission sans comprendre pourquoi.
 */
describe('choix du rattachement', () => {
  it('montre le diplome quand il y en a un', () => {
    expect(choixPoste({ qualificationId: 'deas', exerciceMetier: false })).toBe('deas');
  });

  it('montre le secteur quand l agence l a reconnu', () => {
    expect(choixPoste({ qualificationId: null, exerciceMetier: true })).toBe(SECTEUR);
  });

  it('montre hors secteur par defaut', () => {
    expect(choixPoste({ qualificationId: null, exerciceMetier: false })).toBe(HORS_SECTEUR);
  });

  it('prefere le diplome si les deux sont poses', () => {
    // Etat theoriquement impossible — le serveur lit « diplome OU secteur » —
    // mais l'ecran ne doit pas afficher deux choses a la fois.
    expect(choixPoste({ qualificationId: 'deas', exerciceMetier: true })).toBe('deas');
  });

  it('traduit un diplome en identifiant, sans drapeau', () => {
    expect(versRattachement('deas')).toEqual({ qualificationId: 'deas', exerciceMetier: false });
  });

  it('traduit le secteur en drapeau, sans identifiant', () => {
    expect(versRattachement(SECTEUR)).toEqual({ qualificationId: null, exerciceMetier: true });
  });

  it('traduit hors secteur en rien du tout', () => {
    expect(versRattachement(HORS_SECTEUR)).toEqual({
      qualificationId: null,
      exerciceMetier: false,
    });
  });

  it('ne laisse pas une sentinelle partir au serveur', () => {
    // Le bogue qu'on cherche a rendre impossible : « SECTEUR » envoye tel quel
    // dans `qualificationId`, ou l'API le refuserait comme UUID invalide.
    for (const valeur of [SECTEUR, HORS_SECTEUR, '']) {
      expect(versRattachement(valeur).qualificationId).toBeNull();
    }
  });

  it('fait un aller-retour stable', () => {
    for (const source of [
      { qualificationId: 'deas', exerciceMetier: false },
      { qualificationId: null, exerciceMetier: true },
      { qualificationId: null, exerciceMetier: false },
    ]) {
      expect(versRattachement(choixPoste(source))).toEqual(source);
    }
  });
});
