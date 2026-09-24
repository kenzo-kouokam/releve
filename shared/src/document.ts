import { z } from 'zod';

/**
 * Les pièces d'un dossier candidat.
 *
 * L'ordre est celui dans lequel l'écran les présente : ce qui bloque une
 * embauche d'abord, ce qui pèse sur le classement ensuite.
 */
export const typeDocumentSchema = z.enum(['NIR', 'DIPLOME', 'CV', 'PIECE_IDENTITE', 'RIB']);
export type TypeDocument = z.infer<typeof typeDocumentSchema>;

export const TYPES_DOCUMENT = typeDocumentSchema.options;

/** Intitulé affiché, identique côté agence et côté candidat. */
export const TYPE_DOCUMENT_LIBELLES: Record<TypeDocument, string> = {
  NIR: 'Numéro de sécurité sociale (NIR)',
  DIPLOME: 'Diplômes',
  CV: 'CV',
  PIECE_IDENTITE: "Pièce d'identité",
  RIB: 'RIB',
};

/**
 * Pourquoi la pièce est demandée.
 *
 * Écrit ici et pas dans le gabarit : une personne qui dépose une copie de sa
 * carte d'identité a le droit de savoir à quoi elle sert, et cette phrase doit
 * être la même partout où on la lui demande.
 */
export const TYPE_DOCUMENT_MOTIFS: Record<TypeDocument, string> = {
  NIR: "Nécessaire à la déclaration préalable à l'embauche et à l'édition de vos fiches de paie.",
  DIPLOME: 'Justificatif de formation, vérifié par l’agence avant de compter dans votre dossier.',
  CV: 'Sert à rapprocher votre parcours des compétences demandées par chaque mission.',
  PIECE_IDENTITE: 'Permet de vérifier votre identité et de valider légalement vos contrats.',
  RIB: 'Sert au virement de vos salaires et de vos acomptes.',
};

/**
 * Formats acceptés et plafond de taille.
 *
 * Déclarés dans le paquet partagé parce que l'API les impose et que le
 * navigateur doit les annoncer : deux listes séparées finiraient par diverger,
 * et l'utilisateur découvrirait le refus après le téléversement.
 */
export const TYPES_MIME_DOCUMENT = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type TypeMimeDocument = (typeof TYPES_MIME_DOCUMENT)[number];

/** 10 Mo. Au-delà, c'est une photo non recadrée, pas un justificatif. */
export const TAILLE_MAX_DOCUMENT = 10 * 1024 * 1024;

/** Extensions correspondantes, pour l'attribut `accept` d'un champ fichier. */
export const EXTENSIONS_DOCUMENT = '.pdf,.jpg,.jpeg,.png';

export function typeMimeAccepte(typeMime: string): typeMime is TypeMimeDocument {
  return (TYPES_MIME_DOCUMENT as readonly string[]).includes(typeMime);
}

/** Métadonnées d'une pièce. Le contenu ne transite jamais par cet objet. */
export interface DocumentResume {
  id: string;
  type: TypeDocument;
  nomOrigine: string;
  typeMime: string;
  taille: number;
  /** Date de dépôt, au format ISO. */
  ajouteLe: string;
  /** Date à laquelle l'agence a constaté la pièce, nulle tant qu'elle ne l'a pas fait. */
  verifieLe: string | null;
  /** Péremption, pour les pièces qui en ont une. */
  expireLe: string | null;
  /**
   * Date jusqu'à laquelle la plateforme conserve la pièce. Affichée sur le
   * dossier : quelqu'un qui confie sa carte d'identité a le droit de savoir
   * jusqu'à quand elle reste là, sans avoir à lire la politique.
   */
  conservationJusquAu: string;
}

/**
 * Ce que l'écran du dossier affiche : une ligne par type attendu, qu'elle soit
 * remplie ou non. Le vide est une information au moins aussi utile que le plein.
 */
export interface LigneDossier {
  type: TypeDocument;
  libelle: string;
  motif: string;
  document: DocumentResume | null;
}

export const documentUploadSchema = z.object({
  type: typeDocumentSchema,
});

export type DocumentUpload = z.infer<typeof documentUploadSchema>;
