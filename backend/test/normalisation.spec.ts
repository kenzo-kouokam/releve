import { describe, expect, it } from 'vitest';
import {
  departementDepuisLieu,
  empreinteOffre,
  preparerLot,
  preparerOffre,
  normaliserIntitule,
  tauxHoraireDepuisLibelle,
  type OffreBrute,
} from '../src/donnees-publiques/normalisation';

/**
 * Tests unitaires du nettoyage : aucune base, aucun reseau.
 *
 * Les cas viennent d'un echantillon reel de 150 offres d'interim du secteur,
 * ou huit formes de libelle de salaire coexistent. C'est la seule partie de la
 * chaine ou une erreur passe inapercue : un taux mal converti ne plante pas, il
 * fausse silencieusement la suggestion faite a l'entreprise.
 */
describe('nettoyage des offres publiques', () => {
  describe('taux horaire', () => {
    it('lit un horaire simple', () => {
      expect(tauxHoraireDepuisLibelle('Horaire de 15.0 Euros')).toBe(15);
    });

    it('prend le milieu d une fourchette horaire', () => {
      expect(tauxHoraireDepuisLibelle('Horaire de 12.0 Euros à 14.0 Euros')).toBe(13);
    });

    it('convertit un mensuel en horaire', () => {
      // 1820 / 151,67 = 12,00
      expect(tauxHoraireDepuisLibelle('Mensuel de 1820.0 Euros')).toBeCloseTo(12, 1);
    });

    it('convertit un annuel en horaire', () => {
      // 24000 / (12 x 151,67) = 13,19
      expect(tauxHoraireDepuisLibelle('Annuel de 24000.0 Euros')).toBeCloseTo(13.19, 1);
    });

    it('ne compte pas le nombre de mois comme un montant', () => {
      const avec = tauxHoraireDepuisLibelle('Mensuel de 1820.0 Euros sur 12.0 mois');
      const sans = tauxHoraireDepuisLibelle('Mensuel de 1820.0 Euros');

      expect(avec).toBe(sans);
    });

    it('ignore le commentaire libre qui suit le montant', () => {
      expect(
        tauxHoraireDepuisLibelle('Horaire de 15.0 Euros - selon convention, diplome et anciennete'),
      ).toBe(15);
    });

    it('ignore une prime chiffree ajoutee apres le salaire', () => {
      expect(
        tauxHoraireDepuisLibelle('Horaire de 12.0 Euros à 14.0 Euros - prime segur + 200 Euros'),
      ).toBe(13);
    });

    /**
     * Le point qui compte le plus : une offre sans salaire lisible doit sortir
     * du calcul. Lui donner une valeur par defaut fausserait la mediane vers le
     * bas, et personne ne s'en apercevrait.
     */
    it('renvoie null plutot qu une valeur inventee', () => {
      expect(tauxHoraireDepuisLibelle(undefined)).toBeNull();
      expect(tauxHoraireDepuisLibelle('')).toBeNull();
      expect(tauxHoraireDepuisLibelle('Selon profil')).toBeNull();
      expect(tauxHoraireDepuisLibelle('A negocier')).toBeNull();
    });

    it('ecarte les valeurs hors plage plausible', () => {
      // Un "horaire" a 900 euros est une erreur de saisie, pas un taux.
      expect(tauxHoraireDepuisLibelle('Horaire de 900.0 Euros')).toBeNull();
      expect(tauxHoraireDepuisLibelle('Horaire de 2.0 Euros')).toBeNull();
    });
  });

  describe('departement', () => {
    it('lit le prefixe du libelle de lieu', () => {
      expect(departementDepuisLieu({ libelle: '85 - Chaize-Giraud' })).toBe('85');
    });

    it('retombe sur le code postal quand le libelle ne dit rien', () => {
      expect(departementDepuisLieu({ libelle: 'Nantes', codePostal: '44300' })).toBe('44');
    });

    it('garde trois chiffres pour l outre-mer', () => {
      expect(departementDepuisLieu({ libelle: 'Saint-Denis', codePostal: '97400' })).toBe('974');
    });

    it('gere la Corse', () => {
      expect(departementDepuisLieu({ libelle: '2A - Ajaccio' })).toBe('2A');
    });

    it('renvoie null quand rien n est exploitable', () => {
      expect(departementDepuisLieu({ libelle: 'Lieu inconnu' })).toBeNull();
      expect(departementDepuisLieu(undefined)).toBeNull();
    });
  });

  describe('intitule', () => {
    it('prefere l appellation du referentiel au titre de l employeur', () => {
      expect(
        normaliserIntitule({
          id: '1',
          intitule: 'AIDE SOIGNANT H/F - URGENT',
          appellationlibelle: 'Aide-soignant / Aide-soignante',
        }),
      ).toBe('Aide-soignant');
    });

    it('nettoie le titre libre quand le referentiel manque', () => {
      expect(normaliserIntitule({ id: '1', intitule: 'Auxiliaire de vie (F/H)' })).toBe(
        'Auxiliaire de vie',
      );
    });
  });

  describe('dedoublonnage', () => {
    const base: OffreBrute = {
      id: 'A',
      intitule: 'Aide soignant (F/H)',
      appellationlibelle: 'Aide-soignant / Aide-soignante',
      romeCode: 'J1501',
      romeLibelle: 'Aide-soignant / Aide-soignante',
      entreprise: { nom: 'APPEL MEDICAL' },
      lieuTravail: { libelle: '44 - NANTES', commune: 'Nantes', codePostal: '44000' },
      salaire: { libelle: 'Horaire de 15.0 Euros' },
      dateCreation: '2026-09-10T08:00:00.000Z',
      experienceExige: 'E',
    };

    it('donne la meme empreinte a deux republications', () => {
      const premiere = preparerOffre(base);
      const seconde = preparerOffre({
        ...base,
        id: 'B',
        intitule: 'AIDE-SOIGNANT H/F',
        dateCreation: '2026-09-12T08:00:00.000Z',
      });

      expect(premiere?.empreinte).toBe(seconde?.empreinte);
    });

    /**
     * Les republications sont comptees, plus fusionnees.
     *
     * La licence de reutilisation demande de restituer les offres mises a
     * disposition : deux agences qui publient la meme mission publient deux
     * annonces reelles, et en masquer une amputerait le catalogue. Le
     * dedoublonnage a lieu plus loin, dans la requete du barometre, sur cette
     * meme empreinte.
     */
    it('conserve les republications et les signale', () => {
      const lot = preparerLot([
        { ...base, id: 'B', dateCreation: '2026-09-12T08:00:00.000Z' },
        { ...base, id: 'A', dateCreation: '2026-09-10T08:00:00.000Z' },
      ]);

      expect(lot.offres).toHaveLength(2);
      expect(lot.doublons).toBe(1);
      expect(new Set(lot.offres.map((offre) => offre.empreinte)).size).toBe(1);
    });

    it('distingue deux employeurs sur la meme commune', () => {
      const lot = preparerLot([base, { ...base, id: 'C', entreprise: { nom: 'AUTRE AGENCE' } }]);

      expect(lot.offres).toHaveLength(2);
      expect(lot.doublons).toBe(0);
      expect(new Set(lot.offres.map((offre) => offre.empreinte)).size).toBe(2);
    });

    it('ignore la casse et les accents dans l empreinte', () => {
      const a = empreinteOffre({
        romeCode: 'J1501',
        intituleNormalise: 'Aide-soignant',
        entreprise: 'Établissement Léa',
        commune: 'Rezé',
      });
      const b = empreinteOffre({
        romeCode: 'J1501',
        intituleNormalise: 'AIDE SOIGNANT',
        entreprise: 'etablissement lea',
        commune: 'REZE',
      });

      expect(a).toBe(b);
    });
  });

  describe('lot complet', () => {
    /**
     * Une offre non situable reste publiable : « France entiere » est un lieu
     * de travail parfaitement lisible pour un candidat. Elle sort des agregats
     * departementaux, elle ne sort pas du site — l'ecarter etait juste tant que
     * la seule destination etait une statistique.
     */
    it('conserve tout ce qui est affichable et compte ce qui manque', () => {
      const lot = preparerLot([
        {
          id: 'ok',
          appellationlibelle: 'Aide-soignant / Aide-soignante',
          romeCode: 'J1501',
          lieuTravail: { libelle: '44 - NANTES', commune: 'Nantes', codePostal: '44000' },
          salaire: { libelle: 'Horaire de 15.0 Euros' },
          dateCreation: '2026-09-10T08:00:00.000Z',
        },
        // Sans departement : hors barometre territorial, mais affichable.
        {
          id: 'sans-lieu',
          intitule: 'Aide soignant (F/H)',
          appellationlibelle: 'Aide-soignant / Aide-soignante',
          romeCode: 'J1501',
          lieuTravail: { libelle: 'France entiere', commune: 'Nantes' },
          dateCreation: '2026-09-10T08:00:00.000Z',
        },
        // Sans salaire : conservee, mais signalee.
        {
          id: 'sans-salaire',
          appellationlibelle: 'Auxiliaire de vie',
          romeCode: 'K1304',
          lieuTravail: { libelle: '44 - REZE', commune: 'Reze', codePostal: '44400' },
          dateCreation: '2026-09-11T08:00:00.000Z',
        },
      ]);

      expect(lot.recues).toBe(3);
      // Rien n'est inexploitable : les trois ont un identifiant, un titre et
      // une date.
      expect(lot.ecartees).toBe(0);
      expect(lot.offres).toHaveLength(3);
      expect(lot.sansDepartement).toBe(1);
      expect(lot.sansSalaire).toBe(2);
    });

    it('ecarte ce qui n a ni titre ni date', () => {
      const lot = preparerLot([
        { id: 'sans-date', intitule: 'Aide soignant' },
        { id: 'sans-titre', dateCreation: '2026-09-10T08:00:00.000Z' },
      ]);

      expect(lot.ecartees).toBe(2);
      expect(lot.offres).toHaveLength(0);
    });
  });
});
