import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VERIFICATION_EXPIRE_HEURES, type ReponseConnexion } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { courrielVerification } from '../mail/gabarits';
import { AuthService } from './auth.service';
import { JetonsUsageUniqueService } from './jetons-usage-unique.service';
import { lienCourriel } from './liens';

/** Ce qu'il faut pour rediger le courriel et retrouver le compte. */
interface Destinataire {
  id: string;
  email: string;
  prenom: string | null;
}

@Injectable()
export class VerificationEmailService {
  private readonly logger = new Logger(VerificationEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly jetons: JetonsUsageUniqueService,
  ) {}

  private get dureeHeures(): number {
    return Number(
      this.config.get<string>('VERIFICATION_EXPIRE_HEURES') ?? VERIFICATION_EXPIRE_HEURES,
    );
  }

  /**
   * Emet un lien de confirmation et l'envoie.
   *
   * Retourne le lien, dont seuls les tests se servent — le reste du code n'a
   * aucune raison de le connaitre.
   */
  async emettre(destinataire: Destinataire): Promise<string> {
    const valeur = await this.jetons.emettre(
      destinataire.id,
      destinataire.email,
      'VERIFICATION_EMAIL',
      this.dureeHeures,
    );

    const lien = lienCourriel(this.config, 'verification', valeur);

    await this.mail.envoyer(
      courrielVerification(destinataire.email, destinataire.prenom, lien, this.dureeHeures),
    );

    return lien;
  }

  /**
   * Confirme l'adresse et ouvre la session.
   *
   * Un seul message d'erreur pour tous les refus — jeton inconnu, deja
   * consomme, expire. Les distinguer apprendrait a qui tatonne si une valeur a
   * deja existe, et ne change rien pour la personne de bonne foi : dans les
   * trois cas, la marche a suivre est de demander un nouveau lien.
   */
  async confirmer(valeur: string): Promise<ReponseConnexion> {
    const resolu = await this.jetons.consommer(valeur, 'VERIFICATION_EMAIL');

    if (!resolu) {
      throw new BadRequestException(
        'Ce lien de verification est invalide ou expire. Demandez-en un nouveau.',
      );
    }

    // `updateMany` conditionne sur `emailVerifieLe: null` : un second lien
    // valide ne doit pas reecrire la date de la premiere confirmation.
    await this.prisma.utilisateur.updateMany({
      where: { id: resolu.utilisateurId, emailVerifieLe: null },
      data: { emailVerifieLe: new Date(), derniereCnx: new Date() },
    });

    const utilisateur = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: resolu.utilisateurId },
      select: {
        id: true,
        email: true,
        role: true,
        agenceId: true,
        clientId: true,
        candidatId: true,
      },
    });

    this.logger.log(`Adresse confirmee : ${utilisateur.email}`);

    return this.auth.ouvrirSession(utilisateur);
  }

  /**
   * Renvoi du lien.
   *
   * Ne dit jamais si l'adresse existe, ni si elle est deja confirmee : ce
   * formulaire est public, et repondre differemment en ferait un testeur
   * d'adresses. L'appelant recoit toujours la meme chose.
   */
  async renvoyer(email: string): Promise<void> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifieLe: true,
        actif: true,
        candidat: { select: { prenom: true } },
        client: { select: { contactNom: true } },
      },
    });

    if (!utilisateur || utilisateur.emailVerifieLe || !utilisateur.actif) {
      this.logger.log(`Renvoi sans effet demande pour ${email}`);

      return;
    }

    await this.emettre({
      id: utilisateur.id,
      email: utilisateur.email,
      prenom: utilisateur.candidat?.prenom ?? utilisateur.client?.contactNom ?? null,
    });
  }
}
