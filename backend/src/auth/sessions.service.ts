import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface JetonEmis {
  valeur: string;
  expireDans: number;
}

/**
 * Fenetre pendant laquelle un jeton deja echange reste acceptable.
 *
 * Un chargement de page lance plusieurs requetes : celle qui arrive juste apres
 * la rotation porte encore l'ancien jeton sans que personne ne l'ait vole. Sans
 * ce sursis, la rotation deconnecterait les utilisateurs a chaque rafale. Au
 * dela, le rejeu redevient ce qu'il est : le signe d'un vol.
 */
const SURSIS_REJEU_MS = 30_000;

/**
 * Sessions revocables.
 *
 * Le jeton d'acces est un JWT : rapide a verifier, mais impossible a annuler
 * avant son expiration. Le jeton de rafraichissement compense - il est opaque,
 * stocke sous forme d'empreinte, et a usage unique. Couper une session revient
 * donc a revoquer sa chaine de rafraichissement : l'acces s'eteint au plus tard
 * a l'expiration du JWT en cours, et ne peut plus etre prolonge.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly dureeSecondes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.dureeSecondes = Number(config.get<string>('REFRESH_EXPIRES_SECONDS') ?? 12 * 3600);
  }

  /**
   * SHA-256 et non Argon2 : la valeur est deja 256 bits d'aleatoire, il n'y a
   * rien a deviner par force brute. Un hachage lent ne protegerait de rien et
   * couterait a chaque rafraichissement.
   */
  private empreinte(valeur: string): string {
    return createHash('sha256').update(valeur).digest('hex');
  }

  async ouvrir(utilisateurId: string): Promise<JetonEmis> {
    return this.emettre(utilisateurId, randomUUID());
  }

  private async emettre(utilisateurId: string, familleId: string): Promise<JetonEmis> {
    const valeur = randomBytes(32).toString('base64url');

    await this.prisma.jetonRafraichissement.create({
      data: {
        utilisateurId,
        familleId,
        empreinte: this.empreinte(valeur),
        expireLe: new Date(Date.now() + this.dureeSecondes * 1000),
      },
    });

    return { valeur, expireDans: this.dureeSecondes };
  }

  /**
   * Consomme un jeton et en emet un successeur.
   *
   * Rejouer un jeton deja utilise n'arrive pas par accident : soit il a ete
   * vole, soit le vrai porteur a ete devance. Dans le doute on revoque toute la
   * famille, ce qui deconnecte le voleur comme la victime - c'est le
   * comportement voulu, la victime se reconnecte avec son mot de passe.
   */
  async rafraichir(valeur: string): Promise<{ utilisateurId: string; jeton: JetonEmis }> {
    const enregistre = await this.prisma.jetonRafraichissement.findUnique({
      where: { empreinte: this.empreinte(valeur) },
      include: { utilisateur: { select: { actif: true } } },
    });

    if (!enregistre) {
      throw new UnauthorizedException('Session inconnue');
    }

    if (enregistre.revoqueLe) {
      throw new UnauthorizedException('Session expiree');
    }

    if (enregistre.utiliseLe) {
      const age = Date.now() - enregistre.utiliseLe.getTime();

      if (age > SURSIS_REJEU_MS) {
        this.logger.warn(
          `Rejeu d un jeton de rafraichissement (famille ${enregistre.familleId}) : la session est coupee`,
        );
        await this.revoquerFamille(enregistre.familleId);
        throw new UnauthorizedException('Session compromise, reconnexion necessaire');
      }

      // Dans le sursis : requete concurrente, pas attaque. On emet un jeton de
      // plus dans la meme famille plutot que de refuser.
      this.logger.debug(`Rafraichissement concurrent tolere (famille ${enregistre.familleId})`);
    }

    if (enregistre.expireLe <= new Date()) {
      throw new UnauthorizedException('Session expiree');
    }

    if (!enregistre.utilisateur.actif) {
      throw new UnauthorizedException('Compte desactive');
    }

    const successeur = await this.emettre(enregistre.utilisateurId, enregistre.familleId);

    const nouveau = await this.prisma.jetonRafraichissement.findUniqueOrThrow({
      where: { empreinte: this.empreinte(successeur.valeur) },
      select: { id: true },
    });

    await this.prisma.jetonRafraichissement.update({
      where: { id: enregistre.id },
      // `utiliseLe` n'est pose qu'au premier echange : le sursis se compte
      // depuis celui-ci, sinon une rafale le repousserait indefiniment.
      data: { utiliseLe: enregistre.utiliseLe ?? new Date(), remplacePar: nouveau.id },
    });

    return { utilisateurId: enregistre.utilisateurId, jeton: successeur };
  }

  /** Deconnexion : ne coupe que la session presentee, pas les autres appareils. */
  async fermer(valeur: string): Promise<void> {
    const enregistre = await this.prisma.jetonRafraichissement.findUnique({
      where: { empreinte: this.empreinte(valeur) },
      select: { familleId: true },
    });

    if (enregistre) {
      await this.revoquerFamille(enregistre.familleId);
    }
  }

  private async revoquerFamille(familleId: string): Promise<void> {
    await this.prisma.jetonRafraichissement.updateMany({
      where: { familleId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }

  /**
   * Coupe toutes les sessions d'un compte. Appele quand le mot de passe change
   * et quand un administrateur desactive le compte : sans cela, une session deja
   * ouverte survivrait a la mesure censee la fermer.
   */
  async revoquerTout(utilisateurId: string): Promise<number> {
    const { count } = await this.prisma.jetonRafraichissement.updateMany({
      where: { utilisateurId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });

    return count;
  }
}
