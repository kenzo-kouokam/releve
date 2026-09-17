-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- CreateEnum
CREATE TYPE "Filiere" AS ENUM ('DOMICILE', 'ETABLISSEMENT');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('ADMIN_AGENCE', 'CHARGE_RECRUTEMENT', 'CLIENT', 'CANDIDAT');

-- CreateEnum
CREATE TYPE "StatutCandidat" AS ENUM ('BROUILLON', 'EN_VERIFICATION', 'ACTIF', 'INACTIF', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "TypeClient" AS ENUM ('EHPAD', 'USLD', 'RESIDENCE_AUTONOMIE', 'SAAD', 'SSIAD', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeLieu" AS ENUM ('DOMICILE_BENEFICIAIRE', 'ETABLISSEMENT');

-- CreateEnum
CREATE TYPE "StatutMission" AS ENUM ('BROUILLON', 'PUBLIEE', 'EN_MATCHING', 'PROPOSEE', 'VALIDEE', 'CONTRACTUALISEE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'NON_POURVUE');

-- CreateEnum
CREATE TYPE "StatutProposition" AS ENUM ('ENVOYEE', 'ACCEPTEE_CANDIDAT', 'REFUSEE_CANDIDAT', 'VALIDEE_CLIENT', 'REFUSEE_CLIENT', 'EXPIREE');

-- CreateEnum
CREATE TYPE "StatutContrat" AS ENUM ('A_SIGNER', 'SIGNE', 'DPAE_ENVOYEE', 'ROMPU');

-- CreateEnum
CREATE TYPE "StatutReleve" AS ENUM ('SAISI', 'VALIDE_CLIENT', 'CONTESTE', 'EXPORTE');

-- CreateTable
CREATE TABLE "agence" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereCnx" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agenceId" UUID,
    "candidatId" UUID,
    "clientId" UUID,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidat" (
    "id" UUID NOT NULL,
    "agenceId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "statut" "StatutCandidat" NOT NULL DEFAULT 'BROUILLON',
    "filieres" "Filiere"[],
    "adresse" TEXT NOT NULL,
    "codePostal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geography(Point, 4326),
    "rayonKm" INTEGER NOT NULL DEFAULT 20,
    "permisB" BOOLEAN NOT NULL DEFAULT false,
    "vehicule" BOOLEAN NOT NULL DEFAULT false,
    "visiteMedicaleLe" DATE,
    "vaccinationVerifiee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "filieres" "Filiere"[],

    CONSTRAINT "qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_candidat" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "qualificationId" UUID NOT NULL,
    "obtenueLe" DATE,
    "expireLe" DATE,
    "justificatifUrl" TEXT,
    "verifieeLe" TIMESTAMP(3),
    "verifieePar" TEXT,

    CONSTRAINT "qualification_candidat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilite" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "jourSemaine" INTEGER NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "recurrente" BOOLEAN NOT NULL DEFAULT true,
    "valideDu" DATE,
    "valideAu" DATE,

    CONSTRAINT "disponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indisponibilite" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "du" DATE NOT NULL,
    "au" DATE NOT NULL,
    "motif" TEXT,

    CONSTRAINT "indisponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "agenceId" UUID NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "type" "TypeClient" NOT NULL,
    "conventionCollective" TEXT,
    "idcc" TEXT,
    "contactNom" TEXT,
    "contactEmail" TEXT,
    "contactTel" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lieu_intervention" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "type" "TypeLieu" NOT NULL,
    "libelle" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "codePostal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geography(Point, 4326),
    "etage" TEXT,
    "codeAcces" TEXT,
    "consignes" TEXT,
    "beneficiaireRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lieu_intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "agenceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "lieuId" UUID NOT NULL,
    "filiere" "Filiere" NOT NULL,
    "qualificationRequiseId" UUID NOT NULL,
    "statut" "StatutMission" NOT NULL DEFAULT 'BROUILLON',
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "travailNuit" BOOLEAN NOT NULL DEFAULT false,
    "motifRecours" TEXT NOT NULL,
    "description" TEXT,
    "tauxHoraire" DECIMAL(8,4),
    "coefficient" DECIMAL(5,3),
    "candidatRetenuId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposition" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "score" DECIMAL(5,2),
    "detailScore" JSONB,
    "statut" "StatutProposition" NOT NULL DEFAULT 'ENVOYEE',
    "envoyeeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repondueLe" TIMESTAMP(3),
    "expireLe" TIMESTAMP(3),
    "motifRefus" TEXT,

    CONSTRAINT "proposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrat" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "motifRecours" TEXT NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "statut" "StatutContrat" NOT NULL DEFAULT 'A_SIGNER',
    "signeLe" TIMESTAMP(3),
    "documentUrl" TEXT,
    "dpaeEnvoyeeLe" TIMESTAMP(3),
    "dpaeReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releve_heures" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "semaineDu" DATE NOT NULL,
    "heuresNormales" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "heuresNuit" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "heuresDimanche" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "heuresFeriees" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "kilometres" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "statut" "StatutReleve" NOT NULL DEFAULT 'SAISI',
    "saisiLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valideLe" TIMESTAMP(3),
    "validePar" TEXT,
    "commentaire" TEXT,
    "factureId" UUID,

    CONSTRAINT "releve_heures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "periodeDebut" DATE NOT NULL,
    "periodeFin" DATE NOT NULL,
    "montantHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tauxTva" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "montantTTC" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "emiseLe" TIMESTAMP(3),
    "payeeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_mission" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "auteurId" UUID,
    "auteurRole" "RoleUtilisateur",
    "donnees" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_mission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_candidatId_key" ON "utilisateur"("candidatId");

-- CreateIndex
CREATE INDEX "utilisateur_agenceId_role_idx" ON "utilisateur"("agenceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "candidat_email_key" ON "candidat"("email");

-- CreateIndex
CREATE INDEX "candidat_agenceId_statut_idx" ON "candidat"("agenceId", "statut");

-- CreateIndex
CREATE INDEX "candidat_codePostal_idx" ON "candidat"("codePostal");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_code_key" ON "qualification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_candidat_candidatId_qualificationId_key" ON "qualification_candidat"("candidatId", "qualificationId");

-- CreateIndex
CREATE INDEX "disponibilite_candidatId_jourSemaine_idx" ON "disponibilite"("candidatId", "jourSemaine");

-- CreateIndex
CREATE INDEX "indisponibilite_candidatId_du_au_idx" ON "indisponibilite"("candidatId", "du", "au");

-- CreateIndex
CREATE UNIQUE INDEX "client_siret_key" ON "client"("siret");

-- CreateIndex
CREATE INDEX "client_agenceId_type_idx" ON "client"("agenceId", "type");

-- CreateIndex
CREATE INDEX "lieu_intervention_clientId_type_idx" ON "lieu_intervention"("clientId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "mission_reference_key" ON "mission"("reference");

-- CreateIndex
CREATE INDEX "mission_agenceId_statut_idx" ON "mission"("agenceId", "statut");

-- CreateIndex
CREATE INDEX "mission_dateDebut_idx" ON "mission"("dateDebut");

-- CreateIndex
CREATE INDEX "mission_clientId_statut_idx" ON "mission"("clientId", "statut");

-- CreateIndex
CREATE INDEX "proposition_candidatId_statut_idx" ON "proposition"("candidatId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "proposition_missionId_candidatId_key" ON "proposition"("missionId", "candidatId");

-- CreateIndex
CREATE UNIQUE INDEX "contrat_missionId_key" ON "contrat"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "contrat_numero_key" ON "contrat"("numero");

-- CreateIndex
CREATE INDEX "releve_heures_statut_idx" ON "releve_heures"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "releve_heures_missionId_semaineDu_key" ON "releve_heures"("missionId", "semaineDu");

-- CreateIndex
CREATE UNIQUE INDEX "facture_numero_key" ON "facture"("numero");

-- CreateIndex
CREATE INDEX "facture_clientId_periodeDebut_idx" ON "facture"("clientId", "periodeDebut");

-- CreateIndex
CREATE INDEX "evenement_mission_missionId_createdAt_idx" ON "evenement_mission"("missionId", "createdAt");

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_agenceId_fkey" FOREIGN KEY ("agenceId") REFERENCES "agence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidat" ADD CONSTRAINT "candidat_agenceId_fkey" FOREIGN KEY ("agenceId") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_candidat" ADD CONSTRAINT "qualification_candidat_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_candidat" ADD CONSTRAINT "qualification_candidat_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "qualification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilite" ADD CONSTRAINT "disponibilite_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilite" ADD CONSTRAINT "indisponibilite_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_agenceId_fkey" FOREIGN KEY ("agenceId") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieu_intervention" ADD CONSTRAINT "lieu_intervention_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_agenceId_fkey" FOREIGN KEY ("agenceId") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "lieu_intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_qualificationRequiseId_fkey" FOREIGN KEY ("qualificationRequiseId") REFERENCES "qualification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_candidatRetenuId_fkey" FOREIGN KEY ("candidatRetenuId") REFERENCES "candidat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposition" ADD CONSTRAINT "proposition_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposition" ADD CONSTRAINT "proposition_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_heures" ADD CONSTRAINT "releve_heures_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_heures" ADD CONSTRAINT "releve_heures_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_heures" ADD CONSTRAINT "releve_heures_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_mission" ADD CONSTRAINT "evenement_mission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

