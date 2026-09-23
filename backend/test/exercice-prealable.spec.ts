import { describe, expect, it } from 'vitest';
import { heuresExercice, type PosteExerce } from '../src/matching/experience';
import { HEURES_PAR_AN_LEGALES, SEUIL_EXERCICE_PREALABLE_HEURES } from '@releve/shared';

/**
 * L'exercice prealable, teste seul.
 *
 * Cette mesure ne sert pas a departager des candidats mais a dire si l'un
 * d'eux justifie de la duree d'exercice attendue avant une mise a disposition.
 * Elle ne suit donc pas les memes regles que le bareme, et c'est precisement ce
 * que ce fichier verrouille : pas de plafond, pas de ponderation hors
 * referentiel, et la quotite prise au serieux.
 */

/**
 * Un instant de reference fixe : sans lui, « poste en cours » derive.
 *
 * Minuit, et non midi : les dates de poste sont des dates civiles posees a
 * minuit, et une reference a midi ajouterait une demi-journee au seul poste en
 * cours — de quoi le distinguer d'un poste clos le meme jour pour une raison
 * qui n'a rien de metier.
 */
const REFERENCE = new Date('2026-09-23T00:00:00Z');

function poste(surcharge: Partial<PosteExerce> = {}): PosteExerce {
  return {
    debutLe: new Date('2024-09-23T00:00:00Z'),
    finLe: new Date('2026-09-23T00:00:00Z'),
    quotitePourcent: 100,
    duReferentiel: true,
    ...surcharge,
  };
}

describe('exercice prealable', () => {
  it('compte deux ans a plein temps comme deux annees legales', () => {
    const heures = heuresExercice([poste()], REFERENCE);

    // 2 x 1607 h, a une poignee d'heures pres : deux annees civiles ne font pas
    // exactement 24 mois moyens.
    expect(heures).toBeGreaterThan(2 * HEURES_PAR_AN_LEGALES - 40);
    expect(heures).toBeLessThan(2 * HEURES_PAR_AN_LEGALES + 40);
  });

  it('atteint le seuil un peu apres deux ans, pas avec un seul', () => {
    const unAn = heuresExercice(
      [poste({ debutLe: new Date('2025-09-23T00:00:00Z') })],
      REFERENCE,
    );
    const deuxAnsEtUnMois = heuresExercice(
      [poste({ debutLe: new Date('2024-08-23T00:00:00Z') })],
      REFERENCE,
    );

    expect(unAn).toBeLessThan(SEUIL_EXERCICE_PREALABLE_HEURES);
    expect(deuxAnsEtUnMois).toBeGreaterThanOrEqual(SEUIL_EXERCICE_PREALABLE_HEURES);
  });

  /**
   * Deux annees civiles exactes tombent deux heures sous le seuil, et ce n'est
   * pas un defaut de calcul : les deux nombres ne sortent pas de la meme
   * convention. L'annee moyenne du calcul dure 365,2425 jours, alors que du
   * 23 septembre 2024 au 23 septembre 2026 il ne s'ecoule que 730 jours — aucun
   * 29 fevrier dans l'intervalle. 730 / 730,485 de 3 214 h font 3 212 h.
   *
   * Ecart de 0,07 %, sans portee pratique : un contrat ne s'arrete pas au jour
   * anniversaire. Il est fixe ici pour qu'il reste une propriete connue plutot
   * qu'une surprise decouverte devant un candidat a qui l'ecran annoncerait
   * « il manque 2 h ».
   */
  it('laisse deux annees civiles exactes deux heures sous le seuil', () => {
    const heures = heuresExercice([poste()], REFERENCE);

    expect(SEUIL_EXERCICE_PREALABLE_HEURES - heures).toBe(2);
  });

  it('ne compte un mi-temps que pour moitie', () => {
    const plein = heuresExercice([poste()], REFERENCE);
    const moitie = heuresExercice([poste({ quotitePourcent: 50 })], REFERENCE);

    expect(moitie).toBe(Math.round(plein / 2));
  });

  it('ignore un poste hors referentiel', () => {
    // Trois ans de caisse : du travail, mais pas de ce metier-ci.
    const heures = heuresExercice(
      [poste({ debutLe: new Date('2023-09-23T00:00:00Z'), duReferentiel: false })],
      REFERENCE,
    );

    expect(heures).toBe(0);
  });

  it('n applique aucun plafond, contrairement au bareme', () => {
    // Dix ans : le bareme s'arrete a cinq, la mesure legale non.
    const heures = heuresExercice(
      [poste({ debutLe: new Date('2016-09-23T00:00:00Z') })],
      REFERENCE,
    );

    expect(heures).toBeGreaterThan(9 * HEURES_PAR_AN_LEGALES);
  });

  it('fait courir un poste en cours jusqu a la date de reference', () => {
    const enCours = heuresExercice([poste({ finLe: null })], REFERENCE);
    const clos = heuresExercice([poste()], REFERENCE);

    expect(enCours).toBe(clos);
  });

  it('ne compte pas une periode a venir', () => {
    const heures = heuresExercice(
      [
        poste({
          debutLe: new Date('2026-12-01T00:00:00Z'),
          finLe: new Date('2027-01-01T00:00:00Z'),
        }),
      ],
      REFERENCE,
    );

    expect(heures).toBe(0);
  });

  it('additionne plusieurs postes', () => {
    const heures = heuresExercice(
      [
        poste({ debutLe: new Date('2024-09-23T00:00:00Z'), finLe: new Date('2025-09-23T00:00:00Z') }),
        poste({ debutLe: new Date('2025-09-23T00:00:00Z'), finLe: new Date('2026-09-23T00:00:00Z') }),
      ],
      REFERENCE,
    );

    expect(heures).toBeGreaterThan(2 * HEURES_PAR_AN_LEGALES - 40);
  });

  it('borne une quotite aberrante a 100 %', () => {
    const aberrante = heuresExercice([poste({ quotitePourcent: 150 })], REFERENCE);
    const plein = heuresExercice([poste()], REFERENCE);

    expect(aberrante).toBe(plein);
  });
});
