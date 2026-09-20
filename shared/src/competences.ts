import { z } from 'zod';

/**
 * Le référentiel de compétences métier.
 *
 * Il n'est pas écrit à la main, et c'est tout son intérêt. Ce qu'un EHPAD
 * attend réellement d'un aide-soignant s'apprend en lisant ce que les EHPAD
 * écrivent dans leurs annonces — pas en imaginant une liste en réunion. Les
 * lignes sont donc agrégées depuis les offres France Travail déjà collectées,
 * par `pnpm cli competences`, et jamais saisies.
 *
 * C'est le second usage des données publiques, à côté du baromètre de tension.
 * Le baromètre répond à « combien payer », le référentiel à « que demander ».
 */

/** Une compétence telle qu'elle s'affiche dans une liste de choix. */
export interface CompetenceResume {
  id: string;
  /** Le libellé tel que les employeurs le formulent, dans sa forme la plus fréquente. */
  libelle: string;
  /** Code du référentiel quand la source le fournit. Souvent absent. */
  code: string | null;
  /**
   * Nombre d'offres actives où elle apparaît.
   *
   * Rendu au client, et pas seulement utilisé pour trier : afficher « demandée
   * dans 47 offres » à côté d'une case à cocher transforme une liste plate en
   * information de marché. Un établissement qui hésite voit ce que font les
   * autres, ce qui est exactement le service qu'on lui rend.
   *
   * Vaut la somme sur tous les métiers quand la requête n'en cible aucun.
   */
  occurrences: number;
}

/** Compétence attachée à une mission ou à un profil. */
export interface CompetenceLiee {
  id: string;
  libelle: string;
  /**
   * Présent sur une mission seulement. Sépare ce qui écarte de ce qui
   * départage : l'éligibilité reste portée par le diplôme, la zone et les
   * disponibilités, mais une compétence indispensable non détenue coûte
   * beaucoup plus cher au score qu'une compétence souhaitée.
   */
  indispensable?: boolean;
}

/** Le code ROME s'écrit une lettre puis quatre chiffres : J1501, K1302. */
export const MOTIF_ROME = /^[A-Z]\d{4}$/;

export const competencesQuerySchema = z.object({
  /**
   * Métier visé. Sans lui la liste est rendue tous métiers confondus, ce qui
   * n'a de sens que pour la recherche par mots-clés.
   */
  rome: z.string().trim().toUpperCase().regex(MOTIF_ROME, 'Code ROME invalide').optional(),
  recherche: z.string().trim().min(2, 'Deux caractères au minimum').max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(30),
});

export type CompetencesQuery = z.infer<typeof competencesQuerySchema>;

/**
 * Nombre maximal de compétences attachables à une mission.
 *
 * Le plafond n'est pas technique. Une annonce qui exige vingt compétences
 * n'exprime plus un besoin : elle décrit un profil idéal que personne ne coche,
 * et le classement se vide. Douze laisse la place à ce qui compte vraiment sans
 * permettre de transformer la liste en catalogue.
 */
export const COMPETENCES_MAX_MISSION = 12;

/**
 * Nombre maximal de compétences déclarables par un candidat.
 *
 * Plus large que côté mission, et pour une raison inverse : un intervenant qui
 * a quinze ans de terrain en a légitimement beaucoup, et le lui refuser
 * l'appauvrirait face au classement. Le plafond n'est là que pour empêcher de
 * tout cocher, ce qui reviendrait à ne rien déclarer.
 */
export const COMPETENCES_MAX_CANDIDAT = 30;

export const competencesMissionSchema = z
  .array(
    z.object({
      competenceId: z.string().uuid('Compétence invalide'),
      indispensable: z.boolean().default(false),
    }),
  )
  .max(COMPETENCES_MAX_MISSION, `${COMPETENCES_MAX_MISSION} compétences au maximum`)
  .superRefine((valeurs, contexte) => {
    const vues = new Set(valeurs.map((v) => v.competenceId));

    if (vues.size !== valeurs.length) {
      contexte.addIssue({ code: 'custom', message: 'Une compétence est citée deux fois' });
    }
  });

export type CompetencesMission = z.infer<typeof competencesMissionSchema>;

export const competencesCandidatSchema = z
  .array(z.string().uuid('Compétence invalide'))
  .max(COMPETENCES_MAX_CANDIDAT, `${COMPETENCES_MAX_CANDIDAT} compétences au maximum`)
  .superRefine((valeurs, contexte) => {
    if (new Set(valeurs).size !== valeurs.length) {
      contexte.addIssue({ code: 'custom', message: 'Une compétence est citée deux fois' });
    }
  });

export type CompetencesCandidat = z.infer<typeof competencesCandidatSchema>;

/** Ce que rend la reconstruction du référentiel. */
export interface RapportCompetences {
  /** Offres lues, toutes compétences confondues. */
  offresLues: number;
  /** Mentions de compétences rencontrées, avant dédoublonnage. */
  mentions: number;
  /** Lignes du référentiel après reconstruction. */
  competences: number;
  /** Couples (compétence, métier) après reconstruction. */
  rattachements: number;
  /** Lignes créées lors de ce passage. */
  nouvelles: number;
  /**
   * Lignes présentes au référentiel qu'aucune offre active ne mentionne plus.
   *
   * Elles ne sont pas supprimées : leurs occurrences tombent à zéro et leurs
   * rattachements vers les missions passées et les profils qui les ont
   * déclarées restent. Supprimer réécrirait l'histoire.
   */
  retombeesAZero: number;
}
