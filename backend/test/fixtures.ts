import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { hacherMotDePasse } from '../src/auth/mots-de-passe';

export const MOT_DE_PASSE = 'MotDePasseDeTest2026';

export const prisma = new PrismaClient();

/**
 * Deux agences completes.
 *
 * Le jeu de donnees est volontairement symetrique : chaque assertion de
 * cloisonnement se verifie dans les deux sens, ce qui attrape les filtres poses
 * sur la mauvaise agence.
 */
export interface Jeu {
  agenceA: string;
  agenceB: string;
  adminA: string;
  chargeA: string;
  adminB: string;
  candidatA: string;
  candidatB: string;
  clientA: string;
  clientB: string;
  lieuA: string;
  qualification: string;
  compteCandidatA: string;
}

/**
 * Cree un compte connectable pour une suite qui a besoin d'un role absent du
 * jeu commun — un compte client, typiquement.
 *
 * Passe par cette fonction plutot que par `prisma.utilisateur.create` : c'est
 * ici qu'est pose `emailVerifieLe`, sans lequel la connexion repond 403. Un
 * compte cree a la main dans une suite retomberait dans ce piege.
 */
export async function creerCompteDeTest(
  email: string,
  role: 'ADMIN_AGENCE' | 'CHARGE_RECRUTEMENT' | 'CANDIDAT' | 'CLIENT',
  rattachement: Record<string, string>,
): Promise<string> {
  const compte = await prisma.utilisateur.create({
    data: {
      email,
      motDePasse: await hacherMotDePasse(MOT_DE_PASSE),
      role,
      emailVerifieLe: new Date(),
      ...rattachement,
    },
  });

  return compte.id;
}

export async function reinitialiser(): Promise<Jeu> {
  // TRUNCATE plutot qu'une cascade de delete : plus rapide, et remet les
  // sequences a zero, donc deux executions partent du meme etat.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      jeton_rafraichissement, jeton_usage_unique, utilisateur,
      qualification_candidat, experience_professionnelle, disponibilite,
      indisponibilite, proposition, contrat, releve_heures, evenement_mission,
      mission, facture, lieu_intervention, client, candidat, qualification, agence,
      commune_geocodee
    RESTART IDENTITY CASCADE
  `);

  const empreinte = await hacherMotDePasse(MOT_DE_PASSE);

  const agenceA = await prisma.agence.create({ data: { nom: 'Agence A', ville: 'Nantes' } });
  const agenceB = await prisma.agence.create({ data: { nom: 'Agence B', ville: 'Rennes' } });

  const qualification = await prisma.qualification.create({
    // `romeCode` est le pont entre une qualification Releve et les offres
    // collectees sur France Travail : c'est lui qui porte le taux median du
    // marche et les suggestions faites au candidat. Le seed de production le
    // pose ; l'omettre ici ferait passer pour « aucun metier renseigne » un
    // candidat parfaitement qualifie.
    data: { code: 'DEAS', libelle: "Diplome d'Etat d'aide-soignant", romeCode: 'J1501' },
  });

  const candidatA = await prisma.candidat.create({
    data: {
      agenceId: agenceA.id,
      nom: 'Aubry',
      prenom: 'Alice',
      email: 'alice.aubry@test.example',
      telephone: '0612340001',
      adresse: '1 rue A',
      codePostal: '44000',
      ville: 'Nantes',
      // Coordonnees posees d'office : en production elles viennent du
      // geocodage, qui est coupe en test. Sans elles, chaque fiche serait
      // ecartee pour « coordonnees manquantes » — un motif exact, mais qui
      // masquerait tous les autres et ne testerait plus rien.
      latitude: 47.2184,
      longitude: -1.5536,
      statut: 'ACTIF',
    },
  });

  const candidatB = await prisma.candidat.create({
    data: {
      agenceId: agenceB.id,
      nom: 'Bernard',
      prenom: 'Bruno',
      email: 'bruno.bernard@test.example',
      telephone: '0612340002',
      adresse: '1 rue B',
      codePostal: '35000',
      ville: 'Rennes',
      latitude: 48.1173,
      longitude: -1.6778,
      statut: 'ACTIF',
    },
  });

  const clientA = await prisma.client.create({
    data: {
      agenceId: agenceA.id,
      raisonSociale: 'SAAD A',
      siret: '48291736500017',
      type: 'SAAD',
      lieux: {
        create: [
          {
            type: 'DOMICILE_BENEFICIAIRE',
            libelle: 'Domicile A',
            adresse: '2 rue A',
            codePostal: '44000',
            ville: 'Nantes',
            // A quelques centaines de metres du domicile de la candidate A :
            // la distance ne brouille aucune assertion, et les suites qui
            // testent le rayon la deplacent elles-memes.
            latitude: 47.2201,
            longitude: -1.5521,
          },
        ],
      },
    },
    include: { lieux: true },
  });

  const clientB = await prisma.client.create({
    data: {
      agenceId: agenceB.id,
      raisonSociale: 'SAAD B',
      siret: '73282932000074',
      type: 'SAAD',
    },
  });

  const creerCompte = async (
    email: string,
    role: 'ADMIN_AGENCE' | 'CHARGE_RECRUTEMENT' | 'CANDIDAT',
    rattachement: Record<string, string>,
  ): Promise<string> => {
    const compte = await prisma.utilisateur.create({
      // Adresse marquee confirmee : ces comptes naissent d'un seed, pas du site
      // public. La confirmation ne prouve que la possession de l'adresse par
      // celui qui s'inscrit — elle n'a pas de sens pour un compte cree ici, et
      // l'exiger rendrait toutes les suites inconnectables. Le parcours reel,
      // avec son lien, a sa propre suite (verification-email.spec.ts).
      data: {
        email,
        motDePasse: empreinte,
        role,
        emailVerifieLe: new Date(),
        ...rattachement,
      },
    });

    return compte.id;
  };

  return {
    agenceA: agenceA.id,
    agenceB: agenceB.id,
    adminA: await creerCompte('admin.a@test.example', 'ADMIN_AGENCE', { agenceId: agenceA.id }),
    chargeA: await creerCompte('charge.a@test.example', 'CHARGE_RECRUTEMENT', {
      agenceId: agenceA.id,
    }),
    adminB: await creerCompte('admin.b@test.example', 'ADMIN_AGENCE', { agenceId: agenceB.id }),
    compteCandidatA: await creerCompte('candidat.a@test.example', 'CANDIDAT', {
      candidatId: candidatA.id,
    }),
    candidatA: candidatA.id,
    candidatB: candidatB.id,
    clientA: clientA.id,
    clientB: clientB.id,
    lieuA: clientA.lieux[0]!.id,
    qualification: qualification.id,
  };
}

/**
 * Application de test, sans limitation de debit.
 *
 * Le throttler est neutralise ici : il compte les appels par adresse, et une
 * suite en ferait des dizaines depuis la meme. Il a sa propre suite, qui le
 * laisse actif.
 */
export async function creerApp(avecThrottler = false): Promise<INestApplication> {
  // `skipIf` relit la variable a chaque requete : les suites s'executent en
  // serie, la valeur posee ici vaut donc pour toute la suite en cours.
  process.env.THROTTLE_ACTIF = avecThrottler ? 'true' : 'false';

  const app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  return app;
}
