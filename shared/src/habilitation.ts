import { z } from 'zod';

/**
 * Le statut reglementaire d'une structure d'aide a domicile.
 *
 * Ce n'est pas un champ administratif de plus. Il decide de ce que la structure
 * a le droit de faire, et rien dans le SIRET ne le dit : deux services au meme
 * code NAF peuvent relever de regimes differents.
 *
 * - **Declaration** (art. L. 7232-1-1 du code du travail) : simple declaration
 *   aupres de la DDETS, qui ouvre les avantages fiscaux pour les particuliers
 *   employeurs. Elle ne suffit pas pour intervenir aupres de publics fragiles.
 * - **Agrement** (art. L. 7232-1) : exige pour le mode mandataire aupres des
 *   publics fragiles. Delivre par l'Etat, pour cinq ans.
 * - **Autorisation SAD / ESMS** (art. L. 313-1 du CASF) : delivree par le
 *   conseil departemental, par arrete, pour quinze ans. C'est le regime des
 *   services autonomie a domicile depuis le decret 2023-608. Elle fait entrer
 *   la structure dans le champ de l'article L. 312-1 du CASF — et c'est
 *   precisement ce qui declenche la duree minimale d'exercice prealable a
 *   l'interim de la loi Valletoux.
 *
 * L'agence saisit ce statut sur piece. Une structure ne se le donne pas a
 * elle-meme : c'est pour cela que l'inscription des ESMS n'est pas publique.
 */
export const statutReglementaireSchema = z.enum([
  'DECLARE_SAP',
  'AGREE_SAP',
  'AUTORISE_SAD_ESMS',
  'PRESTATAIRE_CLASSIQUE',
]);

export type StatutReglementaire = z.infer<typeof statutReglementaireSchema>;

export const STATUT_REGLEMENTAIRE_LIBELLES: Record<StatutReglementaire, string> = {
  DECLARE_SAP: 'Declare SAP',
  AGREE_SAP: 'Agree SAP',
  AUTORISE_SAD_ESMS: 'Autorise SAD / ESMS',
  PRESTATAIRE_CLASSIQUE: 'Prestataire classique',
};

/** La piece que chaque statut oblige a produire. */
export const STATUT_REGLEMENTAIRE_JUSTIFICATIF: Record<StatutReglementaire, string> = {
  DECLARE_SAP: 'Numero de declaration SAP',
  AGREE_SAP: "Numero d'agrement",
  AUTORISE_SAD_ESMS: "Numero FINESS et reference de l'arrete",
  PRESTATAIRE_CLASSIQUE: 'Numero de declaration SAP',
};

/**
 * Un numero SAP est la lettre SAP suivie des neuf chiffres du SIREN. Les
 * separateurs et la casse sont absorbes : le numero est recopie depuis un
 * recepisse, parfois avec des espaces, et refuser la saisie pour cela ne
 * protegerait de rien.
 */
const numeroSapSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((valeur) => valeur.replace(/[\s.\-/]/g, ''))
  .refine(
    (valeur) => /^SAP\d{9}$/.test(valeur),
    'Numero SAP invalide : SAP suivi des 9 chiffres du SIREN',
  );

/**
 * Le FINESS compte neuf chiffres. Sa cle de controle n'est pas verifiee ici,
 * contrairement a celle du SIRET : l'algorithme varie selon les referentiels, et
 * une implementation approximative refuserait des etablissements parfaitement
 * reels — un faux negatif coute ici bien plus cher qu'un faux positif, que la
 * lecture de l'arrete rattrape de toute facon.
 */
const numeroFinessSchema = z
  .string()
  .trim()
  .transform((valeur) => valeur.replace(/[\s.-]/g, ''))
  .refine((valeur) => /^\d{9}$/.test(valeur), 'Numero FINESS invalide : 9 chiffres attendus');

/** Les champs du bloc, tous facultatifs pris isolement : c'est le statut qui tranche. */
export const champsHabilitation = {
  statutReglementaire: statutReglementaireSchema,
  numeroSap: numeroSapSchema.optional(),
  numeroAgrement: numeroSapSchema.optional(),
  numeroFiness: numeroFinessSchema.optional(),
  arreteReference: z.string().trim().min(1).max(120).optional(),
  arreteDate: z.coerce.date().optional(),
};

/** Ce que chaque statut rend obligatoire, et ou l'erreur doit s'afficher. */
const EXIGENCES: Record<StatutReglementaire, readonly (keyof typeof champsHabilitation)[]> = {
  DECLARE_SAP: ['numeroSap'],
  PRESTATAIRE_CLASSIQUE: ['numeroSap'],
  AGREE_SAP: ['numeroAgrement'],
  AUTORISE_SAD_ESMS: ['numeroFiness', 'arreteReference'],
};

const MESSAGES: Record<string, string> = {
  numeroSap: 'Le numero de declaration SAP est obligatoire pour ce statut',
  numeroAgrement: "Le numero d'agrement est obligatoire pour ce statut",
  numeroFiness: 'Le numero FINESS est obligatoire pour une structure autorisee',
  arreteReference: "La reference de l'arrete d'autorisation est obligatoire",
};

/**
 * Verifie que le justificatif correspond au statut declare.
 *
 * Le controle porte sur la coherence, pas seulement sur la presence : declarer
 * une autorisation departementale en ne fournissant qu'un numero SAP laisserait
 * passer une structure pour ce qu'elle n'est pas — et c'est ce statut qui
 * determine si la duree minimale d'exercice prealable s'applique a ses
 * missions.
 */
export function verifierHabilitation(
  valeur: Partial<Record<keyof typeof champsHabilitation, unknown>>,
  contexte: z.RefinementCtx,
): void {
  const statut = valeur.statutReglementaire as StatutReglementaire | undefined;

  if (!statut) {
    return;
  }

  for (const champ of EXIGENCES[statut]) {
    if (valeur[champ] === undefined || valeur[champ] === null || valeur[champ] === '') {
      contexte.addIssue({ code: 'custom', path: [champ], message: MESSAGES[champ]! });
    }
  }
}

/** Le justificatif tel qu'il s'affiche, quel que soit le statut. */
export interface Habilitation {
  statutReglementaire: StatutReglementaire | null;
  numeroSap: string | null;
  numeroAgrement: string | null;
  numeroFiness: string | null;
  arreteReference: string | null;
  arreteDate: string | null;
}
