-- CreateTable
CREATE TABLE "offre_collectee" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FRANCE_TRAVAIL',
    "romeCode" TEXT NOT NULL,
    "romeLibelle" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "intituleNormalise" TEXT NOT NULL,
    "entreprise" TEXT,
    "departement" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "codePostal" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "tauxHoraire" DECIMAL(8,4),
    "salaireLibelle" TEXT,
    "experienceExigee" BOOLEAN NOT NULL DEFAULT false,
    "nombrePostes" INTEGER NOT NULL DEFAULT 1,
    "publieeLe" TIMESTAMP(3) NOT NULL,
    "collecteeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empreinte" TEXT NOT NULL,

    CONSTRAINT "offre_collectee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offre_collectee_romeCode_departement_idx" ON "offre_collectee"("romeCode", "departement");

-- CreateIndex
CREATE INDEX "offre_collectee_publieeLe_idx" ON "offre_collectee"("publieeLe");

-- CreateIndex
CREATE INDEX "offre_collectee_empreinte_idx" ON "offre_collectee"("empreinte");
