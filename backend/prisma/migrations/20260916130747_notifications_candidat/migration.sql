-- AlterTable
ALTER TABLE "candidat" ADD COLUMN     "missionsNotifieesLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "notificationsEmail" BOOLEAN NOT NULL DEFAULT true;
