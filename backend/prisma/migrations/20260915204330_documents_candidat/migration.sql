-- CreateEnum
CREATE TYPE "TypeDocument" AS ENUM ('NIR', 'DIPLOME', 'CV', 'PIECE_IDENTITE', 'RIB');

-- DropIndex
DROP INDEX "candidat_geom_idx";

-- DropIndex
DROP INDEX "lieu_intervention_geom_idx";

-- CreateTable
CREATE TABLE "document_candidat" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "type" "TypeDocument" NOT NULL,
    "nomOrigine" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "verifieLe" TIMESTAMP(3),
    "verifieParId" UUID,
    "expireLe" DATE,
    "ajouteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_candidat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_candidat_cheminStockage_key" ON "document_candidat"("cheminStockage");

-- CreateIndex
CREATE INDEX "document_candidat_candidatId_idx" ON "document_candidat"("candidatId");

-- CreateIndex
CREATE UNIQUE INDEX "document_candidat_candidatId_type_key" ON "document_candidat"("candidatId", "type");

-- AddForeignKey
ALTER TABLE "document_candidat" ADD CONSTRAINT "document_candidat_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
