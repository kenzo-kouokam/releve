import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';

/** Ce qu'il faut savoir d'une personne pour lui ecrire. */
export interface Destinataire {
  id: string;
  prenom: string;
  email: string;
}

/** Candidatures encore vivantes au moment ou la mission bascule. */
const ETATS_EN_COURS = ['ENVOYEE', 'ACCEPTEE_CANDIDAT'] as const;

/**
 * Qui est concerne par une mission, et a quel titre.
 *
 * Un seul endroit, appele deux fois : une premiere pour composer l'evenement
 * que recoit l'automatisation, une seconde quand elle demande a l'API
 * d'expedier elle-meme. Si les deux calculs vivaient separement, un workflow
 * pourrait obtenir un courriel pour quelqu'un qui n'etait pas dans la liste
 * qu'on lui a servie, et la porte d'eligibilite ne voudrait plus rien dire.
 */
@Injectable()
export class DestinatairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  /**
   * Les candidats a qui la mission peut etre annoncee.
   *
   * La preference de notification est appliquee ici, et pas plus loin : une
   * alerte de mission est un courriel de service, il se coupe depuis « Mon
   * compte ». Filtrer des maintenant evite qu'une reference sorte vers
   * l'automatisation pour une personne a qui, de toute facon, on n'ecrira pas.
   */
  async eligibles(missionId: string): Promise<Destinataire[]> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { agenceId: true },
    });

    if (!mission) {
      return [];
    }

    const candidats = await this.prisma.candidat.findMany({
      where: {
        agenceId: mission.agenceId,
        statut: 'ACTIF',
        utilisateur: { actif: true, notificationsEmail: true, emailVerifieLe: { not: null } },
      },
      select: { id: true, prenom: true, utilisateur: { select: { email: true } } },
    });

    const retenus: Destinataire[] = [];

    for (const candidat of candidats) {
      const evaluation = await this.matching.evaluer(missionId, candidat.id);

      // La meme porte que partout ailleurs. Annoncer une mission a quelqu'un
      // dont la candidature serait refusee d'office serait pire que se taire.
      if (!evaluation || evaluation.motifs.length) {
        continue;
      }

      retenus.push({
        id: candidat.id,
        prenom: candidat.prenom,
        email: candidat.utilisateur!.email,
      });
    }

    return retenus;
  }

  /**
   * Les candidats dont la candidature en cours vient de tomber.
   *
   * Appele **avant** la transaction qui cloture : apres, ces candidatures ne
   * sont plus « en cours », et on ne saurait plus les distinguer de celles
   * refusees la semaine derniere.
   *
   * Aucun filtre sur la preference de notification : apprendre que la mission
   * pour laquelle on s'est porte candidat est pourvue n'est pas un service
   * rendu, c'est la suite de sa propre demarche. Se taire laisserait quelqu'un
   * garder une date libre pour rien.
   */
  enCours(missionId: string, saufCandidatId?: string): Promise<Destinataire[]> {
    return this.parPropositions(missionId, { statut: { in: [...ETATS_EN_COURS] } }, saufCandidatId);
  }

  /**
   * Les candidats ayant postule, quel que soit le sort de leur candidature.
   *
   * Sert de perimetre d'autorisation a la route d'envoi : on peut ecrire a qui
   * s'est manifeste sur cette mission, et a personne d'autre.
   */
  ayantPostule(missionId: string, saufCandidatId?: string): Promise<Destinataire[]> {
    return this.parPropositions(missionId, {}, saufCandidatId);
  }

  /** Le candidat retenu, quand la mission est pourvue. */
  async retenu(missionId: string): Promise<Destinataire | null> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: {
        candidatRetenu: {
          select: { id: true, prenom: true, utilisateur: { select: { email: true } } },
        },
      },
    });

    const candidat = mission?.candidatRetenu;

    if (!candidat?.utilisateur) {
      return null;
    }

    return { id: candidat.id, prenom: candidat.prenom, email: candidat.utilisateur.email };
  }

  /**
   * Retrouve des candidats par identifiant, pour leur ecrire.
   *
   * Sert aux listes que l'appelant a relevees avant sa transaction : il en
   * connait les identifiants, pas les adresses. Ceux dont l'adresse n'est pas
   * verifiee sont ecartes — il n'y aurait nulle part ou ecrire.
   */
  async parIds(ids: string[]): Promise<Destinataire[]> {
    const candidats = await this.prisma.candidat.findMany({
      where: {
        id: { in: ids },
        utilisateur: { actif: true, emailVerifieLe: { not: null } },
      },
      select: { id: true, prenom: true, utilisateur: { select: { email: true } } },
    });

    return candidats.map((candidat) => ({
      id: candidat.id,
      prenom: candidat.prenom,
      email: candidat.utilisateur!.email,
    }));
  }

  private async parPropositions(
    missionId: string,
    filtre: { statut?: { in: string[] } },
    saufCandidatId?: string,
  ): Promise<Destinataire[]> {
    const propositions = await this.prisma.proposition.findMany({
      where: {
        missionId,
        ...(filtre.statut ? { statut: filtre.statut as never } : {}),
        ...(saufCandidatId ? { candidatId: { not: saufCandidatId } } : {}),
        // Sans adresse verifiee, il n'y a nulle part ou ecrire.
        candidat: { utilisateur: { actif: true, emailVerifieLe: { not: null } } },
      },
      select: {
        candidat: {
          select: { id: true, prenom: true, utilisateur: { select: { email: true } } },
        },
      },
    });

    return propositions.map((proposition) => ({
      id: proposition.candidat.id,
      prenom: proposition.candidat.prenom,
      email: proposition.candidat.utilisateur!.email,
    }));
  }
}
