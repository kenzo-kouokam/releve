import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { UsageJeton } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ce qu'un jeton consomme rend a l'appelant. */
export interface JetonResolu {
  utilisateurId: string;
  email: string;
}

@Injectable()
export class JetonsUsageUniqueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La base ne voit qu'une empreinte, jamais la valeur.
   *
   * Meme regle que les jetons de rafraichissement : ces liens ouvrent une
   * session ou changent un mot de passe, donc une fuite de la table ne doit
   * donner a personne de quoi les rejouer.
   */
  private empreinte(valeur: string): string {
    return createHash('sha256').update(valeur).digest('hex');
  }

  /**
   * Emet un lien, et consomme ceux du meme usage encore en vie.
   *
   * L'invalidation des precedents n'est pas une commodite : sans elle, chaque
   * demande de renvoi laisse derriere elle un lien utilisable pour toute sa
   * duree de vie, et il suffit qu'un seul ait ete intercepte. Bornee a l'usage
   * demande — reinitialiser son mot de passe ne doit pas annuler une
   * confirmation d'adresse en attente, qui repond a une autre question.
   */
  async emettre(
    utilisateurId: string,
    email: string,
    usage: UsageJeton,
    dureeHeures: number,
  ): Promise<string> {
    const valeur = randomBytes(32).toString('base64url');
    const maintenant = new Date();

    await this.prisma.$transaction([
      this.prisma.jetonUsageUnique.updateMany({
        where: { utilisateurId, usage, consommeLe: null },
        data: { consommeLe: maintenant },
      }),
      this.prisma.jetonUsageUnique.create({
        data: {
          utilisateurId,
          usage,
          email,
          empreinte: this.empreinte(valeur),
          expireLe: new Date(maintenant.getTime() + dureeHeures * 3600 * 1000),
        },
      }),
    ]);

    return valeur;
  }

  /**
   * Consomme un jeton, ou rend `null` sans dire pourquoi.
   *
   * Inconnu, deja utilise, perime, emis pour un autre usage, ou emis pour une
   * adresse qui a change depuis : un seul resultat pour tous ces cas. Les
   * distinguer apprendrait a qui tatonne qu'une valeur a existe, et ne
   * changerait rien pour la personne de bonne foi — la marche a suivre est la
   * meme dans tous les cas, demander un nouveau lien.
   *
   * L'`updateMany` conditionne sur `consommeLe: null` : deux requetes parties
   * en meme temps avec le meme jeton ne peuvent pas reussir toutes les deux,
   * c'est la base qui tranche et non l'ordre de lecture.
   */
  async consommer(valeur: string, usage: UsageJeton): Promise<JetonResolu | null> {
    const jeton = await this.retrouver(valeur, usage);

    if (!jeton) {
      return null;
    }

    const consommation = await this.prisma.jetonUsageUnique.updateMany({
      where: { id: jeton.id, consommeLe: null },
      data: { consommeLe: new Date() },
    });

    if (consommation.count === 0) {
      return null;
    }

    return { utilisateurId: jeton.utilisateurId, email: jeton.email };
  }

  /**
   * Resout un jeton sans le consommer.
   *
   * Necessaire quand la page doit montrer quelque chose avant que la personne
   * tranche — le dossier qu'elle s'apprete a garder ou a effacer. Consommer des
   * l'affichage brulerait la decision de quelqu'un dont le client de
   * messagerie precharge les liens, et qui n'a encore rien lu.
   *
   * Memes refus que `consommer`, et le meme silence sur leur cause.
   */
  async resoudre(valeur: string, usage: UsageJeton): Promise<JetonResolu | null> {
    const jeton = await this.retrouver(valeur, usage);

    return jeton ? { utilisateurId: jeton.utilisateurId, email: jeton.email } : null;
  }

  /** Les controles communs a la resolution et a la consommation. */
  private async retrouver(
    valeur: string,
    usage: UsageJeton,
  ): Promise<{ id: string; utilisateurId: string; email: string } | null> {
    const jeton = await this.prisma.jetonUsageUnique.findUnique({
      where: { empreinte: this.empreinte(valeur) },
      include: { utilisateur: { select: { email: true, actif: true } } },
    });

    if (
      !jeton ||
      jeton.usage !== usage ||
      jeton.consommeLe ||
      jeton.expireLe < new Date() ||
      !jeton.utilisateur.actif ||
      // L'adresse a change entre l'emission et le clic : le lien accorderait
      // sinon sur une adresse ce qui a ete prouve sur une autre.
      jeton.email !== jeton.utilisateur.email
    ) {
      return null;
    }

    return { id: jeton.id, utilisateurId: jeton.utilisateurId, email: jeton.email };
  }
}
