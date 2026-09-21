-- Ouverture aux etablissements de sante : l'agence ne place plus seulement en
-- EHPAD, mais aussi en hopital et en clinique.
--
-- Contrairement au passage SAAD -> EHPAD, ce n'est pas un changement de secteur
-- mais un elargissement : les fiches existantes restent exactement ce qu'elles
-- sont. Aucune donnee n'est reecrite, aucune colonne ne disparait, et le defaut
-- de la colonne reste EHPAD pour les lignes anterieures.
--
-- Deux valeurs suffisent a couvrir les deux regimes nouveaux. Un hopital public
-- et une clinique privee relevent du meme article — l'autorisation d'activite de
-- soins delivree par l'ARS (art. L. 6122-1 du CSP) — mais les distinguer sert
-- ailleurs : le statut juridique du gestionnaire n'est pas la meme chose que la
-- nature de l'etablissement, et un CHU comme une clinique commerciale peuvent
-- porter des conventions collectives differentes a statut juridique egal.
--
-- `ALTER TYPE ... ADD VALUE` s'execute dans une transaction depuis PostgreSQL 12
-- tant que la valeur ajoutee n'est pas utilisee dans la meme transaction. C'est
-- le cas ici : rien n'est mis a jour ensuite. Recreer le type comme le faisait
-- la migration du pivot obligerait a reecrire la colonne de toutes les fiches
-- pour n'ajouter que deux etiquettes.

ALTER TYPE "TypeClient" ADD VALUE IF NOT EXISTS 'HOPITAL';
ALTER TYPE "TypeClient" ADD VALUE IF NOT EXISTS 'CLINIQUE';
