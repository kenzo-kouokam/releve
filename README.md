# Relève

Agence d'intérim numérique pour l'aide à domicile.

L'agence place des intérimaires — auxiliaires de vie, aides-soignants, AES — chez des **services
d'aide et d'accompagnement à domicile (SAAD)** qui ont un besoin de remplacement, souvent à très
court terme. La plateforme remplace le tableur et le téléphone : vivier de candidats, référentiel
client, dépôt de besoin, matching — puis, au schéma mais pas encore au code, contractualisation et
relevés d'heures (voir « État d'avancement »).

Le SAAD est le **seul** type de client : `TypeClient` ne porte qu'une valeur, les particuliers
employeurs sont hors périmètre. Une structure est enregistrée par l'agence, jamais par
auto-inscription — son **statut réglementaire** (déclaration SAP, agrément, ou autorisation
départementale au titre du CASF) décide de ce qu'elle a le droit de faire, et se vérifie sur pièce. Face à Hublo, qui vend un outil de recrutement, et à Mediflash, qui
contourne le salariat, la différenciation tient dans un vrai contrat de mission d'intérim —
l'analyse concurrentielle est dans
[`docs/analyse-de-marche.html`](docs/analyse-de-marche.html).

---

## État d'avancement

Le projet est un **POC de onze jours**. Quatre jalons sur cinq sont entamés.

| Jalon                                        | Périmètre                                                                                                 | État                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **J1–J2 — Socle et vivier**                  | Monorepo, authentification et rôles, référentiels, fiches candidats, back-office                          | **Livré**                     |
| **J3–J5 — Comptes, mission, profil**         | Inscription des deux profils, dépôt de besoin, candidature, validation, espace personnel de l'intérimaire | **Livré**                     |
| **J5–J7 — Données publiques et matching**    | Import France Travail, baromètre, taux suggéré, moteur de matching à score explicable                     | **Livré**                     |
| J7–J9 — Tableau de bord, vitrine, conformité | Tableau de bord candidat, pages publiques, n8n, RGAA / RGESN / RGPD                                       | **Partiel** — voir ci-dessous |
| J10–J11 — Tests, livrables, soutenance       | Couverture transmise, étude de marché, chiffrage réel, pitch                                              | À faire · 4 j·dev             |

**371 tests au vert** : 339 sur l'API, 32 sur les règles partagées. Le front n'en a aucun.

Du jalon J7–J9 sont livrés le **tableau de bord candidat**, les **huit pages vitrine** (accueil,
fonctionnement, à propos, FAQ, contact, mentions légales, conditions d'utilisation, politique de
confidentialité) et la refonte complète des écrans sur le canvas de design. Le volet RGPD est
entamé : dépôt des pièces justificatives, **conservation bornée à un an** avec relance par courriel,
et consentement recueilli et daté à l'inscription. Restent les **automatisations n8n**, le reste de
la **conformité** (RGAA, RGESN) et le **référencement**. Le chiffrage par fonctionnalité, le plan de
repli et les livrables datés sont dans le cahier des charges figé à J+2, qui sert de référence pour
l'écart entre estimé et réel.

**La boucle produit est fermée** : un service publie un besoin, un intérimaire qualifié le voit et
postule, le service le confirme, la mission apparaît dans son suivi.

**Elle s'arrête là.** Les modèles `Contrat`, `ReleveHeures`, `Facture` et `EvenementMission` sont au
schéma et **aucun service ne les lit** — zéro occurrence dans `backend/src`. La contractualisation
et les relevés d'heures annoncés en tête de ce document sont donc une intention du modèle de
données, pas une fonctionnalité.

**Les trois manques qui bloquaient une mise en ligne sont traités** — dépôt de pièces
justificatives, conditions d'utilisation, identité légale. Le dernier l'est **pour la démonstration
seulement** : les dix-sept champs légaux portent un jeu de valeurs fictives, signalé par un bandeau
sur les trois pages. Une mise en ligne réelle exige de les remplacer par les faits de l'agence, dont
la garantie financière obligatoire pour une entreprise de travail temporaire.

---

## Stack

| Couche       | Choix                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Monorepo     | pnpm workspaces, TypeScript strict                                      |
| API          | NestJS 11, Prisma 6, Zod 4, Swagger                                     |
| Base         | PostgreSQL 16 + PostGIS (le géomatching candidat → lieu en dépendra)    |
| File de jobs | Redis 7 (prévu pour BullMQ : matching différé, relances)                |
| Front        | Nuxt 4, Vue 3, rendu serveur                                            |
| Auth         | JWT signé HS256, mots de passe en Argon2id                              |
| Design       | Canvas Claude Design « Relève app web design », transposé en tokens CSS |

`shared` est le point d'articulation : les schémas Zod y sont écrits **une seule fois**
et servent à la fois à valider les entrées de l'API et les formulaires du front. Le package ne
dépend pas de Prisma, pour rester importable par le navigateur.

---

## Démarrage

Prérequis : **Node ≥ 22**, **pnpm 12**, **Docker**.

```bash
pnpm install                 # installe le workspace
cp .env.example backend/.env

pnpm infra:up                # PostgreSQL (5434), Redis (6380), Mailpit (8025)
pnpm db:migrate              # applique la migration
pnpm db:seed                 # jeu de données de démonstration

pnpm dev                     # API sur :3001, front sur :3000
```

Les courriels de confirmation partent sur **Mailpit** : rien à configurer, ils s'ouvrent dans le
navigateur sur **http://localhost:8025**. Aucun message ne sort de la machine, ce qui permet de
dérouler une inscription complète sans écrire à une vraie adresse.

```bash
pnpm test                    # 306 tests : règles partagées + intégration API
```

La base d'intégration (`passerelle_test`) est créée et migrée automatiquement au
premier lancement, puis vidée à chaque suite. Elle est distincte de la base de
développement.

Documentation de l'API générée : <http://localhost:3001/api/docs>.

Les ports **5434** et **6380** sont décalés volontairement : 5432, 5433 et 6379 sont souvent déjà
pris sur un poste de développement (Postgres local, WSL).

### Comptes de démonstration

Mot de passe commun : `Releve2026!`. Relancer `pnpm db:seed` réécrit les mots de passe, c'est
le moyen le plus simple de récupérer un accès en local.

| Adresse                        | Rôle                    | Rattachement             |
| ------------------------------ | ----------------------- | ------------------------ |
| `admin@releve.example`         | Administrateur d'agence | Agence pilote            |
| `charge@releve.example`        | Chargé de recrutement   | Agence pilote            |
| `secteur@les-tilleuls.example` | Client                  | Les Tilleuls (SAAD)      |
| `sophie.marchand@example.org`  | Candidat                | Fiche de Sophie Marchand |

Les quatre comptes ont leurs écrans : back-office pour les deux premiers, espace établissement
pour le troisième, espace candidat — tableau de bord, missions, suivi, profil — pour le dernier.

---

## Données publiques

La plateforme consomme les offres d'intérim publiées sur **France Travail** pour les métiers du
secteur (codes ROME `J1501` aide-soignant, `K1302` assistance auprès d'adultes, `K1304` services
domestiques). Elles servent à deux choses, et à rien d'autre :

- un **baromètre de tension** par métier et par département, qui alimente le taux horaire suggéré à
  l'établissement au moment où il fixe sa rémunération ;
- des **suggestions au candidat connecté**, rapprochées de son métier et de son rayon de
  déplacement.

Elles ne sont **jamais republiées au tout-venant**. La page publique `/offres` ne sert que les
missions de Relève : mélanger les deux ferait croire à un candidat qu'il postule ici alors que
l'annonce appartient à une agence concurrente, et qu'il n'en recevra jamais de réponse de notre
part. Partout où une offre France Travail est montrée — donc dans l'espace candidat — sa source est
citée et un lien mène à l'annonce d'origine, seule façon d'y postuler.

