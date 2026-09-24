import { describe, expect, it } from 'vitest';
import { siretValide } from '../src/siret';
import { clientCreateSchema } from '../src/client';

describe('siretValide', () => {
  it('accepte un SIRET dont la cle de Luhn est bonne', () => {
    expect(siretValide('48291736500017')).toBe(true);
    expect(siretValide('73282932000074')).toBe(true);
  });

  it('refuse un SIRET dont la cle est fausse', () => {
    expect(siretValide('48291736500019')).toBe(false);
  });

  it('refuse ce qui n est pas 14 chiffres', () => {
    expect(siretValide('482917365')).toBe(false);
    expect(siretValide('4829173650001A')).toBe(false);
    expect(siretValide('')).toBe(false);
  });

  it('accepte l exception documentee de La Poste', () => {
    expect(siretValide('35600000000048')).toBe(true);
  });
});

describe('clientCreateSchema', () => {
  // L'autorisation fait partie du socle depuis qu'elle conditionne
  // l'activation : une fiche sans elle n'est plus une fiche valide.
  const base = {
    raisonSociale: 'EHPAD Test',
    type: 'EHPAD',
    statutJuridique: 'PRIVE_NON_LUCRATIF',
    numeroFiness: '440000123',
    arreteReference: 'ARR-2025-114',
  };

  it('normalise un SIRET saisi avec des espaces', () => {
    const resultat = clientCreateSchema.safeParse({ ...base, siret: '732 829 320 00074' });

    expect(resultat.success).toBe(true);
    expect(resultat.data?.siret).toBe('73282932000074');
  });

  it('refuse un IDCC qui n est pas a quatre chiffres', () => {
    expect(
      clientCreateSchema.safeParse({ ...base, siret: '73282932000074', idcc: '12' }).success,
    ).toBe(false);
  });

  /**
   * Le type n'a plus de valeur par defaut depuis qu'il y en a trois.
   *
   * Tant que l'EHPAD etait seul, le deviner etait sans consequence. Ce n'est
   * plus vrai : le type decide de la piece que l'agence doit lire avant
   * d'activer — arrete conjoint pour un EHPAD, autorisation d'activite de soins
   * pour un etablissement de sante — et une fiche typee au hasard ferait
   * reclamer un document qui n'existe pas.
   */
  it('exige le type d etablissement', () => {
    const { type: _type, ...sansType } = base;

    expect(
      clientCreateSchema.safeParse({ ...sansType, siret: '73282932000074' }).success,
    ).toBe(false);
  });

  it('accepte les trois familles', () => {
    for (const type of ['EHPAD', 'HOPITAL', 'CLINIQUE']) {
      expect(
        clientCreateSchema.safeParse({ ...base, siret: '73282932000074', type }).success,
      ).toBe(true);
    }
  });

  it('refuse un type hors perimetre', () => {
    expect(
      clientCreateSchema.safeParse({ ...base, siret: '73282932000074', type: 'SAAD' }).success,
    ).toBe(false);
  });

  /**
   * Le statut juridique et les pieces de l'autorisation.
   *
   * Ce que ces tests protegent n'est pas la presence d'un champ, mais le fait
   * qu'on ne puisse pas declarer un gestionnaire sans produire l'autorisation
   * qui permet a son etablissement d'accueillir. Sous le regime precedent —
   * l'aide a domicile — la piece attendue dependait du statut juridique ; ici
   * elle depend du type d'etablissement, et les deux valeurs a saisir sont les
   * memes pour les trois familles.
   */
  describe('statut juridique et autorisation', () => {
    const fiche = (surcharge: Record<string, unknown>) =>
      clientCreateSchema.safeParse({
        raisonSociale: 'EHPAD Test',
        type: 'EHPAD',
        siret: '73282932000074',
        ...surcharge,
      });

    it('exige un statut', () => {
      expect(fiche({}).success).toBe(false);
    });

    it('accepte un statut accompagne de son arrete', () => {
      expect(
        fiche({
          statutJuridique: 'PUBLIC_HOSPITALIER',
          numeroFiness: '440000123',
          arreteReference: 'ARR-2025-114',
        }).success,
      ).toBe(true);
    });

    it('normalise un FINESS saisi avec des separateurs', () => {
      const resultat = fiche({
        statutJuridique: 'PRIVE_COMMERCIAL',
        numeroFiness: '44 000-01.23',
        arreteReference: 'ARR-2025-114',
      });

      expect(resultat.data?.numeroFiness).toBe('440000123');
    });

    it('refuse un FINESS qui ne fait pas 9 chiffres', () => {
      expect(
        fiche({
          statutJuridique: 'PRIVE_COMMERCIAL',
          numeroFiness: '4400',
          arreteReference: 'ARR-2025-114',
        }).success,
      ).toBe(false);
    });

    /** Une autorisation se prouve par deux pieces : le FINESS ne suffit pas seul. */
    it('exige l arrete en plus du FINESS', () => {
      const resultat = fiche({
        statutJuridique: 'PRIVE_NON_LUCRATIF',
        numeroFiness: '440000123',
      });

      expect(resultat.success).toBe(false);
      expect(resultat.error?.issues[0]?.path).toEqual(['arreteReference']);
    });

    it('exige le FINESS en plus de l arrete', () => {
      const resultat = fiche({
        statutJuridique: 'PRIVE_NON_LUCRATIF',
        arreteReference: 'ARR-2025-114',
      });

      expect(resultat.success).toBe(false);
      expect(resultat.error?.issues[0]?.path).toEqual(['numeroFiness']);
    });

    /**
     * L'ancienne nomenclature relevait du code du travail applicable aux
     * services a la personne. Aucun de ces etablissements n'en releve.
     */
    it('refuse un statut hors nomenclature', () => {
      expect(
        fiche({
          statutJuridique: 'DECLARE_SAP',
          numeroFiness: '440000123',
          arreteReference: 'ARR-2025-114',
        }).success,
      ).toBe(false);
    });
  });
});
