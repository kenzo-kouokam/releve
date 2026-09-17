import {
  POIDS_COMPOSANTES,
  type ComposanteScore,
  type MotifExclusion,
  type ScoreDetail,
} from '@releve/shared';
import {
  bilanExperience,
  libelleDuree,
  PLAFOND_EXPERIENCE_MOIS,
  type BilanExperience,
  type ExperienceEvaluee,
} from './experience';

/**
 * Le calcul du score, isolé de la base.
 *
 * Aucune dépendance à Prisma ni à Nest : ces fonctions se testent seules, avec
 * des valeurs écrites à la main. C'est ce qui permet de vérifier un barème sans
 * monter une base, et de le faire évoluer sans casser le reste.
 */

const MINUTES_PAR_JOUR = 24 * 60;

export interface CreneauCandidat {
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  valideDu: Date | null;
  valideAu: Date | null;
}

export interface ProfilAEvaluer {
  statut: string;
  rayonKm: number;
  latitude: number | null;
  longitude: number | null;
  diplomeValide: boolean;
  /**
   * Postes occupés, déjà réduits à ceux que l'agence a vérifiés. Une expérience
   * déclarée et non contrôlée s'affiche sur la fiche mais ne rapporte rien :
   * c'est la même règle que pour le diplôme, et pour la même raison — sinon le
   * score se déclare lui-même.
   */
  experiences: ExperienceEvaluee[];
  creneaux: CreneauCandidat[];
  /** Périodes d'absence déclarées, bornes incluses. */
  absences: { du: Date; au: Date }[];
  /** Missions déjà décrochées, pour ne pas promettre deux fois la même heure. */
  engagements: { dateDebut: Date; dateFin: Date; heureDebut: string; heureFin: string }[];
}

export interface BesoinAPourvoir {
  dateDebut: Date;
  dateFin: Date;
  heureDebut: string;
  heureFin: string;
  latitude: number | null;
  longitude: number | null;
}

export function enMinutes(heure: string): number {
  const [h, m] = heure.split(':');

  return Number(h) * 60 + Number(m);
}

/** Durée d'une vacation, minuit franchi compris. */
export function dureeMinutes(heureDebut: string, heureFin: string): number {
  const debut = enMinutes(heureDebut);
  const fin = enMinutes(heureFin);

  return fin > debut ? fin - debut : fin + MINUTES_PAR_JOUR - debut;
}

/**
 * Distance à vol d'oiseau, formule de haversine.
 *
 * PostGIS ferait mieux, mais il faudrait une requête par couple. À l'échelle
 * d'un vivier d'agence — quelques centaines de fiches — le calcul en mémoire
 * est instantané et reste testable sans base.
 */
