import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CandidatCreate,
  CandidatDetail,
  CandidatListQuery,
  CandidatResume,
  CandidatUpdate,
  DisponibilitesRemplace,
  DisponibiliteResume,
  ExercicePrealable,
  ExperienceCreate,
  ExperienceResume,
  ExperienceVerification,
  Indisponibilite,
  IndisponibiliteResume,
  PageResultat,
  QualificationCandidatCreate,
  QualificationCandidatResume,
  QualificationCandidatUpdate,
  UtilisateurSession,
} from '@releve/shared';
import { SEUIL_EXERCICE_PREALABLE_HEURES, heuresDepuisMois } from '@releve/shared';
import { heuresExercice, type PosteExerce } from '../matching/experience';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsCompteService } from '../mail/notifications-compte.service';
import { GeocodageService } from '../geocodage/geocodage.service';
import { CompetencesService } from '../competences/competences.service';

const avecQualifications = {
  include: { qualifications: { include: { qualification: true } } },
} satisfies Prisma.CandidatDefaultArgs;

// `Prisma.validator` plutot que `satisfies` : `DefaultArgs` ne decrit que
// select et include, et laisserait `orderBy` s'elargir en `string`.
const avecExperiences = Prisma.validator<Prisma.Candidat$experiencesArgs>()({
  include: { qualification: { select: { libelle: true } } },
  // Du poste le plus recent au plus ancien : c'est l'ordre dans lequel on lit
  // un parcours, et celui dans lequel l'agence verifie.
  orderBy: [{ debutLe: 'desc' }],
});

const avecTout = {
  include: {
    qualifications: {
      include: { qualification: true },
      orderBy: { qualification: { code: 'asc' } },
    },
    experiences: avecExperiences,
    disponibilites: { orderBy: [{ jourSemaine: 'asc' }, { heureDebut: 'asc' }] },
    indisponibilites: { orderBy: { du: 'asc' } },
    competences: {
      include: { competence: { select: { id: true, libelle: true } } },
      orderBy: { competence: { libelle: 'asc' } },
    },
  },
} satisfies Prisma.CandidatDefaultArgs;

type CandidatComplet = Prisma.CandidatGetPayload<typeof avecQualifications>;
type CandidatDetaille = Prisma.CandidatGetPayload<typeof avecTout>;
type LienQualification = CandidatDetaille['qualifications'][number];
type ExperienceChargee = CandidatDetaille['experiences'][number];

/** Les colonnes @db.Date sont des dates civiles : on les rend sans fuseau. */
function enDateIso(valeur: Date | null): string | null {
  return valeur ? valeur.toISOString().slice(0, 10) : null;
}

function versDate(valeur: string | null | undefined): Date | null | undefined {
  if (valeur === undefined) {
    return undefined;
  }

  return valeur === null ? null : new Date(`${valeur}T00:00:00.000Z`);
}

function versResume(candidat: CandidatComplet): CandidatResume {
  return {
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
  };
}

function versQualificationResume(
  lien: LienQualification,
  aujourdHui: string,
): QualificationCandidatResume {
  const expireLe = enDateIso(lien.expireLe);

  return {
    qualificationId: lien.qualificationId,
    code: lien.qualification.code,
    libelle: lien.qualification.libelle,
    obtenueLe: enDateIso(lien.obtenueLe),
    expireLe,
    justificatifUrl: lien.justificatifUrl,
    verifieeLe: lien.verifieeLe ? lien.verifieeLe.toISOString() : null,
    verifieePar: lien.verifieePar,
    expiree: expireLe !== null && expireLe < aujourdHui,
  };
}

/**
 * Duree d'un poste en mois, ponderee par la quotite, sans arrondi.
 *
 * Calculee ici et rendue au client plutot que laissee a son appreciation : le
 * front afficherait sinon sa propre arithmetique, qui divergerait de celle du
 * bareme, et un candidat lirait « 2 ans » sur sa fiche pour un score calcule
 * sur dix-huit mois.
 *
 * L'arrondi est laisse aux deux sorties, qui n'ont pas la meme finesse : les
 * mois se lisent au dixieme, les heures a l'unite. Arrondir ici obligerait les
 * secondes a heriter de l'imprecision des premiers.
 */
