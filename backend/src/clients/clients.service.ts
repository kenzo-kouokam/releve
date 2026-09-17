import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ClientCreate,
  ClientDetail,
  ClientListQuery,
  ClientResume,
  ClientUpdate,
  LieuCreate,
  LieuResume,
  LieuUpdate,
  PageResultat,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodageService } from '../geocodage/geocodage.service';

const avecComptes = {
  include: { _count: { select: { lieux: true } } },
} satisfies Prisma.ClientDefaultArgs;

const avecLieux = {
  include: {
    _count: { select: { lieux: true } },
    lieux: {
      include: { _count: { select: { missions: true } } },
      orderBy: [{ type: 'asc' }, { libelle: 'asc' }],
    },
  },
} satisfies Prisma.ClientDefaultArgs;

type ClientAvecComptes = Prisma.ClientGetPayload<typeof avecComptes>;
type ClientAvecLieux = Prisma.ClientGetPayload<typeof avecLieux>;
type LieuAvecComptes = ClientAvecLieux['lieux'][number];

function versResume(client: ClientAvecComptes): ClientResume {
  return {
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
    statutReglementaire: client.statutReglementaire,
    numeroSap: client.numeroSap,
    numeroAgrement: client.numeroAgrement,
    numeroFiness: client.numeroFiness,
    arreteReference: client.arreteReference,
    // Date seule, sans heure : un arrete est date au jour, et renvoyer un
    // horodatage inviterait a afficher une precision qui n'existe pas.
    arreteDate: client.arreteDate?.toISOString().slice(0, 10) ?? null,
    nombreLieux: client._count.lieux,
  };
}

