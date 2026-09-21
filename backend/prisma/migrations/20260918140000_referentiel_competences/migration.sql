-- Referentiel de competences metier, agrege depuis les offres France Travail.
--
-- Deuxieme usage des donnees publiques, a cote du barometre de tension. Le
-- barometre repond a « combien payer » ; le referentiel repond a « que
-- demander ». Les deux se nourrissent du meme import, aucune collecte
-- supplementaire n'est necessaire : les competences etaient deja rapatriees et
-- stockees dans `offre_collectee.competences`, elles n'etaient simplement
-- jamais agregees.

CREATE TABLE "competence" (
  "id"      UUID NOT NULL,
  -- Libelle normalise : minuscules, sans accents, espaces reduits.
  "cle"     TEXT NOT NULL,
  -- Libelle d'affichage, dans la forme la plus frequente chez les employeurs.
  "libelle" TEXT NOT NULL,
  "code"    TEXT,
  "vueLe"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "competence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competence_cle_key" ON "competence"("cle");

-- Une competence n'appartient pas a un metier : « aide a la toilette » se lit
-- sur les annonces d'aide-soignant comme sur celles d'accompagnant. C'est la
-- frequence qui est propre au metier, pas la competence.
CREATE TABLE "competence_metier" (
  "competenceId" UUID NOT NULL,
  "romeCode"     TEXT NOT NULL,
  "occurrences"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "competence_metier_pkey" PRIMARY KEY ("competenceId", "romeCode")
);

CREATE INDEX "competence_metier_romeCode_occurrences_idx"
  ON "competence_metier"("romeCode", "occurrences");

CREATE TABLE "competence_mission" (
  "missionId"     UUID NOT NULL,
  "competenceId"  UUID NOT NULL,
  "indispensable" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "competence_mission_pkey" PRIMARY KEY ("missionId", "competenceId")
);

CREATE INDEX "competence_mission_competenceId_idx" ON "competence_mission"("competenceId");

CREATE TABLE "competence_candidat" (
  "candidatId"   UUID NOT NULL,
  "competenceId" UUID NOT NULL,
  "declareeLe"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "competence_candidat_pkey" PRIMARY KEY ("candidatId", "competenceId")
);

-- La recherche par mots-cles part de la competence et remonte aux candidats.
CREATE INDEX "competence_candidat_competenceId_idx" ON "competence_candidat"("competenceId");

ALTER TABLE "competence_metier"
  ADD CONSTRAINT "competence_metier_competenceId_fkey"
  FOREIGN KEY ("competenceId") REFERENCES "competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competence_mission"
  ADD CONSTRAINT "competence_mission_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT et non CASCADE : une competence attachee a une mission ou a un profil
-- ne se supprime pas. L'agregation ne fait d'ailleurs jamais de suppression —
-- une competence disparue du marche voit ses occurrences tomber a zero et
-- garde ses rattachements, parce qu'ils disent ce qui a ete demande et declare.
ALTER TABLE "competence_mission"
  ADD CONSTRAINT "competence_mission_competenceId_fkey"
  FOREIGN KEY ("competenceId") REFERENCES "competence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "competence_candidat"
  ADD CONSTRAINT "competence_candidat_candidatId_fkey"
  FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competence_candidat"
  ADD CONSTRAINT "competence_candidat_competenceId_fkey"
  FOREIGN KEY ("competenceId") REFERENCES "competence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
