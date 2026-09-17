import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import {
  courrielConservationDocuments,
  courrielDossierValide,
  courrielMotDePasseChange,
} from './gabarits';

/**
 * Ce qu'on ecrit a quelqu'un a propos de son compte.
 *
 * Regroupe ici plutot que disperse dans les services metier, pour une raison
 * precise : retrouver le prenom d'un compte demande de savoir qu'il pend a un
 * candidat, a un client, ou a personne quand c'est du personnel d'agence. Cette
 * jointure n'a rien a faire dans `AuthService`, et la dupliquer a chaque
 * notification la ferait diverger.
 */
@Injectable()
export class NotificationsCompteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Adresse et prenom d'affichage, selon ce a quoi le compte est rattache. */
  private async destinataire(
    utilisateurId: string,
  ): Promise<{ email: string; prenom: string | null } | null> {
    const compte = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: {
        email: true,
        candidat: { select: { prenom: true } },
        client: { select: { contactNom: true } },
      },
    });

    if (!compte) {
      return null;
    }

    return {
      email: compte.email,
      prenom: compte.candidat?.prenom ?? compte.client?.contactNom ?? null,
    };
  }

  /**
   * Avertit qu'un mot de passe vient de changer.
   *
   * Jamais bloquant : le mot de passe est deja modifie quand on arrive ici, et
   * faire echouer la requete sur une panne de SMTP laisserait la personne
   * persuadee que son changement n'a pas pris — alors que son ancien mot de
   * passe ne fonctionne plus. `MailService.envoyer` absorbe deja l'echec et le
   * journalise ; il n'y a rien a rattraper de plus.
   */
  async motDePasseChange(utilisateurId: string, origine: 'compte' | 'agence'): Promise<void> {
    const cible = await this.destinataire(utilisateurId);

    if (!cible) {
      return;
    }

    await this.mail.envoyer(courrielMotDePasseChange(cible.email, cible.prenom, origine));
  }

  /**
   * Demande si les pieces arrivees a un an doivent etre conservees.
   *
   * Le destinataire est passe par l'appelant et non relu ici : c'est le meme
   * compte que celui pour lequel le lien a ete emis, et le lien ne vaut que
   * pour l'adresse qui figurait dans le jeton. Aller rechercher l'adresse
   * ouvrirait la porte a un decalage entre les deux.
   */
  async conservationDocuments(demande: {
    email: string;
    prenom: string | null;
    pieces: string[];
    effacementLe: Date;
    lien: string;
  }): Promise<void> {
    await this.mail.envoyer(
      courrielConservationDocuments(
        demande.email,
        demande.prenom,
        demande.pieces,
        demande.lien,
        demande.effacementLe.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      ),
    );
  }

  /**
   * Annonce a un candidat que son dossier vient d'etre valide.
   *
   * Relaye a partir de la fiche et non du compte : c'est l'agence qui valide un
   * candidat, et elle ne connait que l'identifiant de la fiche. Reste sans
   * effet si la fiche n'a pas de compte actif, ou si la personne a coupe ses
   * notifications — ce courriel rend service, il ne porte aucune obligation.
   */
  async dossierValide(candidatId: string): Promise<void> {
    const compte = await this.prisma.utilisateur.findFirst({
      where: { candidatId, actif: true, notificationsEmail: true },
      select: { email: true, candidat: { select: { prenom: true } } },
    });

    if (!compte) {
      return;
    }

    const site = (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');

    await this.mail.envoyer(
      courrielDossierValide(compte.email, compte.candidat?.prenom ?? null, `${site}/missions`),
    );
  }
}
