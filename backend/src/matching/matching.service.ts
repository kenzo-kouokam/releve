import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CandidatClasse,
  CandidatEcarte,
  CandidatPropose,
  ClassementMission,
  ClassementQuery,
  MotifExclusion,
  PointFortCandidat,
  ScoreDetail,
  UtilisateurSession,
} from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculerScore,
  distanceKm,
  motifsExclusion,
  type BesoinAPourvoir,
  type ProfilAEvaluer,
} from './score';

/** Missions qui immobilisent déjà un candidat sur une période. */
const ETATS_ENGAGEANTS = ['VALIDEE', 'CONTRACTUALISEE', 'EN_COURS'] as const;

const fichePourScore = Prisma.validator<Prisma.CandidatDefaultArgs>()({
  select: {
    id: true,
    nom: true,
    prenom: true,
    statut: true,
    rayonKm: true,
    latitude: true,
    longitude: true,
    permisB: true,
    vehicule: true,
    visiteMedicaleLe: true,
    qualifications: {
      select: {
        obtenueLe: true,
        verifieeLe: true,
        expireLe: true,
        qualification: { select: { id: true, code: true, libelle: true } },
      },
    },
    experiences: {
      // Seules les lignes verifiees par l'agence sont chargees. Le filtre est
      // pose ici, dans la requete, et non dans le bareme : une experience non
      // controlee ne doit pas meme parvenir au calcul, sans quoi il suffirait
      // d'oublier une condition quelque part pour que la declaration se mette a
      // rapporter des points.
      where: { verifieeLe: { not: null } },
      select: {
        debutLe: true,
        finLe: true,
        quotitePourcent: true,
        qualificationId: true,
      },
    },
    disponibilites: {
      select: {
        jourSemaine: true,
        heureDebut: true,
        heureFin: true,
        valideDu: true,
        valideAu: true,
      },
    },
    indisponibilites: { select: { du: true, au: true } },
    missions: {
      where: { statut: { in: [...ETATS_ENGAGEANTS] } },
      select: { dateDebut: true, dateFin: true, heureDebut: true, heureFin: true },
    },
    _count: { select: { missions: true } },
  },
});

