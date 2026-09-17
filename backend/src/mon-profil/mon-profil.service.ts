import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CandidatDetail,
  CompletudeProfil,
  DeclarationDiplome,
  DisponibilitesRemplace,
  ExperienceCreate,
  MonProfilUpdate,
  UtilisateurSession,
} from '@releve/shared';
import { TYPES_DOCUMENT } from '@releve/shared';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { CandidatsService } from '../candidats/candidats.service';

/**
 * L'espace personnel de l'intérimaire.
 *
 * Ce service ne réécrit aucune règle métier : il délègue à `CandidatsService`,
 * qui porte déjà les garde-fous du back-office — chevauchement de créneaux,
 * qualification vérifiée obligatoire pour rester actif, cloisonnement par
 * agence. Le rôle de cette couche est ailleurs : borner ce que la personne a le
 * droit de toucher sur sa propre fiche, et rien de plus.
 */
@Injectable()
export class MonProfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidats: CandidatsService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Résout la fiche et son agence.
   *
   * Le jeton d'un candidat ne porte pas d'agence : il faut la lire pour pouvoir
   * réutiliser les méthodes du back-office, qui cloisonnent toutes dessus.
   */
  /* Publique depuis que le controleur en a besoin pour les pieces justificatives :
   * elles passent par `DocumentsService`, qui ne connait qu'un identifiant de
   * candidat. */
  async fiche(session: UtilisateurSession): Promise<{ id: string; agenceId: string }> {
    if (!session.candidatId) {
      throw new ForbiddenException("Ce compte n'est rattache a aucune fiche candidat");
    }

    const candidat = await this.prisma.candidat.findUnique({
      where: { id: session.candidatId },
      select: { id: true, agenceId: true },
    });

    if (!candidat) {
      throw new NotFoundException('Fiche candidat introuvable');
    }

    return candidat;
  }

  async lire(session: UtilisateurSession): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    return this.candidats.detail(id, agenceId);
  }

  async modifier(donnees: MonProfilUpdate, session: UtilisateurSession): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    // `monProfilUpdateSchema` a deja retire statut, e-mail et donnees
    // d'aptitude : ce qui arrive ici est par construction modifiable.
    return this.candidats.modifier(id, donnees, agenceId);
  }

  async remplacerDisponibilites(
    donnees: DisponibilitesRemplace,
    session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    return this.candidats.remplacerDisponibilites(id, donnees, agenceId);
  }

  /**
   * Déclaration d'un diplôme.
   *
   * Elle part non vérifiée, et le schéma partagé ne porte même pas de champ
   * permettant de le prétendre. C'est l'agence qui contrôle le justificatif ;
   * tant qu'elle ne l'a pas fait, la ligne ne rend éligible à rien.
   */
  async declarerDiplome(
    donnees: DeclarationDiplome,
    session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    await this.candidats.ajouterQualification(id, donnees, agenceId);

    return this.candidats.detail(id, agenceId);
  }

  /**
   * Retrait d'un diplôme déclaré.
   *
   * Seule une ligne encore non vérifiée peut être retirée par l'intéressé : une
   * qualification contrôlée par l'agence engage des missions passées, et la
   * faire disparaître effacerait la trace de ce contrôle.
   */
  async retirerDiplome(
    qualificationId: string,
    session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    const lien = await this.prisma.qualificationCandidat.findUnique({
      where: { candidatId_qualificationId: { candidatId: id, qualificationId } },
      select: { verifieeLe: true },
    });

    if (!lien) {
      throw new NotFoundException('Diplome introuvable sur votre fiche');
    }

    if (lien.verifieeLe) {
      throw new ForbiddenException(
        "Ce diplome a ete verifie par l'agence : elle seule peut le retirer",
      );
    }

    // Suppression directe, et non `retirerQualification`. Le garde-fou du
    // back-office protege la derniere qualification *verifiee* d'un candidat
    // actif ; on vient d'etablir que celle-ci ne l'est pas, donc la retirer ne
    // change rien a ce qui rend proposable. Passer par la methode du
    // back-office refuserait une declaration que personne n'a encore
    // controlee.
    await this.prisma.qualificationCandidat.delete({
      where: { candidatId_qualificationId: { candidatId: id, qualificationId } },
    });

    return this.candidats.detail(id, agenceId);
  }

  /**
   * Déclaration d'un poste occupé.
   *
   * Même règle que pour le diplôme, et elle vaut la peine d'être répétée : la
   * ligne part non vérifiée, et le schéma partagé ne porte aucun champ
   * permettant de prétendre l'inverse. Tant que l'agence n'a pas vu un
   * certificat de travail, ce poste s'affiche sur la fiche et ne rapporte pas
   * un point. Sans cela, n'importe qui s'inventerait cinq ans de terrain et
   * remonterait en tête des classements.
   */
  async declarerExperience(
    donnees: ExperienceCreate,
    session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    return this.candidats.ajouterExperience(id, donnees, agenceId);
  }

  /**
   * Retrait d'un poste déclaré.
   *
   * Comme pour les diplômes, seule une ligne encore non vérifiée peut être
   * retirée par l'intéressé. Une expérience contrôlée par l'agence a servi à
   * classer le candidat sur des missions passées ; la faire disparaître
   * effacerait la trace de ce contrôle, et rendrait des scores archivés
   * inexplicables.
   */
  async retirerExperience(
    experienceId: string,
    session: UtilisateurSession,
  ): Promise<CandidatDetail> {
    const { id, agenceId } = await this.fiche(session);

    const poste = await this.prisma.experienceProfessionnelle.findFirst({
      where: { id: experienceId, candidatId: id },
      select: { id: true, verifieeLe: true },
    });

    if (!poste) {
      throw new NotFoundException('Experience introuvable sur votre fiche');
    }

    if (poste.verifieeLe) {
      throw new ForbiddenException(
        "Cette experience a ete verifiee par l'agence : elle seule peut la retirer",
      );
    }

    await this.prisma.experienceProfessionnelle.delete({ where: { id: poste.id } });

    return this.candidats.detail(id, agenceId);
  }

  /**
   * Ce qu'il manque pour devenir proposable.
   *
   * Un intérimaire inscrit ne comprend pas pourquoi aucune mission ne lui est
   * accessible. Cette liste le dit en clair, dans l'ordre où ça bloque : sans
   * diplôme vérifié la porte d'éligibilité refuse, sans adresse localisée le
   * matching écarte, sans disponibilité le score de créneau tombe à zéro, sans
   * expérience déclarée la composante qui pèse le plus reste à zéro.
   */
  async completude(session: UtilisateurSession): Promise<CompletudeProfil> {
    const { id } = await this.fiche(session);

    const candidat = await this.prisma.candidat.findUniqueOrThrow({
      where: { id },
      select: {
        statut: true,
        latitude: true,
        longitude: true,
        telephone: true,
        _count: { select: { disponibilites: true, experiences: true } },
        qualifications: { select: { verifieeLe: true, expireLe: true } },
      },
    });

    const maintenant = new Date();
    const pieces = await this.documents.compter(id);

    const attendus: { cle: string; libelle: string; rempli: boolean }[] = [
      {
        cle: 'diplome',
        libelle: 'Un diplome verifie par l agence',
        rempli: candidat.qualifications.some(
          (lien) => lien.verifieeLe && (!lien.expireLe || lien.expireLe > maintenant),
        ),
      },
      {
        cle: 'adresse',
        libelle: 'Une adresse localisee, pour mesurer les distances',
        rempli: candidat.latitude !== null && candidat.longitude !== null,
      },
      {
        cle: 'disponibilites',
        libelle: 'Au moins un creneau de disponibilite',
        rempli: candidat._count.disponibilites > 0,
      },
      {
        // Ne bloque rien : un profil sans experience declaree reste
        // proposable, il marque simplement zero sur la composante qui pese le
        // plus. Le dire ici est le seul endroit ou la personne l'apprendra
        // avant de constater qu'aucune mission ne lui arrive.
        cle: 'experience',
        libelle: 'Au moins un poste declare, pour peser dans le classement',
        rempli: candidat._count.experiences > 0,
      },
      {
        // Ne bloque rien non plus, mais l'agence ne peut etablir ni contrat ni
        // paie sans ces pieces : un dossier sans elles s'arrete a la
        // candidature.
        cle: 'documents',
        libelle: 'Vos pieces justificatives : NIR, diplomes, CV, identite, RIB',
        rempli: pieces >= TYPES_DOCUMENT.length,
      },
      {
        cle: 'telephone',
        libelle: 'Un numero de telephone joignable',
        rempli: candidat.telephone.length > 0,
      },
      {
        cle: 'validation',
        libelle: 'La validation de votre profil par l agence',
        rempli: candidat.statut === 'ACTIF',
      },
    ];

    const remplis = attendus.filter((ligne) => ligne.rempli).length;

    return {
      pourcentage: Math.round((remplis / attendus.length) * 100),
      manques: attendus
        .filter((ligne) => !ligne.rempli)
        .map(({ cle, libelle }) => ({ cle, libelle })),
    };
  }
}
