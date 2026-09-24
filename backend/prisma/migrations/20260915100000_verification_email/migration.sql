-- Verification de l'adresse e-mail a l'inscription.

ALTER TABLE "utilisateur" ADD COLUMN "emailVerifieLe" TIMESTAMP(3);

-- Les comptes deja en base sont consideres verifies.
--
-- Sans cette ligne, la migration verrouille tout le monde d'un coup : les
-- comptes du back-office, ceux de la demo, et les jeux de tests. Leur adresse
-- n'a pas ete confirmee par un lien, mais elle a ete saisie par l'agence ou par
-- un seed, pas par un inconnu — c'est la creation par un tiers de confiance qui
-- fait foi ici, et la regle ne vaut que pour ce qui arrive du site public.
UPDATE "utilisateur" SET "emailVerifieLe" = NOW() WHERE "emailVerifieLe" IS NULL;

CREATE TABLE "jeton_verification_email" (
    "id" UUID NOT NULL,
    "utilisateurId" UUID NOT NULL,
    "empreinte" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,

    CONSTRAINT "jeton_verification_email_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jeton_verification_email_empreinte_key"
    ON "jeton_verification_email"("empreinte");

CREATE INDEX "jeton_verification_email_utilisateurId_consommeLe_idx"
    ON "jeton_verification_email"("utilisateurId", "consommeLe");

ALTER TABLE "jeton_verification_email"
    ADD CONSTRAINT "jeton_verification_email_utilisateurId_fkey"
    FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
