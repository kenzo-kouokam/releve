-- Changement de secteur : l'agence ne place plus dans des services d'aide a
-- domicile (SAAD) mais dans des etablissements d'hebergement pour personnes
-- agees dependantes (EHPAD).
--
-- Le changement n'est pas un renommage. Un SAAD intervient au domicile d'un
-- beneficiaire sous un regime de declaration ou d'agrement « services a la
-- personne » ; un EHPAD accueille des residents dans ses propres murs sous une
-- autorisation conjointe ARS / conseil departemental. Les pieces qui etablissent
-- le droit d'exercer ne sont donc pas les memes, et les colonnes qui les
-- portaient changent avec elles.

-- ---------------------------------------------------------------- type de client
UPDATE "client" SET "type" = 'SAAD' WHERE "type" <> 'SAAD';

ALTER TYPE "TypeClient" RENAME TO "TypeClient_ancien";

CREATE TYPE "TypeClient" AS ENUM ('EHPAD');

ALTER TABLE "client"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "TypeClient" USING ('EHPAD'::"TypeClient"),
  ALTER COLUMN "type" SET DEFAULT 'EHPAD';

DROP TYPE "TypeClient_ancien";

-- ---------------------------------------------------------------- statut juridique
--
-- L'ancien champ disait sous quel regime la structure avait le droit
-- d'intervenir, parce que ce droit variait. Il ne varie plus : il n'existe pas
-- d'EHPAD sans arrete d'autorisation. Ce qui varie desormais, c'est le statut
-- juridique du gestionnaire, parce qu'il decide de la convention collective —
-- donc du salaire de reference de l'interimaire.
--
-- Aucune correspondance n'est tentee entre les deux : un « declare SAP » ne dit
-- rien de la nature publique ou privee du gestionnaire. La colonne repart a
-- NULL, et les fiches concernees redeviennent non activables tant que l'agence
-- n'a pas lu l'arrete — ce qui est exactement le comportement voulu.
CREATE TYPE "StatutJuridique" AS ENUM (
  'PUBLIC_HOSPITALIER',
  'PUBLIC_TERRITORIAL',
  'PRIVE_NON_LUCRATIF',
  'PRIVE_COMMERCIAL'
);

ALTER TABLE "client"
  DROP COLUMN "statutReglementaire",
  ADD COLUMN "statutJuridique" "StatutJuridique";

DROP TYPE "StatutReglementaire";

-- Le numero SAP et le numero d'agrement relevent du code du travail applicable
-- aux services a la personne (art. L. 7232-1 et suivants). Un EHPAD n'en a pas.
ALTER TABLE "client"
  DROP COLUMN "numeroSap",
  DROP COLUMN "numeroAgrement";

-- ---------------------------------------------------------------- lieu d'intervention
--
-- Le domicile du beneficiaire disparait : on ne travaille plus que dans
-- l'etablissement. La distinction utile devient l'unite protegee, qui accueille
-- des residents atteints de troubles cognitifs et suppose une formation que
-- tout titulaire du diplome n'a pas.
UPDATE "lieu_intervention" SET "type" = 'ETABLISSEMENT' WHERE "type" <> 'ETABLISSEMENT';

ALTER TYPE "TypeLieu" RENAME TO "TypeLieu_ancien";

CREATE TYPE "TypeLieu" AS ENUM ('ETABLISSEMENT', 'UNITE_PROTEGEE');

ALTER TABLE "lieu_intervention"
  ALTER COLUMN "type" TYPE "TypeLieu" USING ("type"::text::"TypeLieu");

DROP TYPE "TypeLieu_ancien";

-- La reference pseudonymisee du beneficiaire designait un logement. Elle n'a
-- plus d'objet : on intervient pour une unite, pas pour une personne. La
-- supprimer est aussi la meilleure facon de respecter la minimisation — une
-- colonne absente ne peut pas etre remplie par erreur.
ALTER TABLE "lieu_intervention" DROP COLUMN "beneficiaireRef";
