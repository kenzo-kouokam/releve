/*
  Warnings:

  - You are about to drop the column `verrouilleJusqua` on the `utilisateur` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "utilisateur" DROP COLUMN "verrouilleJusqua",
ADD COLUMN     "dernierEchecLe" TIMESTAMP(3);
