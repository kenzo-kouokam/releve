-- Le classement, fige au moment ou l'agence propose.
--
-- Jusqu'ici le classement se calculait a la demande et ne laissait rien. Un
-- motif d'exclusion etait donc recalcule, jamais relu : la reponse a « pourquoi
-- ce candidat n'a-t-il pas ete propose ? » changeait avec les donnees du jour.
CREATE TABLE "classement_archive" (
  "id"          UUID         NOT NULL,
  "missionId"   UUID         NOT NULL,
  "auteurId"    UUID,
  "auteurEmail" TEXT         NOT NULL,
  "retenus"     JSONB        NOT NULL,
  "ecartes"     JSONB        NOT NULL,
  "proposesIds" UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "classement_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "classement_archive_missionId_createdAt_idx"
  ON "classement_archive" ("missionId", "createdAt");

ALTER TABLE "classement_archive"
  ADD CONSTRAINT "classement_archive_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "mission" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL` : le depart d'un charge de recrutement ne doit pas effacer la
-- trace de ses decisions. `auteurEmail` la conserve lisible.
ALTER TABLE "classement_archive"
  ADD CONSTRAINT "classement_archive_auteurId_fkey"
  FOREIGN KEY ("auteurId") REFERENCES "utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