function moisExacts(experience: ExperienceChargee, reference: Date): number {
  const debut = experience.debutLe.getTime();
  const fin = Math.min(experience.finLe?.getTime() ?? reference.getTime(), reference.getTime());
  const jours = Math.max(0, fin - debut) / (24 * 3600 * 1000);

  return (jours / 30.436875) * (experience.quotitePourcent / 100);
}


function versExperienceResume(experience: ExperienceChargee, reference: Date): ExperienceResume {
  // Les heures partent des dates brutes, pas de `dureeMois` : celui-ci est
  // arrondi au dixieme de mois, soit trois jours, et l'ecran affichait « 4 406 h »
  // sur une ligne juste au-dessus d'un total exact de « 4 402 h ». Deux nombres
  // a quatre heures d'ecart sur le meme ecran donnent l'impression que l'un des
  // deux ment.
  const exacts = moisExacts(experience, reference);

  return {
    id: experience.id,
    employeur: experience.employeur,
    intitule: experience.intitule,
    qualificationId: experience.qualificationId,
    qualificationLibelle: experience.qualification?.libelle ?? null,
    debutLe: enDateIso(experience.debutLe)!,
    finLe: enDateIso(experience.finLe),
    quotitePourcent: experience.quotitePourcent,
    description: experience.description,
    verifieeLe: experience.verifieeLe ? experience.verifieeLe.toISOString() : null,
    verifieePar: experience.verifieePar,
    dureeMois: Math.round(exacts * 10) / 10,
    dureeHeures: Math.round(heuresDepuisMois(exacts)),
    enCours: experience.finLe === null,
  };
}

/**
 * Ou en est le candidat de l'exercice prealable exige.
 *
 * Ne comptent que les postes **rattaches au referentiel** : la loi parle
 * d'exercice du metier, et un poste hors referentiel — qui pese pourtant pour
 * moitie au bareme — ne dit rien de celui-ci.
 *
 * Aucun plafond n'est applique, a la difference du bareme. Le plafond de cinq
 * ans existe pour eviter de departager deux professionnelles sur une difference
 * que l'etablissement ne constatera jamais ; ici on ne departage personne, on
 * mesure une duree face a un seuil.
 */
function bilanExercicePrealable(
  experiences: ExperienceChargee[],
  reference: Date,
): ExercicePrealable {
  // Calcule sur les dates brutes, et non en additionnant les `dureeHeures`
  // deja arrondies de chaque ligne : sur dix postes, dix arrondis feraient
  // deriver le total de plusieurs heures du seuil affiche juste a cote.
  const poste = (ligne: ExperienceChargee): PosteExerce => ({
    debutLe: ligne.debutLe,
    finLe: ligne.finLe,
    quotitePourcent: ligne.quotitePourcent,
    duReferentiel: ligne.qualificationId !== null,
  });

  const heuresVerifiees = heuresExercice(
    experiences.filter((ligne) => ligne.verifieeLe !== null).map(poste),
    reference,
  );
  const heuresDeclarees = heuresExercice(experiences.map(poste), reference);

  return {
    heuresVerifiees,
    heuresDeclarees,
    seuilHeures: SEUIL_EXERCICE_PREALABLE_HEURES,
    seuilAtteint: heuresVerifiees >= SEUIL_EXERCICE_PREALABLE_HEURES,
    heuresManquantes: Math.max(0, SEUIL_EXERCICE_PREALABLE_HEURES - heuresVerifiees),
  };
}

