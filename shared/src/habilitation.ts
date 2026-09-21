import { z } from 'zod';
import { TYPE_CLIENT_COURT, type TypeClient } from './enums';

/**
 * L'autorisation d'un etablissement, et le statut juridique de son
 * gestionnaire.
 *
 * Deux informations distinctes vivent ici, et il ne faut pas les confondre.
 *
 * **L'autorisation** existe pour les trois familles, mais elle ne vient pas de
 * la meme autorite. Un EHPAD est un etablissement social et medico-social au
 * sens de l'article L. 312-1 du CASF : il ouvre sur un arrete conjoint du
 * directeur general de l'ARS et du president du conseil departemental
 * (art. L. 313-1), delivre pour quinze ans. Un hopital ou une clinique sont des
 * etablissements de sante : ils exercent sur une autorisation d'activite de
 * soins delivree par l'ARS seule (art. L. 6122-1 du CSP). Reclamer l'arrete
 * conjoint a une clinique, c'est reclamer une piece qui n'existe pas — et
 * obtenir n'importe quoi en retour.
 *
 * Ce qui ne varie pas : les trois portent un numero FINESS geographique, et
 * aucun des trois n'exerce sans autorisation. Le controle porte donc toujours
 * sur deux valeurs, quelle que soit la famille ; c'est leur libelle qui change,
 * pas leur nombre.
 *
 * C'est aussi ce qui rend la loi Valletoux (loi 2023-1268, art. 8) applicable a
 * toutes nos mises a disposition : la duree minimale d'exercice prealable a
 * l'interim vise les professionnels de sante exercant en etablissement de sante
 * comme en ESMS. Sous le regime precedent — l'aide a domicile — elle ne mordait
 * que sur une partie des structures, et il fallait un champ pour savoir
 * lesquelles. Ici la regle couvre les trois types, et le code n'a plus a la
 * conditionner.
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
 * C'est le FINESS geographique qui est attendu, celui du site ou les patients
 * ou residents sont accueillis, et non le FINESS juridique du gestionnaire : un
 * groupe qui exploite douze etablissements n'a qu'un FINESS juridique, et
 * l'autorisation se lit site par site.
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

/**
 * La piece a lire, par famille d'etablissement.
 *
 * Elle depend du type et non du statut juridique : c'est le regime qui decide
 * de l'autorite, pas la nature du gestionnaire. Un EHPAD commercial et un
 * EHPAD associatif produisent le meme arrete conjoint ; une clinique
 * commerciale produit une autorisation d'activite de soins.
 */
export const AUTORISATION_PAR_TYPE: Record<TypeClient, { piece: string; fondement: string }> = {
  EHPAD: {
    piece: "Arrete conjoint ARS / conseil departemental",
    fondement: 'art. L. 313-1 du CASF',
  },
  HOPITAL: {
    piece: "Autorisation d'activite de soins delivree par l'ARS",
    fondement: 'art. L. 6122-1 du CSP',
  },
  CLINIQUE: {
    piece: "Autorisation d'activite de soins delivree par l'ARS",
    fondement: 'art. L. 6122-1 du CSP',
  },
};

/** Le justificatif complet, tel qu'il se demande a un etablissement donne. */
export function justificatifAutorisation(type: TypeClient): string {
  const { piece, fondement } = AUTORISATION_PAR_TYPE[type];

  return `${TYPE_CLIENT_COURT[type]} : numero FINESS geographique et reference de l'${piece.toLowerCase()} (${fondement})`;
}

/**
 * Verifie que l'autorisation est documentee des lors qu'un statut est declare.
 *
 * Le controle ne depend pas du statut juridique, et c'est le point : sous le
 * regime precedent chaque statut appelait une piece differente, ce qui laissait
 * passer une structure qui se presentait sous un regime en produisant le
 * justificatif d'un autre. Ici les deux valeurs sont les memes pour tous —
 * FINESS et reference d'autorisation — et c'est `AUTORISATION_PAR_TYPE` qui dit
 * a l'agence quelle piece ouvrir pour les lire. Un etablissement sans
 * autorisation n'est pas un etablissement.
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
