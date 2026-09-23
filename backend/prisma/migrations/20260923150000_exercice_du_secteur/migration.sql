-- Troisieme cas pour une experience : le secteur sans diplome rattache.
--
-- `qualificationId` nul disait jusqu'ici deux choses a la fois — « un autre
-- metier » et « du soin, mais aucun de nos deux diplomes ». Les lignes
-- existantes prennent `false`, qui correspond a ce que le calcul en faisait
-- deja : aucune heure d'exercice. Reclasser celles qui le meritent est un
-- geste d'agence, sur piece, pas une migration.
ALTER TABLE "experience_professionnelle"
  ADD COLUMN IF NOT EXISTS "exerciceMetier" BOOLEAN NOT NULL DEFAULT false;
