import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Command } from 'commander';
import {
  DELAI_REPONSE_JOURS,
  DUREE_CONSERVATION_MOIS,
  typeDocumentSchema,
  TYPES_DOCUMENT,
} from '@releve/shared';
import { readFile, writeFile } from 'node:fs/promises';
import { AppModule } from '../app.module';
import { FranceTravailClient } from '../donnees-publiques/france-travail.client';
import { GeocodageOffresService } from '../donnees-publiques/geocodage-offres.service';
import { OffresService, ROMES_SECTEUR } from '../donnees-publiques/offres.service';
import { ConservationService } from '../documents/conservation.service';
import { NotificationsMissionsService } from '../notifications/notifications-missions.service';
import { DocumentsService } from '../documents/documents.service';
import { GeocodageService } from '../geocodage/geocodage.service';

/**
 * Outillage en ligne de commande de la chaine de donnees publiques.
 *
 * Le contexte Nest est demarre sans serveur HTTP : la CLI reutilise exactement
 * les services de l'API — meme client, meme nettoyage, meme ecriture. Une
 * commande qui aurait sa propre copie du nettoyage finirait par en diverger,
 * et c'est le barometre qui deviendrait faux.
 */
async function contexte() {
  return NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
}

function listeDepuis(valeur: string): string[] {
  return valeur
    .split(',')
    .map((element) => element.trim().toUpperCase())
    .filter(Boolean);
}

function afficherRapport(rapport: {
  source: string;
  recues: number;
  ecartees: number;
  doublons: number;
  sansDepartement: number;
  sansSalaire: number;
  enregistrees: number;
  expirees: number;
  simulation: boolean;
  offres: { tauxHoraire: number | null }[];
}): void {
  const exploitables = rapport.offres.length - rapport.sansSalaire;

  console.log('');
  console.log(`Source                     ${rapport.source}`);
  console.log(`Offres recues              ${rapport.recues}`);
  console.log(`Ecartees (inexploitables)  ${rapport.ecartees}`);
  console.log(`Retenues                   ${rapport.offres.length}`);
  console.log(`  dont salaire exploitable ${exploitables}`);
  console.log(`  dont sans salaire        ${rapport.sansSalaire}`);
  console.log(`  dont lieu non situable   ${rapport.sansDepartement}`);
  // Republiees et non fusionnees : la licence demande de restituer le
  // catalogue. C'est le barometre qui les dedoublonne, au calcul.
  console.log(`Republications reperees    ${rapport.doublons}`);
  console.log(
    rapport.simulation
      ? 'Simulation : rien n a ete ecrit en base.'
      : `Enregistrees en base       ${rapport.enregistrees}`,
  );

  if (!rapport.simulation) {
    console.log(`Expirees (retirees source) ${rapport.expirees}`);
  }

  console.log('');
}

const programme = new Command();

programme
  .name('releve')
  .description('Outils de collecte et de nettoyage des donnees publiques')
  .version('0.1.0');

programme
  .command('importer:offres')
  .description("Collecte les offres d'interim du secteur, les nettoie et les enregistre")
  .option('--rome <codes>', 'codes ROME separes par des virgules', listeDepuis, [...ROMES_SECTEUR])
  .option('--departement <codes>', 'departements separes par des virgules', listeDepuis)
  .option('--jours <n>', 'ne prendre que les offres creees depuis N jours', Number, 30)
  .option('--max <n>', "plafond d'offres a rapatrier", Number, 600)
  .option('--fichier <chemin>', "importer depuis un instantane local au lieu de l'API")
  .option('--sec', 'tout preparer et compter, sans rien ecrire en base', false)
  /**
   * Expirer, c'est retirer du site les offres que le balayage n'a pas revues.
   * La licence de reutilisation l'impose, mais le faire depuis un import
   * partiel effacerait le catalogue : l'option reste donc explicite, et le
   * service refuse de toute facon d'expirer sur un balayage trop court.
   */
  .option(
    '--expirer',
    'retirer les offres disparues de la source (reserve a un balayage complet)',
    false,
  )
  .action(async (options) => {
    const app = await contexte();
    const offres = app.get(OffresService);

    try {
      const rapport = options.fichier
        ? await offres.importerDepuisFichier(await readFile(options.fichier, 'utf8'), options.sec)
        : await offres.importerDepuisApi(
            {
              romes: options.rome,
              departements: options.departement,
              jours: options.jours,
              max: options.max,
            },
            options.sec,
            options.expirer,
          );

      afficherRapport(rapport);
    } finally {
      await app.close();
    }
  });