> **Licence.** La réutilisation est encadrée par la _licence de réutilisation de la base d'offres
> d'emploi de France Travail_, à laquelle il faut adhérer sur
> [francetravail.io](https://francetravail.io). Elle impose d'interroger l'API au moins toutes les
> 24 heures, de faire disparaître les offres retirées chez la source, de ne pas dénaturer le contenu,
> d'afficher la date de dernière actualisation, et **exclut les coordonnées du recruteur** — que le
> code ne collecte donc pas. Le champ `contact` est volontairement absent du type `OffreBrute` : un
> champ qu'on ne déclare pas est un champ qu'on ne peut pas recopier par distraction.

```bash
# Collecte, nettoyage et enregistrement
pnpm cli importer:offres --jours 30 --departement 44,85,49

# Balayage complet : retire aussi les offres disparues de la source.
# Réservé à un import non tronqué — le service refuse d'expirer en dessous du seuil.
pnpm cli importer:offres --jours 60 --max 3000 --expirer

# Tout préparer et compter, sans rien écrire
pnpm cli importer:offres --jours 30 --sec

# Rejouer l'instantané livré avec le dépôt, sans réseau ni identifiants
pnpm cli importer:offres --fichier donnees/offres-echantillon.json

# Enregistrer un nouvel instantané brut
pnpm cli exporter:offres --jours 30 --sortie donnees/instantane.json

# Situer les offres à partir de leur commune (voir « Géocodage » ci-dessous)
pnpm cli geocoder:offres

# Afficher le baromètre
pnpm cli barometre --jours 30 --departement 44

# Situer les fiches candidats restées sans coordonnées
pnpm cli geocoder
```

Les identifiants se créent sur [francetravail.io](https://francetravail.io) (application + souscription
à « Offres d'emploi v2 ») et se renseignent dans `backend/.env`. Sans eux, seul l'import par fichier
fonctionne.

### Ce que fait la préparation

La donnée brute n'est pas exploitable telle quelle. Sur un balayage réel du 16 septembre 2026
(2 020 offres, 60 jours, trois codes ROME) :

| Étape                                    | Effet mesuré   |
| ---------------------------------------- | -------------- |
| Reçues                                   | 2 020          |
| Écartées (sans identifiant, titre, date) | 0              |
| Républications repérées                  | 479, soit 24 % |
| dont salaire exploitable                 | 518            |
| dont sans salaire annoncé                | 1 502          |
| dont lieu non situable                   | 10             |

- **Salaires** : huit formes de libellé coexistent (`Horaire de 15.0 Euros`,
  `Mensuel de 1800.0 Euros à 2000.0 Euros sur 12.0 mois`, `Annuel de 24000.0 Euros`, suivies parfois
  d'un commentaire libre). Tout est ramené à un taux horaire ; sur une fourchette on prend le milieu.
  Un libellé illisible donne `null`, jamais une valeur inventée. Mesuré : **518 conversions réussies
  sur 521 libellés présents**, les 3 échecs étant des saisies employeur aberrantes
  (`Annuel de 12.0 Euros`) que les garde-fous rejettent à raison.
- **Intitulés** : « Aide soignant (F/H) », « AIDE-SOIGNANT H/F - URGENT » sont ramenés à
  l'appellation du référentiel ROME dans `intituleNormalise`, seule chaîne stable sur laquelle
  regrouper. Le titre de l'employeur reste intact dans `intitule` — c'est lui qui s'affiche, et le
  remplacer serait « dénaturer le contenu » au sens de la licence.
- **Lieux** : le département est tiré du libellé (`85 - Chaize-Giraud`), avec repli sur le code
  postal, et trois chiffres conservés pour l'outre-mer. Piège du format : `lieuTravail.commune`
  contient le **code INSEE** (`74280`), pas le nom — le nom n'existe que dans le libellé, derrière
  le numéro de département.

Ces règles sont des fonctions pures, sans base ni réseau, couvertes par 21 tests unitaires.

### Le dédoublonnage se fait au calcul, pas à l'import

Les républications ne sont plus fusionnées à l'écriture. La licence demande de restituer les offres
mises à disposition, et deux agences qui publient la même mission publient deux annonces réelles.

Toutes les lignes sont donc conservées, et c'est la requête du baromètre qui n'en garde qu'une par
`empreinte`, avec un `DISTINCT ON`. À empreinte égale, la plus ancienne gagne : c'est la vraie date
de mise sur le marché, et prendre la républication ferait glisser la fenêtre de tension à chaque
reprise de l'annonce.

Ce déplacement corrige aussi un défaut de la version précédente. Le tri se faisait lot par lot,
avant l'écriture ; deux républications arrivées dans deux imports différents portaient deux
identifiants distincts, entraient toutes les deux en base, et la tension les comptait deux fois.
L'index sur `empreinte` existait mais ne servait à rien.

### Cycle de vie : une offre pourvue disparaît

`statut` vaut `ACTIVE` ou `EXPIREE`. Un balayage complet marque `vueLe` sur chaque offre revue, puis
passe en `EXPIREE` celles que la source ne publie plus — la licence l'impose, et afficher des
missions déjà pourvues est de toute façon le pire défaut possible.

**Le garde-fou est ce qui compte.** Un import tronqué — plafond `--max` trop bas, coupure réseau au
milieu de la pagination — ne prouve pas que le reste du catalogue a disparu. Le service refuse donc
d'expirer quand le balayage ramène moins de 70 % des offres actives en base, et l'écrit dans le
journal plutôt que de le taire. Sans ce refus, une seule commande viderait le site.

Les lignes expirées restent en base : le baromètre travaille sur une fenêtre glissante de 30 à
90 jours et doit continuer à voir les offres passées.

### Limite à énoncer

La médiane ne porte que sur les offres qui **annoncent** une rémunération — **26 %** sur le balayage
national du 16 septembre (521 sur 2 025). Le baromètre expose `offresSansSalaire` pour que la page le
dise, plutôt que d'afficher un chiffre qui aurait l'air complet.

### Import automatique

`IMPORT_OFFRES_AUTOMATIQUE="true"` déclenche deux balayages complets par jour, à 5 h et 13 h, suivis
du géocodage des communes nouvelles. La licence impose 24 heures au maximum ; deux passages laissent
de la marge si l'un échoue.

À poser **sur le serveur qui sert le site, et sur lui seul**. Laissé à `false` sur les postes de
développement : sinon chaque machine tape l'API pour son propre compte, et plusieurs imports
concurrents vers la même base de recette se marchent dessus.

---

## Géocodage

Tout le volet géographique du matching — le rayon de déplacement, la porte « hors rayon », la
composante « zone », le tri « à proximité » — lit `latitude` / `longitude`. Ces coordonnées sont
**calculées à partir de l'adresse, jamais saisies**, par la
[Base Adresse Nationale](https://adresse.data.gouv.fr) : service public, gratuit, sans clé, et les
données ne quittent pas le pays — une adresse de domicile est une donnée personnelle, l'envoyer
chez un tiers hors UE ajouterait un sous-traitant au registre pour un résultat moins bon sur la
France.

Elles ne sont pas acceptées en entrée d'API, et c'est la propriété qui compte : la composante
« zone » ne lit rien d'autre, donc les laisser déclaratives permettrait à n'importe quel compte de
se placer à côté du lieu d'une mission et de remonter en tête de tous les classements, sans mentir
sur quoi que ce soit de vérifiable.

Le géocodage se déclenche aux trois endroits où une adresse entre en base — inscription publique,
fiche candidat du back-office, lieu d'intervention — **après l'écriture et sans la bloquer** : une
personne doit pouvoir corriger son adresse même si la BAN est indisponible. Les fiches restées sans
point se reprennent avec `pnpm cli geocoder`.

Deux règles de rejet valent d'être connues. Un résultat trop incertain (score BAN sous 0,4) ou tombé
sur une autre commune que le code postal saisi est **refusé** : une fiche sans coordonnées est
écartée du matching _en le disant_, alors qu'une fiche mal placée remonte en tête d'un classement
sans que personne ne s'en aperçoive. Et une adresse modifiée qu'on ne sait plus situer **efface** les
anciennes coordonnées — garder le point du précédent domicile laisserait une distance mesurable,
donc crédible, et fausse.

La finesse du résultat est conservée (`geocodePrecision` : numéro, rue, lieu-dit, commune). Un
rayon de déplacement se compte en dizaines de kilomètres, donc un point au centre de la commune
reste exploitable — ce qui ne le serait pas, c'est de le faire passer pour une adresse.

**Une mission ne peut pas être publiée sur un lieu non localisé.** Sans coordonnées, la distance
n'est mesurable pour personne : la porte écarte le vivier entier, l'établissement contemple un
classement vide, et le candidat se voit refuser pour une erreur qui n'est pas la sienne. Le refus
est posé à la publication, seul moment où quelqu'un peut encore corriger — et il est précédé d'une
tentative de géocodage, parce qu'une BAN indisponible au moment de la saisie ne doit pas bloquer un
besoin urgent des semaines plus tard. Le message nomme l'adresse fautive et dit vers qui se tourner :
les lieux se corrigent depuis le back-office, pas depuis l'espace client.

### Les offres France Travail se situent par leur commune

France Travail ne géolocalise qu'**une annonce sur sept** : sur le balayage du 16 septembre, 295
offres sur 2 020 portaient des coordonnées. Les 1 725 autres ont pourtant leur commune et leur code
postal — il ne manquait qu'une conversion.

Le géocodage se fait **par commune, jamais par offre**. Les 1 725 annonces non situées ne
représentent que 1 040 couples code postal / commune distincts, stockés dans `commune_geocodee` : une
commune située une fois sert toutes ses offres, aujourd'hui et aux imports suivants. Appeler la BAN
offre par offre recalculerait sans cesse les mêmes points.

Mesuré sur le rattrapage réel : **1 017 communes situées, zéro échec, en trois minutes**, faisant
passer la couverture de **15 % à 98 %**. Pour un aide-soignant nantais au rayon de 20 km, les offres
à portée passent de 5 à 19.

`origineCoordonnees` distingue `SOURCE` de `COMMUNE`, et l'affichage écrit « ~5,5 km » quand le point
n'est que le centre d'une commune. Sur Nantes l'écart peut atteindre 3 à 4 km — négligeable pour
filtrer un rayon de 20 km, trompeur si on le présente comme une mesure.

**Piège désamorcé** : l'import écrit les coordonnées de la source. Si le `null` de France Travail
écrasait le point déduit, le géocodage serait refait chaque jour pour être effacé chaque nuit, sans
que rien ne le signale — la couverture resterait simplement basse. Les coordonnées sont donc écrites
à part de l'`upsert`, et un test verrouille ce comportement.

`GEOCODAGE_ACTIF=false` coupe le service sans rien effacer (suites d'intégration, poste hors réseau).

---

## Matching

Le moteur répond à une question simple — **qui peut y aller, et dans quel ordre** — en deux temps
qui ne se mélangent jamais.

**1. Une porte binaire.** Elle écarte, avec un motif nommé : profil non validé par l'agence,
diplôme non détenu ou expiré, absence déclarée sur la période, mission déjà décrochée sur les mêmes
dates, domicile au-delà du rayon déclaré, coordonnées manquantes. Rien ne sert de classer quelqu'un
qui ne peut pas y aller — et l'écarté sait pourquoi.

Cette porte est **unique et partagée** (`MatchingService.evaluer`). Elle traverse les trois chemins
qui en ont besoin : le classement de l'agence, la candidature du côté public, et le score figé sur
la proposition. Elle ne l'était pas — la candidature ne vérifiait que le statut et le diplôme, le
score figé ne vérifiait rien — et une intervenante hors de son rayon pouvait postuler, obtenir un
score, apparaître chez l'établissement, tout en restant introuvable dans le classement de l'agence
qui l'écartait. Trois écrans, trois vérités.

Côté candidat, une mission hors rayon **reste visible et le dit** : la masquer priverait la personne
de l'information qui lui permettrait d'agir — élargir son rayon de cinq kilomètres lui ouvrirait
peut-être dix missions, et une liste vide ressemble à une panne. Le bouton de candidature est
remplacé par le motif chiffré et un lien vers son profil.

**2. Un score sur 100, toujours rendu décomposé.**

| Composante    | Poids | Ce qui est mesuré                                                        |
| ------------- | ----- | ------------------------------------------------------------------------ |
| Expérience    | 40    | Mois de terrain **vérifiés**, pondérés par la quotité, plafonnés à 5 ans |
| Zone          | 35    | Distance réelle au lieu, décroissance linéaire jusqu'au rayon déclaré    |
| Disponibilité | 25    | Part de la vacation réellement couverte par les créneaux déclarés        |

Le diplôme ne rapporte aucun point, et c'est délibéré : la porte d'éligibilité l'exige déjà de tout
le monde, donc lui en attribuer reviendrait à ajouter la même constante à chaque candidat classé —
une constante ne départage personne, elle gonfle les scores et fait paraître serré un classement
qui ne l'est pas. Ce qui distingue deux titulaires du même diplôme, c'est le temps passé sur le
terrain.

Deux règles corrigent ce temps, et chacune répare un abus différent. **La quotité** : deux ans à
mi-temps ne sont pas deux ans de terrain, et le temps partiel est la norme dans ce secteur. **Le
plafond calendaire** : deux mi-temps menés en parallèle font bien un temps plein, mais deux temps
pleins superposés sur la même année ne font pas deux ans de métier — ils font une erreur de saisie.
Une expérience hors du métier exigé compte pour moitié : elle dit quelque chose de la personne au
travail, rien de sa qualification.

Comme pour les diplômes, **seule une expérience vérifiée par l'agence** sur certificat de travail
entre dans le calcul. Le filtre est posé dans la requête, pas dans le barème : une ligne déclarée
ne parvient même pas au calcul.

Le total n'est jamais affiché sans ses trois lignes : un chargé de recrutement doit pouvoir dire à
un candidat pourquoi il est troisième, et un score devient indéfendable dès qu'on le conteste sans
pouvoir le décomposer.

```
81/100  Sophie Marchand
        Experience     24/40  3 ans et 7 mois retenus, dont 2 ans et 2 mois sur le diplome exige
        Zone           32/35  A 3.2 km du lieu, pour un rayon declare de 35 km
        Disponibilite  25/25  100 % du creneau couvert par les disponibilites declarees
```

Le barème vit dans `backend/src/matching/score.ts`, **sans dépendance à Prisma ni à Nest** : il se
teste seul, avec des valeurs écrites à la main, et un poids se discute sans monter de base.

Deux partis pris à connaître. La distance est calculée par haversine en mémoire plutôt que par
PostGIS : à l'échelle d'un vivier d'agence c'est instantané et ça reste testable sans base — mais
les deux points comparés viennent désormais tous deux du géocodage, jamais d'une saisie. Et le
score est **figé sur la candidature** au moment où elle est déposée : le recalculer à l'affichage
le ferait bouger après coup — parce que le candidat a déplacé une disponibilité — et rendrait la
décision de l'établissement incompréhensible a posteriori.

---

## Design

Les écrans viennent du **canvas Claude Design « Relève app web design »**
(`e3f578c4-45f4-4fd3-8f81-57fa3f3349b4`), qui couvre douze vues : accueil, fonctionnement,
missions, détail, à propos, FAQ, contact, connexion, inscription, tableau de bord, profil et
paramètres. L'ancien fichier Figma `9pCZmDqcx6nuuMRoYdLmNH` ne sert plus que de source pour les
icônes.

Le canvas **ne déclare aucune variable** : les couleurs y sont des hex posés à la main. Elles ont
donc été relevées et regroupées dans `frontend/app/assets/css/main.css`, seule source de vérité
côté code.

| Ce que le canvas donne  | Ce que le code en fait                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| Couleurs des écrans     | Tokens `--ground`, `--surface`, `--ink`, `--dom`, `--eta`, `--line-forte`… |
| Trois familles d'accent | Trios fond / filet / encre : vert, `--lavande*`, `--ambre*`                |
| Rayons                  | `--r-champ` 12px, `--r-marque` 13px, `--r-tuile` 14px, `--r-carte` 16px    |
| Police                  | Plus Jakarta Sans, chargée depuis Google Fonts dans `nuxt.config.ts`       |
| Icônes                  | SVG exportés, inlinés par `AppIcon.vue` avec `currentColor`                |
| Marque                  | `AppLogo.vue` — tracé du canvas, couleurs liées aux tokens                 |

**La police n'était pas chargée.** `--sans` déclarait `'Inter'` mais rien ne la téléchargeait :
tout le front tournait en fait sous Segoe UI. Le `preconnect` et la feuille Google Fonts ont été
ajoutés en même temps que le passage à Plus Jakarta Sans.

Les icônes sont **inlinées** et non chargées en `<img>` : une balise image ne se recolore pas, et
le même tracé doit servir la puce verte d'un choix sélectionné et la puce grise d'un autre.

### Deux coques, plus de layout `onboarding`

Le canvas dessine deux mises en page, portées par le seul `layouts/default.vue` selon la session :

- **coque publique** — en-tête collant translucide, navigation vitrine, pied de page à trois
  colonnes ;
- **coque applicative** — barre latérale de 248 px, navigation selon le rôle, identité et
  déconnexion en pied.

Le layout `onboarding` et son cadre mobile de 402 px ont disparu avec les écrans qu'ils
encadraient : le canvas est dessiné pour le poste de travail. Les points de rupture sous 900 px et
560 px sont des ajouts, le canvas ne décrivant aucune version étroite.

### Ce que le canvas décrit et que l'API ne sait pas faire

Trois écrans du canvas reposaient sur un **dépôt de documents** — étape 2 de l'inscription, cartes
du dossier candidat, compteurs de complétion par pièce. Ils sont désormais transposés : le dossier
existe, avec une ligne par pièce attendue, remplie ou non. Le dépôt reste hors du parcours
d'inscription, qui crée un compte et rien de plus ; les pièces se déposent depuis « Mon profil »,
une fois l'adresse confirmée.

La **liste publique de missions** du canvas existe désormais, sous `/offres` : elle sert les
missions ouvertes de l'agence, sans session, avec trois menus déroulants — département, ville,
métier — construits sur les missions réellement ouvertes plutôt que sur une liste figée des cent une
divisions françaises. Elle ne nomme pas l'établissement client : publier sur le web ouvert quels
services d'aide à domicile passent par une agence d'intérim est commercialement sensible pour eux,
et ils ne l'ont pas autorisé en déposant un besoin.

`GET /missions` reste réservé à une session : c'est la vue du candidat sur son agence, avec son
classement et ses candidatures, et elle n'a pas le même contenu.

**Le thème sombre n'existe pas dans le canvas.** Les teintes sombres de `main.css` sont une
transposition des mêmes hues, faite pour que les écrans restent lisibles. À faire valider — ou à
faire dessiner.

Deux réglages d'affichage sont exposés dans « Mon compte » et rendus entièrement par le
navigateur : **contraste renforcé** (redéfinit les tokens de texte secondaire et de filet) et
**réduction des animations**. Ils sont conservés dans le stockage local, donc attachés à l'appareil
et non au compte.

---

## Structure du dépôt

Trois paquets à la racine : le serveur, le client, et ce qu'ils partagent.

```
backend/                          API NestJS
  donnees/
    offres-echantillon.json       102 offres réelles, rejouables sans réseau
  prisma/
    schema.prisma                 modèle complet du produit + 3 invariants métier
    migrations/                   … statut réglementaire, pièces justificatives, conservation
    seed.ts                       agence, deux diplômes, SAAD, candidats, comptes ; élague le référentiel
  src/
    auth/                         authentification, rôles, sessions, mots de passe
      auth.decorateurs.ts         @Public, @Roles, @UtilisateurCourant, @AgenceCourante
      jetons-usage-unique.service.ts  hachage, péremption, consommation unique
      verification-email.service.ts  confirmation d'adresse
      reinitialisation.service.ts  mot de passe oublié
      jwt-auth.guard.ts           garde globale : fermé par défaut
      roles.guard.ts              contrôle de rôle
      sessions.service.ts         jetons de rafraîchissement, rotation, révocation
      inscriptions.service.ts     auto-inscription entreprise et intérimaire
      mots-de-passe.ts            Argon2id
    candidats/                    vivier : fiche, qualifications, disponibilités
    clients/                      clients SAAD et lieux d'intervention
    contact/                      formulaire public de la vitrine, relayé par courriel
    notifications/                annonce quotidienne des missions correspondantes
    mail/                         sortie courriel, un seul point de sortie
      gabarits.ts                 les messages en clair, texte et HTML
      notifications-compte.service.ts  ce qu'on écrit à quelqu'un sur son compte
    matching/                     porte d'éligibilité et score explicable
      score.ts                    le barème, sans Prisma ni Nest : testable seul
    missions/                     dépôt de besoin, visibilité par profil, annulation
    documents/                    pièces justificatives : stockage, dépôt, conservation
      stockage.service.ts         disque, noms opaques, racine jamais servie
      conservation.service.ts     relance à un an, réponse au lien, effacement sans réponse
      conservation.controller.ts  les deux routes publiques, ouvertes par jeton et non par session
      echeances.ts                les deux dates du cycle, calculées en un seul endroit
    mon-profil/                   ce que l'intérimaire modifie sur sa propre fiche
    propositions/                 candidatures, décision du client, mission confirmée
    donnees-publiques/            France Travail : collecte, baromètre, vitrine publique
      france-travail.client.ts    OAuth2 et pagination de l'API Offres d'emploi
      normalisation.ts            salaires, empreinte, lieux (pur, testé sans base)
      offres.service.ts           import, expiration, médianes, taux suggéré
      geocodage-offres.service.ts communes situées une fois, réutilisées ensuite
      import-planifie.service.ts  deux balayages par jour, sous IMPORT_OFFRES_AUTOMATIQUE
      vitrine.service.ts          missions publiques, et suggestions du marché au candidat
      cache.service.ts            Redis, namespacé par base, dégradation propre
      offres.controller.ts        GET /api/offres, /offres/options, /offres/suggestions
      tension.controller.ts       GET /api/tension et /api/tension/suggestion
    geocodage/                    Base Adresse Nationale : adresse -> point
      ban.client.ts               appel BAN et règles de rejet (pur, testé sans réseau)
      geocodage.service.ts        écriture lat/lon/geom, rattrapage en lot
    cli/main.ts                   importer:offres, exporter:offres, barometre, geocoder,
                                  geocoder:offres, notifier:missions, purger:documents,
                                  conservation:relancer, conservation:purger
    qualifications/               référentiel partagé — deux diplômes : DEAS et AVS
    utilisateurs/                 gestion des comptes
    common/
      zod-validation.pipe.ts      valide avec les schémas de @releve/shared
    health/                       sonde /api/sante
  test/                           146 tests d'intégration
    fixtures.ts                   deux agences symétriques, app de test
    cloisonnement.spec.ts         étanchéité entre agences
    roles.spec.ts                 gardes de rôle et routes publiques
    inscription.spec.ts           parcours des deux profils, permissions
    missions.spec.ts              la boucle complète, vue par les trois profils
    score.spec.ts                 le barème seul, sans base ni réseau
    geocodage.spec.ts             lecture d'une réponse BAN, sans réseau
    matching.spec.ts              classement, écartés motivés, score figé
    mon-profil.spec.ts            ce que le candidat ne peut pas s'accorder
    verification-email.spec.ts    le lien : usage unique, péremption, non-énumération
    reinitialisation.spec.ts      mot de passe oublié, et le cloisonnement des deux usages
    disponibilites.spec.ts        chevauchements, travail de nuit
    donnees-publiques.spec.ts     import, médianes, exposition API
    normalisation.spec.ts         salaires et empreintes, sans base ni réseau
    comptes.spec.ts               garde-fous d'administration
    sessions.spec.ts              rotation, rejeu, révocation
    debit.spec.ts                 limitation de débit

frontend/                         Front Nuxt
  server/                         Nitro : le navigateur ne voit jamais l'API
    middleware/session.ts         rafraîchit la session avant tout traitement
    routes/bff/[...chemin].ts     relais authentifié vers l'API
    routes/bff/auth/              connexion, déconnexion, inscription, vérification, mot de passe
    utils/session.ts              cookies httpOnly, rafraîchissement mutualisé
  app/
    assets/
      css/main.css                tokens du canvas : couleurs, rayons, thème sombre, accessibilité
      css/vitrine.css             échelle typographique commune aux six pages publiques
      icons/*.svg                 exports Figma, recolorés par currentColor
    components/                   AppBouton, AppCarte, AppBadge, AppAvatar, AppBarreApp
      AppLogo.vue                 marque du canvas, couleurs liées aux tokens
      AppIcon.vue                 inline les tracés pour qu'ils suivent la couleur
      AppAttenteVerification.vue  « consultez votre boîte mail » après inscription
      AppOffresMarche.vue         encart candidat : offres France Travail, source citée
    data/vitrine.ts               tout le contenu éditorial des pages publiques, en un seul endroit
    data/legal.ts                 les faits juridiques, à compléter en un seul fichier
    utils/mise-en-forme.ts        dates, durées et montants : une seule définition
    layouts/default.vue           deux coques : publique, et applicative à barre latérale
    plugins/affichage.client.ts   applique contraste et animations dès le démarrage
    composables/
      useSession.ts               identité connectée (aucun jeton côté page)
      useApi.ts                   appel via le relais /bff
      useCompletude.ts            avancement du dossier, partagé par la barre latérale et le profil
      usePreferencesAffichage.ts  contraste renforcé, animations réduites
    middleware/
      auth.global.ts              tout est fermé sauf liste blanche ; vitrine ouverte à tous,
                                  y compris la section /offres déclarée en préfixe
    pages/                        33 routes
      accueil.vue                 vitrine : promesse, trois étapes, dossier candidat
      fonctionnement.vue          le parcours en six étapes
      a-propos.vue                positionnement, et « déclaré n'est pas vérifié »
      faq.vue                     six questions, accordéon natif
      offres/index.vue            nos missions ouvertes, sans session, trois menus déroulants
      contact.vue                 coordonnées et formulaire, relayé par l'API
      mentions-legales.vue        rubriques légales, champs « À compléter », en noindex
      conditions-utilisation.vue  conditions générales, en noindex
      politique-confidentialite.vue  traitements réels, durée de conservation, ce qui reste à préciser
      conservation.vue            cible du lien de relance : garder les pièces un an de plus, ou les effacer
      connexion.vue
      inscription/interimaire.vue le seul parcours public ; /inscription y redirige (301)
      verification.vue            cible du lien reçu : confirme, puis redirige selon le rôle
      mot-de-passe-oublie.vue     demande d'un lien, réponse identique dans tous les cas
      reinitialisation.vue        choix du nouveau mot de passe depuis le lien
      bienvenue.vue               splash, enchaîne vers /connexion
      index.vue                   vivier candidats
      candidats/[id].vue          fiche candidat complète
      clients/index.vue           liste des clients
      clients/[id].vue            fiche client et ses lieux
      tension.vue                 baromètre du marché, données France Travail
      tableau-de-bord.vue         accueil du candidat : complétude, compteurs, missions proches
      missions/                   liste et fiche, côté intérimaire
      candidature/[id].vue        accusé de réception d'une candidature
      suivi.vue                   mission confirmée, contact et itinéraire
      mon-profil.vue              coordonnées, secteur, disponibilités, diplômes, parcours
      etablissement/              accueil, dépôt de besoin, profil d'un candidat
      mon-espace.vue              espace des profils externes
      comptes.vue                 administration des accès
      mon-compte.vue              identité, réglages d'affichage, mot de passe


shared/                           @releve/shared — contrat API ↔ front
  src/
    enums.ts                      énumérations et libellés d'affichage
    motifs.ts                     expressions régulières de saisie
    siret.ts                      validation SIRET (14 chiffres + clé de Luhn)
    auth.ts, utilisateur.ts, inscription.ts
    candidat.ts, disponibilite.ts
    client.ts, lieu.ts, qualification.ts
    mission.ts, proposition.ts    dépôt de besoin, candidature, décision
    matching.ts, profil.ts        score décomposé, espace personnel
    habilitation.ts               statut réglementaire et cohérence du justificatif
    verification.ts               confirmation d'adresse et destination par rôle
    reinitialisation.ts           mot de passe oublié
    document.ts                   types de pièces, formats admis, plafond de taille
    conservation.ts               durée de conservation, délai de réponse, décision
    conditions.ts                 version des conditions générales en ligne
    contact.ts                    sujets figés, bornes de saisie, adresse de l'agence
    notifications.ts              réglage des courriels de service, forme d'une mission annoncée
    tension.ts                    baromètre et suggestion de taux
    pagination.ts
  test/                           32 tests unitaires des règles partagées

docs/
  analyse-de-marche.html          concurrence, positionnement, proposition de valeur
  questions-a-trancher.md         décisions en attente, par échéance
docker-compose.yml                PostgreSQL + PostGIS, Redis
```

---

## Modèle de données : les trois invariants

Le schéma porte trois décisions structurantes, commentées dans `schema.prisma`.

**1. Le client contractuel n'est pas le lieu d'intervention.** Un SAAD signe la mission ;
l'intervention a lieu chez le bénéficiaire. `Client` et `LieuIntervention` sont deux modèles
distincts, et le client n'a pas d'adresse propre.

**2. La convention collective est portée par le client.** Principe d'égalité de traitement avec les
salariés de l'entreprise utilisatrice : c'est sa convention qui fixe le salaire de référence de
l'intérimaire, pas celle du candidat.

**3. Le statut réglementaire du client est saisi sur pièce.** Rien dans le SIRET ne dit sous quel
régime une structure intervient : deux services au même code NAF peuvent relever de régimes
différents. Le champ est **nullable** — les fiches antérieures à la règle n'ont pas de statut connu,
et leur en inventer un ferait dire à la base ce que personne n'a vérifié. L'absence est ici
l'information juste, et c'est l'**activation** qui la refuse.

### Le statut réglementaire, et ce qu'il commande

| Statut                    | Justificatif exigé          | Ce qu'il implique                                          |
| ------------------------- | --------------------------- | ---------------------------------------------------------- |
| **Déclaré SAP**           | Numéro SAP                  | Déclaration en DDETS ; avantage fiscal pour le particulier |
| **Agréé SAP**             | Numéro d'agrément           | Mandataire auprès de publics fragiles ; État, 5 ans        |
| **Autorisé SAD / ESMS**   | Numéro FINESS **et** arrêté | Conseil départemental, 15 ans ; entre dans L. 312-1 CASF   |
| **Prestataire classique** | Numéro SAP                  | Hors champ de l'autorisation                               |

Le contrôle porte sur la **cohérence**, pas seulement sur la présence : déclarer une autorisation
départementale en ne fournissant qu'un numéro SAP ferait passer une structure pour ce qu'elle n'est
pas. Et l'enjeu n'est pas administratif — une structure autorisée relève de l'article L. 312-1 du
CASF, ce qui déclenche pour ses mises à disposition la **durée minimale d'exercice préalable** à
l'intérim de la loi Valletoux. Le barème vit dans `shared/src/habilitation.ts`.

Le numéro SAP est normalisé (`SAP` + les 9 chiffres du SIREN, séparateurs absorbés). La clé de
contrôle du FINESS n'est **pas** vérifiée, contrairement à celle du SIRET : l'algorithme varie selon
les référentiels, et une implémentation approximative refuserait des établissements parfaitement
réels. Ici, un faux négatif coûte bien plus cher qu'un faux positif — que la lecture de l'arrêté
rattrape de toute façon.

### RGPD

Le secteur concentre des données sensibles. La règle de conception est de **ne pas collecter ce
dont la mission n'a pas besoin** :

- le bénéficiaire n'est jamais nommé — `LieuIntervention.beneficiaireRef` est une référence
  pseudonymisée (`BEN-0147`) ;
- les consignes d'un lieu servent à l'accès au logement, pas à décrire une pathologie ;
- l'aptitude du candidat se résume à une date de visite médicale et deux booléens. La plateforme a
  besoin de savoir si quelqu'un est déployable, pas pourquoi. Aucun motif, aucun document médical.

Ce que la plateforme collecte tout de même — les pièces justificatives, dont un NIR, une pièce
d'identité et un RIB — est **borné dans le temps**. Chaque pièce est conservée un an à compter de
son dépôt ; à l'échéance, un courriel demande à la personne si elle veut qu'on la garde, et **sans
réponse sous trente jours elle est effacée**. Le silence ne vaut pas accord : c'est le point de
toute la mécanique. La durée vaut pour les cinq types sans exception — le code ne branche nulle part
sur le type de pièce pour calculer une échéance. Voir
[`docs/conservation-documents.md`](docs/conservation-documents.md).

Le **consentement** aux conditions générales est recueilli à l'inscription, et enregistré avec la
version acceptée (`conditionsAccepteesLe`, `conditionsVersion`) : accepter un texte, c'est accepter
celui-là, et une révision ultérieure ne peut pas se prévaloir d'un consentement donné à la
précédente. La connexion, elle, ne fait rien accepter — on n'accepte rien en se connectant.

---

## Sécurité

**Fermé par défaut.** `JwtAuthGuard` est enregistrée en garde globale : toute route exige un jeton
valide tant qu'elle n'est pas explicitement marquée `@Public()`. Une route ajoutée sans y penser est
donc protégée, pas ouverte. Les seules routes publiques sont la connexion, l'inscription, la
confirmation d'adresse, le mot de passe oublié, le rafraîchissement, la déconnexion,
`GET /api/sante` et les **deux routes de conservation** — celles-là autorisées par un jeton reçu par
courriel, à usage unique et borné, parce qu'on écrit à quelqu'un précisément parce qu'il ne s'est
plus connecté depuis un an.

**L'adresse e-mail est prouvée avant tout accès.** Une inscription n'ouvre aucune session : elle
envoie un lien, et c'est lui — à usage unique, valable 48 heures, stocké en base sous forme
d'empreinte SHA-256 comme les jetons de session — qui crée l'accès. Sans cela, l'adresse saisie
n'était qu'une chaîne de caractères : rien n'obligeait à la posséder, et on pouvait ouvrir un
compte au nom de quelqu'un d'autre sur une plateforme où cette adresse est à la fois l'identifiant
de connexion et le canal par lequel une mission se décroche.

Le refus de connexion pour adresse non confirmée est renvoyé **après** la vérification du mot de
passe, jamais avant : annoncé plus tôt, il apprendrait à n'importe qui qu'un compte existe pour une
adresse donnée, et ruinerait le soin pris ailleurs à rendre les échecs indiscernables. Pour la même
raison, le renvoi du lien répond toujours 204 — adresse inconnue, déjà confirmée ou réellement
réexpédiée se ressemblent vues du dehors.

Les comptes créés par l'agence, par le seed ou par les fixtures naissent confirmés : la
vérification atteste que _celui qui s'inscrit_ possède l'adresse qu'il déclare, question qui ne se
pose pas quand un administrateur identifié ouvre le compte.

**Le mot de passe se récupère sans passer par un administrateur.** Un lien envoyé à l'adresse du
compte, valable **une heure** et à usage unique, permet d'en choisir un nouveau. C'est la même
preuve que la confirmation d'adresse — posséder la boîte mail — donc le même mécanisme : une seule
table de liens, une seule implémentation du hachage, de la péremption et de la consommation unique.
Les écrire deux fois les ferait diverger, et c'est toujours la copie oubliée qui reste exploitable.
Un `usage` porté par chaque lien empêche qu'un jeton serve à l'autre parcours.

Le formulaire de demande répond **204 dans tous les cas**, adresse connue ou non, et il est plafonné
à trois essais par minute : répondre différemment en ferait un annuaire des inscrits — et ici, être
inscrit révèle qu'on cherche des missions d'aide à domicile. Une réinitialisation réussie ferme
**toutes** les sessions en cours : elle sert aussi après un vol, et laisser vivre les sessions
laisserait le voleur connecté après la reprise de main.

**Tout changement de mot de passe est signalé par courriel** — celui que l'intéressé fait lui-même
comme la réinitialisation par l'agence. C'est le seul message de la plateforme qui ne sert à rien
quand tout va bien : quelqu'un qui prend un compte commence par en changer le mot de passe, et sans
cet avertissement le propriétaire ne l'apprend qu'en se retrouvant dehors, sans savoir ni pourquoi
ni quand. Le message ne contient jamais de mot de passe, ni l'ancien ni le nouveau : un courriel
traverse des serveurs qu'on ne maîtrise pas et reste dans une boîte pour toujours.

**Cloisonnement multi-agence.** Le décorateur `@AgenceCourante()` extrait l'agence du jeton ; les
services la reçoivent en paramètre obligatoire. Un enregistrement d'une autre agence répond **404 et
non 403** : on ne confirme pas son existence. Les comptes externes (client, candidat) tiennent leur
périmètre de leur rattachement plutôt que d'une colonne `agenceId` dupliquée, qui deviendrait fausse
en silence si un client changeait d'agence.

**Rôles.** `@Roles(...)` filtre par rôle ; sans décorateur, tout compte authentifié passe.
Le back-office (`ADMIN_AGENCE`, `CHARGE_RECRUTEMENT`) voit le vivier et les clients ; seul
`ADMIN_AGENCE` gère les accès ; la lecture du référentiel de qualifications est ouverte à tous les
comptes authentifiés, parce qu'un candidat et un client en ont besoin pour lire une mission.

**Mots de passe.** Argon2id. Douze caractères minimum à la création — longueur plutôt que règles de
complexité, conformément aux recommandations ANSSI/CNIL. Une empreinte leurre est vérifiée quand
l'e-mail est inconnu, pour qu'une réponse instantanée ne révèle pas l'absence de compte. Un compte
désactivé et un mot de passe faux renvoient le même message.

**Session révocable.** Le JWT d'accès dure 15 minutes et n'est pas annulable ; c'est un jeton de
rafraîchissement opaque, stocké sous forme d'empreinte SHA-256, qui porte la session (12 heures par
défaut). Il est à usage unique et tourne à chaque échange. Rejouer un jeton déjà consommé au-delà
d'un sursis de 30 secondes est traité comme un vol : toute la chaîne est révoquée. Le sursis existe
parce qu'un chargement de page lance plusieurs requêtes, et que celle qui arrive juste après la
rotation porte encore l'ancien jeton sans que personne ne l'ait volé.

Désactiver un compte, réinitialiser ou changer un mot de passe révoque toutes ses sessions — y
compris celle qui fait la demande, sans quoi la mesure ne fermerait pas la session d'un voleur.

**Aucun jeton côté navigateur.** Les deux jetons vivent dans des cookies `httpOnly` que seul Nitro
lit ; la page appelle `/bff/**` sur son propre domaine et le relais compose l'en-tête
`Authorization`. Une faille XSS n'a donc rien à voler, et l'API n'a pas besoin d'ouvrir CORS au
navigateur. Le rafraîchissement est mutualisé entre requêtes concurrentes, pour ne pas déclencher la
détection de rejeu décrite plus haut.

**Bourrinage.** Dix tentatives de connexion par minute et par adresse. Au-delà de cinq échecs
consécutifs sur un même compte, la réponse est ralentie de façon exponentielle jusqu'à cinq
secondes, et le compteur s'oublie après quinze minutes sans échec. Délibérément pas un verrouillage :
bloquer un compte donnerait à un attaquant le moyen de fermer l'agence à 6 h 30, et annoncer « compte
verrouillé » trahirait son existence.

**Garde-fous d'administration.** Un administrateur ne peut ni se désactiver, ni changer son propre
rôle ; on refuse de retirer les droits du dernier administrateur actif d'une agence ; le rôle d'un
compte client ou candidat ne se change pas, ce serait une escalade de privilèges déguisée.

---

## Règles métier appliquées

| Règle                                                            | Où                           | Pourquoi                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SIRET : 14 chiffres **et** clé de Luhn                           | `contracts/siret.ts`         | Le SIRET part dans la DPAE et sur la facture ; une coquille se paie en rejet administratif                     |
| Le SIRET n'est pas modifiable                                    | `clientUpdateSchema`         | Un autre SIRET, c'est une autre entité juridique — donc un autre client                                        |
| Pas de suppression de client, seulement `actif: false`           | `clients.service.ts`         | Un client porte des missions, contrats et factures                                                             |
| Disponibilités : aucun chevauchement                             | `contracts/disponibilite.ts` | Deux créneaux qui se recouvrent feraient compter deux fois le même intérimaire au matching                     |
| Un créneau dont la fin précède le début traverse minuit          | idem                         | 20:00–07:00 est une nuit en établissement, pas une faute de frappe                                             |
| Le planning hebdomadaire se remplace en bloc                     | `PUT /disponibilites`        | Le chevauchement se vérifie sur l'ensemble ; une édition ligne à ligne ouvrirait une course entre deux onglets |
| Passer `ACTIF` exige une qualification vérifiée et non expirée   | `candidats.service.ts`       | C'est ce statut qui rend le candidat proposable sur une mission                                                |
| Retirer la dernière qualification vérifiée d'un actif est refusé | idem                         | Mieux vaut refuser que désactiver le candidat dans son dos                                                     |

La règle sur le statut `ACTIF` est une décision d'implémentation, pas une exigence du cahier des
charges : si l'agence veut pouvoir activer sans justificatif, elle se retire en deux lignes dans
`candidats.service.ts`.

---

## API

Base : `http://localhost:3001/api`. Toutes les routes sauf mention contraire exigent
`Authorization: Bearer <jeton>`.

### Authentification

| Méthode | Route                              | Accès                                          |
| ------- | ---------------------------------- | ---------------------------------------------- |
| `POST`  | `/auth/connexion`                  | public                                         |
| `POST`  | `/auth/inscription/interimaire`    | public — le seul parcours d'inscription        |
| `POST`  | `/auth/verification/confirmer`     | public — le lien du courriel, ouvre la session |
| `POST`  | `/auth/verification/renvoyer`      | public — toujours 204                          |
| `POST`  | `/auth/mot-de-passe/oublie`        | public — toujours 204                          |
| `POST`  | `/auth/mot-de-passe/reinitialiser` | public — le lien recu par courriel             |
| `POST`  | `/auth/rafraichir`                 | public — porteur du jeton de session           |
| `POST`  | `/auth/deconnexion`                | public — porteur du jeton de session           |
| `GET`   | `/auth/moi`                        | authentifié                                    |
| `GET`   | `/auth/mon-espace`                 | authentifié — vue selon le profil              |
| `POST`  | `/auth/mot-de-passe`               | authentifié — changement par l'intéressé       |
| `GET`   | `/auth/notifications`              | authentifié — réglage des courriels de service |
| `PUT`   | `/auth/notifications`              | authentifié — activer ou couper                |
| `GET`   | `/sante`                           | public                                         |

### Candidats

| Méthode  | Route                                                | Accès       |
| -------- | ---------------------------------------------------- | ----------- |
| `GET`    | `/candidats`                                         | back-office |
| `GET`    | `/candidats/:id`                                     | back-office |
| `POST`   | `/candidats`                                         | back-office |
| `PATCH`  | `/candidats/:id`                                     | back-office |
| `POST`   | `/candidats/:id/qualifications`                      | back-office |
| `PATCH`  | `/candidats/:id/qualifications/:qualificationId`     | back-office |
| `DELETE` | `/candidats/:id/qualifications/:qualificationId`     | back-office |
| `POST`   | `/candidats/:id/experiences`                         | back-office |
| `PATCH`  | `/candidats/:id/experiences/:experienceId`           | back-office |
| `DELETE` | `/candidats/:id/experiences/:experienceId`           | back-office |
| `PUT`    | `/candidats/:id/disponibilites`                      | back-office |
| `POST`   | `/candidats/:id/indisponibilites`                    | back-office |
| `DELETE` | `/candidats/:id/indisponibilites/:indisponibiliteId` | back-office |

### Clients et lieux

| Méthode | Route                        | Accès       |
| ------- | ---------------------------- | ----------- |
| `GET`   | `/clients`                   | back-office |
| `GET`   | `/clients/:id`               | back-office |
| `POST`  | `/clients`                   | back-office |
| `PATCH` | `/clients/:id`               | back-office |
| `GET`   | `/clients/:id/lieux`         | back-office |
| `POST`  | `/clients/:id/lieux`         | back-office |
| `PATCH` | `/clients/:id/lieux/:lieuId` | back-office |

### Référentiel et comptes

| Méthode | Route                            | Accès          |
| ------- | -------------------------------- | -------------- |
| `GET`   | `/qualifications`                | authentifié    |
| `POST`  | `/qualifications`                | administrateur |
| `GET`   | `/utilisateurs`                  | administrateur |
| `POST`  | `/utilisateurs`                  | administrateur |
| `PATCH` | `/utilisateurs/:id`              | administrateur |
| `POST`  | `/utilisateurs/:id/mot-de-passe` | administrateur |

### Missions

| Méthode | Route                           | Accès                         |
| ------- | ------------------------------- | ----------------------------- |
| `GET`   | `/missions`                     | authentifié — vue par profil  |
| `GET`   | `/missions/resume`              | authentifié — tableau de bord |
| `GET`   | `/missions/options-publication` | back-office ou client         |
| `GET`   | `/missions/:id`                 | authentifié — vue par profil  |
| `POST`  | `/missions`                     | back-office ou client         |
| `PATCH` | `/missions/:id`                 | back-office ou client         |
| `POST`  | `/missions/:id/annuler`         | back-office ou client         |
| `GET`   | `/missions/:id/candidats`       | back-office ou client         |
| `POST`  | `/missions/:id/candidatures`    | candidat                      |

**Ce que chaque profil voit est décidé dans le service, jamais dans le contrôleur.** L'agence voit
son périmètre, le client ses missions, le candidat les missions ouvertes **de son agence** plus
celles où il a postulé. Les consignes d'accès au domicile ne sortent que pour l'agence, le client
et le candidat retenu : quelqu'un qui consulte l'annonce n'a pas à lire le code de la porte.

### Candidatures

| Méthode | Route                       | Accès                              |
| ------- | --------------------------- | ---------------------------------- |
| `GET`   | `/propositions`             | authentifié — vue par profil       |
| `GET`   | `/propositions/courante`    | candidat — prochaine confirmée     |
| `GET`   | `/propositions/:id`         | authentifié — vue par profil       |
| `POST`  | `/propositions/:id/valider` | back-office ou client              |
| `POST`  | `/propositions/:id/refuser` | authentifié — sens selon le profil |

Une candidature déposée par l'intéressé naît `ACCEPTEE_CANDIDAT` : en cliquant, il a déjà dit oui,
seule la décision du client manque. Valider en retient un, écarte les autres et pourvoit la
mission **en une transaction** — sinon deux validations concurrentes laisseraient deux personnes
persuadées d'avoir la mission.

### Mon profil — espace de l'intérimaire

| Méthode  | Route                                   | Accès    |
| -------- | --------------------------------------- | -------- |
| `GET`    | `/mon-profil`                           | candidat |
| `GET`    | `/mon-profil/completude`                | candidat |
| `PATCH`  | `/mon-profil`                           | candidat |
| `PUT`    | `/mon-profil/disponibilites`            | candidat |
| `POST`   | `/mon-profil/diplomes`                  | candidat |
| `DELETE` | `/mon-profil/diplomes/:qualificationId` | candidat |
| `POST`   | `/mon-profil/experiences`               | candidat |
| `DELETE` | `/mon-profil/experiences/:experienceId` | candidat |
| `GET`    | `/mon-profil/documents`                 | candidat |
| `POST`   | `/mon-profil/documents/:type`           | candidat |
| `GET`    | `/mon-profil/documents/:id/contenu`     | candidat |
| `DELETE` | `/mon-profil/documents/:id`             | candidat |

Routes séparées de `/candidats` plutôt que des gardes assouplies : le back-office garde ses règles
intactes, et ce qu'un candidat peut toucher se lit d'un coup d'œil sur un seul fichier. **Ce qui en
est absent l'est pour une raison** : le `statut` appartient à l'agence — se rendre actif soi-même
viderait la vérification de son sens ; l'adresse e-mail est l'identifiant de connexion ; la visite
médicale et la vaccination sont constatées sur pièce, jamais déclarées ; les coordonnées
géographiques sont calculées par géocodage, et les accepter en entrée permettrait de se placer à
côté du lieu d'une mission. Un diplôme déclaré naît **non vérifié** et ne rend éligible à rien tant
que l'agence ne l'a pas contrôlé ; une expérience déclarée naît non vérifiée elle aussi et ne
rapporte aucun point tant qu'un certificat de travail n'a pas été vu.

`/mon-profil/completude` répond à la question que pose tout inscrit — pourquoi aucune mission ne
m'est proposée — en listant les manques dans l'ordre où ils bloquent.

L'agence lit le même dossier en **lecture seule** par `GET /candidats/:id/documents` et
`.../documents/:id/contenu` : elle vérifie une pièce, elle n'en dépose ni n'en retire à la place de
quelqu'un. Le contenu sort toujours en `Content-Disposition: attachment`, jamais `inline`, pour
qu'un PDF téléversé ne s'exécute pas dans le contexte de l'API.

### Conservation des pièces

| Méthode | Route           | Accès                   |
| ------- | --------------- | ----------------------- |
| `GET`   | `/conservation` | jeton reçu par courriel |
| `POST`  | `/conservation` | jeton reçu par courriel |

**Les deux seules routes du produit autorisées par un jeton plutôt que par une session.** C'est
voulu : on écrit à quelqu'un précisément parce qu'il ne s'est plus connecté depuis un an. Exiger une
connexion pour répondre reviendrait à ne jamais obtenir de réponse, donc à effacer par défaut.

Le jeton est à usage unique, borné au délai de réponse, émis pour une adresse donnée et invalide si
elle a changé depuis. Le `GET` **ne le consomme pas** — un client de messagerie qui précharge les
liens brûlerait sinon la décision de quelqu'un qui n'a encore rien lu.

### Contact

| Méthode | Route      | Accès  |
| ------- | ---------- | ------ |
| `POST`  | `/contact` | public |

Le formulaire de la vitrine envoie vraiment : l'API relaie le message à la boîte de l'agence
(`CONTACT_EMAIL`, sinon l'adresse déclarée dans `@releve/shared`). Il ouvrait jusqu'ici le logiciel
de messagerie avec un `mailto:` pré-rempli, faute de route — honnête tant que rien n'existait côté
serveur, mais sans effet chez qui n'a pas de client de messagerie configuré : un bouton qui ne
répond pas, sans message d'erreur.

**Rien n'est enregistré en base.** Un message de contact n'a pas de cycle de vie, personne ne le
relit dans l'application, et le conserver ferait une seconde copie d'adresses à protéger pour rien.

Une route ouverte qui fait partir un courriel se transforme vite en robinet à spam, d'où trois
barrières : **trois messages par quart d'heure** et par adresse, des **bornes de longueur** sur
chaque champ dans le schéma partagé, et un **piège à robots** — un champ hors écran qu'une personne
ne remplit jamais. Quand il est rempli, la route répond `202` et n'envoie rien : refuser
explicitement apprendrait à celui qui sonde qu'il existe un champ à laisser vide.

L'adresse saisie ne devient **jamais l'expéditeur** : elle part en `Reply-To`. L'usurper ferait
rejeter le message par n'importe quel relais qui vérifie SPF, et ouvrirait le site à l'envoi de
courrier au nom de n'importe qui.

### Offres publiques et suggestions du marché

| Méthode | Route                 | Accès      |
| ------- | --------------------- | ---------- |
| `GET`   | `/offres`             | **ouvert** |
| `GET`   | `/offres/options`     | **ouvert** |
| `GET`   | `/offres/suggestions` | `CANDIDAT` |

Les deux routes ouvertes servent **les missions de Relève**, jamais les offres France Travail :
`/offres` les liste avec pagination et filtres (`departement`, `ville`, `metier`), `/offres/options`
alimente les menus déroulants à partir des missions réellement ouvertes. Le nom de l'établissement
client n'est pas projeté.

`/offres/suggestions` est la seule route qui rende des offres France Travail, et elle exige une
session candidat. Le rapprochement se fait sur le **code ROME de la qualification** du candidat
(DEAS → `J1501`, AVS → `K1304`) croisé avec son **rayon de déplacement**, filtré en base par une
boîte englobante puis tranché à la distance à vol d'oiseau. Chaque suggestion porte sa source et son
`urlOrigine`.

Aucun score n'est affiché, et c'est délibéré : le barème de Relève pèse d'abord le chevauchement
entre les créneaux déclarés et les horaires de la mission, or une offre France Travail n'annonce ses
horaires qu'en texte libre (`35H/semaine, travail en journée`). Un score calculé sur des champs
absents serait un chiffre inventé, affiché avec l'autorité d'une mesure.

Quand la liste est vide, `motif` dit pourquoi — `AUCUN_METIER`, `ADRESSE_ABSENTE`, `AUCUNE_OFFRE` —
pour que l'encart indique au candidat ce qu'il peut y changer plutôt que de rester muet.

### Tension du marché

| Méthode | Route                 | Accès       |
| ------- | --------------------- | ----------- |
| `GET`   | `/tension`            | authentifié |
| `GET`   | `/tension/suggestion` | authentifié |

`/tension/suggestion` retombe sur la médiane nationale quand le département ne dit rien, et renvoie
`perimetre: 'aucun'` plutôt que d'inventer un taux.

« back-office » = `ADMIN_AGENCE` ou `CHARGE_RECRUTEMENT`.

---

## Scripts

| Commande                                 | Effet                                               |
| ---------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                               | Contracts compilés, puis API et front en parallèle  |
| `pnpm dev:backend` / `pnpm dev:frontend` | Un seul des deux                                    |
| `pnpm build`                             | Contracts, puis API, puis front                     |
| `pnpm test`                              | Règles partagées (32) puis intégration API (339)    |
| `pnpm test:shared`                       | Règles partagées seules, sans base                  |
| `pnpm test:backend`                      | Intégration API seule                               |
| `pnpm typecheck`                         | TypeScript sur les trois paquets, tests compris     |
| `pnpm lint` / `pnpm format`              | ESLint / Prettier                                   |
| `pnpm infra:up` / `pnpm infra:down`      | Conteneurs PostgreSQL, Redis et Mailpit             |
| `pnpm db:migrate`                        | `prisma migrate dev`                                |
| `pnpm db:seed`                           | Jeu de données de démonstration                     |
| `pnpm db:studio`                         | Prisma Studio                                       |
| `pnpm db:reset`                          | **Détruit** la base locale et rejoue les migrations |

### Commandes d'exploitation

Elles tournent hors HTTP, sur le même contexte Nest que l'API — mêmes services, mêmes règles.
**Trois sont à appeler une fois par jour par l'ordonnanceur** : les deux de conservation, dans cet
ordre et jamais fondues en une seule (la relance du matin effacerait sinon ce qu'elle vient
d'annoncer), et l'annonce des missions. `--sec` montre ce qui se passerait sans rien écrire.

| Commande                         | Effet                                                                       |
| -------------------------------- | --------------------------------------------------------------------------- |
| `pnpm cli conservation:relancer` | Écrit aux candidats dont des pièces atteignent un an                        |
| `pnpm cli conservation:purger`   | Efface les pièces restées sans réponse 30 jours après la relance            |
| `pnpm cli notifier:missions`     | Annonce à chaque candidat actif les missions publiées qui lui correspondent |
| `pnpm cli purger:documents`      | Effacement ciblé par type et par âge, hors du cycle de conservation         |
| `pnpm cli geocoder`              | Situe les fiches candidats restées sans coordonnées                         |
| `pnpm cli geocoder:offres`       | Situe les offres collectées à partir de leur commune, via la BAN            |
| `pnpm cli importer:offres`       | Collecte des offres France Travail (voir « Données publiques »)             |

---

## Limites connues

**Le jeton d'accès survit jusqu'à 15 minutes à une révocation.** La session ne peut plus être
prolongée dès qu'elle est coupée, mais le JWT en cours reste accepté jusqu'à son expiration. Le
réduire supposerait une vérification en base à chaque requête — arbitrage entre latence et délai de
coupure, à poser si le contexte l'exige.

**La limitation de débit est en mémoire du processus.** Elle se remet à zéro à chaque redémarrage et
ne se partage pas entre instances. Dès que l'API tournera sur plus d'une instance, il faudra la
faire passer par Redis, déjà présent dans le `docker-compose`.

**La colonne PostGIS `geom` est alimentée, mais encore inutilisée par le classement.** Elle est
écrite à chaque géocodage et son index GiST existe ; en revanche `classer()` charge toujours tout le
vivier de l'agence en mémoire avant de filtrer. Le pré-filtre `ST_DWithin` est le gain suivant, et
il ne deviendra mesurable qu'à quelques milliers de fiches.

**La distance reste à vol d'oiseau.** Pour de l'aide à domicile, 12 km en centre-ville et 12 km en
campagne ne sont pas le même trajet, et c'est le temps de route qui décide si une intervenante
accepte. PostGIS n'y changerait rien — il mesure aussi à vol d'oiseau. Il faudra du routage (OSRM
auto-hébergé sur un extrait OSM, ou une API de matrice de distances).

**Le dépôt de pièces est en place, sans les garde-fous d'un usage réel.** Modèle
`DocumentCandidat`, stockage disque sous `STOCKAGE_DOCUMENTS`, routes de dépôt, de téléchargement et
de retrait. **La conservation est bornée à un an** : à l'échéance, `pnpm cli conservation:relancer`
écrit à la personne pour lui demander si elle veut qu'on garde ses pièces, et
`conservation:purger` efface celles restées sans réponse trente jours plus tard — le silence ne vaut
pas accord. Manquent le chiffrement au repos, l'analyse antivirale, la vérification de la signature
du fichier, la journalisation des accès, et **l'ordonnanceur qui appelle ces deux commandes chaque
jour** : tant qu'il n'est pas branché, la durée d'un an est écrite dans la politique de
confidentialité sans être appliquée. La durée vaut pour les **cinq types sans exception**, pièce
d'identité et diplôme compris : le code ne branche nulle part sur le type de pièce pour calculer une
échéance. Tout est détaillé dans
[`docs/conservation-documents.md`](docs/conservation-documents.md).

**Les notifications métier s'arrêtent à la candidature.** Le candidat est averti quand son dossier
est validé, et une fois par jour des missions publiées qui lui correspondent
(`pnpm cli notifier:missions`). En revanche, un candidat retenu ne
l'apprend qu'en ouvrant son suivi, un établissement qu'en ouvrant son accueil. La sortie courriel
existe (`backend/src/mail/`), il reste à y brancher les événements — c'est ce que les
automatisations n8n du jalon suivant doivent couvrir.

**Aucune limite par compte sur les liens émis.** Le plafond de trois demandes par minute est posé
par adresse IP. Quelqu'un qui change d'adresse à chaque essai peut donc inonder une boîte mail de
liens de réinitialisation — sans jamais en obtenir un seul, puisqu'ils partent chez le titulaire,
mais c'est un harcèlement possible. Un compteur par compte le fermerait.

**`connexionSchema` accepte 8 caractères** là où la création en exige 12, pour ne pas bloquer un
compte historique.

**Les tests d'intégration partagent une base** et s'exécutent en série. Suffisant à cette échelle,
mais à revoir si la suite s'allonge.

**Le produit s'appelle Relève, le code s'appelle Relève.** Les paquets (`@releve/shared`),
le titre de page dans `nuxt.config.ts` et l'en-tête du back-office portent encore le nom de
travail. Sans conséquence technique, mais visible en soutenance.

**Aucun test ne couvre le front.** Les 306 tests portent sur l'API et les règles partagées ; les
30 pages Nuxt, le layout et les composants ne sont vérifiés que par le typecheck et le lint.

**La couverture n'est pas mesurée.** `vitest run --coverage` n'est câblé nulle part, alors que le
rapport de couverture est un livrable attendu.

**Les trois textes juridiques sont des brouillons de structure.** Mentions légales, conditions
d'utilisation et politique de confidentialité existent et sont reliées au pied de page. Elles disent
ce que le code fait vraiment. Les dix-sept champs d'identification sont renseignés par un **jeu de
démonstration** : raison sociale inventée, SIRET et TVA réduits à des zéros — clé de contrôle
fausse, donc aucun rattachement possible à une entreprise existante — et organismes explicitement
fictifs. Un bandeau le dit en tête des trois pages, qui restent en `noindex`. Aucune n'a été relue
par un professionnel du droit. **L'inscription fait cocher « j'accepte les conditions générales »**, et enregistre la
date avec la version acceptée (`conditionsAccepteesLe`, `conditionsVersion`) : accepter un texte,
c'est accepter celui-là, et une révision ultérieure ne peut pas se prévaloir d'un consentement donné
à la précédente. La connexion, elle, ne fait toujours rien accepter — on n'accepte rien en se
connectant.

**L'identité légale de l'éditeur est fictive. C'est ce qui sépare encore la démonstration d'une mise
en ligne.** Les dix-sept champs — raison sociale, SIRET, directeur de la publication, hébergeur,
durée de conservation du dossier candidat, **garantie financière** — sont remplis par un jeu de
démonstration, pas par des faits.

Le mécanisme est aussi simple que possible : **un seul fichier**,
[`frontend/app/data/legal.ts`](frontend/app/data/legal.ts), lu par les trois pages. Passer en réel,
c'est remplacer chaque valeur puis mettre `MENTIONS_DEMONSTRATION` à `false` — le bandeau disparaît
alors des trois pages, et rien d'autre ne dépend de ce drapeau.

Ce drapeau n'est **pas déduit du remplissage des champs** : « toutes remplies » ne veut pas dire
« toutes vraies », et une déduction ferait disparaître l'avertissement à l'instant précis où l'on
saisit la dernière valeur inventée. Le passage à `false` est un geste explicite, qui se relit dans
l'historique.

Trois valeurs échappent à la fiction et décrivent le code : la durée de conservation des pièces, la
liste des sous-traitants, et l'absence de transfert hors Union européenne.

**L'accueil affiche encore des missions d'exemple.** La vitrine publique `/offres` sert de vraies
missions depuis `GET /offres`, mais l'encart de la page d'accueil n'y est pas branché : il montre
toujours des exemples explicitement étiquetés comme fictifs. Le raccordement tient en un appel.

**Le contenu éditorial de la vitrine est incomplet.** Les chiffres de l'en-tête d'accueil et le
téléphone de la page contact attendent les valeurs réelles, dans `frontend/app/data/vitrine.ts`. Le
bloc de chiffres reste masqué tant qu'il est vide : une absence ne trompe personne, un chiffre
inventé si. Le formulaire de contact, lui, envoie désormais pour de bon — voir « Contact » dans la
section API.

**Les notifications ne couvrent que deux moments.** Le candidat est averti quand son dossier est
validé, puis une fois par jour des missions publiées qui lui correspondent. Rien ne l'avertit
lorsqu'un établissement retient sa candidature, ni lorsqu'une mission à laquelle il a postulé est
annulée — ces deux-là restent à écrire, et ce sont les plus attendues une fois la boucle fermée.

L'interrupteur « Notifications par e-mail » du canvas existe désormais dans « Mon compte » et
commande quelque chose de réel (`Utilisateur.notificationsEmail`). Il ne coupe que les courriels de
service : confirmation d'adresse, réinitialisation et fin de conservation des pièces partent
toujours — les taire parce qu'une case est décochée ferait effacer des documents sans prévenir.

### Piège de développement

`@releve/shared` est compilé en CommonJS et lié par le workspace. Vite doit donc le pré-bundler,
et il met ce pré-bundle en cache — dans `frontend/node_modules/.cache/vite`, pas dans
`node_modules/.vite`.

Deux pièges en découlent, réglés tous les deux dans `nuxt.config.ts` par
`vite.optimizeDeps = { include: ['@releve/shared'], force: true }` :

- sans `include`, Vite traite le paquet comme du source et rate ses exports nommés —
  `doesn't provide an export named` sur un symbole pourtant bien exporté ;
- sans `force`, **un fichier ajouté au paquet partagé n'invalide rien.** Vite calcule l'empreinte de
  son cache sur le fichier de verrouillage et la configuration, pas sur le contenu d'un paquet lié.
  Le navigateur reçoit alors un pré-bundle d'avant, où le nouveau symbole n'existe pas.

Le second est le plus coûteux à diagnostiquer, parce qu'il **ne se voit pas côté serveur** : Node
charge le vrai `dist`, la page se rend en 200 et paraît normale. C'est l'hydratation qui échoue,
sur un `X is undefined`, et l'écran reste là, inerte — un bouton qui ne répond pas, sans message
d'erreur. Vérifier une page par son HTML rendu ne suffit donc pas ; il faut la charger dans un
navigateur, ou lire les erreurs que le serveur de développement y remonte.

**Après toute modification du paquet partagé : reconstruire, puis redémarrer le serveur Nuxt.** Les
deux, dans cet ordre. Le serveur charge `@releve/shared` une fois au démarrage — pour le rendu
serveur comme pour le navigateur — et ne le relit pas ensuite. Et un redémarrage seul ne suffisait
pas non plus tant que `force` n'était pas posé : le cache est sur disque et survit à l'arrêt du
processus.

```bash
pnpm --filter @releve/shared build   # puis relancer pnpm dev
```

`force` reconstruit les dépendances à chaque démarrage, pour quelques centaines de millisecondes.
Sans effet sur le `build` de production, qui repart toujours de zéro.

---

## Questions métier en attente

Le socle est livré et testé. Restent des questions métier, pas du code :

Elles sont détaillées dans [`docs/questions-a-trancher.md`](docs/questions-a-trancher.md), prêtes à
être envoyées : chaque question y indique ce qu'elle bloque et à partir de quand. **Le format
d'export attendu par le logiciel de paie est la plus urgente** — il conditionne une partie du
modèle, et une réponse tardive se paie en reprise de données.
