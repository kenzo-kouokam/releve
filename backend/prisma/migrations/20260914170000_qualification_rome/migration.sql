-- Code ROME du metier correspondant a chaque qualification.
-- Il relie le referentiel des diplomes aux offres collectees sur France
-- Travail, et permet de suggerer un taux horaire de marche.
ALTER TABLE "qualification" ADD COLUMN "romeCode" TEXT;
