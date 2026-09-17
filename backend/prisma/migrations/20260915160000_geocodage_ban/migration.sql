-- Geocodage des adresses par la Base Adresse Nationale.
--
-- Les colonnes latitude / longitude existaient depuis le socle initial, mais
-- rien ne les remplissait : toute fiche creee depuis le site public restait
-- sans coordonnees, donc ecartee de toutes les missions. Cette migration ajoute
-- ce qui manquait pour que le calcul soit auditable — la finesse du point et la
-- date a laquelle il a ete obtenu — et l'index spatial qui rend la colonne
-- PostGIS utile.

CREATE TYPE "PrecisionGeocodage" AS ENUM ('NUMERO', 'RUE', 'LIEU_DIT', 'COMMUNE');

ALTER TABLE "candidat"
  ADD COLUMN "geocodeLe" TIMESTAMP(3),
  ADD COLUMN "geocodePrecision" "PrecisionGeocodage";

ALTER TABLE "lieu_intervention"
  ADD COLUMN "geocodeLe" TIMESTAMP(3),
  ADD COLUMN "geocodePrecision" "PrecisionGeocodage";

-- Index spatial. Il ne sert a rien tant que le classement charge tout le vivier
-- en memoire, mais il est la condition d'un pre-filtre ST_DWithin : le poser
-- maintenant evite une migration lourde sur une table deja pleine.
CREATE INDEX "candidat_geom_idx" ON "candidat" USING GIST ("geom");
CREATE INDEX "lieu_intervention_geom_idx" ON "lieu_intervention" USING GIST ("geom");

-- Les fiches deja en base ont pu recevoir des coordonnees saisies a la main par
-- le back-office. On les conserve, mais sans pretendre savoir d'ou elles
-- viennent : `geocodeLe` reste nul, et la commande de rattrapage ne les reprend
-- pas puisqu'elles ont deja un point. La colonne `geom`, elle, n'a jamais ete
-- ecrite : on la met en accord avec les deux autres.
UPDATE "candidat"
   SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
 WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

UPDATE "lieu_intervention"
   SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
 WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