programme
  .command('exporter:offres')
  .description('Enregistre un instantane brut de l API, rejouable hors ligne')
  .option('--rome <codes>', 'codes ROME separes par des virgules', listeDepuis, [...ROMES_SECTEUR])
  .option('--departement <codes>', 'departements separes par des virgules', listeDepuis)
  .option('--jours <n>', 'ne prendre que les offres creees depuis N jours', Number, 30)
  .option('--max <n>', "plafond d'offres a rapatrier", Number, 600)
  .requiredOption('--sortie <chemin>', 'fichier JSON a ecrire')
  .action(async (options) => {
    const app = await contexte();
    const client = app.get(FranceTravailClient);

    try {
      const brutes = await client.rechercher({
        romes: options.rome,
        departements: options.departement,
        jours: options.jours,
        max: options.max,
      });

      await writeFile(options.sortie, JSON.stringify({ resultats: brutes }, null, 2), 'utf8');
      console.log(`\n${brutes.length} offres brutes ecrites dans ${options.sortie}\n`);
    } finally {
      await app.close();
    }
  });

programme
  .command('barometre')
  .description('Affiche le barometre de tension calcule a partir des offres collectees')
  .option('--jours <n>', 'periode observee', Number, 30)
  .option('--departement <code>', 'restreindre a un departement')
  .action(async (options) => {
    const app = await contexte();
    const offres = app.get(OffresService);

    try {
      const barometre = await offres.barometre(options.jours, options.departement);

      console.log('');
      console.log(
        `Barometre sur ${barometre.periodeJours} jours` +
          (barometre.depuisLeCache ? ' (depuis le cache Redis)' : ''),
      );
      console.log('');
      console.log('ROME   Dept  Offres  Postes  Median   Fourchette      Exp.  Sans salaire');

      for (const metier of barometre.metiers) {
        const median = metier.tauxHoraireMedian?.toFixed(2).padStart(6) ?? '     —';
        const fourchette =
          metier.tauxHoraireMin && metier.tauxHoraireMax
            ? `${metier.tauxHoraireMin.toFixed(2)} - ${metier.tauxHoraireMax.toFixed(2)}`
            : '—';

        console.log(
          `${metier.romeCode.padEnd(6)} ${metier.departement.padEnd(5)} ` +
            `${String(metier.offres).padStart(6)}  ${String(metier.postes).padStart(6)}  ` +
            `${median}  ${fourchette.padEnd(15)} ${String(metier.partExperienceExigee).padStart(3)}%  ` +
            `${metier.offresSansSalaire}`,
        );
      }

      console.log('');
    } finally {
      await app.close();
    }
  });

programme
  .command('geocoder')
  .description('Situe les candidats et les lieux d intervention restes sans coordonnees')
  .option('--limite <n>', 'nombre maximum de fiches reprises par table', Number, 500)
  .option('--pause <ms>', 'attente entre deux appels a la BAN', Number, 50)
  .action(async (options) => {
    const app = await contexte();
    const geocodage = app.get(GeocodageService);

    try {
      if (!geocodage.estActif()) {
        console.log('GEOCODAGE_ACTIF=false : rien a faire.');

        return;
      }

      const rapport = await geocodage.rattraper(options.limite, options.pause);

      console.log('');
      console.log(`Fiches examinees  ${rapport.examines}`);
      console.log(`Situees           ${rapport.situes}`);
      console.log(`Restees sans point ${rapport.echecs}`);
      console.log('');

      if (rapport.echecs > 0) {
        // Une adresse qui resiste au geocodage est presque toujours une adresse
        // mal saisie, pas une panne : c'est a l'agence de la reprendre avec la
        // personne, et l'afficher ici est le seul endroit ou elle le verra.
        console.log('Les adresses restantes sont a corriger a la main : voir les avertissements.');
      }
    } finally {
      await app.close();
    }
  });

programme
  .command('purger:documents')
  .description('Efface les pieces justificatives d un type au-dela d un age donne')
  .requiredOption('--type <type>', 'NIR, DIPLOME, CV, PIECE_IDENTITE ou RIB')
  .requiredOption('--jours <n>', 'age minimum du depot, en jours', Number)
  .option('--sec', 'montre ce qui serait supprime, sans rien ecrire', false)
  .action(async (options) => {
    // Type et age sont exiges : une purge qui se declencherait sur des valeurs
    // par defaut est une perte de donnees qui attend son heure.
    const type = typeDocumentSchema.safeParse(String(options.type).toUpperCase());

    if (!type.success) {
      console.log(`Type inconnu. Attendus : ${TYPES_DOCUMENT.join(', ')}`);
      process.exitCode = 1;

      return;
    }

    if (!Number.isFinite(options.jours) || options.jours < 1) {
      console.log('--jours doit etre un nombre de jours positif.');
      process.exitCode = 1;

      return;
    }

    const app = await contexte();
    const documents = app.get(DocumentsService);

    try {
      const rapport = await documents.purger(type.data, options.jours, options.sec === true);

      console.log('');
      console.log(`Type                ${type.data}`);
      console.log(`Deposees avant le   ${rapport.avant.toISOString().slice(0, 10)}`);
      console.log(`Concernees          ${rapport.concernees}`);
      console.log(`Supprimees          ${rapport.supprimees}`);
      console.log(options.sec ? 'Simulation : rien n a ete ecrit.' : '');
      console.log('');
    } finally {
      await app.close();
    }
  });

