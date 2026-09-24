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
 * Les trois familles d'etablissements ou l'agence place.
 *
 * Elles ne relevent pas du meme regime, et c'est la seule raison pour laquelle
 * la distinction existe en base. L'EHPAD est un etablissement social et
 * medico-social (art. L. 312-1 du CASF) : il ouvre sur un arrete conjoint du
 * directeur general de l'ARS et du president du conseil departemental
 * (art. L. 313-1). L'hopital et la clinique sont des etablissements de sante :
 * ils exercent sur une autorisation d'activite de soins delivree par l'ARS
 * seule (art. L. 6122-1 du CSP). Le justificatif que l'agence reclame n'est
 * donc pas le meme, et se tromper de piece revient a ne rien verifier.
 *
 * Ce qui ne varie pas, en revanche : les trois portent un numero FINESS, et la
 * duree minimale d'exercice prealable a l'interim (loi 2023-1268, art. 8)
 * s'applique aux professionnels de sante des trois, etablissements de sante
 * comme ESMS. Le code n'a donc pas a conditionner cette regle au type.
 */
export const typeClientSchema = z.enum(['EHPAD', 'HOPITAL', 'CLINIQUE']);
export type TypeClient = z.infer<typeof typeClientSchema>;

export const TYPE_CLIENT_LIBELLES: Record<TypeClient, string> = {
  EHPAD: "Etablissement d'hebergement pour personnes agees dependantes (EHPAD)",
  HOPITAL: 'Etablissement public de sante (centre hospitalier, CHU)',
  CLINIQUE: 'Etablissement de sante prive (clinique, hopital prive)',
};

/**
 * Le meme mot, en un seul terme.
 *
 * Sert la ou le libelle complet ne passe pas : une pastille, et surtout le
 * secteur affiche sur la vitrine publique, ou c'est la seule chose que le
 * visiteur apprend du lieu.
 */
export const TYPE_CLIENT_COURT: Record<TypeClient, string> = {
  EHPAD: 'EHPAD',
  HOPITAL: 'Hopital',
  CLINIQUE: 'Clinique',
};

/**
 * Ou se deroule l'intervention, a l'interieur de l'etablissement.
 *
 * La distinction n'est pas decorative, et elle ne depend pas du type
 * d'etablissement : ce qu'elle dit, c'est qu'intervenir ici suppose une
 * formation que tout titulaire du diplome n'a pas. Une unite protegee d'EHPAD
 * — unite Alzheimer, UHR, PASA — et un service specialise d'hopital ou de
 * clinique posent la meme question au moment du rapprochement. Le type de lieu
 * est donc ce qui permet d'exiger cette formation la ou elle est requise, et de
 * ne pas l'exiger ailleurs.
 *
 * Deux valeurs et non une par service : l'agence n'a pas a tenir la
 * nomenclature des services hospitaliers pour savoir si un aide-soignant peut
 * y aller. Le nom du service se met dans le libelle du lieu.
 */
export const typeLieuSchema = z.enum(['ETABLISSEMENT', 'UNITE_PROTEGEE']);
export type TypeLieu = z.infer<typeof typeLieuSchema>;

export const TYPE_LIEU_LIBELLES: Record<TypeLieu, string> = {
  ETABLISSEMENT: 'Hebergement ou service classique',
  UNITE_PROTEGEE: 'Unite protegee ou service specialise',
};

/** Ce que le choix change, dit a celui qui le fait. */
export const TYPE_LIEU_AIDE: Record<TypeLieu, string> = {
  ETABLISSEMENT: 'Tout professionnel qualifie peut y intervenir.',
  UNITE_PROTEGEE:
    'Unite Alzheimer, UHR, PASA, unite fermee, service specialise : nous ne vous proposerons que des profils formes a ce type de prise en charge.',
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
