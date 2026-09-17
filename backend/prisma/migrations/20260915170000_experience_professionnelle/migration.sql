-- Experience professionnelle des intervenants.
--
-- Le bareme mesurait l'experience par l'anciennete du diplome, faute de mieux :
-- un DEAS obtenu en 2014 et jamais exerce y comptait autant que dix ans de
-- terrain. Cette table porte ce que le diplome ne dit pas, avec le meme
-- invariant que les qualifications : la ligne nait non verifiee et ne rapporte
-- rien tant que l'agence ne l'a pas controlee sur piece.

CREATE TABLE "experience_professionnelle" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "employeur" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "qualificationId" UUID,
    "debutLe" DATE NOT NULL,
    "finLe" DATE,
    "quotitePourcent" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "verifieeLe" TIMESTAMP(3),
    "verifieePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_professionnelle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "experience_professionnelle_candidatId_debutLe_idx"
    ON "experience_professionnelle" ("candidatId", "debutLe");

CREATE INDEX "experience_professionnelle_qualificationId_idx"
    ON "experience_professionnelle" ("qualificationId");

ALTER TABLE "experience_professionnelle"
  ADD CONSTRAINT "experience_professionnelle_candidatId_fkey"
  FOREIGN KEY ("candidatId") REFERENCES "candidat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL et non CASCADE : retirer une qualification du referentiel ne doit pas
-- effacer le passe professionnel de ceux qui la detenaient. La ligne survit,
-- simplement elle ne compte plus comme qualifiante.
ALTER TABLE "experience_professionnelle"
  ADD CONSTRAINT "experience_professionnelle_qualificationId_fkey"
  FOREIGN KEY ("qualificationId") REFERENCES "qualification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