@Injectable()
export class CandidatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodage: GeocodageService,
    private readonly notifications: NotificationsCompteService,
    private readonly competences: CompetencesService,
  ) {}

  async lister(query: CandidatListQuery, agenceId: string): Promise<PageResultat<CandidatResume>> {
    const where: Prisma.CandidatWhereInput = {
      // Cloisonnement multi-agence : jamais optionnel, jamais surchargeable
      // depuis la query - il vient du jeton.
      agenceId,
      ...(query.statut ? { statut: query.statut } : {}),
      ...(query.permisB === undefined ? {} : { permisB: query.permisB }),
      // Conjonctif : autant de conditions `some` que de competences demandees.
      // Un seul `some` avec un `in` rendrait les candidats qui en detiennent
      // une seule — l'union au lieu de l'intersection, donc l'inverse de ce
      // qu'un charge de recrutement demande en cochant deux cases.
      ...(query.competences?.length
        ? {
            AND: query.competences.map((competenceId) => ({
              competences: { some: { competenceId } },
            })),
          }
        : {}),
      ...(query.recherche
        ? {
            OR: [
              { nom: { contains: query.recherche, mode: 'insensitive' } },
              { prenom: { contains: query.recherche, mode: 'insensitive' } },
              { ville: { contains: query.recherche, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, candidats] = await this.prisma.$transaction([
      this.prisma.candidat.count({ where }),
      this.prisma.candidat.findMany({
        where,
        ...avecQualifications,
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        skip: (query.page - 1) * query.limite,
        take: query.limite,
      }),
    ]);

    return {
      donnees: candidats.map(versResume),
      total,
      page: query.page,
      limite: query.limite,
    };
  }

  async detail(id: string, agenceId: string): Promise<CandidatDetail> {
    const candidat = await this.exigerCandidat(id, agenceId, avecTout);
    const maintenant = new Date();
    const aujourdHui = maintenant.toISOString().slice(0, 10);
    const experiences = candidat.experiences.map((poste) =>
      versExperienceResume(poste, maintenant),
    );

    return {
      ...versResume(candidat),
      adresse: candidat.adresse,
      latitude: candidat.latitude,
      longitude: candidat.longitude,
      geocodePrecision: candidat.geocodePrecision,
      geocodeLe: candidat.geocodeLe ? candidat.geocodeLe.toISOString() : null,
      visiteMedicaleLe: enDateIso(candidat.visiteMedicaleLe),
      vaccinationVerifiee: candidat.vaccinationVerifiee,
      competences: candidat.competences.map((lien) => ({
        id: lien.competence.id,
        libelle: lien.competence.libelle,
      })),
      qualificationsDetail: candidat.qualifications.map((lien) =>
        versQualificationResume(lien, aujourdHui),
      ),
      experiences,
      exercicePrealable: bilanExercicePrealable(candidat.experiences, maintenant),
      disponibilites: candidat.disponibilites.map((creneau): DisponibiliteResume => ({
        id: creneau.id,
        jourSemaine: creneau.jourSemaine,
        heureDebut: creneau.heureDebut,
        heureFin: creneau.heureFin,
        recurrente: creneau.recurrente,
        valideDu: enDateIso(creneau.valideDu) ?? undefined,
        valideAu: enDateIso(creneau.valideAu) ?? undefined,
      })),
      indisponibilites: candidat.indisponibilites.map((periode): IndisponibiliteResume => ({
        id: periode.id,
        du: enDateIso(periode.du)!,
        au: enDateIso(periode.au)!,
        motif: periode.motif,
      })),
    };
  }

  async creer(donnees: CandidatCreate, agenceId: string): Promise<CandidatResume> {
    const candidat = await this.prisma.candidat.create({
      data: {
        agenceId,
        nom: donnees.nom,
        prenom: donnees.prenom,
        email: donnees.email,
        telephone: donnees.telephone,
        adresse: donnees.adresse,
        codePostal: donnees.codePostal,
        ville: donnees.ville,
        rayonKm: donnees.rayonKm,
        permisB: donnees.permisB,
        vehicule: donnees.vehicule,
      },
      ...avecQualifications,
    });

    // Apres l'ecriture, et sans la bloquer : la fiche existe meme si la BAN est
    // indisponible, et `releve geocoder` reprendra les adresses restees sans
    // point.
    await this.geocodage.situer('candidat', candidat.id, donnees);

    return versResume(candidat);
  }

  async modifier(id: string, donnees: CandidatUpdate, agenceId: string): Promise<CandidatDetail> {
    const candidat = await this.exigerCandidat(id, agenceId, avecTout);

    // Meme controle que cote mission, et pour la meme raison : sans lui, la
    // cle etrangere leverait une P2003 rendue en 500, et une faute de saisie
    // passerait pour une panne du serveur.
    if (donnees.competences?.length) {
      const connues = await this.competences.existantes(donnees.competences);
      const inconnues = donnees.competences.filter((competenceId) => !connues.has(competenceId));

      if (inconnues.length) {
        throw new BadRequestException(
          `Competences inconnues du referentiel : ${inconnues.join(', ')}`,
        );
      }
    }

    // Passer ACTIF, c'est rendre le candidat proposable sur une mission. Sans
    // justificatif verifie, l'agence engagerait sa responsabilite a l'aveugle.
    if (donnees.statut === 'ACTIF' && candidat.statut !== 'ACTIF') {
      if (!this.aUneQualificationValide(candidat.qualifications)) {
        throw new BadRequestException(
          'Un candidat ne peut passer ACTIF sans au moins une qualification verifiee et non expiree',
        );
      }
    }

    const validation = donnees.statut === 'ACTIF' && candidat.statut !== 'ACTIF';
    const { visiteMedicaleLe, competences, ...reste } = donnees;

    // Les competences declarees remplacent la liste, elles ne la completent
    // pas : `deleteMany` puis `createMany` dans la meme requete. Distinguer
    // « je n'y touche pas » de « je les retire toutes » serait impossible
    // autrement — un tableau vide ne sait pas dire lequel des deux il veut
    // dire, c'est l'absence du champ qui le dit.
    const remplacerCompetences =
      competences === undefined
        ? {}
        : {
            competences: {
              deleteMany: {},
              createMany: { data: competences.map((competenceId) => ({ competenceId })) },
            },
          };

    const apres = await this.prisma.candidat.update({
      where: { id },
      data: {
        ...reste,
        ...remplacerCompetences,
        ...(visiteMedicaleLe === undefined ? {} : { visiteMedicaleLe: versDate(visiteMedicaleLe) }),
        // La date de derniere annonce est posee au moment de la validation, et
        // pas laissee nulle : sinon le premier balayage deroulerait a un nouvel
        // arrivant tout l'historique des publications, jusqu'a la plus ancienne.
        ...(validation ? { missionsNotifieesLe: new Date() } : {}),
      },
      select: { adresse: true, codePostal: true, ville: true },
    });

    // Une adresse retouchee invalide le point : on le recalcule, et s'il ne
    // vient pas, on efface. Conserver les coordonnees de l'ancien domicile
    // laisserait une distance mesurable, donc credible, et fausse.
    if (!GeocodageService.memeAdresse(candidat, apres)) {
      await this.geocodage.situer('candidat', id, apres);
    }

    // Jamais bloquant : le dossier est deja valide quand on arrive ici, et
    // faire echouer la requete sur une panne de SMTP laisserait le charge de
    // recrutement persuade que sa validation n'a pas pris.
    if (validation) {
      await this.notifications.dossierValide(id);
    }

    return this.detail(id, agenceId);
  }

  async ajouterQualification(
    id: string,
    donnees: QualificationCandidatCreate,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    const qualification = await this.prisma.qualification.findUnique({
      where: { id: donnees.qualificationId },
      select: { id: true },
    });

    if (!qualification) {
      throw new NotFoundException(`Qualification ${donnees.qualificationId} introuvable`);
    }

    const deja = await this.prisma.qualificationCandidat.findUnique({
      where: {
        candidatId_qualificationId: { candidatId: id, qualificationId: donnees.qualificationId },
      },
      select: { id: true },
    });

    if (deja) {
      throw new BadRequestException('Cette qualification est deja rattachee au candidat');
    }

    await this.prisma.qualificationCandidat.create({
      data: {
        candidatId: id,
        qualificationId: donnees.qualificationId,
        obtenueLe: versDate(donnees.obtenueLe) ?? null,
        expireLe: versDate(donnees.expireLe) ?? null,
        justificatifUrl: donnees.justificatifUrl ?? null,
      },
    });

    return this.detail(id, agenceId);
  }

  async modifierQualification(
    id: string,
    qualificationId: string,
    donnees: QualificationCandidatUpdate,
    utilisateur: UtilisateurSession,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    const lien = await this.prisma.qualificationCandidat.findUnique({
      where: { candidatId_qualificationId: { candidatId: id, qualificationId } },
      select: { id: true },
    });

    if (!lien) {
      throw new NotFoundException('Cette qualification n est pas rattachee au candidat');
    }

    const { verifiee, obtenueLe, expireLe, justificatifUrl } = donnees;

    await this.prisma.qualificationCandidat.update({
      where: { id: lien.id },
      data: {
        ...(obtenueLe === undefined ? {} : { obtenueLe: versDate(obtenueLe) }),
        ...(expireLe === undefined ? {} : { expireLe: versDate(expireLe) }),
        ...(justificatifUrl === undefined ? {} : { justificatifUrl }),
        // On trace qui a verifie et quand : en cas de controle, c'est cette
        // ligne qui justifie qu'un interimaire a ete propose sur une mission.
        ...(verifiee === undefined
          ? {}
          : verifiee
            ? { verifieeLe: new Date(), verifieePar: utilisateur.email }
            : { verifieeLe: null, verifieePar: null }),
      },
    });

    return this.detail(id, agenceId);
  }

  async retirerQualification(
    id: string,
    qualificationId: string,
    agenceId: string,
  ): Promise<CandidatDetail> {
    const candidat = await this.exigerCandidat(id, agenceId, avecTout);

    const lien = candidat.qualifications.find((q) => q.qualificationId === qualificationId);

    if (!lien) {
      throw new NotFoundException('Cette qualification n est pas rattachee au candidat');
    }

    // Un candidat ACTIF sans qualification verifiee deviendrait proposable sans
    // justificatif : on refuse plutot que de le desactiver dans son dos.
    if (candidat.statut === 'ACTIF') {
      const restantes = candidat.qualifications.filter(
        (q) => q.qualificationId !== qualificationId,
      );

      if (!this.aUneQualificationValide(restantes)) {
        throw new BadRequestException(
          'Derniere qualification verifiee d un candidat actif : le passer INACTIF avant de la retirer',
        );
      }
    }

    await this.prisma.qualificationCandidat.delete({ where: { id: lien.id } });

    return this.detail(id, agenceId);
  }

  /**
   * Ajoute un poste au parcours du candidat.
   *
   * La ligne nait non verifiee, quelle que soit la main qui la saisit — y
   * compris celle de l'agence. Verifier, c'est constater une piece ; le faire
   * au moment de la saisie confondrait les deux gestes, et on ne saurait plus
   * quelles lignes ont reellement ete controlees.
   */
  async ajouterExperience(
    id: string,
    donnees: ExperienceCreate,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    if (donnees.qualificationId) {
      const qualification = await this.prisma.qualification.findUnique({
        where: { id: donnees.qualificationId },
        select: { id: true },
      });

      if (!qualification) {
        throw new NotFoundException(`Qualification ${donnees.qualificationId} introuvable`);
      }
    }

    await this.prisma.experienceProfessionnelle.create({
      data: {
        candidatId: id,
        employeur: donnees.employeur,
        intitule: donnees.intitule,
        qualificationId: donnees.qualificationId ?? null,
        debutLe: versDate(donnees.debutLe)!,
        finLe: versDate(donnees.finLe) ?? null,
        quotitePourcent: donnees.quotitePourcent,
        description: donnees.description ?? null,
      },
    });

    return this.detail(id, agenceId);
  }

  /**
   * Verifie — ou devalide — un poste, sur certificat de travail.
   *
   * C'est le seul geste qui fait entrer une experience dans le score. On trace
   * qui l'a pose et quand, pour la meme raison que sur les qualifications : en
   * cas de contestation d'un classement, c'est cette ligne qui justifie les
   * points attribues.
   */
  async verifierExperience(
    id: string,
    experienceId: string,
    donnees: ExperienceVerification,
    utilisateur: UtilisateurSession,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    const poste = await this.exigerExperience(id, experienceId);

    // Le rattachement n'est touche que s'il est fourni : `undefined` laisse la
    // ligne telle quelle, `null` la detache. Sans cette distinction, tout appel
    // qui se contente de verifier effacerait le diplome au passage.
    const rattachement =
      donnees.qualificationId === undefined ? {} : { qualificationId: donnees.qualificationId };

    if (donnees.qualificationId) {
      // Une qualification d'un autre referentiel que celui de l'agence n'existe
      // pas : `findUniqueOrThrow` rendrait une 500, on veut une 400.
      const existe = await this.prisma.qualification.count({
        where: { id: donnees.qualificationId },
      });

      if (existe === 0) {
        throw new BadRequestException('Qualification inconnue du referentiel');
      }
    }

    await this.prisma.experienceProfessionnelle.update({
      where: { id: poste.id },
      data: {
        ...rattachement,
        ...(donnees.verifiee
          ? { verifieeLe: new Date(), verifieePar: utilisateur.email }
          : { verifieeLe: null, verifieePar: null }),
      },
    });

    return this.detail(id, agenceId);
  }

  async retirerExperience(
    id: string,
    experienceId: string,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    const poste = await this.exigerExperience(id, experienceId);

    await this.prisma.experienceProfessionnelle.delete({ where: { id: poste.id } });

    return this.detail(id, agenceId);
  }

  /**
   * Charge un poste en verifiant qu'il appartient bien a cette fiche.
   *
   * Sans ce filtre, un identifiant devine permettrait d'agir sur l'experience
   * d'un autre candidat — y compris d'une autre agence, puisque l'identifiant
   * de la fiche ne suffirait plus a borner la portee.
   */
  private async exigerExperience(
    candidatId: string,
    experienceId: string,
  ): Promise<{ id: string; verifieeLe: Date | null }> {
    const poste = await this.prisma.experienceProfessionnelle.findFirst({
      where: { id: experienceId, candidatId },
      select: { id: true, verifieeLe: true },
    });

    if (!poste) {
      throw new NotFoundException(`Experience ${experienceId} introuvable`);
    }

    return poste;
  }

  /**
   * Remplace l'integralite du planning hebdomadaire.
   *
   * Remplacement et pas edition ligne a ligne : le chevauchement se verifie sur
   * l'ensemble des creneaux, pas sur celui qu'on ajoute. Une edition
   * incrementale obligerait a relire l'existant a chaque appel, avec une course
   * possible entre deux onglets ouverts sur la meme fiche.
   */
  async remplacerDisponibilites(
    id: string,
    donnees: DisponibilitesRemplace,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    await this.prisma.$transaction([
      this.prisma.disponibilite.deleteMany({ where: { candidatId: id } }),
      this.prisma.disponibilite.createMany({
        data: donnees.disponibilites.map((creneau) => ({
          candidatId: id,
          jourSemaine: creneau.jourSemaine,
          heureDebut: creneau.heureDebut,
          heureFin: creneau.heureFin,
          recurrente: creneau.recurrente,
          valideDu: versDate(creneau.valideDu) ?? null,
          valideAu: versDate(creneau.valideAu) ?? null,
        })),
      }),
    ]);

    return this.detail(id, agenceId);
  }

  async ajouterIndisponibilite(
    id: string,
    donnees: Indisponibilite,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    await this.prisma.indisponibilite.create({
      data: {
        candidatId: id,
        du: versDate(donnees.du)!,
        au: versDate(donnees.au)!,
        motif: donnees.motif ?? null,
      },
    });

    return this.detail(id, agenceId);
  }

  async retirerIndisponibilite(
    id: string,
    indisponibiliteId: string,
    agenceId: string,
  ): Promise<CandidatDetail> {
    await this.exigerCandidat(id, agenceId, avecQualifications);

    const periode = await this.prisma.indisponibilite.findFirst({
      where: { id: indisponibiliteId, candidatId: id },
      select: { id: true },
    });

    if (!periode) {
      throw new NotFoundException(`Indisponibilite ${indisponibiliteId} introuvable`);
    }

    await this.prisma.indisponibilite.delete({ where: { id: periode.id } });

    return this.detail(id, agenceId);
  }

  private aUneQualificationValide(qualifications: LienQualification[]): boolean {
    const maintenant = new Date();

    return qualifications.some(
      (lien) => lien.verifieeLe !== null && (lien.expireLe === null || lien.expireLe >= maintenant),
    );
  }

  /**
   * Charge un candidat en verifiant qu'il appartient a l'agence appelante.
   * findFirst et pas findUnique : un candidat d'une autre agence doit repondre
   * 404, pas 403 - on ne confirme pas qu'il existe.
   */
  /**
   * Verifie qu'un candidat appartient bien a l'agence, et rend son identifiant.
   *
   * Sert aux pieces justificatives : `DocumentsService` ne connait qu'un
   * identifiant de candidat, le cloisonnement doit donc etre tranche ici, comme
   * pour toutes les autres routes du vivier.
   */
  async exigerAppartenance(id: string, agenceId: string): Promise<string> {
    const candidat = await this.exigerCandidat(id, agenceId, { select: { id: true } });

    return candidat.id;
  }

  private async exigerCandidat<TArgs extends Prisma.CandidatDefaultArgs>(
    id: string,
    agenceId: string,
    args: TArgs,
  ): Promise<Prisma.CandidatGetPayload<TArgs>> {
    const candidat = await this.prisma.candidat.findFirst({ where: { id, agenceId }, ...args });

    if (!candidat) {
      throw new NotFoundException(`Candidat ${id} introuvable`);
    }

    return candidat as Prisma.CandidatGetPayload<TArgs>;
  }
}
