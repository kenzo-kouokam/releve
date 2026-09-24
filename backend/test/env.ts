import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vitest s'execute depuis la racine du paquet (backend) : le .env y est.
const RACINE = process.cwd();

/**
 * Charge backend/.env sans passer par dotenv, qui n'est pas une dependance
 * directe de ce paquet. Les variables deja definies gagnent, comme le fait
 * ConfigModule : c'est ce qui permet de forcer DATABASE_URL en integration.
 */
function chargerEnv(): void {
  let contenu: string;

  try {
    contenu = readFileSync(join(RACINE, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const ligne of contenu.split(/\r?\n/)) {
    const correspondance = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);

    if (!correspondance) {
      continue;
    }

    const [, cle, brut] = correspondance;
    const valeur = brut!.trim().replace(/^["']|["']$/g, '');

    process.env[cle!] ??= valeur;
  }
}

chargerEnv();

/**
 * Bascule la connexion vers une base de test dediee.
 *
 * Les tests d'integration tapent une vraie base : c'est le seul moyen de
 * verifier le cloisonnement multi-agence, qui vit dans les clauses `where` de
 * Prisma et qu'un bouchon ne prouverait pas. Elle est separee de celle de
 * developpement, qu'on ne veut pas voir vider a chaque execution.
 */
export const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  (process.env.DATABASE_URL ?? '').replace(/\/([^/?]+)(\?|$)/, '/passerelle_test$2');

process.env.DATABASE_URL = URL_TEST;

/**
 * Aucun SMTP en test, meme si le .env local en declare un.
 *
 * Sans cette ligne, une suite lancee sur un poste ou Mailpit tourne enverrait
 * de vrais messages et laisserait la boite en memoire vide : les tests du
 * parcours de verification, qui relisent le courriel pour en extraire le lien,
 * echoueraient alors sur une machine et passeraient sur une autre.
 */
process.env.MAIL_HOST = '';

/**
 * Aucun appel a la Base Adresse Nationale depuis les tests.
 *
 * Chaque fiche enregistree declenche un geocodage : sans cette ligne, une suite
 * d'integration martelerait un service public gratuit a chaque execution, et
 * ses assertions dependraient de sa disponibilite. Les regles de lecture d'une
 * reponse BAN se verifient a part, sur un objet ecrit a la main
 * (`geocodage.spec.ts`).
 */
process.env.GEOCODAGE_ACTIF = 'false';

/**
 * Stockage des pieces justificatives isole, et jetable.
 *
 * Sans cette ligne les tests ecriraient dans le dossier de developpement et y
 * laisseraient des fichiers orphelins a chaque execution — des fichiers qui,
 * dans la vraie vie, contiennent une piece d'identite.
 */
process.env.STOCKAGE_DOCUMENTS = join(RACINE, 'donnees', 'documents-test');

/**
 * Aucun webhook emis depuis les tests.
 *
 * Meme raison que pour le SMTP : une suite lancee sur un poste qui fait tourner
 * n8n enverrait de vrais evenements dans des workflows reels. L'emetteur se met
 * alors en sourdine et retient les evenements en memoire, ce qui permet de
 * verifier ce qui *serait* parti sans que rien ne parte.
 */
process.env.N8N_EVENTS_WEBHOOK_URL = '';

/**
 * Jeton de service fixe, connu de la suite.
 *
 * Les routes internes repondent 503 tant qu'il est absent : sans cette ligne,
 * les tests verifieraient la fermeture par defaut et jamais le comportement
 * nominal.
 */
process.env.INTERNAL_SERVICE_TOKEN = 'jeton-de-service-de-test';
