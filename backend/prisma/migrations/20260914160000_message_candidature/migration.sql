-- Mot d accompagnement ecrit par le candidat quand il postule.
-- Nullable : une proposition emise par l agence n en porte pas.
ALTER TABLE "proposition" ADD COLUMN "message" TEXT;