function versLieuResume(lieu: LieuAvecComptes): LieuResume {
  return {
    id: lieu.id,
    clientId: lieu.clientId,
    type: lieu.type,
    libelle: lieu.libelle,
    adresse: lieu.adresse,
    codePostal: lieu.codePostal,
    ville: lieu.ville,
    latitude: lieu.latitude,
    longitude: lieu.longitude,
    geocodePrecision: lieu.geocodePrecision,
    etage: lieu.etage,
    codeAcces: lieu.codeAcces,
    consignes: lieu.consignes,
    beneficiaireRef: lieu.beneficiaireRef,
    nombreMissions: lieu._count.missions,
  };
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodage: GeocodageService,
  ) {}

  async lister(query: ClientListQuery, agenceId: string): Promise<PageResultat<ClientResume>> {
    const where: Prisma.ClientWhereInput = {
      agenceId,
      ...(query.actif === undefined ? {} : { actif: query.actif }),
      ...(query.recherche
        ? {
            OR: [
              { raisonSociale: { contains: query.recherche, mode: 'insensitive' } },
              { siret: { startsWith: query.recherche.replace(/\s/g, '') } },
              // Le client n'a pas d'adresse : c'est le lieu d'intervention qui
              // en porte une. Chercher "Reze" doit quand meme sortir le SAAD
              // qui y intervient.
              { lieux: { some: { ville: { contains: query.recherche, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [total, clients] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        ...avecComptes,
        orderBy: { raisonSociale: 'asc' },
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    return { donnees: clients.map(versResume), total, page: query.page, limite: query.limite };
  }

  async detail(id: string, agenceId: string): Promise<ClientDetail> {
    const client = await this.exigerClient(id, agenceId, avecLieux);

    return { ...versResume(client), lieux: client.lieux.map(versLieuResume) };
  }

  async creer(donnees: ClientCreate, agenceId: string): Promise<ClientResume> {
    // Le SIRET est unique sur toute la base et pas par agence : deux agences du
    // meme reseau ne doivent pas creer deux fiches pour le meme etablissement.
    const existant = await this.prisma.client.findUnique({ where: { siret: donnees.siret } });

    if (existant) {
      throw new ConflictException(`Le SIRET ${donnees.siret} est deja enregistre`);
    }

    const client = await this.prisma.client.create({
      data: { ...donnees, agenceId },
      ...avecComptes,
    });

    return versResume(client);
  }

  async modifier(id: string, donnees: ClientUpdate, agenceId: string): Promise<ClientResume> {
    const existant = await this.exigerClient(id, agenceId, avecComptes);

    // Une fiche sans statut reglementaire ne peut pas etre activee.
    //
    // C'est le seul endroit ou la regle mord vraiment. Le statut decide de ce
    // que la structure a le droit de faire, et — si elle est autorisee au titre
    // du CASF — de l'application de la duree minimale d'exercice prealable a
    // l'interim. Activer sans l'avoir renseigne reviendrait a envoyer des
    // intervenants sans savoir sous quel regime.
    const statutApres = donnees.statutReglementaire ?? existant.statutReglementaire;

    if (donnees.actif === true && !statutApres) {
      throw new BadRequestException(
        'Renseignez le statut reglementaire de la structure avant de l activer',
      );
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: donnees,
      ...avecComptes,
    });

    return versResume(client);
  }

  async listerLieux(clientId: string, agenceId: string): Promise<LieuResume[]> {
    const client = await this.exigerClient(clientId, agenceId, avecLieux);

    return client.lieux.map(versLieuResume);
  }

  async creerLieu(clientId: string, donnees: LieuCreate, agenceId: string): Promise<LieuResume> {
    await this.exigerClient(clientId, agenceId, avecComptes);

    const cree = await this.prisma.lieuIntervention.create({
      data: { ...donnees, clientId },
      select: { id: true },
    });

    // Un lieu sans coordonnees rend toute mission qui s'y deroule impossible a
    // pourvoir : la distance n'est mesurable pour personne, donc tout le vivier
    // est ecarte. Situer ici evite d'avoir a le decouvrir sur un classement vide.
    await this.geocodage.situer('lieu_intervention', cree.id, donnees);

    const lieu = await this.prisma.lieuIntervention.findUniqueOrThrow({
      where: { id: cree.id },
      include: { _count: { select: { missions: true } } },
    });

    return versLieuResume(lieu);
  }

  async modifierLieu(
    clientId: string,
    lieuId: string,
    donnees: LieuUpdate,
    agenceId: string,
  ): Promise<LieuResume> {
    await this.exigerClient(clientId, agenceId, avecComptes);

    // On verifie que le lieu appartient bien a ce client : sans ce filtre, un
    // identifiant de lieu devine permettrait de modifier celui d'un autre client.
    const existant = await this.prisma.lieuIntervention.findFirst({
      where: { id: lieuId, clientId },
      select: { id: true, adresse: true, codePostal: true, ville: true },
    });

    if (!existant) {
      throw new NotFoundException(`Lieu ${lieuId} introuvable`);
    }

    const lieu = await this.prisma.lieuIntervention.update({
      where: { id: lieuId },
      data: donnees,
      include: { _count: { select: { missions: true } } },
    });

    if (!GeocodageService.memeAdresse(existant, lieu)) {
      await this.geocodage.situer('lieu_intervention', lieuId, lieu);

      return this.prisma.lieuIntervention
        .findUniqueOrThrow({
          where: { id: lieuId },
          include: { _count: { select: { missions: true } } },
        })
        .then(versLieuResume);
    }

    return versLieuResume(lieu);
  }

  /**
   * Charge un client en verifiant qu'il appartient a l'agence appelante.
   * Repond 404 et pas 403 : on ne confirme pas l'existence d'un client
   * d'une autre agence.
   */
  private async exigerClient<TArgs extends Prisma.ClientDefaultArgs>(
    id: string,
    agenceId: string,
    args: TArgs,
  ): Promise<Prisma.ClientGetPayload<TArgs>> {
    const client = await this.prisma.client.findFirst({ where: { id, agenceId }, ...args });

    if (!client) {
      throw new NotFoundException(`Client ${id} introuvable`);
    }

    return client as Prisma.ClientGetPayload<TArgs>;
  }
}
