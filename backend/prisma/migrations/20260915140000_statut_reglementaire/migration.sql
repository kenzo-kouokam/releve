-- Statut reglementaire de la structure d'aide a domicile.
--
-- Rien dans le SIRET ne dit sous quel regime un service intervient : declaration
-- SAP, agrement, ou autorisation departementale au titre du CASF. C'est pourtant
-- ce qui decide de ce qu'il a le droit de faire, et — pour une structure
-- autorisee, qui releve alors de l'article L. 312-1 du CASF — de l'application
-- de la duree minimale d'exercice prealable a l'interim.

CREATE TYPE "StatutReglementaire" AS ENUM (
    'DECLARE_SAP',
    'AGREE_SAP',
    'AUTORISE_SAD_ESMS',
    'PRESTATAIRE_CLASSIQUE'
);

-- Nullable, et sans valeur par defaut : les fiches anterieures n'ont pas de
-- statut connu, et leur en attribuer un d'office ferait dire a la base quelque
-- chose que personne n'a verifie. L'absence est ici l'information juste. Une
-- fiche sans statut ne peut pas etre activee — c'est la que la regle mord.
ALTER TABLE "client" ADD COLUMN "statutReglementaire" "StatutReglementaire";
ALTER TABLE "client" ADD COLUMN "numeroSap" TEXT;
ALTER TABLE "client" ADD COLUMN "numeroAgrement" TEXT;
ALTER TABLE "client" ADD COLUMN "numeroFiness" TEXT;
ALTER TABLE "client" ADD COLUMN "arreteReference" TEXT;
ALTER TABLE "client" ADD COLUMN "arreteDate" TIMESTAMP(3);
