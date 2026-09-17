import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REINITIALISATION_EXPIRE_HEURES } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsCompteService } from '../mail/notifications-compte.service';
import { courrielReinitialisation } from '../mail/gabarits';
import { hacherMotDePasse } from './mots-de-passe';
import { SessionsService } from './sessions.service';
import { JetonsUsageUniqueService } from './jetons-usage-unique.service';
import { lienCourriel } from './liens';

/**
 * Reprise de main sur un compte dont le mot de passe est perdu.
 *
 * La preuve d'identite est la meme que pour la confirmation d'adresse — un lien
 * recu dans une boite mail — et le mecanisme est donc partage. Ce qui change est
 * ce que le lien autorise, et la duree pendant laquelle il le fait : une heure
 * ici contre deux jours la-bas, parce que celui-ci ouvre un compte existant et
 * non un compte vide.
 */
@Injectable()
export class ReinitialisationService {
  private readonly logger = new Logger(ReinitialisationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
    private readonly jetons: JetonsUsageUniqueService,
    private readonly notifications: NotificationsCompteService,
  ) {}

  private get dureeHeures(): number {
    return Number(
      this.config.get<string>('REINITIALISATION_EXPIRE_HEURES') ?? REINITIALISATION_EXPIRE_HEURES,
    );
  }

  /**
   * Demande de lien.
   *
   * Ne dit jamais si l'adresse existe : ce formulaire est public, et repondre
   * differemment en ferait un annuaire des inscrits — particulierement genant
   * ici, ou etre inscrit revele qu'on cherche des missions d'aide a domicile.
   * L'appelant recoit toujours la meme chose, compte inconnu ou non.
   *
   * Retourne le lien, dont seuls les tests se servent.
   */
  async demander(email: string): Promise<string | null> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        actif: true,
        candidat: { select: { prenom: true } },
        client: { select: { contactNom: true } },
      },
    });

    if (!utilisateur || !utilisateur.actif) {
      this.logger.log(`Reinitialisation sans effet demandee pour ${email}`);

      return null;
    }

    // Une adresse non confirmee n'est pas ecartee ici. Le lien part a cette
    // adresse : y repondre prouve qu'on la possede, ce qui est exactement ce
    // que la confirmation demande. L'ecarter enfermerait qui a oublie son mot
    // de passe *et* neglige de confirmer — le lien de confirmation n'ouvre
    // qu'une session, dont on ne peut rien faire sans l'ancien mot de passe.
    const valeur = await this.jetons.emettre(
      utilisateur.id,
      utilisateur.email,
      'REINITIALISATION_MOT_DE_PASSE',
      this.dureeHeures,
    );

    const lien = lienCourriel(this.config, 'reinitialisation', valeur);

    await this.mail.envoyer(
      courrielReinitialisation(
        utilisateur.email,
        utilisateur.candidat?.prenom ?? utilisateur.client?.contactNom ?? null,
        lien,
        this.dureeHeures,
      ),
    );

    return lien;
  }

  /**
   * Pose du nouveau mot de passe.
   *
   * Aucune session n'est ouverte au passage, contrairement a la confirmation
   * d'adresse. La personne vient de choisir un mot de passe : la faire entrer
   * avec verifie qu'il est bien celui qu'elle croit, et l'ecran de connexion
   * qui suit est la ou elle s'attend a atterrir.
   */
  async reinitialiser(valeur: string, nouveau: string): Promise<void> {
    const resolu = await this.jetons.consommer(valeur, 'REINITIALISATION_MOT_DE_PASSE');

    if (!resolu) {
      throw new BadRequestException(
        'Ce lien de reinitialisation est invalide ou expire. Demandez-en un nouveau.',
      );
    }

    const compte = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: resolu.utilisateurId },
      select: { emailVerifieLe: true },
    });

    await this.prisma.utilisateur.update({
      where: { id: resolu.utilisateurId },
      data: {
        motDePasse: await hacherMotDePasse(nouveau),
        // Le compteur d'echecs repart de zero : le ralentissement progressif
        // vise le bourrinage, pas quelqu'un qui vient de prouver son identite.
        echecsConnexion: 0,
        dernierEchecLe: null,
        // Le clic a prouve la possession de l'adresse, ce qui est exactement ce
        // que la confirmation etablit. Sans cela, un compte jamais confirme
        // resterait inconnectable apres sa reinitialisation — son lien de
        // confirmation n'ouvrant qu'une session, dont on ne peut rien faire
        // sans l'ancien mot de passe. La date d'origine est conservee quand
        // elle existe : c'est la premiere preuve qui fait foi, pas la derniere.
        emailVerifieLe: compte.emailVerifieLe ?? new Date(),
      },
    });

    // Toutes les sessions tombent. Une reinitialisation fait suite a un oubli ou
    // a un incident : dans le second cas, laisser vivre les sessions en cours
    // laisserait le voleur connecte apres la reprise de main.
    await this.sessions.revoquerTout(resolu.utilisateurId);

    await this.notifications.motDePasseChange(resolu.utilisateurId, 'compte');

    this.logger.log(`Mot de passe reinitialise pour ${resolu.email}`);
  }
}