type FicheChargee = Prisma.CandidatGetPayload<typeof fichePourScore>;

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Portée de lecture du classement.
   *
   * Le classement expose des fiches candidats : il est réservé à l'agence et à
   * l'établissement concerné. Un candidat n'a rien à faire ici — il ne doit pas
   * savoir qui d'autre a postulé.
   */
  private async mission(missionId: string, session: UtilisateurSession) {
    if (session.candidatId) {
      throw new ForbiddenException('Le classement des candidats ne vous est pas destine');
    }

    const mission = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        ...(session.agenceId ? { agenceId: session.agenceId } : {}),
        ...(session.clientId ? { clientId: session.clientId } : {}),
      },
      select: {
        id: true,
        agenceId: true,
        qualificationRequiseId: true,
        dateDebut: true,
        dateFin: true,
        heureDebut: true,
        heureFin: true,
        lieu: { select: { latitude: true, longitude: true } },
      },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    return mission;
  }

  /** Traduit une fiche Prisma en ce que le barème attend, sans logique métier. */
  private profil(fiche: FicheChargee, qualificationRequiseId: string): ProfilAEvaluer {
    const maintenant = new Date();

    const lien = fiche.qualifications.find((q) => q.qualification.id === qualificationRequiseId);

    const valide = !!lien?.verifieeLe && (!lien.expireLe || lien.expireLe > maintenant);

    return {
      statut: fiche.statut,
      rayonKm: fiche.rayonKm,
      latitude: fiche.latitude,
      longitude: fiche.longitude,
      diplomeValide: valide,
      experiences: fiche.experiences.map((poste) => ({
        debutLe: poste.debutLe,
        finLe: poste.finLe,
        quotitePourcent: poste.quotitePourcent,
        // Qualifiante quand le poste releve du diplome exige par cette
        // mission-ci : la meme fiche n'a donc pas la meme experience selon le
        // besoin, ce qui est exactement le propos.
        qualifiante: poste.qualificationId === qualificationRequiseId,
      })),
      creneaux: fiche.disponibilites,
      absences: fiche.indisponibilites,
      engagements: fiche.missions,
    };
  }

  private carteDeVisite(fiche: FicheChargee, codeRequis: string): CandidatPropose {
    const pertinente =
      fiche.qualifications.find((q) => q.qualification.code === codeRequis) ??
      fiche.qualifications[0];

    const pointsForts: PointFortCandidat[] = [
      {
        icone: 'star',
        libelle: 'Missions realisees',
        valeur: `${fiche._count.missions} avec l agence`,
      },
      {
        icone: 'map-pin',
        libelle: 'Mobilite',
        valeur: fiche.vehicule
          ? `Rayon de ${fiche.rayonKm} km, vehicule`
          : `Rayon de ${fiche.rayonKm} km`,
      },
    ];

    if (pertinente) {
      pointsForts.unshift({
        icone: 'briefcase',
        libelle: 'Diplome',
        valeur: pertinente.qualification.code,
      });
    }

    const etiquettes: string[] = [];

    if (fiche.statut === 'ACTIF') etiquettes.push('Profil valide');
    if (fiche.permisB) etiquettes.push('Permis B');
    if (fiche.visiteMedicaleLe) etiquettes.push('Visite medicale a jour');

    return {
      id: fiche.id,
      nom: fiche.nom,
      prenom: fiche.prenom,
      initiales: initiales(fiche.prenom, fiche.nom),
      qualification: pertinente?.qualification.libelle ?? null,
      etiquettes,
      pointsForts,
    };
  }

  /**
   * Classement des candidats pour une mission.
   *
   * Deux listes, jamais une seule : les retenus, ordonnés par score, et les
   * écartés avec leur motif. Une liste unique et courte laisserait croire que
   * le vivier est vide, alors qu'il est le plus souvent mal renseigné.
   */
  async classer(
    missionId: string,
    query: ClassementQuery,
    session: UtilisateurSession,
  ): Promise<ClassementMission> {
    const mission = await this.mission(missionId, session);

    const qualification = await this.prisma.qualification.findUniqueOrThrow({
      where: { id: mission.qualificationRequiseId },
      select: { code: true },
    });

    const besoin: BesoinAPourvoir = {
      dateDebut: mission.dateDebut,
      dateFin: mission.dateFin,
      heureDebut: mission.heureDebut,
      heureFin: mission.heureFin,
      latitude: mission.lieu.latitude,
      longitude: mission.lieu.longitude,
    };

    const [fiches, dejaProposes] = await Promise.all([
      this.prisma.candidat.findMany({
        // Le vivier est borné à l'agence de la mission : c'est le même
        // cloisonnement que partout ailleurs, il n'a pas d'exception ici.
        where: { agenceId: mission.agenceId, statut: { not: 'ARCHIVE' } },
        ...fichePourScore,
      }),
      this.prisma.proposition.findMany({
        where: { missionId },
        select: { candidatId: true },
      }),
    ]);

    const proposes = new Set(dejaProposes.map((p) => p.candidatId));

    const retenus: CandidatClasse[] = [];
    const ecartes: CandidatEcarte[] = [];

    for (const fiche of fiches) {
      const profil = this.profil(fiche, mission.qualificationRequiseId);
      const motifs = motifsExclusion(profil, besoin);
      const carte = this.carteDeVisite(fiche, qualification.code);

      if (motifs.length) {
        ecartes.push({ candidat: carte, motifs });
        continue;
      }

      retenus.push({
        candidat: carte,
        score: calculerScore(profil, besoin),
        distanceKm: distanceKm(
          profil.latitude,
          profil.longitude,
          besoin.latitude,
          besoin.longitude,
        ),
        dejaPropose: proposes.has(fiche.id),
      });
    }

    retenus.sort((a, b) => b.score.total - a.score.total);

    return {
      missionId,
      retenus: retenus.slice(0, query.limite),
      ecartes: query.ecartes ? ecartes.slice(0, query.limite) : [],
      examines: fiches.length,
    };
  }

  /**
   * Éligibilité et score d'un couple mission / candidat.
   *
   * Les deux sont rendus ensemble, et c'est le point de cette méthode. Le
   * classement de l'agence passait par la porte d'exclusion, la candidature du
   * côté public ne vérifiait que le statut et le diplôme, et le score figé ne
   * vérifiait rien du tout : trois chemins, trois vérités. Une intervenante
   * hors de son rayon pouvait postuler, obtenir un score, apparaître chez
   * l'établissement — et rester introuvable dans le classement de l'agence, qui
   * l'écartait.
   *
   * La porte est ici une seule fois. Qui veut scorer traverse d'abord ce que
   * `classer()` applique déjà.
   */
  async evaluer(
    missionId: string,
    candidatId: string,
  ): Promise<{ motifs: MotifExclusion[]; score: ScoreDetail } | null> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: {
        qualificationRequiseId: true,
        dateDebut: true,
        dateFin: true,
        heureDebut: true,
        heureFin: true,
        lieu: { select: { latitude: true, longitude: true } },
      },
    });

    const fiche = await this.prisma.candidat.findUnique({
      where: { id: candidatId },
      ...fichePourScore,
    });

    if (!mission || !fiche) {
      return null;
    }

    const profil = this.profil(fiche, mission.qualificationRequiseId);

    const besoin: BesoinAPourvoir = {
      dateDebut: mission.dateDebut,
      dateFin: mission.dateFin,
      heureDebut: mission.heureDebut,
      heureFin: mission.heureFin,
      latitude: mission.lieu.latitude,
      longitude: mission.lieu.longitude,
    };

    return { motifs: motifsExclusion(profil, besoin), score: calculerScore(profil, besoin) };
  }

  /**
   * Score seul, figé au moment de la proposition.
   *
   * Il est recalculé et stocké sur la ligne : un score qui bougerait après coup
   * — parce que le candidat a déplacé une disponibilité — rendrait la décision
   * de l'établissement incompréhensible a posteriori.
   */
  async scorer(missionId: string, candidatId: string): Promise<ScoreDetail | null> {
    const evaluation = await this.evaluer(missionId, candidatId);

    return evaluation?.score ?? null;
  }
}
