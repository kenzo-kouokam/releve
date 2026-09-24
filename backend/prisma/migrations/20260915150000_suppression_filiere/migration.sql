-- Suppression de la filiere.
--
-- Le champ separait le domicile de l'etablissement. La plateforme ne couvre
-- plus que l'aide a domicile : il ne prenait donc qu'une seule valeur, et un
-- discriminant a une valeur ne discrimine rien. Ce qui rend un intervenant
-- proposable, ce sont desormais le diplome verifie, la zone et les
-- disponibilites — le matching n'y perd aucune regle, il en perd une qui ne
-- filtrait plus personne.

ALTER TABLE "candidat" DROP COLUMN "filieres";
ALTER TABLE "qualification" DROP COLUMN "filieres";
ALTER TABLE "mission" DROP COLUMN "filiere";

DROP TYPE "Filiere";
