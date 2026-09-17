/**
 * Ce que pèse un passé professionnel, isolé de la base.
 *
 * Même règle que pour le reste du barème : aucune dépendance à Prisma ni à
 * Nest, pour que la mesure se discute sur des dates écrites à la main. C'est
 * ici qu'on décide ce qui compte, et ce genre de décision se relit.
 */

const MS_PAR_JOUR = 24 * 3600 * 1000;

/** Longueur moyenne d'un mois. Les mois civils varient, la mesure non. */
const JOURS_PAR_MOIS = 30.436875;

/**
 * Cinq ans. Au-delà, l'écart entre deux professionnelles ne se lit plus dans la
 * durée : une aide à domicile avec huit ans de terrain et une avec quinze font
 * le même travail, et prétendre les départager sur ce critère reviendrait à
 * écarter mécaniquement les plus jeunes pour une différence que l'établissement
 * ne constatera jamais.
 */
export const PLAFOND_EXPERIENCE_MOIS = 60;

/**
 * Poids d'une expérience hors référentiel.
 *
 * Un poste de caissière ou de manutention dit quelque chose de quelqu'un au
 * travail — assiduité, contact, tenue d'un horaire — mais rien de son métier.
 * L'ignorer complètement pénaliserait les reconversions, qui sont nombreuses
 * dans le secteur ; la compter à plein reviendrait à dire qu'elle vaut du soin.
 */
export const PONDERATION_HORS_REFERENTIEL = 0.5;

export interface ExperienceEvaluee {
  debutLe: Date;
  /** Null quand le poste est en cours : la durée court jusqu'à aujourd'hui. */
  finLe: Date | null;
  quotitePourcent: number;
  /** Rattachée à la qualification exigée par la mission. */
  qualifiante: boolean;
}

export interface BilanExperience {
  /** Mois pondérés sur la qualification exigée. */
  moisQualifiants: number;
  /** Mois pondérés sur le reste. */
  moisAutres: number;
  /** Ce que le barème retient, après pondération et plafond calendaire. */
  moisRetenus: number;
}

function enMois(millisecondes: number): number {
  return millisecondes / (JOURS_PAR_MOIS * MS_PAR_JOUR);
}

/** Bornes d'une expérience, ramenées à un intervalle exploitable. */
function intervalle(experience: ExperienceEvaluee, reference: Date): [number, number] | null {
  const debut = experience.debutLe.getTime();
  // Un poste en cours court jusqu'à aujourd'hui ; un poste dont la fin est dans
  // le futur — un contrat signé qui n'a pas commencé — est ramené à aujourd'hui
  // aussi : on compte ce qui a été fait, pas ce qui est prévu.
  const fin = Math.min(experience.finLe?.getTime() ?? reference.getTime(), reference.getTime());

  return fin > debut ? [debut, fin] : null;
}

/** Durée totale couverte par l'union des périodes, en mois. */
function moisCalendaires(intervalles: [number, number][]): number {
  const tries = [...intervalles].sort((a, b) => a[0] - b[0]);

  let total = 0;
  let finCourante = -Infinity;

  for (const [debut, fin] of tries) {
    total += Math.max(0, fin - Math.max(debut, finCourante));
    finCourante = Math.max(finCourante, fin);
  }

  return enMois(total);
}

/**
 * Mois d'expérience retenus par le barème.
 *
 * Deux corrections s'appliquent, dans cet ordre, et chacune répare un abus
 * différent :
 *
 *  - **la quotité**, parce que deux ans à mi-temps ne sont pas deux ans de
 *    terrain, et que le temps partiel est la norme dans ce secteur ;
 *  - **le plafond calendaire**, parce que la somme des durées peut dépasser le
 *    temps réellement écoulé. Deux mi-temps menés en parallèle font bien un
 *    temps plein et doivent compter comme tel — mais deux temps pleins
 *    superposés sur la même année ne font pas deux ans de métier, ils font une
 *    saisie en double ou une erreur de date.
 */
export function bilanExperience(
  experiences: ExperienceEvaluee[],
  reference: Date = new Date(),
): BilanExperience {
  let moisQualifiants = 0;
  let moisAutres = 0;
  const periodes: [number, number][] = [];

  for (const experience of experiences) {
    const bornes = intervalle(experience, reference);

    if (!bornes) {
      continue;
    }

    periodes.push(bornes);

    // La quotité est bornée : une saisie à 150 % est une erreur, pas un exploit.
    const quotite = Math.min(Math.max(experience.quotitePourcent, 0), 100) / 100;
    const mois = enMois(bornes[1] - bornes[0]) * quotite;

    if (experience.qualifiante) {
      moisQualifiants += mois;
    } else {
      moisAutres += mois;
    }
  }

  const pondere = moisQualifiants + moisAutres * PONDERATION_HORS_REFERENTIEL;

  return {
    moisQualifiants,
    moisAutres,
    moisRetenus: Math.min(pondere, moisCalendaires(periodes)),
  };
}

/** Rendu lisible d'une durée en mois : « 3 ans et 2 mois ». */
export function libelleDuree(mois: number): string {
  const entiers = Math.floor(mois);
  const annees = Math.floor(entiers / 12);
  const restants = entiers % 12;

  if (annees === 0) {
    return `${restants} mois`;
  }

  const partAnnees = `${annees} an${annees > 1 ? 's' : ''}`;

  return restants === 0 ? partAnnees : `${partAnnees} et ${restants} mois`;
}
