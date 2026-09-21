import { z } from 'zod';

/**
 * Ces enums sont la source de verite cote contrat d'API. Ils doivent rester
 * alignes avec les enums Prisma de `backend/prisma/schema.prisma` : le package
 * `contracts` ne depend pas de Prisma pour rester importable par le front.
 */

export const statutCandidatSchema = z.enum([
  'BROUILLON',
  'EN_VERIFICATION',
  'ACTIF',
  'INACTIF',
  'ARCHIVE',
]);
export type StatutCandidat = z.infer<typeof statutCandidatSchema>;

export const STATUT_CANDIDAT_LIBELLES: Record<StatutCandidat, string> = {
  BROUILLON: 'Brouillon',
  EN_VERIFICATION: 'En verification',
  ACTIF: 'Actif',
  INACTIF: 'Inactif',
  ARCHIVE: 'Archive',
};

/**
 * Un seul type de client : l'EHPAD.
 *
 * L'agence ne place que dans des etablissements d'hebergement pour personnes
 * agees dependantes. L'enum est conserve plutot que supprime parce qu'il porte
 * une information juridique exploitee ailleurs : un EHPAD releve de l'article
 * L. 312-1 du CASF, donc la duree minimale d'exercice prealable a l'interim
 * s'applique a toutes ses mises a disposition, sans exception.
 */
export const typeClientSchema = z.enum(['EHPAD']);
export type TypeClient = z.infer<typeof typeClientSchema>;

export const TYPE_CLIENT_LIBELLES: Record<TypeClient, string> = {
  EHPAD: "Etablissement d'hebergement pour personnes agees dependantes (EHPAD)",
};

/**
 * Ou se deroule l'intervention, a l'interieur de l'etablissement.
 *
 * La distinction n'est pas decorative. Une unite protegee — unite Alzheimer,
 * UHR, PASA — accueille des residents atteints de troubles cognitifs, et y
 * intervenir suppose une formation que tout titulaire du diplome n'a pas. Le
 * type de lieu est donc ce qui permet d'exiger cette formation la ou elle est
 * requise, et de ne pas l'exiger ailleurs.
 */
export const typeLieuSchema = z.enum(['ETABLISSEMENT', 'UNITE_PROTEGEE']);
export type TypeLieu = z.infer<typeof typeLieuSchema>;

export const TYPE_LIEU_LIBELLES: Record<TypeLieu, string> = {
  ETABLISSEMENT: 'Hebergement classique',
  UNITE_PROTEGEE: 'Unite protegee (Alzheimer, UHR, PASA)',
};

export const statutMissionSchema = z.enum([
  'BROUILLON',
  'PUBLIEE',
  'EN_MATCHING',
  'PROPOSEE',
  'VALIDEE',
  'CONTRACTUALISEE',
  'EN_COURS',
  'TERMINEE',
  'ANNULEE',
  'NON_POURVUE',
]);
export type StatutMission = z.infer<typeof statutMissionSchema>;

export const statutPropositionSchema = z.enum([
  'ENVOYEE',
  'ACCEPTEE_CANDIDAT',
  'REFUSEE_CANDIDAT',
  'VALIDEE_CLIENT',
  'REFUSEE_CLIENT',
  'EXPIREE',
]);
export type StatutProposition = z.infer<typeof statutPropositionSchema>;

export const roleUtilisateurSchema = z.enum([
  'ADMIN_AGENCE',
  'CHARGE_RECRUTEMENT',
  'CLIENT',
  'CANDIDAT',
]);
export type RoleUtilisateur = z.infer<typeof roleUtilisateurSchema>;

/**
 * Le cycle de vie d'un releve d'heures.
 *
 * SAISI est le seul etat ou l'interimaire peut encore corriger. VALIDE_CLIENT
 * fige les heures et ouvre la facturation. CONTESTE renvoie la semaine en
 * discussion sans effacer ce qui a ete saisi - c'est la trace du desaccord qui
 * compte. EXPORTE marque le passage en paie : a ce stade plus rien ne bouge,
 * une erreur se corrige par un avoir et non par une modification.
 */
export const statutReleveSchema = z.enum(['SAISI', 'VALIDE_CLIENT', 'CONTESTE', 'EXPORTE']);
export type StatutReleve = z.infer<typeof statutReleveSchema>;

export const STATUT_RELEVE_LIBELLES: Record<StatutReleve, string> = {
  SAISI: 'Saisi',
  VALIDE_CLIENT: 'Valide par le client',
  CONTESTE: 'Conteste',
  EXPORTE: 'Exporte en paie',
};