export function distanceKm(
  latA: number | null,
  lonA: number | null,
  latB: number | null,
  lonB: number | null,
): number | null {
  if (latA === null || lonA === null || latB === null || lonB === null) {
    return null;
  }

  const RAYON_TERRE_KM = 6371;
  const rad = (degres: number): number => (degres * Math.PI) / 180;

  const dLat = rad(latB - latA);
  const dLon = rad(lonB - lonA);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;

  return Math.round(RAYON_TERRE_KM * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * Le rayon déclaré est-il respecté ?
 *
 * `null` quand la distance n'est pas mesurable — on ne peut alors ni affirmer
 * ni infirmer, et c'est un troisième cas, pas un refus déguisé.
 *
 * Écrite ici, à côté du barème, et exportée : la porte d'éligibilité, la liste
 * des missions du candidat et l'écran de candidature posent tous les trois la
 * même question. Trois copies de `distance > rayon` finiraient par diverger, et
 * l'utilisateur lirait « au-delà de votre rayon » sur un écran et pourrait
 * postuler sur un autre.
 */
export function dansLeRayon(distance: number | null, rayonKm: number): boolean | null {
  return distance === null ? null : distance <= rayonKm;
}

/** Chaque jour couvert par la mission, bornes incluses. */
function joursDeLaMission(besoin: BesoinAPourvoir): Date[] {
  const jours: Date[] = [];
  const curseur = new Date(besoin.dateDebut);

  while (curseur <= besoin.dateFin && jours.length < 366) {
    jours.push(new Date(curseur));
    curseur.setDate(curseur.getDate() + 1);
  }

  return jours;
}

/** 1 = lundi … 7 = dimanche, comme ISO-8601. */
function jourIso(date: Date): number {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

function creneauActif(creneau: CreneauCandidat, jour: Date): boolean {
  if (creneau.valideDu && jour < creneau.valideDu) return false;
  if (creneau.valideAu && jour > creneau.valideAu) return false;

  return true;
}

/**
 * Part de la vacation couverte par les disponibilités déclarées, entre 0 et 1.
 *
 * On raisonne en minutes plutôt qu'en « disponible ou non » : une intervenante
 * disponible de 7 h à 12 h sur une vacation de 7 h à 14 h couvre les cinq
 * septièmes du besoin, et cette information vaut mieux qu'un refus sec.
 */
export function couvertureDisponibilite(profil: ProfilAEvaluer, besoin: BesoinAPourvoir): number {
  const jours = joursDeLaMission(besoin);

  if (jours.length === 0) {
    return 0;
  }

  const debutVacation = enMinutes(besoin.heureDebut);
  const dureeVacation = dureeMinutes(besoin.heureDebut, besoin.heureFin);

  if (dureeVacation === 0) {
    return 0;
  }

  let couvertes = 0;

  for (const jour of jours) {
    // La vacation est projetée sur une ligne de temps de deux jours : celle qui
    // franchit minuit déborde sur le lendemain, et les créneaux du lendemain
    // doivent donc être examinés aussi.
    const fenetre: [number, number] = [debutVacation, debutVacation + dureeVacation];

    const jourSuivant = new Date(jour);
    jourSuivant.setDate(jourSuivant.getDate() + 1);

    const segments: [number, number][] = [];

    for (const creneau of profil.creneaux) {
      for (const [date, decalage] of [
        [jour, 0],
        [jourSuivant, MINUTES_PAR_JOUR],
      ] as [Date, number][]) {
        if (creneau.jourSemaine !== jourIso(date) || !creneauActif(creneau, date)) {
          continue;
        }

        const debut = decalage + enMinutes(creneau.heureDebut);
        const duree = dureeMinutes(creneau.heureDebut, creneau.heureFin);

        segments.push([debut, debut + duree]);
      }
    }

    couvertes += minutesCouvertes(fenetre, segments);
  }

  return couvertes / (dureeVacation * jours.length);
}

/** Minutes de `fenetre` couvertes par l'union de `segments`. */
function minutesCouvertes(fenetre: [number, number], segments: [number, number][]): number {
  const bornes = segments
    .map(([debut, fin]): [number, number] => [
      Math.max(debut, fenetre[0]),
      Math.min(fin, fenetre[1]),
    ])
    .filter(([debut, fin]) => fin > debut)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let finCourante = -Infinity;

  for (const [debut, fin] of bornes) {
    // Union plutôt que somme : deux créneaux qui se recouvrent ne comptent pas
    // deux fois la même heure.
    total += Math.max(0, fin - Math.max(debut, finCourante));
    finCourante = Math.max(finCourante, fin);
  }

  return total;
}

function periodesSeChevauchent(aDebut: Date, aFin: Date, bDebut: Date, bFin: Date): boolean {
  return aDebut <= bFin && bDebut <= aFin;
}

/**
 * Porte d'éligibilité : binaire, et antérieure au score.
 *
 * Rien ne sert de classer quelqu'un qui ne peut pas y aller. Chaque refus porte
 * son motif : l'agence sait quoi corriger, et le candidat, côté public, sait ce
 * qui lui manque.
 */
export function motifsExclusion(profil: ProfilAEvaluer, besoin: BesoinAPourvoir): MotifExclusion[] {
  const motifs: MotifExclusion[] = [];

  if (profil.statut !== 'ACTIF') {
    motifs.push({ cle: 'statut', libelle: "Profil non valide par l'agence" });
  }

  if (!profil.diplomeValide) {
    motifs.push({ cle: 'diplome', libelle: 'Diplome exige non detenu, non verifie ou expire' });
  }

  const absent = profil.absences.some((absence) =>
    periodesSeChevauchent(absence.du, absence.au, besoin.dateDebut, besoin.dateFin),
  );

  if (absent) {
    motifs.push({ cle: 'indisponible', libelle: 'Absence declaree sur la periode' });
  }

  const engage = profil.engagements.some((mission) =>
    periodesSeChevauchent(mission.dateDebut, mission.dateFin, besoin.dateDebut, besoin.dateFin),
  );

  if (engage) {
    motifs.push({ cle: 'deja-engage', libelle: 'Deja retenu sur une mission de la periode' });
  }

  const distance = distanceKm(profil.latitude, profil.longitude, besoin.latitude, besoin.longitude);
  const accessible = dansLeRayon(distance, profil.rayonKm);

  if (accessible === null) {
    // Sans coordonnees, on ne peut ni mesurer ni affirmer : on ecarte en le
    // disant, plutot que d'attribuer une distance nulle qui ferait remonter la
    // fiche en tete du classement.
    motifs.push({ cle: 'sans-adresse', libelle: 'Coordonnees manquantes, distance non mesurable' });
  } else if (!accessible) {
    motifs.push({
      cle: 'hors-rayon',
      libelle: `A ${distance} km, au-dela du rayon de ${profil.rayonKm} km`,
    });
  }

  return motifs;
}

/**
 * Ce que l'agence lit à la place d'un nombre.
 *
 * Elle distingue les deux natures d'expérience, parce que la question posée au
 * candidat n'est pas la même : « il vous manque du temps » ou « il vous manque
 * du temps *dans ce métier-là* » n'appellent pas la même suite.
 */
function explicationExperience(bilan: BilanExperience): string {
  if (bilan.moisRetenus <= 0) {
    return 'Aucune experience verifiee par l agence';
  }

  const retenue = libelleDuree(bilan.moisRetenus);

  if (bilan.moisAutres > 0 && bilan.moisQualifiants > 0) {
    return `${retenue} retenus, dont ${libelleDuree(bilan.moisQualifiants)} sur le diplome exige`;
  }

  if (bilan.moisQualifiants > 0) {
    return `${retenue} verifies sur le diplome exige`;
  }

  return `${retenue} retenus, hors du metier exige (comptes pour moitie)`;
}

/**
 * Score sur 100, décomposé en trois lignes lisibles.
 *
 * Le barème est délibérément simple et explicable de vive voix. Un modèle plus
 * fin serait moins défendable : ici, chaque point se justifie par une donnée
 * que l'agence peut montrer au candidat.
 */
export function calculerScore(profil: ProfilAEvaluer, besoin: BesoinAPourvoir): ScoreDetail {
  const composantes: ComposanteScore[] = [];

  // --- Expérience : des mois de terrain vérifiés, plus l'âge du diplôme.
  //
  // Le diplôme ne rapporte plus rien ici, et c'est délibéré. La porte
  // d'éligibilité exige déjà qu'il soit détenu et vérifié : tout candidat
  // classé le possède, donc lui attribuer des points revient à ajouter la même
  // constante à tout le monde. Une constante ne départage personne — elle gonfle
  // les scores et fait paraître serré un classement qui ne l'est pas.
  const maxExperience = POIDS_COMPOSANTES.experience;
  const bilan = bilanExperience(profil.experiences);
  const part = Math.min(bilan.moisRetenus / PLAFOND_EXPERIENCE_MOIS, 1);

  composantes.push({
    cle: 'experience',
    libelle: 'Experience',
    points: Math.round(maxExperience * part),
    sur: maxExperience,
    explication: explicationExperience(bilan),
  });

  // --- Zone : décroissance linéaire jusqu'au rayon déclaré.
  const maxZone = POIDS_COMPOSANTES.zone;
  const distance = distanceKm(profil.latitude, profil.longitude, besoin.latitude, besoin.longitude);

  const pointsZone =
    distance === null
      ? 0
      : Math.round(maxZone * Math.max(0, 1 - distance / Math.max(profil.rayonKm, 1)));

  composantes.push({
    cle: 'zone',
    libelle: 'Zone',
    points: pointsZone,
    sur: maxZone,
    explication:
      distance === null
        ? 'Distance non mesurable'
        : `A ${distance} km du lieu, pour un rayon declare de ${profil.rayonKm} km`,
  });

  // --- Disponibilité : part de la vacation réellement couverte.
  const maxDispo = POIDS_COMPOSANTES.disponibilite;
  const couverture = couvertureDisponibilite(profil, besoin);

  composantes.push({
    cle: 'disponibilite',
    libelle: 'Disponibilite',
    points: Math.round(maxDispo * couverture),
    sur: maxDispo,
    explication: profil.creneaux.length
      ? `${Math.round(couverture * 100)} % du creneau couvert par les disponibilites declarees`
      : 'Aucune disponibilite declaree',
  });

  return {
    total: composantes.reduce((somme, composante) => somme + composante.points, 0),
    composantes,
  };
}
