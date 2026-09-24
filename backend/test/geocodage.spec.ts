import { describe, expect, it } from 'vitest';
import { GeocodageService } from '../src/geocodage/geocodage.service';
import { lireReponseBan, type ReponseBan } from '../src/geocodage/ban.client';

/**
 * La lecture d'une reponse BAN, testee seule.
 *
 * Aucun reseau : ces cas sont des objets ecrits a la main, repris de reponses
 * reelles du service. C'est deliberé — un test qui appellerait la BAN
 * verifierait sa disponibilite, pas nos regles de rejet, et passerait ou non
 * selon l'heure.
 */

function reponse(
  proprietes: Record<string, unknown>,
  coordonnees = [-1.551073, 47.215936],
): ReponseBan {
  return {
    features: [
      {
        geometry: { coordinates: coordonnees as [number, number] },
        properties: proprietes,
      },
    ],
  };
}

describe('lecture d une reponse BAN', () => {
  it('retient un numero de rue et rend le point dans le bon ordre', () => {
    const point = lireReponseBan(
      reponse({
        label: '12 Rue de Strasbourg 44000 Nantes',
        score: 0.97,
        type: 'housenumber',
        postcode: '44000',
      }),
      '44000',
    );

    expect(point).not.toBeNull();
    // GeoJSON ordonne longitude puis latitude. L'inversion est silencieuse :
    // le point tomberait au large de la Somalie sans qu'aucun type ne bronche.
    expect(point!.latitude).toBeCloseTo(47.21, 1);
    expect(point!.longitude).toBeCloseTo(-1.55, 1);
    expect(point!.precision).toBe('NUMERO');
  });

  it('conserve un resultat a la commune, en le disant', () => {
    const point = lireReponseBan(
      reponse({ label: 'Nantes', score: 0.96, type: 'municipality', postcode: '44000' }),
      '44000',
    );

    // Un rayon de deplacement se compte en dizaines de kilometres : le centre
    // de la commune reste exploitable. Ce qui ne le serait pas, c'est de le
    // faire passer pour une adresse.
    expect(point?.precision).toBe('COMMUNE');
  });

  it('refuse un resultat trop incertain plutot que de placer la fiche au hasard', () => {
    const point = lireReponseBan(
      reponse({ label: 'Quelque part', score: 0.2, type: 'street', postcode: '44000' }),
      '44000',
    );

    expect(point).toBeNull();
  });

  it('refuse un resultat tombe sur une autre commune', () => {
    // La BAN glisse volontiers vers une homonyme a l'autre bout du pays quand la
    // rue est mal orthographiee, avec un score eleve. Le code postal est la
    // seule partie de la saisie qu'on peut confronter au resultat.
    const point = lireReponseBan(
      reponse({
        label: 'Rue de Nantes 35000 Rennes',
        score: 0.9,
        type: 'street',
        postcode: '35000',
      }),
      '44000',
    );

    expect(point).toBeNull();
  });

  it('refuse une reponse vide', () => {
    expect(lireReponseBan({ features: [] })).toBeNull();
    expect(lireReponseBan({})).toBeNull();
  });

  it('refuse un trait sans geometrie exploitable', () => {
    expect(
      lireReponseBan({
        features: [{ properties: { score: 0.9, type: 'housenumber' } }],
      }),
    ).toBeNull();
  });
});

describe('detection d un changement d adresse', () => {
  const base = { adresse: '12 rue de Strasbourg', codePostal: '44000', ville: 'Nantes' };

  it('ignore la casse et les espaces surnumeraires', () => {
    expect(
      GeocodageService.memeAdresse(base, {
        adresse: '  12   RUE de Strasbourg ',
        codePostal: '44000',
        ville: 'NANTES',
      }),
    ).toBe(true);
  });

  it('voit un changement de numero', () => {
    expect(GeocodageService.memeAdresse(base, { ...base, adresse: '14 rue de Strasbourg' })).toBe(
      false,
    );
  });

  it('voit un demenagement dans une autre commune', () => {
    expect(
      GeocodageService.memeAdresse(base, { ...base, codePostal: '44400', ville: 'Reze' }),
    ).toBe(false);
  });
});
