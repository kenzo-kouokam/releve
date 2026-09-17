import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

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
 */
@Injectable()
export class StockageService {
  private readonly logger = new Logger(StockageService.name);

  /** Racine du stockage, resolue une fois pour toutes au demarrage. */
  private readonly racine = resolve(
    process.env.STOCKAGE_DOCUMENTS ?? join(process.cwd(), 'donnees', 'documents'),
  );

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
    await writeFile(chemin, contenu, { flag: 'wx' });

    return {
      reference: reference.split('\\').join('/'),
      empreinte: createHash('sha256').update(contenu).digest('hex'),
    };
  }

  async lire(reference: string): Promise<Buffer> {
    return readFile(this.absolu(reference));
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
}
