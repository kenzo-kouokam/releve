import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { setTimeout as attendre } from 'node:timers/promises';
import { CODE_EMAIL_NON_VERIFIE } from '@releve/shared';
import type {
  Connexion,
  MotDePasseChange,
  PreferencesNotification,
  ReponseConnexion,
  UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsCompteService } from '../mail/notifications-compte.service';
import { hacherMotDePasse, verifierMotDePasse } from './mots-de-passe';
import { SessionsService } from './sessions.service';
import type { ChargeUtileJeton } from './auth.types';

/** Ce qu'il faut d'un compte pour lui ouvrir une session. */
type CompteAuthentifie = Pick<
  UtilisateurSession,
  'id' | 'email' | 'role' | 'agenceId' | 'clientId' | 'candidatId'
>;

/** Au-dela de ce nombre d'echecs consecutifs, la reponse est ralentie. */
const ECHECS_AVANT_RALENTISSEMENT = 5;

/** Plafond du ralentissement : au-dela, on immobiliserait nos propres requetes. */
const RALENTISSEMENT_MAX_MS = 5_000;

/** Apres ce delai sans echec, le compteur repart de zero. */
const OUBLI_ECHECS_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Empreinte jetable verifiee quand l'e-mail est inconnu : sans elle, une
   * reponse instantanee revelerait qu'un compte n'existe pas. Calculee une
   * seule fois, au premier echec.
   */
  private leurre?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsCompteService,
  ) {}

  /**
   * Ralentissement exponentiel apres echecs repetes.
   *
   * Deliberement pas un verrouillage : bloquer un compte offrirait a un
   * attaquant le moyen de fermer l'agence a 6h30 en saisissant trois mauvais
   * mots de passe, et annoncer "compte verrouille" trahirait l'existence du
   * compte. Un delai invisible ne bloque personne, ne revele rien, et rend le
   * bourrinage distribue impraticable.
   */
  private delaiApresEchecs(echecs: number): number {
    if (echecs < ECHECS_AVANT_RALENTISSEMENT) {
      return 0;
    }

    const progression = 2 ** (echecs - ECHECS_AVANT_RALENTISSEMENT) * 250;

    return Math.min(progression, RALENTISSEMENT_MAX_MS);
  }

  private echecsCourants(echecs: number, dernierEchecLe: Date | null): number {
    if (!dernierEchecLe || Date.now() - dernierEchecLe.getTime() > OUBLI_ECHECS_MS) {
      return 0;
    }

    return echecs;
  }

  async connexion(donnees: Connexion): Promise<ReponseConnexion> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: donnees.email },
    });

    if (!utilisateur) {
      this.leurre ??= hacherMotDePasse('leurre-anti-enumeration');
      await verifierMotDePasse(await this.leurre, donnees.motDePasse);
      throw new UnauthorizedException('Identifiants invalides');
    }

    const echecs = this.echecsCourants(utilisateur.echecsConnexion, utilisateur.dernierEchecLe);
    const delai = this.delaiApresEchecs(echecs);

    if (delai > 0) {
      await attendre(delai);
    }

    const motDePasseValide = await verifierMotDePasse(utilisateur.motDePasse, donnees.motDePasse);

    // Meme message dans les deux cas : un compte desactive ne doit pas se
    // distinguer d'un mot de passe faux vu du formulaire de connexion.
    if (!motDePasseValide || !utilisateur.actif) {
      this.logger.warn(
        `Connexion refusee pour ${utilisateur.email} (${motDePasseValide ? 'compte inactif' : 'mot de passe invalide'})`,
      );

      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { echecsConnexion: echecs + 1, dernierEchecLe: new Date() },
      });

      throw new UnauthorizedException('Identifiants invalides');
    }

    // Adresse non confirmee : refus, mais seulement ici.
    //
    // L'ordre compte. Ce refus est place *apres* la verification du mot de
    // passe, jamais avant : annonce plus tot, il apprendrait a n'importe qui
    // qu'un compte existe pour une adresse donnee, et ruinerait le soin pris
    // juste au-dessus a rendre les echecs indiscernables. A ce point-ci, celui
    // qui interroge a deja prouve qu'il connait le mot de passe — lui dire
    // pourquoi il n'entre pas ne lui apprend rien qu'il ignorait.
    //
    // 403 et non 401 : les identifiants sont bons, c'est l'etat du compte qui
    // bloque. Le code accompagne le message pour que le front propose le renvoi
    // du lien au lieu d'envoyer chercher une faute de frappe inexistante.
    if (!utilisateur.emailVerifieLe) {
      this.logger.warn(`Connexion refusee pour ${utilisateur.email} (adresse non confirmee)`);

      throw new ForbiddenException({
        statusCode: 403,
        code: CODE_EMAIL_NON_VERIFIE,
        message:
          "Votre adresse e-mail n'a pas encore ete confirmee. Ouvrez le lien recu par courriel.",
      });
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { derniereCnx: new Date(), echecsConnexion: 0, dernierEchecLe: null },
    });

    return this.ouvrirSession(utilisateur);
  }

  /**
   * Emet les deux jetons pour un compte dont l'identite est deja etablie :
   * apres verification du mot de passe, ou juste apres une inscription. Le
   * chemin est le meme dans les deux cas, il n'y a donc qu'un endroit ou une
   * session peut naitre.
   */
  async ouvrirSession(utilisateur: CompteAuthentifie): Promise<ReponseConnexion> {
    const session: UtilisateurSession = {
      id: utilisateur.id,
      email: utilisateur.email,
      role: utilisateur.role,
      agenceId: utilisateur.agenceId,
      clientId: utilisateur.clientId,
      candidatId: utilisateur.candidatId,
    };

    const rafraichissement = await this.sessions.ouvrir(session.id);

    return { ...this.emettreAcces(session), ...this.formaterRafraichissement(rafraichissement) };
  }

  /**
   * Echange un jeton de rafraichissement contre un nouvel acces. La session est
   * relue en base a cette occasion : un compte desactive ou dont le role a change
   * ne prolonge pas un jeton devenu faux.
   */
  async rafraichir(valeur: string): Promise<ReponseConnexion> {
    const { utilisateurId, jeton } = await this.sessions.rafraichir(valeur);

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
    });

    if (!utilisateur || !utilisateur.actif) {
      await this.sessions.revoquerTout(utilisateurId);
      throw new UnauthorizedException('Compte desactive');
    }

    const session: UtilisateurSession = {
      id: utilisateur.id,
      email: utilisateur.email,
      role: utilisateur.role,
      agenceId: utilisateur.agenceId,
      clientId: utilisateur.clientId,
      candidatId: utilisateur.candidatId,
    };

    return { ...this.emettreAcces(session), ...this.formaterRafraichissement(jeton) };
  }

  async deconnexion(valeur: string): Promise<void> {
    await this.sessions.fermer(valeur);
  }

  /**
   * Changement par l'interesse lui-meme. On revalide l'ancien mot de passe :
   * un poste laisse ouvert ne doit pas suffire a verrouiller le compte de
   * quelqu'un d'autre.
   *
   * Toutes les sessions sont coupees dans la foulee, y compris celle qui fait
   * la demande : changer son mot de passe apres un vol de session doit fermer
   * la session du voleur, sinon la mesure ne sert a rien.
   */
  async changerMotDePasse(
    utilisateur: UtilisateurSession,
    donnees: MotDePasseChange,
  ): Promise<void> {
    const enregistre = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateur.id },
      select: { motDePasse: true },
    });

    if (!(await verifierMotDePasse(enregistre.motDePasse, donnees.ancien))) {
      this.logger.warn(`Changement de mot de passe refuse pour ${utilisateur.email}`);
      throw new UnauthorizedException('Mot de passe actuel invalide');
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { motDePasse: await hacherMotDePasse(donnees.nouveau) },
    });

    await this.sessions.revoquerTout(utilisateur.id);

    // L'avertissement part meme quand le changement est parfaitement legitime.
    // C'est tout son interet : celui qui prend un compte commence par en
    // changer le mot de passe, et sans ce message le proprietaire ne
    // l'apprendrait qu'en se retrouvant dehors, sans savoir ni pourquoi ni
    // quand.
    await this.notifications.motDePasseChange(utilisateur.id, 'compte');
  }

  private emettreAcces(session: UtilisateurSession): {
    jeton: string;
    expireDans: number;
    utilisateur: UtilisateurSession;
  } {
    const charge: ChargeUtileJeton = {
      sub: session.id,
      email: session.email,
      role: session.role,
      agenceId: session.agenceId,
      clientId: session.clientId,
      candidatId: session.candidatId,
    };

    const jeton = this.jwt.sign(charge);
    const { exp } = this.jwt.decode<{ exp: number }>(jeton);

    return {
      jeton,
      expireDans: Math.max(0, exp - Math.floor(Date.now() / 1000)),
      utilisateur: session,
    };
  }

  private formaterRafraichissement(jeton: { valeur: string; expireDans: number }): {
    jetonRafraichissement: string;
    rafraichissementExpireDans: number;
  } {
    return {
      jetonRafraichissement: jeton.valeur,
      rafraichissementExpireDans: jeton.expireDans,
    };
  }

  /** Reglage des courriels de service, tel qu'il est enregistre. */
  async lireNotifications(session: UtilisateurSession): Promise<PreferencesNotification> {
    const compte = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: session.id },
      select: { notificationsEmail: true },
    });

    return { notificationsEmail: compte.notificationsEmail };
  }

  /**
   * Active ou coupe les courriels de service.
   *
   * Rend l'etat enregistre plutot que rien : l'ecran affiche un interrupteur,
   * et il doit refleter ce que la base dit, pas ce que le clic supposait.
   */
  async changerNotifications(
    session: UtilisateurSession,
    donnees: PreferencesNotification,
  ): Promise<PreferencesNotification> {
    const compte = await this.prisma.utilisateur.update({
      where: { id: session.id },
      data: { notificationsEmail: donnees.notificationsEmail },
      select: { notificationsEmail: true },
    });

    return { notificationsEmail: compte.notificationsEmail };
  }
}
