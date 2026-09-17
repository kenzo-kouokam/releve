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
  // Le statut reglementaire fait partie du socle depuis qu'il conditionne
  // l'activation : une fiche sans lui n'est plus une fiche valide.
  const base = {
    raisonSociale: 'SAAD Test',
    statutReglementaire: 'DECLARE_SAP',
    numeroSap: 'SAP732829320',
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

  // Le perimetre est reduit aux SAAD : le type n'est plus a saisir, et un type
  // hors perimetre doit etre refuse plutot qu'ignore en silence.
  it('retient SAAD quand le type est omis', () => {
    const resultat = clientCreateSchema.safeParse({ ...base, siret: '73282932000074' });

    expect(resultat.success).toBe(true);
    expect(resultat.data?.type).toBe('SAAD');
  });

  it('refuse un type hors perimetre', () => {
    expect(
      clientCreateSchema.safeParse({ ...base, siret: '73282932000074', type: 'EHPAD' }).success,
    ).toBe(false);
  });

  /**
   * Le statut reglementaire et sa piece justificative.
   *
   * Ce que ces tests protegent n'est pas la presence d'un champ, mais sa
   * coherence : declarer une autorisation departementale en ne fournissant
   * qu'un numero SAP ferait passer une structure pour ce qu'elle n'est pas — et
   * c'est ce statut qui determine si la duree minimale d'exercice prealable a
   * l'interim s'applique a ses missions.
   */
  describe('statut reglementaire', () => {
    const fiche = (surcharge: Record<string, unknown>) =>
      clientCreateSchema.safeParse({
        raisonSociale: 'SAAD Test',
        siret: '73282932000074',
        ...surcharge,
      });

    it('exige un statut', () => {
      expect(fiche({}).success).toBe(false);
    });

    it('accepte une declaration accompagnee de son numero SAP', () => {
      expect(fiche({ statutReglementaire: 'DECLARE_SAP', numeroSap: 'SAP732829320' }).success).toBe(
        true,
      );
    });

    it('normalise un numero SAP saisi avec des separateurs', () => {
      const resultat = fiche({
        statutReglementaire: 'PRESTATAIRE_CLASSIQUE',
        numeroSap: 'sap 732-829-320',
      });

      expect(resultat.data?.numeroSap).toBe('SAP732829320');
    });

    it('refuse un numero SAP qui ne porte pas 9 chiffres', () => {
      expect(fiche({ statutReglementaire: 'DECLARE_SAP', numeroSap: 'SAP7328' }).success).toBe(
        false,
      );
    });

    it('refuse une declaration sans numero', () => {
      const resultat = fiche({ statutReglementaire: 'DECLARE_SAP' });

      expect(resultat.success).toBe(false);
      expect(resultat.error?.issues[0]?.path).toEqual(['numeroSap']);
    });

    it('exige un numero d agrement, et pas un numero SAP, pour un agree', () => {
      expect(fiche({ statutReglementaire: 'AGREE_SAP', numeroSap: 'SAP732829320' }).success).toBe(
        false,
      );

      expect(
        fiche({ statutReglementaire: 'AGREE_SAP', numeroAgrement: 'SAP732829320' }).success,
      ).toBe(true);
    });

    /** Une autorisation se prouve par deux pieces : le FINESS ne suffit pas seul. */
    it('exige le FINESS et l arrete pour une structure autorisee', () => {
      expect(
        fiche({ statutReglementaire: 'AUTORISE_SAD_ESMS', numeroFiness: '440000123' }).success,
      ).toBe(false);

      expect(
        fiche({
          statutReglementaire: 'AUTORISE_SAD_ESMS',
          numeroFiness: '440000123',
          arreteReference: 'ARR-2025-114',
        }).success,
      ).toBe(true);
    });

    it('refuse un FINESS qui ne fait pas 9 chiffres', () => {
      expect(
        fiche({
          statutReglementaire: 'AUTORISE_SAD_ESMS',
          numeroFiness: '4400',
          arreteReference: 'ARR-2025-114',
        }).success,
      ).toBe(false);
    });

    it('refuse un statut hors nomenclature', () => {
      expect(fiche({ statutReglementaire: 'AUTRE', numeroSap: 'SAP732829320' }).success).toBe(
        false,
      );
    });
  });
});
