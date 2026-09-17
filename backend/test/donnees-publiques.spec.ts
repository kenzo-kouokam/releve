import type { INestApplication } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { avec, connecter, type Session } from './aide';
import { creerApp, prisma, reinitialiser, type Jeu } from './fixtures';
import { FranceTravailClient } from '../src/donnees-publiques/france-travail.client';
import { GeocodageOffresService } from '../src/donnees-publiques/geocodage-offres.service';
import { OffresService } from '../src/donnees-publiques/offres.service';
import type { OffreBrute } from '../src/donnees-publiques/normalisation';

/** Offre brute minimale, au format exact de l'API France Travail. */
function offre(surcharge: Record<string, unknown> = {}) {
  return {
    id: `X${Math.random().toString(36).slice(2, 9)}`,
    intitule: 'Aide soignant (F/H)',
    appellationlibelle: 'Aide-soignant / Aide-soignante',
    romeCode: 'J1501',
    romeLibelle: 'Aide-soignant / Aide-soignante',
    entreprise: { nom: `AGENCE ${Math.random().toString(36).slice(2, 6)}` },
    lieuTravail: { libelle: '44 - NANTES', commune: 'Nantes', codePostal: '44000' },
    salaire: { libelle: 'Horaire de 14.0 Euros' },
    typeContrat: 'MIS',
    dateCreation: new Date().toISOString(),
    ...surcharge,
  };
}

/**
 * La chaine de donnees publiques, de l'instantane au barometre.
 *
 * Le reseau n'est jamais sollicite : les tests passent par l'import de fichier,
 * qui rejoue exactement le meme nettoyage que l'appel a l'API. Une suite qui
 * dependrait de France Travail echouerait le jour de la soutenance.
 */
