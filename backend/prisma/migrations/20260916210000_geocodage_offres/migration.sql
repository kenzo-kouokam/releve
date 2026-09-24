-- Geocodage des offres collectees.
--
-- France Travail ne publie des coordonnees que pour une annonce sur sept : sur
-- un import reel de 2 020 offres, 295 seulement etaient situees. Les 1 725
-- autres portent pourtant leur commune et leur code postal — il ne manquait
-- qu'une conversion, et la Base Adresse Nationale la fait gratuitement.
--
-- Le geocodage se fait par commune, jamais par offre : les 1 725 annonces sans
-- coordonnees ne representent que 1 040 couples code postal / commune
-- distincts, et une commune situee sert a toutes ses offres, aujourd'hui comme
-- aux imports suivants.

CREATE TYPE "OrigineCoordonnees" AS ENUM ('SOURCE', 'COMMUNE');

-- Table de communes situees, reutilisee d'un import a l'autre.
CREATE TABLE "commune_geocodee" (
  "codePostal"  TEXT    NOT NULL,
  "nom"         TEXT    NOT NULL,
  "latitude"    DOUBLE PRECISION,
  "longitude"   DOUBLE PRECISION,
  -- Sans ce drapeau, chaque import retenterait indefiniment les communes que
  -- la BAN ne sait pas resoudre.
  "introuvable" BOOLEAN NOT NULL DEFAULT false,
  "situeeLe"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commune_geocodee_pkey" PRIMARY KEY ("codePostal", "nom")
);

ALTER TABLE "offre_collectee"
  ADD COLUMN "origineCoordonnees" "OrigineCoordonnees";

-- Les offres deja situees le sont par la source : on le dit retroactivement,
-- sinon elles passeraient toutes pour des approximations de commune.
UPDATE "offre_collectee"
   SET "origineCoordonnees" = 'SOURCE'
 WHERE "latitude" IS NOT NULL
   AND "longitude" IS NOT NULL;

-- Le rapprochement candidat filtre sur le metier puis sur une boite englobante.
CREATE INDEX "offre_collectee_statut_romeCode_latitude_idx"
  ON "offre_collectee" ("statut", "romeCode", "latitude");

-- Le rattrapage cherche les offres sans coordonnees, commune par commune.
CREATE INDEX "offre_collectee_codePostal_communeNom_idx"
  ON "offre_collectee" ("codePostal", "communeNom");
