import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { chiffrer, dechiffrer, estChiffre, lireCle } from './coffre';

/**
 * Ecriture et lecture des pieces justificatives sur disque.
 *
 * Deliberement reduit a quatre methodes et a aucune connaissance du metier :
 * c'est la seule classe a remplacer le jour ou les fichiers partiront vers un
 * stockage objet. Rien d'autre dans le code ne sait ou vivent les binaires.
 *
 * Trois regles tiennent la surface d'attaque fermee :
 *
 * 1. Le nom sur disque est un UUID genere ici, jamais celui televerse. Un nom
 *    d'origine se promene avec des separateurs, des accents et parfois `..` ;
 *    s'en servir reviendrait a laisser l'appelant choisir ou ecrire.
 * 2. Les fichiers sont ranges par deux caracteres de prefixe. Quelques milliers
 *    d'entrees dans un seul dossier rendent l'exploration penible, sur tous les
 *    systemes de fichiers.
 * 3. La racine n'est jamais servie statiquement. Un document ne sort que par
 *    une route authentifiee qui verifie a qui il appartient.
 *
 * Ces trois-la protegent l'acces **par l'application**. La quatrieme protege
 * l'acces **au disque** : le contenu est chiffre en AES-256-GCM avant d'etre
 * ecrit, et seule cette classe le voit en clair. Voir `coffre.ts` pour le
 * format de l'enveloppe et le sort des fichiers anterieurs.
 */
@Injectable()
export class StockageService {
  private readonly logger = new Logger(StockageService.name);

  /** Racine du stockage, resolue une fois pour toutes au demarrage. */
  private readonly racine = resolve(
    process.env.STOCKAGE_DOCUMENTS ?? join(process.cwd(), 'donnees', 'documents'),
  );

  /**
   * Cle de chiffrement, lue une fois au demarrage.
   *
   * Lue ici et pas a chaque ecriture : une cle absente ou mal formee doit
   * empecher l'application de demarrer, pas faire echouer le premier depot d'un
   * candidat trois semaines plus tard. Le meme parti que pour `JWT_SECRET`.
   */
  private readonly cle = lireCle(process.env.STOCKAGE_CLE);

  /** Chemin absolu d'une reference, verifie comme etant sous la racine. */
  private absolu(reference: string): string {
    const chemin = resolve(this.racine, reference);

    // Ceinture et bretelles : les references sont generees ici, mais une
    // reference lue en base a pu etre alteree autrement que par ce code.
    if (chemin !== this.racine && !chemin.startsWith(this.racine + sep)) {
      throw new Error('Reference de document hors du stockage');
    }

    return chemin;
  }

  /**
   * Ecrit le contenu et rend sa reference et son empreinte.
   *
   * L'empreinte est calculee ici parce que le contenu y est deja en memoire :
   * la recalculer plus tard supposerait de relire le fichier.
   */
  async ecrire(contenu: Buffer): Promise<{ reference: string; empreinte: string }> {
    const identifiant = randomUUID();
    const reference = join(identifiant.slice(0, 2), identifiant);
    const chemin = this.absolu(reference);

    await mkdir(dirname(chemin), { recursive: true });
    await writeFile(chemin, chiffrer(contenu, this.cle), { flag: 'wx' });

    return {
      reference: reference.split('\\').join('/'),
      // Empreinte du contenu **en clair**, et c'est important : chiffree, elle
      // changerait a chaque ecriture du meme fichier — le vecteur
      // d'initialisation est tire au hasard — et cesserait de pouvoir constater
      // qu'un document n'a pas bouge ou qu'il fait doublon.
      empreinte: createHash('sha256').update(contenu).digest('hex'),
    };
  }

  async lire(reference: string): Promise<Buffer> {
    return dechiffrer(await readFile(this.absolu(reference)), this.cle);
  }

  /**
   * Efface le fichier. Une reference deja absente n'est pas une erreur : le
   * resultat voulu — plus de fichier — est atteint, et faire echouer la
   * suppression d'une ligne parce que son binaire manque deja laisserait la
   * base dans un etat pire.
   */
  async effacer(reference: string): Promise<void> {
    try {
      await rm(this.absolu(reference), { force: true });
    } catch (cause) {
      this.logger.warn(`Suppression impossible pour ${reference} : ${String(cause)}`);
    }
  }

  /**
   * Reprend les fichiers deposes avant le chiffrement.
   *
   * Parcourt le stockage plutot que la base : ce qui compte ici est ce qui
   * traine **sur le disque**, y compris un binaire dont la ligne aurait disparu.
   * C'est precisement ce qu'une fuite exposerait.
   *
   * Chaque fichier est reecrit a cote puis renomme par-dessus. L'ecriture
   * directe serait plus courte et laisserait, en cas de coupure au mauvais
   * moment, un fichier a moitie chiffre — donc definitivement illisible.
   */
  async chiffrerLExistant(): Promise<{ examines: number; chiffres: number; echecs: number }> {
    const rapport = { examines: 0, chiffres: 0, echecs: 0 };
    const aVoir = [this.racine];

    while (aVoir.length > 0) {
      const dossier = aVoir.pop()!;
      let entrees;

      try {
        entrees = await readdir(dossier, { withFileTypes: true });
      } catch {
        // Stockage jamais utilise : rien a reprendre, et ce n'est pas une panne.
        continue;
      }

      for (const entree of entrees) {
        const chemin = join(dossier, entree.name);

        if (entree.isDirectory()) {
          aVoir.push(chemin);
          continue;
        }

        // Les fichiers temporaires d'une reprise interrompue : on les efface au
        // lieu de les chiffrer, ce qui produirait un doublon indechiffrable.
        if (entree.name.endsWith('.tmp')) {
          await rm(chemin, { force: true });
          continue;
        }

        rapport.examines += 1;

        try {
          const contenu = await readFile(chemin);

          if (estChiffre(contenu)) {
            continue;
          }

          const provisoire = `${chemin}.tmp`;

          await writeFile(provisoire, chiffrer(contenu, this.cle));
          await rm(chemin, { force: true });
          await rename(provisoire, chemin);

          rapport.chiffres += 1;
        } catch (cause) {
          rapport.echecs += 1;
          this.logger.error(
            `Chiffrement impossible pour ${relative(this.racine, chemin)} : ${String(cause)}`,
          );
        }
      }
    }

    return rapport;
  }

  /** Nombre de fichiers encore en clair, sans rien modifier. */
  async compterEnClair(): Promise<number> {
    let enClair = 0;
    const aVoir = [this.racine];

    while (aVoir.length > 0) {
      const dossier = aVoir.pop()!;
      let entrees;

      try {
        entrees = await readdir(dossier, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entree of entrees) {
        const chemin = join(dossier, entree.name);

        if (entree.isDirectory()) {
          aVoir.push(chemin);
          continue;
        }

        const infos = await stat(chemin).catch(() => null);

        if (infos?.isFile() && !estChiffre(await readFile(chemin))) {
          enClair += 1;
        }
      }
    }

    return enClair;
  }
}
