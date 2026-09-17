import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  estRoleInterne,
  type MotDePasseReinitialise,
  type PageResultat,
  type UtilisateurCreate,
  type UtilisateurListQuery,
  type UtilisateurResume,
  type UtilisateurSession,
  type UtilisateurUpdate,
} from '@releve/shared';
import { hacherMotDePasse } from '../auth/mots-de-passe';
import { SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsCompteService } from '../mail/notifications-compte.service';

const avecRattachements = {
  include: {
    client: { select: { raisonSociale: true } },
    candidat: { select: { nom: true, prenom: true } },
  },
} satisfies Prisma.UtilisateurDefaultArgs;

type UtilisateurComplet = Prisma.UtilisateurGetPayload<typeof avecRattachements>;

function versResume(utilisateur: UtilisateurComplet): UtilisateurResume {
  return {
    id: utilisateur.id,
    email: utilisateur.email,
    role: utilisateur.role,
    actif: utilisateur.actif,
    derniereCnx: utilisateur.derniereCnx ? utilisateur.derniereCnx.toISOString() : null,
    agenceId: utilisateur.agenceId,
    clientId: utilisateur.clientId,
    clientNom: utilisateur.client?.raisonSociale ?? null,
    candidatId: utilisateur.candidatId,
    candidatNom: utilisateur.candidat
      ? `${utilisateur.candidat.prenom} ${utilisateur.candidat.nom}`
      : null,
  };
}

