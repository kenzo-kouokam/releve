import { z } from 'zod';

/**
 * L'autorisation d'un EHPAD, et le statut juridique de son gestionnaire.
 *
 * Deux informations distinctes vivent ici, et il ne faut pas les confondre.
 *
 * **L'autorisation** ne varie pas. Un EHPAD est un etablissement social et
 * medico-social au sens de l'article L. 312-1 du CASF : il ne peut ouvrir
 * qu'apres un arrete conjoint du directeur general de l'ARS et du president du
 * conseil departemental (art. L. 313-1 du CASF), delivre pour quinze ans, et il
 * porte un numero FINESS. Il n'existe pas d'EHPAD non autorise. C'est pourquoi
 * le FINESS et la reference de l'arrete sont exiges de tous, sans condition.
 *
 * C'est aussi ce qui rend la loi Valletoux (loi 2023-1268, art. 8) applicable a
 * toutes nos mises a disposition : la duree minimale d'exercice prealable a
 * l'interim vise les professionnels de sante exercant en ESMS. Sous le regime
 * precedent — l'aide a domicile — elle ne mordait que sur une partie des
 * structures, et il fallait un champ pour savoir lesquelles. Ici la regle est
 * generale, et le code n'a plus a la conditionner.
 *
 * **Le statut juridique**, lui, varie, et c'est la seule chose qui varie. Il ne
 * decide pas de ce que l'etablissement a le droit de faire — l'arrete s'en
 * charge — mais de la convention collective applicable, donc du salaire de
 * reference de l'interimaire, qui se calcule sur celui d'un titulaire du meme
 * poste dans l'entreprise utilisatrice.
 */
export const statutJuridiqueSchema = z.enum([
  'PUBLIC_HOSPITALIER',
  'PUBLIC_TERRITORIAL',
  'PRIVE_NON_LUCRATIF',
  'PRIVE_COMMERCIAL',
]);

export type StatutJuridique = z.infer<typeof statutJuridiqueSchema>;

export const STATUT_JURIDIQUE_LIBELLES: Record<StatutJuridique, string> = {
  PUBLIC_HOSPITALIER: 'Public hospitalier',
  PUBLIC_TERRITORIAL: 'Public territorial (CCAS, CIAS, departement)',
  PRIVE_NON_LUCRATIF: 'Prive a but non lucratif (association, fondation, mutuelle)',
  PRIVE_COMMERCIAL: 'Prive commercial',
};

/**
 * Le cadre de remuneration attache a chaque statut.
 *
 * Indicatif : il oriente la saisie de la convention collective, il ne la
 * remplace pas. Deux EHPAD associatifs peuvent relever de conventions
 * differentes, et c'est la fiche qui fait foi.
 */
export const STATUT_JURIDIQUE_CADRE_SALARIAL: Record<StatutJuridique, string> = {
  PUBLIC_HOSPITALIER: 'Fonction publique hospitaliere (grille indiciaire)',
  PUBLIC_TERRITORIAL: 'Fonction publique territoriale (grille indiciaire)',
  PRIVE_NON_LUCRATIF: 'Convention collective de branche (CCN 51, CCN 66)',
  PRIVE_COMMERCIAL: 'Convention collective de branche (IDCC 2264)',
};

/**
 * Le FINESS compte neuf chiffres. Sa cle de controle n'est pas verifiee ici,
 * contrairement a celle du SIRET : l'algorithme varie selon les referentiels, et
 * une implementation approximative refuserait des etablissements parfaitement
 * reels — un faux negatif coute ici bien plus cher qu'un faux positif, que la
 * lecture de l'arrete rattrape de toute facon.
 *
 * C'est le FINESS geographique qui est attendu, celui du site ou les residents
 * sont accueillis, et non le FINESS juridique du gestionnaire : un groupe qui
 * exploite douze EHPAD n'a qu'un FINESS juridique, et l'autorisation se lit site
 * par site.
 */
const numeroFinessSchema = z
  .string()
  .trim()
  .transform((valeur) => valeur.replace(/[\s.-]/g, ''))
  .refine((valeur) => /^\d{9}$/.test(valeur), 'Numero FINESS invalide : 9 chiffres attendus');

/** Les champs du bloc, tous facultatifs pris isolement : voir `verifierHabilitation`. */
export const champsHabilitation = {
  statutJuridique: statutJuridiqueSchema,
  numeroFiness: numeroFinessSchema.optional(),
  arreteReference: z.string().trim().min(1).max(120).optional(),
  arreteDate: z.coerce.date().optional(),
};

const MESSAGES: Record<string, string> = {
  numeroFiness: "Le numero FINESS de l'etablissement est obligatoire",
  arreteReference: "La reference de l'arrete d'autorisation est obligatoire",
};

/** La piece qui etablit l'autorisation, identique pour tous les statuts. */
export const JUSTIFICATIF_AUTORISATION =
  "Numero FINESS geographique et reference de l'arrete d'autorisation";

/**
 * Verifie que l'autorisation est documentee des lors qu'un statut est declare.
 *
 * Le controle ne depend plus du statut, et c'est le point : sous le regime
 * precedent chaque statut appelait une piece differente, ce qui laissait passer
 * une structure qui se presentait sous un regime en produisant le justificatif
 * d'un autre. Ici il n'y a qu'un regime, donc qu'une piece — un EHPAD sans
 * arrete n'est pas un EHPAD.
 */
export function verifierHabilitation(
  valeur: Partial<Record<keyof typeof champsHabilitation, unknown>>,
  contexte: z.RefinementCtx,
): void {
  if (!valeur.statutJuridique) {
    return;
  }

  for (const champ of ['numeroFiness', 'arreteReference'] as const) {
    if (valeur[champ] === undefined || valeur[champ] === null || valeur[champ] === '') {
      contexte.addIssue({ code: 'custom', path: [champ], message: MESSAGES[champ]! });
    }
  }
}

/** Le justificatif tel qu'il s'affiche. */
export interface Habilitation {
  statutJuridique: StatutJuridique | null;
  numeroFiness: string | null;
  arreteReference: string | null;
  arreteDate: string | null;
}
