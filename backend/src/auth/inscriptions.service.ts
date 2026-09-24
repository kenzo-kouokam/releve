import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  VERSION_CONDITIONS,
  type EspacePersonnel,
  type InscriptionEtablissement,
  type InscriptionInterimaire,
  type ReponseInscription,
  type UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodageService } from '../geocodage/geocodage.service';
import { VerificationEmailService } from './verification-email.service';
import { hacherMotDePasse } from './mots-de-passe';

@Injectable()
export class InscriptionsService {
  private readonly logger = new Logger(InscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationEmailService,
    private readonly config: ConfigService,
    private readonly geocodage: GeocodageService,
  ) {}

  /**
   * Agence a laquelle rattacher une inscription venue du site public.
   *
   * Le visiteur ne choisit pas son agence : il ne sait pas comment le groupe
   * est decoupe, et le lui demander ferait porter une erreur de saisie sur le
   * cloisonnement. Un deploiement mono-agence prend la seule qui existe ;
   * `AGENCE_PAR_DEFAUT_ID` tranche si le groupe en exploite plusieurs.
   *
   * TODO(lot 2) : router selon le departement du demandeur plutot que par
   * configuration, quand les secteurs des agences seront en base.
   */
  private async agenceDInscription(): Promise<string> {
    const configuree = this.config.get<string>('AGENCE_PAR_DEFAUT_ID');

    if (configuree) {
      const agence = await this.prisma.agence.findUnique({
        where: { id: configuree },
        select: { id: true },
      });

      if (agence) {
        return agence.id;
      }

      this.logger.error(`AGENCE_PAR_DEFAUT_ID pointe sur une agence inconnue : ${configuree}`);
    }

    const premiere = await this.prisma.agence.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!premiere) {
      // 503 et non 500 : la base est saine, c'est le parametrage qui manque.
      throw new ServiceUnavailableException('Aucune agence ne peut recevoir les inscriptions');
    }

