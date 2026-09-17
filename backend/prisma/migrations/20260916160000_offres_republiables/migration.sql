-- Republication des offres France Travail.
--
-- Trois choses a la fois : les champs qui manquaient pour afficher une annonce
-- entiere, un cycle de vie pour faire disparaitre les offres retirees chez la
-- source, et l'assouplissement des colonnes que le nettoyage statistique
-- exigeait mais que la republication ne peut pas exiger.

-- Cycle de vie. EXPIREE ne supprime pas la ligne : le barometre travaille sur
-- une fenetre glissante et doit continuer a voir les offres passees.
CREATE TYPE "StatutOffreCollectee" AS ENUM ('ACTIVE', 'EXPIREE');

ALTER TABLE "offre_collectee"
  ADD COLUMN "statut" "StatutOffreCollectee" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "vueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expireeLe" TIMESTAMP(3);

-- `commune` contenait le code INSEE ("74280"), pas un nom de ville : on le
-- renomme au lieu de le jeter, la valeur est bonne, c'est son nom qui mentait.
ALTER TABLE "offre_collectee" RENAME COLUMN "commune" TO "communeCode";

-- Le nom lisible n'avait jamais ete collecte. Le prochain import le remplira ;
-- d'ici la, les lignes existantes l'ont a NULL et l'affichage se rabat sur le
-- code postal.
ALTER TABLE "offre_collectee"
  ADD COLUMN "communeNom" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "entrepriseDescription" TEXT,
  ADD COLUMN "experienceLibelle" TEXT,
  ADD COLUMN "qualificationLibelle" TEXT,
  ADD COLUMN "secteurActiviteLibelle" TEXT,
  ADD COLUMN "competences" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "horaires" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "conditionsExercice" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "dureeTravailLibelle" TEXT,
  ADD COLUMN "natureContrat" TEXT,
  ADD COLUMN "typeContrat" TEXT,
  ADD COLUMN "typeContratLibelle" TEXT,
  ADD COLUMN "alternance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "actualiseeLe" TIMESTAMP(3),
  ADD COLUMN "urlOrigine" TEXT;

-- Une offre "France entiere" n'a pas de departement, une offre non rattachee au
-- referentiel n'a pas de ROME : les ecarter etait juste pour une statistique,
-- faux pour une republication.
ALTER TABLE "offre_collectee"
  ALTER COLUMN "romeCode" DROP NOT NULL,
  ALTER COLUMN "romeLibelle" DROP NOT NULL,
  ALTER COLUMN "departement" DROP NOT NULL,
  ALTER COLUMN "communeCode" DROP NOT NULL,
  ALTER COLUMN "codePostal" DROP NOT NULL;

CREATE INDEX "offre_collectee_statut_publieeLe_idx" ON "offre_collectee" ("statut", "publieeLe");
CREATE INDEX "offre_collectee_source_statut_idx" ON "offre_collectee" ("source", "statut");