/**
 * Les deux temps de la conservation, en deux commandes distinctes.
 *
 * Separees volontairement : la premiere ecrit a des gens, la seconde efface des
 * fichiers. Les fondre en une seule ferait qu'un ordonnanceur mal regle
 * declencherait les deux du meme mouvement, et que la relance du matin
 * effacerait ce qu'elle vient d'annoncer. Cadence attendue : une fois par jour
 * chacune.
 */
programme
  .command('conservation:relancer')
  .description(
    `Ecrit aux candidats dont des pieces atteignent ${DUREE_CONSERVATION_MOIS} mois, pour leur demander s il faut les garder`,
  )
  .option('--sec', 'montre qui serait relance, sans rien envoyer ni ecrire', false)
  .action(async (options) => {
    const app = await contexte();
    const conservation = app.get(ConservationService);

    try {
      const rapport = await conservation.relancer(options.sec === true);

      console.log('');
      console.log(`Dossiers relances   ${rapport.dossiers}`);
      console.log(`Pieces concernees   ${rapport.pieces}`);
      console.log(`Delai de reponse    ${DELAI_REPONSE_JOURS} jours`);
      console.log(options.sec ? 'Simulation : aucun courriel envoye, rien ecrit.' : '');
      console.log('');
    } finally {
      await app.close();
    }
  });

programme
  .command('conservation:purger')
  .description(
    `Efface les pieces restees sans reponse plus de ${DELAI_REPONSE_JOURS} jours apres la relance`,
  )
  .option('--sec', 'montre ce qui serait efface, sans rien ecrire', false)
  .action(async (options) => {
    const app = await contexte();
    const conservation = app.get(ConservationService);

    try {
      const rapport = await conservation.purgerSansReponse(options.sec === true);

      console.log('');
      console.log(`Dossiers concernes  ${rapport.dossiers}`);
      console.log(`Pieces effacees     ${rapport.pieces}`);
      console.log(options.sec ? 'Simulation : rien n a ete efface.' : '');
      console.log('');
    } finally {
      await app.close();
    }
  });

/**
 * Les missions correspondantes, annoncees une fois par jour.
 *
 * Pas au moment de la publication : une agence qui depose huit besoins dans
 * l'apres-midi ferait huit courriels a la meme personne, et c'est ainsi qu'on
 * se fait classer en indesirable. Un message par jour au plus, avec les
 * missions publiees depuis le precedent.
 */
programme
  .command('notifier:missions')
  .description('Annonce a chaque candidat actif les missions publiees qui lui correspondent')
  .option('--sec', 'montre qui serait averti, sans rien envoyer ni ecrire', false)
  .action(async (options) => {
    const app = await contexte();
    const notifications = app.get(NotificationsMissionsService);

    try {
      const rapport = await notifications.notifier(options.sec === true);

      console.log('');
      console.log(`Candidats examines  ${rapport.examines}`);
      console.log(`Candidats avertis   ${rapport.avertis}`);
      console.log(`Missions annoncees  ${rapport.missions}`);
      console.log(options.sec ? 'Simulation : aucun courriel envoye, rien ecrit.' : '');
      console.log('');
    } finally {
      await app.close();
    }
  });

/**
 * Rattrapage geographique des offres collectees.
 *
 * France Travail ne geolocalise qu'une annonce sur sept : sur un import reel de
 * 2 020 offres, 295 seulement portaient des coordonnees. Les autres ont
 * pourtant leur commune et leur code postal, et la Base Adresse Nationale sait
 * les situer gratuitement.
 *
 * Le travail se fait par commune, pas par offre : les 1 725 annonces non
 * situees ne representent que 1 040 couples code postal / commune distincts. Le
 * rattrapage initial prend donc environ une minute, et les balayages suivants
 * n'ont plus que quelques communes nouvelles a traiter — l'import planifie les
 * prend lui-meme au passage.
 */
programme
  .command('geocoder:offres')
  .description('Situe les offres collectees a partir de leur commune, via la BAN')
  .option('--max <n>', 'plafond de communes a situer en une passe', Number, 400)
  .action(async (options) => {
    const app = await contexte();
    const geocodage = app.get(GeocodageOffresService);

    try {
      const avant = await geocodage.couverture();
      const rapport = await geocodage.rattraper(options.max);
      const apres = await geocodage.couverture();

      console.log('');
      console.log(`Communes examinees     ${rapport.communesExaminees}`);
      console.log(`  situees              ${rapport.communesSituees}`);
      console.log(`  introuvables         ${rapport.communesIntrouvables}`);
      console.log(`Offres situees         ${rapport.offresSituees}`);
      console.log(
        `Couverture             ${avant.situees}/${avant.total} (${avant.part} %) ` +
          `-> ${apres.situees}/${apres.total} (${apres.part} %)`,
      );

      if (rapport.communesExaminees === options.max) {
        console.log('');
        console.log('Plafond atteint : relancer la commande pour continuer.');
      }

      console.log('');
    } finally {
      await app.close();
    }
  });

programme.parseAsync(process.argv).catch((erreur: unknown) => {
  new Logger('CLI').error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
});
