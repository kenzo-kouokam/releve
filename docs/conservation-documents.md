# Pièces justificatives : conservation et sécurité

Ce document accompagne le modèle `DocumentCandidat` et le module
`backend/src/documents/`. Il décrit ce qui est en place, et surtout **ce qui ne
l'est pas** — les pièces concernées (NIR, pièce d'identité, RIB) comptent parmi
les données personnelles les plus sensibles que la plateforme manipule.

Il n'a pas été relu par un délégué à la protection des données. Les durées
ci-dessous sont des propositions à arbitrer par l'agence, pas des obligations
constatées.

---

## Ce que la plateforme stocke

| Champ            | Contenu                                               |
| ---------------- | ----------------------------------------------------- |
| `type`           | NIR, DIPLOME, CV, PIECE_IDENTITE, RIB                 |
| `nomOrigine`     | Nom du fichier tel que téléversé, pour réaffichage    |
| `typeMime`       | Constaté à la réception, restreint à la liste blanche |
| `taille`         | Octets, plafonnée à 10 Mo                             |
| `cheminStockage` | Identifiant opaque dans le stockage, jamais un nom    |
| `empreinte`      | SHA-256 du contenu                                    |
| `verifieLe`      | Date du contrôle par l'agence, nulle tant qu'absent   |
| `expireLe`       | Péremption, pour les pièces qui en ont une            |

**Le binaire n'est jamais en base.** Il vit dans le dossier désigné par
`STOCKAGE_DOCUMENTS`, sous un nom généré (UUID), rangé par deux caractères de
préfixe. Une colonne `bytea` rendrait chaque lecture de fiche coûteuse et les
sauvegardes impraticables.

**Un seul document par type et par candidat.** Déposer à nouveau remplace, et
l'ancien binaire est effacé. Un dossier qui accumulerait trois RIB ne dirait
plus lequel fait foi.

**Un remplacement annule la vérification.** Le contrôle de l'agence portait sur
le fichier précédent.

---

## Qui accède à quoi

| Acteur                | Droit                                              |
| --------------------- | -------------------------------------------------- |
| La personne concernée | Dépose, télécharge et retire ses propres pièces    |
| L'agence              | **Lit** les pièces de ses candidats, pour vérifier |
| L'établissement       | Aucun accès                                        |

L'agence ne peut ni déposer ni retirer à la place de quelqu'un : ces gestes
appartiennent à la personne, et un document retiré par un tiers serait
indéfendable en cas de litige.

Le cloisonnement par agence s'applique comme sur le reste du vivier :
`exigerAppartenance()` est appelée avant toute lecture côté back-office.

**Aucune racine n'est servie statiquement.** Un document ne sort que par une
route authentifiée qui vérifie à qui il appartient, et l'en-tête de réponse est
`Content-Disposition: attachment` — jamais `inline`, pour qu'un PDF téléversé ne
s'exécute pas dans le contexte de l'API.

---

## Durée de conservation : un an, puis on redemande

**Règle en vigueur depuis le 16 septembre 2026.** Elle est décidée, implémentée
et écrite dans la politique de confidentialité — ce n'est plus une proposition.

Une pièce déposée est conservée **douze mois** à compter de son dépôt. Redéposer
une pièce fait repartir ce délai : déposer est un signe de vie du dossier.

À l'échéance, la plateforme écrit à la personne, à l'adresse de son compte, et
lui demande si elle veut qu'on garde ses pièces. Un seul courriel par dossier,
quel que soit le nombre de pièces échues : cinq messages le même matin donnent à
la demande un air de panne. Le message porte un lien à usage unique, valable
trente jours, qui ouvre une page où elle tranche — conserver un an de plus, ou
effacer tout de suite.

**Sans réponse au bout de trente jours, les pièces sont effacées.** Le silence
ne vaut pas accord : c'est le point de toute la mécanique. Le compte et le
dossier, eux, restent ouverts ; la personne peut redéposer quand elle veut.

Les deux valeurs — douze mois, trente jours — sont déclarées une seule fois,
dans `shared/src/conservation.ts`, et lues par la commande, par le courriel et
par la page publique. Les changer là les change partout.

### Les deux balayages

