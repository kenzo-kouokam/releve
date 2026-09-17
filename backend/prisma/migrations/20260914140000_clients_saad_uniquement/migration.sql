-- Reduction du perimetre : l'agence ne place plus que dans des services d'aide
-- et d'accompagnement a domicile (SAAD). EHPAD, USLD, residence autonomie,
-- SSIAD et « autre » disparaissent du referentiel.

-- Les clients d'un autre type sont bascules plutot que supprimes : leurs
-- missions, contrats et factures restent rattaches. En production cette bascule
-- serait precedee d'un export, ici il s'agit du jeu de demonstration.
UPDATE "client" SET "type" = 'SAAD' WHERE "type" <> 'SAAD';

-- PostgreSQL ne sait pas retirer une valeur d'un type enumere : il faut le
-- recreer et reconvertir la colonne.
ALTER TYPE "TypeClient" RENAME TO "TypeClient_ancien";

CREATE TYPE "TypeClient" AS ENUM ('SAAD');

ALTER TABLE "client"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "TypeClient" USING ("type"::text::"TypeClient"),
  ALTER COLUMN "type" SET DEFAULT 'SAAD';

DROP TYPE "TypeClient_ancien";

-- Indexer une colonne devenue constante ne sert plus a rien ; la liste des
-- clients filtre sur l'agence et sur l'activation.
DROP INDEX IF EXISTS "client_agenceId_type_idx";

CREATE INDEX "client_agenceId_actif_idx" ON "client"("agenceId", "actif");