describe('donnees publiques', () => {
  let app: INestApplication;
  let offres: OffresService;
  let agence: Session;

  /**
   * Rejoue un balayage complet sans reseau.
   *
   * Seul le client est remplace : tout le reste du chemin — preparation,
   * ecriture, seuil de securite, expiration — est celui de la production. Un
   * import de fichier ne pourrait pas servir ici, puisqu'il se declare
   * volontairement partiel et n'expire donc jamais rien.
   */
  async function balayageComplet(brutes: unknown[]) {
    const client = app.get(FranceTravailClient);
    const espion = vi
      .spyOn(client, 'rechercher')
      .mockResolvedValue(brutes as unknown as OffreBrute[]);

    try {
      return await offres.importerDepuisApi({ romes: ['J1501'] }, false, true);
    } finally {
      espion.mockRestore();
    }
  }

  beforeAll(async () => {
    app = await creerApp();
    await reinitialiser();
    offres = app.get(OffresService);
    agence = await connecter(app, 'charge.a@test.example');
    await prisma.offreCollectee.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('import', () => {
    /**
     * Le changement de fond depuis la republication : plus rien n'est jete.
     *
     * Une republication est une offre reelle, publiee par une agence reelle, et
     * la licence de reutilisation demande de restituer le catalogue mis a
     * disposition. Elle est donc comptee et enregistree. Une offre « France
     * entiere » n'a pas de departement mais reste parfaitement lisible : elle
     * sort des agregats, pas du site.
     */
    it('conserve republications et offres non situables', async () => {
      const employeur = { nom: 'APPEL MEDICAL' };
      const lot = JSON.stringify({
        resultats: [
          offre({ id: 'A1', entreprise: employeur, salaire: { libelle: 'Horaire de 13.0 Euros' } }),
          // Republication : meme metier, meme employeur, meme commune.
          offre({ id: 'A2', entreprise: employeur, salaire: { libelle: 'Horaire de 13.0 Euros' } }),
          offre({ id: 'A3', salaire: { libelle: 'Horaire de 15.0 Euros' } }),
          // Lieu non situable : conservee, sans departement.
          offre({ id: 'A4', lieuTravail: { libelle: 'France entiere', commune: 'Nantes' } }),
        ],
      });

      const rapport = await offres.importerDepuisFichier(lot);

      expect(rapport.recues).toBe(4);
      expect(rapport.ecartees).toBe(0);
      expect(rapport.doublons).toBe(1);
      expect(rapport.sansDepartement).toBe(1);
      expect(rapport.enregistrees).toBe(4);
      expect(await prisma.offreCollectee.count()).toBe(4);
    });

    /**
     * Le titre de l'employeur ne doit jamais etre remplace par l'appellation du
     * referentiel : c'est ce que la licence appelle denaturer le contenu. Les
     * deux coexistent sur la meme ligne, chacun pour son usage.
     */
    it('republie le titre de l employeur et garde la forme normalisee a cote', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [offre({ id: 'T1', intitule: 'AIDE-SOIGNANT(E) - Interim (H/F)' })],
        }),
      );

      const enregistree = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'T1' } });

      expect(enregistree.intitule).toBe('AIDE-SOIGNANT(E) - Interim (H/F)');
      expect(enregistree.intituleNormalise).toBe('Aide-soignant');
    });

    /**
     * Piege du format France Travail : `lieuTravail.commune` porte le code
     * INSEE, pas le nom. Le nom n'existe que dans le libelle, derriere le
     * numero de departement.
     */
    it('lit le nom de commune dans le libelle, pas le code INSEE', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'L1',
              lieuTravail: { libelle: '74 - Thenes', commune: '74280', codePostal: '74230' },
            }),
          ],
        }),
      );

      const enregistree = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'L1' } });

      expect(enregistree.communeNom).toBe('Thenes');
      expect(enregistree.communeCode).toBe('74280');
      expect(enregistree.departement).toBe('74');
    });

    /**
     * Les champs d'annonce sont le coeur de la republication : sans eux la page
     * de detail n'a rien a montrer, et la licence demande de restituer le
     * contenu mis a disposition.
     */
    it('collecte le corps de l annonce et le lien vers la source', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'D1',
              description: 'Rejoignez une equipe engagee aupres des residents.',
              typeContratLibelle: 'Interim - 3 Mois',
              dureeTravailLibelle: 'Temps partiel - 11H/semaine',
              experienceLibelle: '1 An(s)',
              dateActualisation: '2026-09-16T12:16:17.794Z',
              origineOffre: {
                urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/D1',
              },
              competences: [{ code: '514781', libelle: 'Soins de confort', exigence: 'E' }],
              contexteTravail: { horaires: ['Travail en journee'] },
            }),
          ],
        }),
      );

      const enregistree = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'D1' } });

      expect(enregistree.description).toContain('Rejoignez une equipe');
      expect(enregistree.urlOrigine).toBe(
        'https://candidat.francetravail.fr/offres/recherche/detail/D1',
      );
      expect(enregistree.typeContratLibelle).toBe('Interim - 3 Mois');
      expect(enregistree.experienceLibelle).toBe('1 An(s)');
      expect(enregistree.actualiseeLe).toEqual(new Date('2026-09-16T12:16:17.794Z'));
      expect(enregistree.competences).toEqual([
        { code: '514781', libelle: 'Soins de confort', exigence: 'E' },
      ]);
      expect(enregistree.horaires).toEqual(['Travail en journee']);
    });

    it('est idempotent : un second import ne duplique rien', async () => {
      const lot = JSON.stringify({ resultats: [offre({ id: 'B1' })] });

      await offres.importerDepuisFichier(lot);
      const apresPremier = await prisma.offreCollectee.count();

      await offres.importerDepuisFichier(lot);

      expect(await prisma.offreCollectee.count()).toBe(apresPremier);
    });

    it('ne touche pas la base en simulation', async () => {
      const avant = await prisma.offreCollectee.count();

      const rapport = await offres.importerDepuisFichier(
        JSON.stringify({ resultats: [offre({ id: 'C1' })] }),
        true,
      );

      expect(rapport.simulation).toBe(true);
      expect(rapport.enregistrees).toBe(0);
      expect(await prisma.offreCollectee.count()).toBe(avant);
    });

    /**
     * Garde-fou sur le format reel : si France Travail change la forme de ses
     * reponses, ce test tombe avant que le barometre ne se vide en silence.
     */
    it('traite l instantane reel livre avec le depot', async () => {
      const chemin = join(process.cwd(), 'donnees', 'offres-echantillon.json');
      const rapport = await offres.importerDepuisFichier(await readFile(chemin, 'utf8'), true);

      expect(rapport.recues).toBeGreaterThan(50);
      expect(rapport.offres.length).toBeGreaterThan(40);
      // Le nettoyage doit rester utile : au moins un tiers des offres retenues
      // porte un taux exploitable.
      expect(rapport.offres.length - rapport.sansSalaire).toBeGreaterThan(
        rapport.offres.length / 3,
      );
    });
  });

  /**
   * Jeu de reference du barometre : cinq offres a Nantes de taux connus, dont
   * la mediane vaut 14, plus une sans salaire annonce.
   *
   * Extrait en fonction parce que deux blocs en ont besoin et qu'ils ne se
   * suivent plus : le bloc d'expiration vide la table entre les deux, et un
   * test qui dependrait silencieusement du voisin precedent finirait par tomber
   * sur un simple reordonnancement.
   */
  async function semerBarometre() {
    await prisma.offreCollectee.deleteMany();

    const taux = [12, 13, 14, 15, 16];
    const lot = taux.map((valeur, index) =>
      offre({
        id: `M${index}`,
        entreprise: { nom: `EMPLOYEUR ${index}` },
        salaire: { libelle: `Horaire de ${valeur}.0 Euros` },
        experienceExige: index < 2 ? 'E' : 'D',
      }),
    );

    // Une offre sans salaire : elle compte dans le volume, pas dans la mediane.
    lot.push(offre({ id: 'M9', entreprise: { nom: 'EMPLOYEUR 9' }, salaire: undefined }) as never);

    await offres.importerDepuisFichier(JSON.stringify({ resultats: lot }));
  }

  describe('barometre', () => {
    beforeAll(semerBarometre);

    it('calcule la mediane sur les seules offres chiffrees', async () => {
      const barometre = await offres.barometre(30, '44');
      const metier = barometre.metiers.find((ligne) => ligne.romeCode === 'J1501');

      expect(metier?.offres).toBe(6);
      expect(metier?.tauxHoraireMedian).toBe(14);
      expect(metier?.offresSansSalaire).toBe(1);
      expect(metier?.tauxHoraireMin).toBe(12);
      expect(metier?.tauxHoraireMax).toBe(16);
    });

    it('rapporte la part d offres exigeant de l experience', async () => {
      const barometre = await offres.barometre(30, '44');
      const metier = barometre.metiers.find((ligne) => ligne.romeCode === 'J1501');

      // Deux sur six.
      expect(metier?.partExperienceExigee).toBe(33);
    });

    it('ne voit rien hors de la periode observee', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'VIEUX',
              entreprise: { nom: 'ANCIEN EMPLOYEUR' },
              dateCreation: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
            }),
          ],
        }),
      );

      const recent = await offres.barometre(7, '44');
      const metier = recent.metiers.find((ligne) => ligne.romeCode === 'J1501');

      expect(metier?.offres).toBe(6);
    });

    it('suggere un taux pour le departement demande', async () => {
      const suggestion = await offres.tauxSuggere('J1501', '44', 30);

      expect(suggestion.tauxHoraireMedian).toBe(14);
      expect(suggestion.perimetre).toBe('departemental');
    });

    it('retombe sur le national quand le departement ne dit rien', async () => {
      const suggestion = await offres.tauxSuggere('J1501', '09', 30);

      expect(suggestion.perimetre).toBe('national');
      expect(suggestion.tauxHoraireMedian).toBe(14);
    });

    it('n invente pas de taux pour un metier inconnu', async () => {
      const suggestion = await offres.tauxSuggere('A1101', '44', 30);

      expect(suggestion.tauxHoraireMedian).toBeNull();
      expect(suggestion.perimetre).toBe('aucun');
    });

    /**
     * Le dedoublonnage se fait desormais au calcul, et pas a l'import.
     *
     * C'est ce qui corrige un defaut de la version precedente : le tri se
     * faisait lot par lot, donc deux republications arrivees dans deux imports
     * differents portaient deux identifiants distincts, entraient toutes les
     * deux en base, et gonflaient la tension. Les deux imports separes
     * ci-dessous reproduisent exactement ce cas.
     */
    it('ne compte qu une fois une republication, meme importee plus tard', async () => {
      const memeMission = {
        entreprise: { nom: 'DOUBLON MEDICAL' },
        salaire: { libelle: 'Horaire de 14.0 Euros' },
      };

      const avant = (await offres.barometre(30, '44')).metiers.find(
        (ligne) => ligne.romeCode === 'J1501',
      )?.offres;

      await offres.importerDepuisFichier(
        JSON.stringify({ resultats: [offre({ id: 'R1', ...memeMission })] }),
      );
      await offres.importerDepuisFichier(
        JSON.stringify({ resultats: [offre({ id: 'R2', ...memeMission })] }),
      );

      const apres = (await offres.barometre(30, '44')).metiers.find(
        (ligne) => ligne.romeCode === 'J1501',
      )?.offres;

      // Les deux lignes sont bien en base — la licence demande de les restituer
      // toutes les deux — mais le barometre n'en voit qu'une.
      expect(await prisma.offreCollectee.count({ where: { id: { in: ['R1', 'R2'] } } })).toBe(2);
      expect(apres).toBe((avant ?? 0) + 1);
    });
  });

  /**
   * Cycle de vie : la licence de reutilisation impose qu'une offre retiree chez
   * France Travail disparaisse aussi du site.
   */
  describe('expiration des offres disparues', () => {
    beforeAll(async () => {
      await prisma.offreCollectee.deleteMany();
    });

    it('retire du site les offres absentes d un balayage complet', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({ id: 'E1', entreprise: { nom: 'TOUJOURS LA' } }),
            offre({ id: 'E2', entreprise: { nom: 'BIENTOT POURVUE' } }),
          ],
        }),
      );

      // Second passage sans E2 : la mission a ete pourvue chez la source.
      await balayageComplet([offre({ id: 'E1', entreprise: { nom: 'TOUJOURS LA' } })]);

      const restante = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'E1' } });
      const retiree = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'E2' } });

      expect(restante.statut).toBe('ACTIVE');
      expect(retiree.statut).toBe('EXPIREE');
      expect(retiree.expireeLe).not.toBeNull();
      // La ligne reste en base : le barometre travaille sur une fenetre
      // glissante et doit continuer a voir les offres passees.
      expect(await prisma.offreCollectee.count()).toBe(2);
    });

    /**
     * Le garde-fou le plus important du lot. Un import tronque — plafond trop
     * bas, coupure reseau, API qui repond court — ne prouve pas que le reste du
     * catalogue a disparu. Sans ce refus, une seule commande viderait le site.
     */
    it('refuse d expirer sur un balayage manifestement tronque', async () => {
      await prisma.offreCollectee.deleteMany();

      const lot = Array.from({ length: 20 }, (_, index) =>
        offre({ id: `P${index}`, entreprise: { nom: `AGENCE ${index}` } }),
      );

      await offres.importerDepuisFichier(JSON.stringify({ resultats: lot }));

      // Une seule offre revue sur vingt : tres en dessous du seuil.
      const rapport = await balayageComplet([lot[0]!]);

      expect(rapport.expirees).toBe(0);
      expect(await prisma.offreCollectee.count({ where: { statut: 'ACTIVE' } })).toBe(20);
    });

    it('remet en ligne une offre republiee apres avoir ete expiree', async () => {
      await prisma.offreCollectee.deleteMany();

      const annonce = offre({ id: 'REV1', entreprise: { nom: 'REVENANTE' } });

      await offres.importerDepuisFichier(JSON.stringify({ resultats: [annonce] }));
      await balayageComplet([]);

      expect(
        (await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'REV1' } })).statut,
      ).toBe('EXPIREE');

      await offres.importerDepuisFichier(JSON.stringify({ resultats: [annonce] }));

      const revenue = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'REV1' } });

      expect(revenue.statut).toBe('ACTIVE');
      expect(revenue.expireeLe).toBeNull();
    });
  });

  describe('exposition par l API', () => {
    beforeAll(semerBarometre);

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/tension').expect(401);
    });

    it('repond au personnel de l agence', async () => {
      const reponse = await avec(app, agence)
        .get('/api/tension?jours=30&departement=44')
        .expect(200);

      expect(reponse.body.periodeJours).toBe(30);
      expect(reponse.body.metiers[0].romeCode).toBe('J1501');
    });

    it('refuse un departement mal forme', async () => {
      const reponse = await avec(app, agence).get('/api/tension?departement=zz').expect(400);

      expect(reponse.body.erreurs[0].champ).toBe('departement');
    });

    it('sert la suggestion de taux', async () => {
      const reponse = await avec(app, agence)
        .get('/api/tension/suggestion?rome=J1501&departement=44&jours=30')
        .expect(200);

      expect(reponse.body.tauxHoraireMedian).toBe(14);
      expect(reponse.body.perimetre).toBe('departemental');
    });

    it('refuse un code ROME mal forme', async () => {
      await avec(app, agence).get('/api/tension/suggestion?rome=abc').expect(400);
    });
  });

  /**
   * Geocodage des offres par leur commune.
   *
   * France Travail ne geolocalise qu'une annonce sur sept — 295 sur 2 020 lors
   * d'un import reel. Sans ce rattrapage, le rapprochement candidat ignorerait
   * six offres sur sept.
   *
   * La BAN est coupee en test (`GEOCODAGE_ACTIF=false`) : ces cas verifient le
   * report des communes deja situees sur les offres, et surtout qu'un import
   * ne detruit pas ce travail.
   */
  describe('geocodage par la commune', () => {
    let geocodage: GeocodageOffresService;

    beforeAll(async () => {
      geocodage = app.get(GeocodageOffresService);
      await prisma.offreCollectee.deleteMany();
      await prisma.communeGeocodee.deleteMany();
    });

    it('reporte les coordonnees de la commune sur les offres qui en manquent', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'G1',
              lieuTravail: { libelle: '44 - Nantes', commune: '44109', codePostal: '44000' },
            }),
          ],
        }),
      );

      const avant = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'G1' } });
      expect(avant.latitude).toBeNull();
      expect(avant.origineCoordonnees).toBeNull();

      await prisma.communeGeocodee.create({
        data: { codePostal: '44000', nom: 'Nantes', latitude: 47.2184, longitude: -1.5536 },
      });

      const rapport = await geocodage.rattraper();

      expect(rapport.offresSituees).toBe(1);

      const apres = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'G1' } });

      expect(apres.latitude).toBeCloseTo(47.2184);
      // L'origine dit que le point vaut la commune, pas l'adresse : c'est elle
      // qui fera ecrire « environ 12 km » plutot que « 12 km ».
      expect(apres.origineCoordonnees).toBe('COMMUNE');
    });

    /**
     * Le piege le plus couteux du lot. L'import ecrit les coordonnees de la
     * source ; si le `null` de France Travail ecrasait le point deduit, le
     * geocodage serait refait chaque jour pour etre efface chaque nuit, et
     * personne ne s'en apercevrait — la couverture resterait simplement basse.
     */
    it('ne laisse pas un import ecraser les coordonnees deduites', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'G1',
              lieuTravail: { libelle: '44 - Nantes', commune: '44109', codePostal: '44000' },
            }),
          ],
        }),
      );

      const apresReimport = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'G1' } });

      expect(apresReimport.latitude).toBeCloseTo(47.2184);
      expect(apresReimport.origineCoordonnees).toBe('COMMUNE');
    });

    /** Les coordonnees de la source, elles, priment toujours sur la commune. */
    it('garde les coordonnees de la source quand elle en fournit', async () => {
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'G2',
              lieuTravail: {
                libelle: '44 - Nantes',
                commune: '44109',
                codePostal: '44000',
                latitude: 47.25,
                longitude: -1.6,
              },
            }),
          ],
        }),
      );

      const enregistree = await prisma.offreCollectee.findUniqueOrThrow({ where: { id: 'G2' } });

      expect(enregistree.latitude).toBeCloseTo(47.25);
      expect(enregistree.origineCoordonnees).toBe('SOURCE');
    });

    it('rend compte de la couverture geographique', async () => {
      const couverture = await geocodage.couverture();

      expect(couverture.total).toBe(2);
      expect(couverture.situees).toBe(2);
      expect(couverture.part).toBe(100);
    });
  });

  /**
   * La vitrine publique, et surtout ce qu'elle ne montre pas.
   *
   * Depuis que les offres France Travail ne sont plus republiees, `/offres` ne
   * sert que les missions de Releve. C'est la frontiere la plus importante du
   * produit : la franchir laisserait un candidat croire qu'il postule chez nous
   * pour une annonce qui appartient a un concurrent.
   */
  describe('vitrine publique', () => {
    let jeu: Jeu;

    beforeAll(async () => {
      jeu = await reinitialiser();
      await prisma.offreCollectee.deleteMany();

      // Une offre France Travail bien vivante, qui ne doit jamais sortir ici.
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [offre({ id: 'FT1', entreprise: { nom: 'CONCURRENT INTERIM' } })],
        }),
      );

      await prisma.mission.create({
        data: {
          reference: 'M-VITRINE-1',
          agenceId: jeu.agenceA,
          clientId: jeu.clientA,
          lieuId: jeu.lieuA,
          qualificationRequiseId: jeu.qualification,
          statut: 'PUBLIEE',
          dateDebut: new Date('2026-10-01'),
          dateFin: new Date('2026-10-01'),
          heureDebut: '08:00',
          heureFin: '12:00',
          motifRecours: 'ACCROISSEMENT_TEMPORAIRE',
          tauxHoraire: 14.5,
        },
      });

      // Brouillon : elle ne cherche encore personne, donc pas de vitrine.
      await prisma.mission.create({
        data: {
          reference: 'M-VITRINE-2',
          agenceId: jeu.agenceA,
          clientId: jeu.clientA,
          lieuId: jeu.lieuA,
          qualificationRequiseId: jeu.qualification,
          statut: 'BROUILLON',
          dateDebut: new Date('2026-10-02'),
          dateFin: new Date('2026-10-02'),
          heureDebut: '08:00',
          heureFin: '12:00',
          motifRecours: 'ACCROISSEMENT_TEMPORAIRE',
        },
      });
    });

    it('sert les missions Releve sans session', async () => {
      const reponse = await request(app.getHttpServer()).get('/api/offres').expect(200);

      expect(reponse.body.total).toBe(1);
      expect(reponse.body.donnees[0].reference).toBe('M-VITRINE-1');
      expect(reponse.body.donnees[0].tauxHoraire).toBe(14.5);
    });

    /** Le coeur de la separation : aucune offre du marche ne fuit sur la vitrine. */
    it('ne laisse sortir aucune offre France Travail', async () => {
      const reponse = await request(app.getHttpServer()).get('/api/offres').expect(200);
      const corps = JSON.stringify(reponse.body);

      expect(corps).not.toContain('CONCURRENT INTERIM');
      expect(corps).not.toContain('FRANCE_TRAVAIL');
      expect(corps).not.toContain('francetravail.fr');
    });

    /**
     * Publier sur le web ouvert quels services d'aide a domicile passent par une
     * agence d'interim est commercialement sensible pour eux, et ils ne l'ont
     * pas autorise en deposant un besoin.
     */
    it('ne nomme pas l etablissement client', async () => {
      const reponse = await request(app.getHttpServer()).get('/api/offres').expect(200);

      expect(JSON.stringify(reponse.body)).not.toContain('SAAD A');
      expect(reponse.body.donnees[0].ville).toBe('Nantes');
    });

    it('ignore les missions qui ne cherchent personne', async () => {
      const reponse = await request(app.getHttpServer()).get('/api/offres').expect(200);

      expect(
        reponse.body.donnees.map((ligne: { reference: string }) => ligne.reference),
      ).not.toContain('M-VITRINE-2');
    });

    it('construit les menus deroulants sur les missions ouvertes', async () => {
      const reponse = await request(app.getHttpServer()).get('/api/offres/options').expect(200);

      expect(reponse.body.departements).toEqual([
        { code: '44', libelle: '44 — Loire-Atlantique', missions: 1 },
      ]);
      expect(reponse.body.villes).toEqual([{ nom: 'Nantes', departement: '44', missions: 1 }]);
      expect(reponse.body.metiers).toHaveLength(1);
    });

    it('filtre par departement et par ville', async () => {
      const bon = await request(app.getHttpServer()).get('/api/offres?departement=44').expect(200);
      const ailleurs = await request(app.getHttpServer())
        .get('/api/offres?departement=85')
        .expect(200);
      const parVille = await request(app.getHttpServer())
        .get('/api/offres?ville=Nantes')
        .expect(200);

      expect(bon.body.total).toBe(1);
      expect(ailleurs.body.total).toBe(0);
      expect(parVille.body.total).toBe(1);
    });
  });

  /**
   * Les annonces partenaire, dans l'espace du candidat.
   *
   * Deux invariants tiennent tout ce bloc, et ce sont eux qui distinguent ces
   * annonces des missions Releve : elles ne s'ouvrent qu'a un dossier valide,
   * et **aucune reponse n'en donne le chemin de candidature** — ni lien vers la
   * source, ni bouton. Releve n'est pas l'employeur de ces postes.
   */
  describe('annonces partenaire', () => {
    let jeu: Jeu;
    let candidat: Session;

    beforeAll(async () => {
      jeu = await reinitialiser();
      candidat = await connecter(app, 'candidat.a@test.example');

      await prisma.offreCollectee.deleteMany();
      await offres.importerDepuisFichier(
        JSON.stringify({
          resultats: [
            offre({
              id: 'AP-NANTES',
              intitule: 'AIDE-SOIGNANT(E) - Interim (H/F)',
              description: 'Poste en EHPAD, equipe de dix personnes.',
              entreprise: { nom: 'CONCURRENT INTERIM' },
              origineOffre: {
                urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/AP-NANTES',
              },
              lieuTravail: {
                libelle: '44 - Nantes',
                commune: '44109',
                codePostal: '44000',
                latitude: 47.2201,
                longitude: -1.5521,
              },
            }),
            offre({
              id: 'AP-MARSEILLE',
              entreprise: { nom: 'LOINTAINE INTERIM' },
              romeCode: 'K1304',
              romeLibelle: 'Aide a domicile / Aide a domicile',
              lieuTravail: {
                libelle: '13 - Marseille',
                commune: '13055',
                codePostal: '13001',
                latitude: 43.2965,
                longitude: 5.3698,
              },
            }),
          ],
        }),
      );
    });

    it('exige une session', async () => {
      await request(app.getHttpServer()).get('/api/offres/annonces').expect(401);
    });

    it('reste fermee au personnel de l agence', async () => {
      await avec(app, agence).get('/api/offres/annonces').expect(403);
    });

    /**
     * Le cas voulu, et le plus important : tant que l'agence n'a pas valide le
     * dossier, le marche reste ferme. La reponse n'est pas une erreur mais une
     * liste vide et un motif — « pas encore » n'est pas un refus, et l'ecran
     * doit pouvoir le dire plutot que de passer pour une panne.
     */
    it('reste fermee tant que le dossier n est pas valide', async () => {
      await prisma.candidat.update({
        where: { id: jeu.candidatA },
        data: { statut: 'EN_VERIFICATION' },
      });

      const reponse = await avec(app, candidat).get('/api/offres/annonces').expect(200);

      expect(reponse.body.motif).toBe('DOSSIER_NON_VALIDE');
      expect(reponse.body.donnees).toHaveLength(0);
      expect(reponse.body.total).toBe(0);

      // Un identifiant devine ne doit pas contourner la porte.
      await avec(app, candidat).get('/api/offres/annonces/AP-NANTES').expect(403);

      await prisma.candidat.update({ where: { id: jeu.candidatA }, data: { statut: 'ACTIF' } });
    });

    /**
     * Tout le marche, et pas une selection : le candidat a demande a voir ce qui
     * se cherche. Marseille sort donc avec Nantes, alors que le rapprochement
     * par distance l'aurait ecartee.
     */
    it('sert tout le catalogue au dossier valide', async () => {
      const reponse = await avec(app, candidat).get('/api/offres/annonces').expect(200);

      expect(reponse.body.motif).toBeNull();
      expect(reponse.body.total).toBe(2);
      expect(reponse.body.donnees.map((l: { id: string }) => l.id).sort()).toEqual([
        'AP-MARSEILLE',
        'AP-NANTES',
      ]);
    });

    /**
     * Le coeur de la decision produit. Exposer `urlOrigine` rouvrirait un chemin
     * de candidature qu'on a choisi de fermer : le candidat lit l'annonce, puis
     * vient parler de son projet a Releve.
     */
    it('n expose aucun chemin de candidature', async () => {
      const liste = await avec(app, candidat).get('/api/offres/annonces').expect(200);
      const detail = await avec(app, candidat).get('/api/offres/annonces/AP-NANTES').expect(200);

      for (const corps of [liste.body, detail.body]) {
        const texte = JSON.stringify(corps);

        expect(texte).not.toContain('urlOrigine');
        expect(texte).not.toContain('candidat.francetravail.fr');
      }

      expect(detail.body).not.toHaveProperty('urlOrigine');
      // Valeur derivee pour le barometre : l'afficher a la place du titre de
      // l'employeur denaturerait l'annonce.
      expect(detail.body).not.toHaveProperty('intituleNormalise');
    });

    /** La source reste nommee : c'est ce qui rend le mot « partenaire » exact. */
    it('nomme la source et restitue le titre de l employeur', async () => {
      const reponse = await avec(app, candidat).get('/api/offres/annonces/AP-NANTES').expect(200);

      expect(reponse.body.source).toBe('FRANCE_TRAVAIL');
      expect(reponse.body.intitule).toBe('AIDE-SOIGNANT(E) - Interim (H/F)');
      expect(reponse.body.description).toContain('EHPAD');
      expect(reponse.body.actualiseeLe ?? reponse.body.publieeLe).toBeTruthy();
    });

    it('filtre par departement et par metier', async () => {
      const parDepartement = await avec(app, candidat)
        .get('/api/offres/annonces?departement=13')
        .expect(200);
      const parMetier = await avec(app, candidat)
        .get('/api/offres/annonces?rome=J1501')
        .expect(200);

      expect(parDepartement.body.donnees.map((l: { id: string }) => l.id)).toEqual([
        'AP-MARSEILLE',
      ]);
      expect(parMetier.body.donnees.map((l: { id: string }) => l.id)).toEqual(['AP-NANTES']);
    });

    /**
     * La case « dans mon rayon » est le seul filtre geographique, et elle reste
     * decochee par defaut : le catalogue entier est ce qu'on a promis.
     */
    it('resserre sur le rayon seulement quand on le demande', async () => {
      await prisma.candidat.update({ where: { id: jeu.candidatA }, data: { rayonKm: 30 } });

      const tout = await avec(app, candidat).get('/api/offres/annonces').expect(200);
      const proche = await avec(app, candidat)
        .get('/api/offres/annonces?monRayon=true')
        .expect(200);

      expect(tout.body.total).toBe(2);
      expect(proche.body.total).toBe(1);
      expect(proche.body.donnees[0].id).toBe('AP-NANTES');
    });

    /**
     * Regression. Une chaine de requete ne transporte que du texte, et
     * `Boolean('false')` vaut `true` : avec `z.coerce.boolean()`, le filtre du
     * rayon s'appliquait en permanence. Le catalogue tombait de 2 020 annonces a
     * 34 sans qu'aucune erreur ne le signale.
     */
    it('lit monRayon=false comme un faux, pas comme une chaine non vide', async () => {
      const explicite = await avec(app, candidat)
        .get('/api/offres/annonces?monRayon=false')
        .expect(200);
      const absent = await avec(app, candidat).get('/api/offres/annonces').expect(200);

      expect(explicite.body.total).toBe(absent.body.total);
      expect(explicite.body.total).toBe(2);
    });

    it('classe les plus proches en tete et mesure la distance', async () => {
      const reponse = await avec(app, candidat).get('/api/offres/annonces?tri=PROCHES').expect(200);

      expect(reponse.body.donnees[0].id).toBe('AP-NANTES');
      expect(reponse.body.donnees[0].distanceKm).toBeLessThan(2);
      expect(reponse.body.donnees[0].distanceApprochee).toBe(false);
    });

    it('construit les menus sur les annonces reellement en ligne', async () => {
      const reponse = await avec(app, candidat).get('/api/offres/annonces/options').expect(200);

      expect(reponse.body.total).toBe(2);
      expect(reponse.body.departements).toEqual([
        { code: '13', annonces: 1 },
        { code: '44', annonces: 1 },
      ]);
      expect(reponse.body.metiers.map((m: { romeCode: string }) => m.romeCode).sort()).toEqual([
        'J1501',
        'K1304',
      ]);
    });

    it('ne sert plus une annonce retiree chez la source', async () => {
      await prisma.offreCollectee.update({
        where: { id: 'AP-MARSEILLE' },
        data: { statut: 'EXPIREE', expireeLe: new Date() },
      });

      await avec(app, candidat).get('/api/offres/annonces/AP-MARSEILLE').expect(404);

      const liste = await avec(app, candidat).get('/api/offres/annonces').expect(200);

      expect(liste.body.total).toBe(1);
    });
  });
});