Rien ne se déclenche depuis le processus web : une tâche cachée dans l'API
s'exécuterait autant de fois qu'il y a d'instances, et personne ne saurait quand
elle a tourné. Ce sont deux commandes, à appeler une fois par jour chacune par
l'ordonnanceur.

```bash
# Qui serait relancé, sans rien envoyer
pnpm cli conservation:relancer --sec
pnpm cli conservation:relancer

# Ce qui serait effacé faute de réponse, sans rien écrire
pnpm cli conservation:purger --sec
pnpm cli conservation:purger
```

Elles sont volontairement séparées. Fondues en une seule, un ordonnanceur mal
réglé déclencherait les deux du même mouvement, et la relance du matin
effacerait ce qu'elle vient d'annoncer.

### La même durée pour les cinq types

**Tranché par l'agence le 16 septembre 2026.** Deux questions restaient
ouvertes ; la réponse est la même pour les deux : un an, comme le reste.

| Pièce            | Question posée                                                   | Réponse |
| ---------------- | ---------------------------------------------------------------- | ------- |
| Pièce d'identité | L'effacer dès `verifieLe` renseigné, plutôt qu'au bout d'un an ? | Non     |
| Diplômes         | La garder 5 ans quand elle a justifié un placement ?             | Non     |

Conséquence directe : **aucune règle particulière par type dans le code**. Le
service ne branche nulle part sur `TypeDocument` pour calculer une échéance, et
c'est voulu. Une durée par pièce serait cinq chemins à tenir à jour, cinq
occasions de diverger, et un courriel de relance qui devrait expliquer pourquoi
le RIB part et le diplôme reste.

Deux remarques à garder sous la main si la décision devait être revue :

- La copie de la pièce d'identité est la plus difficile à justifier au-delà du
  contrôle : la vérification peut être constatée (`verifieLe`) sans que la copie
  soit gardée. Si un conseil juridique revenait là-dessus, c'est le seul type
  qui mériterait son propre traitement.
- À l'inverse, si l'agence doit répondre cinq ans d'un placement, ce n'est pas
  le diplôme qu'il faut garder mais la **trace** qu'il a été vérifié — et cette
  trace existe déjà (`verifieLe`, `verifieParId`), indépendamment du fichier.
  Effacer la pièce ne l'efface pas.

---

## Ce qui manque avant un usage réel

1. **Aucun chiffrement au repos.** Les fichiers sont écrits en clair sur le
   disque. En production, le volume doit être chiffré, ou le contenu chiffré
   applicativement avec une clé hors du dépôt.
2. **Aucune analyse antivirale.** Un fichier téléversé est accepté sur la foi de
   son type MIME déclaré et de sa taille. Un passage par ClamAV, ou un service
   équivalent, est à prévoir avant que l'agence n'ouvre ces pièces.
3. **Le type MIME n'est pas vérifié contre le contenu.** Il est comparé à une
   liste blanche, mais reste une déclaration du navigateur. Une inspection de la
   signature du fichier (les premiers octets) le confirmerait.
4. **L'ordonnanceur n'est pas branché.** Les deux commandes de conservation
   existent et sont testées ; rien ne les appelle encore chaque jour. Tant que
   c'est le cas, la durée d'un an est écrite dans la politique sans être
   appliquée — c'est le manque le plus visible de cette liste.
5. **Aucune journalisation des accès.** Savoir qui a ouvert la pièce d'identité
   de qui, et quand, fait partie de ce qu'une autorité de contrôle demande.
6. **Aucune restitution automatisée.** Le droit à la portabilité s'exerce
   aujourd'hui par courriel, traité à la main.

---

## Purge manuelle, hors du cycle d'un an

`purger:documents` reste disponible pour un effacement ciblé — retirer tous les
CV de plus de deux ans, par exemple, indépendamment du cycle de conservation.

```bash
# Ce qui serait supprimé, sans rien écrire
pnpm cli purger:documents --type CV --jours 730 --sec

# Appliquer
pnpm cli purger:documents --type CV --jours 730
```

La commande ne touche qu'un type à la fois et exige un âge explicite : une purge
qui se déclencherait sur des valeurs par défaut est une perte de données qui
attend son heure. À la différence des deux balayages de conservation, elle
n'écrit à personne — elle efface.
