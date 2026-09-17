-- Conservation limitee des pieces justificatives, et trace du consentement.
--
-- Deux sujets dans une seule migration parce qu'ils repondent a la meme
-- question : ce que la plateforme a le droit de garder, et ce que la personne
-- a accepte.

-- AlterEnum
ALTER TYPE "UsageJeton" ADD VALUE 'CONSERVATION_DOCUMENTS';

-- AlterTable : la piece porte desormais sa propre echeance de conservation.
ALTER TABLE "document_candidat" ADD COLUMN "conservationJusquAu" TIMESTAMP(3),
ADD COLUMN "relanceEnvoyeeLe" TIMESTAMP(3);

-- Reprise des pieces deja deposees. Elles n'avaient pas d'echeance ; on leur
-- donne celle qu'elles auraient eue, un an apres leur depot, plutot qu'un an a
-- compter d'aujourd'hui. Une piece deposee il y a onze mois arrive donc a
-- echeance le mois prochain, ce qui est la regle telle qu'elle s'applique a
-- toutes les autres.
UPDATE "document_candidat"
   SET "conservationJusquAu" = "ajouteLe" + INTERVAL '1 year';

ALTER TABLE "document_candidat" ALTER COLUMN "conservationJusquAu" SET NOT NULL;

-- AlterTable : date et version des conditions acceptees.
--
-- Laissees nulles pour les comptes existants. On n'antidate pas un
-- consentement : ces comptes ont ete crees avant la case, et le dire est plus
-- exact que d'inventer une date a laquelle personne n'a rien coche.
ALTER TABLE "utilisateur" ADD COLUMN "conditionsAccepteesLe" TIMESTAMP(3),
ADD COLUMN "conditionsVersion" TEXT;

-- CreateIndex
CREATE INDEX "document_candidat_conservationJusquAu_relanceEnvoyeeLe_idx" ON "document_candidat"("conservationJusquAu", "relanceEnvoyeeLe");