    return premiere.id;
  }

  /** L'adresse sert d'identifiant de connexion : elle ne peut pas etre partagee. */
  private async exigerEmailLibre(email: string): Promise<void> {
    const existant = await this.prisma.utilisateur.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existant) {
      throw new ConflictException('Un compte existe deja pour cette adresse e-mail');
    }
  }

  /**
   * Inscription d'un interimaire.
   *
   * Deux verrous distincts, qu'il ne faut pas confondre. Le statut
   * `EN_VERIFICATION` dit que l'agence n'a pas encore vu les diplomes : se
   * declarer aide-soignant ne suffit pas a etre envoye chez quelqu'un. La
   * confirmation d'adresse, elle, ne dit rien des competences — seulement que
   * la personne qui s'inscrit possede l'adresse qu'elle declare.
   */
  async interimaire(donnees: InscriptionInterimaire): Promise<ReponseInscription> {
    await this.exigerEmailLibre(donnees.compte.email);

    const agenceId = await this.agenceDInscription();
    const empreinte = await hacherMotDePasse(donnees.compte.motDePasse);
    let compte: { id: string; email: string };
    let ficheId: string;

    try {
      const utilisateur = await this.prisma.$transaction(async (tx) => {
        const candidat = await tx.candidat.create({
          data: {
            agenceId,
            nom: donnees.interimaire.nom,
            prenom: donnees.interimaire.prenom,
            email: donnees.compte.email,
            telephone: donnees.interimaire.telephone,
            adresse: donnees.interimaire.adresse,
            codePostal: donnees.interimaire.codePostal,
            ville: donnees.interimaire.ville,
            rayonKm: donnees.interimaire.rayonKm,
            permisB: donnees.interimaire.permisB,
            vehicule: donnees.interimaire.vehicule,
            statut: 'EN_VERIFICATION',
          },
          select: { id: true },
        });

        ficheId = candidat.id;

        return tx.utilisateur.create({
          data: {
            email: donnees.compte.email,
            motDePasse: empreinte,
            role: 'CANDIDAT',
            candidatId: candidat.id,
            // La date et la version sont ecrites ensemble : accepter un texte,
            // c'est accepter celui-la. Une revision ulterieure ne peut pas se
            // prevaloir d'un consentement donne a la precedente.
            conditionsAccepteesLe: new Date(),
            conditionsVersion: VERSION_CONDITIONS,
          },
        });
      });

      this.logger.log(`Inscription interimaire : ${donnees.compte.email}`);

      compte = utilisateur;
    } catch (cause) {
      throw this.traduireConflit(cause, 'email', 'Une fiche existe deja pour cette adresse e-mail');
    }

    // Hors transaction, et deliberement : un appel reseau tenu ouvert le temps
    // d'une transaction immobilise une connexion de la base, et une BAN lente
    // ferait echouer des inscriptions parfaitement valides. La fiche est deja
    // ecrite ; il ne lui manque qu'un point, que `releve geocoder` reprendra.
    await this.geocodage.situer('candidat', ficheId!, donnees.interimaire);

    await this.verification.emettre({
      id: compte.id,
      email: compte.email,
      prenom: donnees.interimaire.prenom,
    });

    return { email: compte.email, verificationRequise: true };
  }

  /**
   * Inscription d'un etablissement.
   *
   * Le meme principe que pour l'interimaire, avec un verrou different. La fiche
   * nait **inactive**, et c'est tout ce qui la separe d'une structure en
   * exercice : le compte existe, la personne se connecte, elle voit son espace
   * et l'etat de son dossier — mais `missions.creer()` refuse un client inactif,
   * donc elle ne peut deposer aucun besoin.
   *
   * Le controle n'est pas ajoute ici : il existait deja, pour les fiches que
   * l'agence desactive. C'est ce qui permet d'ouvrir l'inscription sans rien
   * relacher — une structure auto-declaree se trouve exactement dans la
   * situation d'un etablissement dont l'agence aurait suspendu la fiche.
   *
   * **L'autorisation n'est pas demandee ici**, et ce n'est pas un oubli. Elle
   * ne serait verifiee par rien a ce moment, donc la saisir ne prouverait rien ;
   * elle se renseigne a l'activation, par l'agence, en ouvrant la piece —
   * l'arrete conjoint d'un EHPAD ou l'autorisation d'activite de soins d'un
   * etablissement de sante, selon le type declare ici. La fiche nait donc sans
   * statut juridique et sans FINESS, ce que `clients.service` refuse d'activer.
   *
   * Entre les deux, la structure attend, comme un interimaire attend la
   * verification de ses diplomes.
   */
  async etablissement(donnees: InscriptionEtablissement): Promise<ReponseInscription> {
    await this.exigerEmailLibre(donnees.compte.email);

    // Le SIRET est unique sur toute la base et pas par agence : deux agences du
    // meme reseau ne doivent pas ouvrir deux fiches pour le meme etablissement.
    // Verifie avant la transaction pour rendre un message utile plutot qu'une
    // violation de contrainte traduite a l'aveugle.
    const deja = await this.prisma.client.findUnique({
      where: { siret: donnees.etablissement.siret },
      select: { id: true },
    });

    if (deja) {
      throw new ConflictException(
        'Cet etablissement est deja enregistre. Demandez un acces a votre agence.',
      );
    }

    const agenceId = await this.agenceDInscription();
    const empreinte = await hacherMotDePasse(donnees.compte.motDePasse);
    let compte: { id: string; email: string };
    let lieuId: string;

    try {
      const utilisateur = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            agenceId,
            raisonSociale: donnees.etablissement.raisonSociale,
            siret: donnees.etablissement.siret,
            // Le type est declare, l'autorisation ne l'est pas : c'est lui qui
            // dira a l'agence quelle piece reclamer avant d'activer.
            type: donnees.etablissement.type,
            contactNom: donnees.etablissement.contactNom,
            contactEmail: donnees.compte.email,
            contactTel: donnees.etablissement.contactTel,
            // Le verrou. Rien ne sort de la plateforme vers cet etablissement
            // tant que l'agence n'a pas lu son autorisation.
            actif: false,
            lieux: { create: [donnees.lieu] },
          },
          select: { id: true, lieux: { select: { id: true } } },
        });

        lieuId = client.lieux[0]!.id;

        return tx.utilisateur.create({
          data: {
            email: donnees.compte.email,
            motDePasse: empreinte,
            role: 'CLIENT',
            clientId: client.id,
            conditionsAccepteesLe: new Date(),
            conditionsVersion: VERSION_CONDITIONS,
          },
        });
      });

      this.logger.log(
        `Inscription etablissement : ${donnees.etablissement.raisonSociale} (${donnees.compte.email})`,
      );

      compte = utilisateur;
    } catch (cause) {
      throw this.traduireConflit(cause, 'siret', 'Cet etablissement est deja enregistre');
    }

    // Hors transaction, pour la meme raison que cote interimaire : une BAN lente
    // ne doit pas faire echouer une inscription valide. Un lieu sans
    // coordonnees empeche de publier — mais la fiche est de toute facon inactive
    // jusqu'a la validation, et `pnpm cli geocoder` reprend ce qui manque.
    await this.geocodage.situer('lieu_intervention', lieuId!, donnees.lieu);

    await this.verification.emettre({
      id: compte.id,
      email: compte.email,
      prenom: donnees.etablissement.contactNom,
    });

    return { email: compte.email, verificationRequise: true };
  }

  /**
   * Vue que le compte a de lui-meme.
   *
   * Le back-office n'y lit rien : son espace, ce sont le vivier et les
   * referentiels. Les deux profils externes, eux, n'ont que cela.
   */
  async espace(session: UtilisateurSession): Promise<EspacePersonnel> {
    if (session.clientId) {
      const client = await this.prisma.client.findUniqueOrThrow({
        where: { id: session.clientId },
        include: { _count: { select: { lieux: true } } },
      });

      return {
        type: 'CLIENT',
        valideParLAgence: client.actif,
        client: {
          id: client.id,
          raisonSociale: client.raisonSociale,
          siret: client.siret,
          type: client.type,
          conventionCollective: client.conventionCollective,
          idcc: client.idcc,
          contactNom: client.contactNom,
          contactEmail: client.contactEmail,
          contactTel: client.contactTel,
          actif: client.actif,
          statutJuridique: client.statutJuridique,
          numeroFiness: client.numeroFiness,
          arreteReference: client.arreteReference,
          arreteDate: client.arreteDate?.toISOString().slice(0, 10) ?? null,
          nombreLieux: client._count.lieux,
        },
      };
    }

    if (session.candidatId) {
      const candidat = await this.prisma.candidat.findUniqueOrThrow({
        where: { id: session.candidatId },
        include: { qualifications: { include: { qualification: true } } },
      });

      return {
        type: 'CANDIDAT',
        valideParLAgence: candidat.statut === 'ACTIF',
        candidat: {
          id: candidat.id,
          nom: candidat.nom,
          prenom: candidat.prenom,
          email: candidat.email,
          telephone: candidat.telephone,
          statut: candidat.statut,
          ville: candidat.ville,
          codePostal: candidat.codePostal,
          rayonKm: candidat.rayonKm,
          permisB: candidat.permisB,
          vehicule: candidat.vehicule,
          qualifications: candidat.qualifications.map((lien) => lien.qualification.code),
        },
      };
    }

    return { type: 'AGENCE' };
  }

  /**
   * Une contrainte d'unicite qui saute pendant la transaction devient un 409
   * lisible plutot qu'une 500. Le cas se produit quand deux inscriptions
   * partent en meme temps avec le meme SIRET : la verification prealable passe
   * pour les deux, c'est la base qui tranche.
   */
  private traduireConflit(cause: unknown, champ: string, message: string): unknown {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      const cibles = cause.meta?.target;

      if (Array.isArray(cibles) && cibles.some((cible) => String(cible).includes(champ))) {
        return new ConflictException(message);
      }

      return new ConflictException('Cette inscription existe deja');
    }

    return cause;
  }
}
