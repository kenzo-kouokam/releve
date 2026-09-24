-- Reinitialisation de mot de passe en autonomie.
--
-- La table des liens de verification devient la table des liens tout court :
-- confirmer une adresse et reprendre la main sur un compte ont exactement les
-- memes proprietes de securite (empreinte, peremption, usage unique), et deux
-- tables jumelles finiraient par diverger.

CREATE TYPE "UsageJeton" AS ENUM ('VERIFICATION_EMAIL', 'REINITIALISATION_MOT_DE_PASSE');

ALTER TABLE "jeton_verification_email" RENAME TO "jeton_usage_unique";

ALTER TABLE "jeton_usage_unique"
    RENAME CONSTRAINT "jeton_verification_email_pkey" TO "jeton_usage_unique_pkey";

ALTER TABLE "jeton_usage_unique"
    RENAME CONSTRAINT "jeton_verification_email_utilisateurId_fkey"
    TO "jeton_usage_unique_utilisateurId_fkey";

ALTER INDEX "jeton_verification_email_empreinte_key"
    RENAME TO "jeton_usage_unique_empreinte_key";

DROP INDEX "jeton_verification_email_utilisateurId_consommeLe_idx";

-- Les lignes deja en base sont toutes des confirmations d'adresse : c'est le
-- seul usage qui existait. Le DEFAULT les remplit, puis disparait — a partir
-- d'ici, l'usage se declare toujours explicitement a l'emission.
ALTER TABLE "jeton_usage_unique"
    ADD COLUMN "usage" "UsageJeton" NOT NULL DEFAULT 'VERIFICATION_EMAIL';

ALTER TABLE "jeton_usage_unique" ALTER COLUMN "usage" DROP DEFAULT;

CREATE INDEX "jeton_usage_unique_utilisateurId_usage_consommeLe_idx"
    ON "jeton_usage_unique"("utilisateurId", "usage", "consommeLe");