@Injectable()
export class UtilisateursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsCompteService,
  ) {}

  /**
   * Perimetre d'une agence : son personnel, plus les comptes externes rattaches
   * a ses clients et a ses candidats.
   *
   * Le rattachement des comptes externes passe par la relation et non par une
   * colonne `agenceId` dupliquee sur l'utilisateur : si un client changeait
   * d'agence, cette colonne deviendrait fausse en silence et laisserait un acces
   * ouvert sur l'ancienne.
   */
  private perimetre(agenceId: string): Prisma.UtilisateurWhereInput {
    return {
      OR: [{ agenceId }, { client: { agenceId } }, { candidat: { agenceId } }],
    };
  }

  async lister(
    query: UtilisateurListQuery,
    agenceId: string,
  ): Promise<PageResultat<UtilisateurResume>> {
    const where: Prisma.UtilisateurWhereInput = {
      ...this.perimetre(agenceId),
      ...(query.role ? { role: query.role } : {}),
      ...(query.actif === undefined ? {} : { actif: query.actif }),
      ...(query.recherche ? { email: { contains: query.recherche, mode: 'insensitive' } } : {}),
    };

    const [total, utilisateurs] = await this.prisma.$transaction([
      this.prisma.utilisateur.count({ where }),
      this.prisma.utilisateur.findMany({
        where,
        ...avecRattachements,
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    return {
      donnees: utilisateurs.map(versResume),
      total,
      page: query.page,
      limite: query.limite,
    };
  }

  async creer(donnees: UtilisateurCreate, agenceId: string): Promise<UtilisateurResume> {
    const existant = await this.prisma.utilisateur.findUnique({
      where: { email: donnees.email },
      select: { id: true },
    });

    if (existant) {
      throw new ConflictException(`L adresse ${donnees.email} est deja utilisee`);
    }

    // Le rattachement doit appartenir a l'agence appelante : sans cette
    // verification, un administrateur pourrait s'ouvrir un acces sur le client
    // d'une autre agence en devinant son identifiant.
    if (donnees.clientId) {
      await this.exigerClientDeLAgence(donnees.clientId, agenceId);
    }

    if (donnees.candidatId) {
      await this.exigerCandidatDeLAgence(donnees.candidatId, agenceId);

      const deja = await this.prisma.utilisateur.findUnique({
        where: { candidatId: donnees.candidatId },
        select: { id: true },
      });

      if (deja) {
        throw new ConflictException('Ce candidat a deja un compte');
      }
    }

    const utilisateur = await this.prisma.utilisateur.create({
      data: {
        email: donnees.email,
        motDePasse: await hacherMotDePasse(donnees.motDePasse),
        role: donnees.role,
        // Cree par l'agence, donc reputee confirmee : la verification par lien
        // repond a « celui qui s'inscrit possede-t-il cette adresse ». Ici,
        // c'est un administrateur identifie qui ouvre le compte, et lui imposer
        // un aller-retour par courriel n'ajouterait aucune garantie — juste un
        // compte inutilisable si le mail se perd.
        emailVerifieLe: new Date(),
        // Seul le personnel interne porte l'agence ; un compte externe la tient
        // de son client ou de son candidat.
        agenceId: estRoleInterne(donnees.role) ? agenceId : null,
        clientId: donnees.clientId ?? null,
        candidatId: donnees.candidatId ?? null,
      },
      ...avecRattachements,
    });

    return versResume(utilisateur);
  }

  async modifier(
    id: string,
    donnees: UtilisateurUpdate,
    auteur: UtilisateurSession,
    agenceId: string,
  ): Promise<UtilisateurResume> {
    const cible = await this.exigerUtilisateur(id, agenceId);

    // Un administrateur ne se retire pas ses propres droits : il se verrouillerait
    // dehors, et il n'y a pas de super-administrateur pour le reouvrir.
    if (cible.id === auteur.id) {
      if (donnees.actif === false) {
        throw new BadRequestException('Un administrateur ne peut pas desactiver son propre compte');
      }

      if (donnees.role && donnees.role !== cible.role) {
        throw new BadRequestException('Un administrateur ne peut pas changer son propre role');
      }
    }

    if (donnees.role) {
      // Promouvoir le compte d'un client ou d'un candidat au back-office serait
      // une escalade de privileges deguisee en changement de role.
      if (!estRoleInterne(cible.role)) {
        throw new BadRequestException(
          'Le role d un compte client ou candidat ne se change pas : creer un compte d agence a la place',
        );
      }
    }

    const perdDroitsAdmin =
      cible.role === 'ADMIN_AGENCE' &&
      ((donnees.role !== undefined && donnees.role !== 'ADMIN_AGENCE') || donnees.actif === false);

    if (perdDroitsAdmin) {
      await this.exigerUnAutreAdministrateur(cible.id, agenceId);
    }

    const utilisateur = await this.prisma.utilisateur.update({
      where: { id },
      data: donnees,
      ...avecRattachements,
    });

    // Desactiver un compte sans couper ses sessions le laisserait travailler
    // jusqu'a la fin de la journee : c'est le jeton de rafraichissement qui
    // maintient l'acces, pas le mot de passe.
    if (donnees.actif === false) {
      await this.sessions.revoquerTout(id);
    }

    return versResume(utilisateur);
  }

  async reinitialiserMotDePasse(
    id: string,
    donnees: MotDePasseReinitialise,
    agenceId: string,
  ): Promise<UtilisateurResume> {
    await this.exigerUtilisateur(id, agenceId);

    const utilisateur = await this.prisma.utilisateur.update({
      where: { id },
      data: {
        motDePasse: await hacherMotDePasse(donnees.motDePasse),
        echecsConnexion: 0,
        dernierEchecLe: null,
      },
      ...avecRattachements,
    });

    // Une reinitialisation fait suite a un oubli ou a un incident : dans les
    // deux cas les sessions en cours n'ont plus lieu d'etre.
    await this.sessions.revoquerTout(id);

    // L'interesse est prevenu, avec la mention que l'operation vient de
    // l'agence. Le nouveau mot de passe n'y figure pas : il est communique de
    // vive voix, un courriel traverse des serveurs qu'on ne maitrise pas et
    // reste dans une boite pour toujours.
    await this.notifications.motDePasseChange(id, 'agence');

    return versResume(utilisateur);
  }

  /**
   * Refuse de laisser une agence sans aucun administrateur actif : plus personne
   * ne pourrait creer de compte ni en reactiver un.
   */
  private async exigerUnAutreAdministrateur(exclusId: string, agenceId: string): Promise<void> {
    const autres = await this.prisma.utilisateur.count({
      where: { agenceId, role: 'ADMIN_AGENCE', actif: true, id: { not: exclusId } },
    });

    if (autres === 0) {
      throw new BadRequestException(
        'C est le dernier administrateur actif de l agence : en nommer un autre avant',
      );
    }
  }

  private async exigerClientDeLAgence(clientId: string, agenceId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, agenceId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException(`Client ${clientId} introuvable`);
    }
  }

  private async exigerCandidatDeLAgence(candidatId: string, agenceId: string): Promise<void> {
    const candidat = await this.prisma.candidat.findFirst({
      where: { id: candidatId, agenceId },
      select: { id: true },
    });

    if (!candidat) {
      throw new NotFoundException(`Candidat ${candidatId} introuvable`);
    }
  }

  private async exigerUtilisateur(id: string, agenceId: string): Promise<UtilisateurComplet> {
    const utilisateur = await this.prisma.utilisateur.findFirst({
      where: { id, ...this.perimetre(agenceId) },
      ...avecRattachements,
    });

    if (!utilisateur) {
      throw new NotFoundException(`Utilisateur ${id} introuvable`);
    }

    return utilisateur;
  }
}
