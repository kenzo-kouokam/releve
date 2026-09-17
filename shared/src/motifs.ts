/**
 * Expressions regulieres partagees. Elles sont ici et pas dans chaque schema
 * pour qu'une regle de saisie ne soit ecrite qu'une fois : les memes motifs
 * servent a l'API et aux formulaires Nuxt.
 */

export const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MOTIF_TELEPHONE = /^(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}$/;
export const MOTIF_CODE_POSTAL = /^\d{5}$/;

/** Heure locale sur 24 h, "07:00" ou "20:30". */
export const MOTIF_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Date civile sans fuseau : une disponibilite du 3 mars l'est partout. */
export const MOTIF_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
