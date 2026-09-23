import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Chiffrement des pieces justificatives au repos.
 *
 * Pourquoi ici et pas ailleurs : les sept barrieres qui entourent deja un
 * document — nom de fichier opaque, racine jamais servie statiquement, route
 * authentifiee qui verifie l'appartenance — protegent l'acces **par
 * l'application**. Aucune ne protege l'acces **au disque**. Une sauvegarde
 * oubliee, un serveur compromis, un disque mal efface, et une carte d'identite
 * se lit en l'ouvrant. C'est exactement la situation que vise l'article 32 du
 * RGPD, et ici la nature des pieces la justifie : NIR, piece d'identite, RIB.
 *
 * **AES-256-GCM** et non CBC : GCM authentifie en plus de chiffrer. Un fichier
 * altere sur le disque — un octet retourne, une troncature — est refuse au
 * dechiffrement au lieu de rendre des donnees fausses. Un chiffrement sans
 * authentification laisserait passer l'alteration en silence.
 *
 * Le module est volontairement une fonction pure, sans Nest ni systeme de
 * fichiers : le chiffrement se teste alors sans monter d'application ni ecrire
 * quoi que ce soit.
 */

/**
 * Marque de tete de l'enveloppe.
 *
 * Elle sert a **reconnaitre un fichier chiffre**, et donc a lire encore les
 * fichiers deposes avant que le chiffrement n'existe. Sans elle, activer le
 * chiffrement rendrait illisible tout ce qui avait ete depose la veille, ou
 * obligerait a une migration en une seule fois, serveur arrete.
 *
 * Huit octets ASCII qui ne peuvent pas commencer un fichier accepte : un PDF
 * commence par `%PDF`, un JPEG par `FF D8`, un PNG par `89 50 4E 47`. La
 * confusion est donc impossible dans les deux sens.
 */
const MARQUE = Buffer.from('RELEVE01', 'ascii');

/** GCM travaille avec un vecteur d'initialisation de 12 octets, et un tag de 16. */
const TAILLE_IV = 12;
const TAILLE_TAG = 16;

/** AES-256 : la cle fait 32 octets, soit 44 caracteres en base64. */
export const TAILLE_CLE = 32;

/**
 * Lit la cle depuis sa forme texte.
 *
 * Refus explicite plutot que valeur de repli : une cle absente ou trop courte
 * doit arreter le demarrage, comme `JWT_SECRET`. Se rabattre sur du clair
 * laisserait tourner la version dangereuse en croyant l'inverse — et personne
 * ne s'en apercevrait avant la fuite.
 */
export function lireCle(valeur: string | undefined): Buffer {
  if (!valeur) {
    throw new Error(
      'STOCKAGE_CLE est absent : en generer une avec `openssl rand -base64 32`',
    );
  }

  let cle: Buffer;

  try {
    cle = Buffer.from(valeur.trim(), 'base64');
  } catch {
    throw new Error('STOCKAGE_CLE n est pas du base64 valide');
  }

  if (cle.length !== TAILLE_CLE) {
    throw new Error(
      `STOCKAGE_CLE doit faire ${TAILLE_CLE} octets une fois decode (${cle.length} recus) : ` +
        'en generer une avec `openssl rand -base64 32`',
    );
  }

  return cle;
}

/**
 * Enveloppe : `MARQUE (8) | IV (12) | TAG (16) | chiffre`.
 *
 * Le vecteur d'initialisation est tire au hasard pour **chaque** fichier, et
 * range avec lui. Reutiliser un IV en GCM est la seule faute qui casse
 * reellement le mode : deux fichiers chiffres avec le meme couple cle/IV
 * laissent deduire leur difference. Il n'a pas a etre secret, seulement unique.
 */
export function chiffrer(contenu: Buffer, cle: Buffer): Buffer {
  const iv = randomBytes(TAILLE_IV);
  const chiffreur = createCipheriv('aes-256-gcm', cle, iv);
  const corps = Buffer.concat([chiffreur.update(contenu), chiffreur.final()]);

  return Buffer.concat([MARQUE, iv, chiffreur.getAuthTag(), corps]);
}

/** Vrai si le fichier porte l'enveloppe, faux s'il date d'avant le chiffrement. */
export function estChiffre(fichier: Buffer): boolean {
  return fichier.length >= MARQUE.length && fichier.subarray(0, MARQUE.length).equals(MARQUE);
}

/**
 * Rend le contenu en clair, ou laisse passer un fichier anterieur au
 * chiffrement.
 *
 * Le fichier non marque est rendu tel quel : c'est ce qui permet d'activer le
 * chiffrement sans interrompre le service, les anciens depots restant lisibles
 * jusqu'a leur reprise par `pnpm cli chiffrer:documents`. La contrepartie est
 * qu'un fichier en clair ne provoque aucune erreur — d'ou la commande, qui dit
 * combien il en reste.
 */
export function dechiffrer(fichier: Buffer, cle: Buffer): Buffer {
  if (!estChiffre(fichier)) {
    return fichier;
  }

  const debutTag = MARQUE.length + TAILLE_IV;
  const debutCorps = debutTag + TAILLE_TAG;

  if (fichier.length < debutCorps) {
    throw new Error('Fichier chiffre tronque : enveloppe incomplete');
  }

  const dechiffreur = createDecipheriv(
    'aes-256-gcm',
    cle,
    fichier.subarray(MARQUE.length, debutTag),
  );

  dechiffreur.setAuthTag(fichier.subarray(debutTag, debutCorps));

  // `final()` leve si le tag ne correspond pas : fichier altere, tronque, ou
  // chiffre avec une autre cle. On laisse remonter — rendre un contenu douteux
  // serait pire que l'erreur.
  return Buffer.concat([dechiffreur.update(fichier.subarray(debutCorps)), dechiffreur.final()]);
}
