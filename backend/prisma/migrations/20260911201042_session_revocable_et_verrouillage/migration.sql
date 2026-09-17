-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "echecsConnexion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verrouilleJusqua" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "jeton_rafraichissement" (
    "id" UUID NOT NULL,
    "utilisateurId" UUID NOT NULL,
    "empreinte" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utiliseLe" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),
    "remplacePar" UUID,
    "familleId" UUID NOT NULL,

    CONSTRAINT "jeton_rafraichissement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jeton_rafraichissement_empreinte_key" ON "jeton_rafraichissement"("empreinte");

-- CreateIndex
CREATE INDEX "jeton_rafraichissement_utilisateurId_revoqueLe_idx" ON "jeton_rafraichissement"("utilisateurId", "revoqueLe");

-- CreateIndex
CREATE INDEX "jeton_rafraichissement_familleId_idx" ON "jeton_rafraichissement"("familleId");

-- AddForeignKey
ALTER TABLE "jeton_rafraichissement" ADD CONSTRAINT "jeton_rafraichissement_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
