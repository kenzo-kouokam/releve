# Questions à trancher avant les lots suivants

Le lot 1 (socle, authentification, référentiels, vivier) est terminé et testé. Les questions
ci-dessous ne bloquent pas ce qui existe, mais conditionnent ce qui vient. Elles sont classées par
échéance : la première doit trouver sa réponse maintenant, avant même que le développement du lot
concerné ne commence.

---

## 1. Quel logiciel de paie, et quel format d'export attend-il ?

**À obtenir : maintenant.** C'est la question la plus urgente du projet.

### Pourquoi elle est urgente

Elle ne bloque pas le lot 2, mais elle décide d'une partie du **modèle de données**, pas seulement
d'un écran de sortie. Concrètement, l'export de paie impose :

- la **liste des natures d'heures** à distinguer (normales, nuit, dimanche, jours fériés,
  majorations conventionnelles…). Le schéma en prévoit cinq aujourd'hui sur `ReleveHeures` ; si la
  paie en attend douze, c'est une migration et une reprise des relevés déjà saisis ;
- le **format des coefficients et des taux** : nombre de décimales, arrondi, et surtout à quel
  moment l'arrondi est fait. Un écart d'un centime par heure devient un écart visible sur un
  bulletin, et c'est l'agence qui le justifiera ;
- les **rubriques de paie** et leurs codes, qui doivent correspondre exactement à ceux du logiciel ;
- le **mode de transmission** : fichier déposé, API, import manuel — et à quelle fréquence.

Attendre le lot 4 pour poser la question, c'est découvrir le format une fois les relevés d'heures
déjà en production. La reprise coûte alors bien plus que l'export lui-même.

### Ce qu'il faut demander, précisément

Une demande adressée à l'éditeur ou à l'expert-comptable qui tient la paie :

1. Le **nom et la version** du logiciel de paie utilisé.
2. Un **fichier d'exemple réel** (anonymisé) d'un import d'heures accepté par ce logiciel.
3. La **documentation d'import** : champs obligatoires, encodage, séparateur, format de dates.
4. La **liste des rubriques** correspondant aux natures d'heures d'intérim dans le secteur.
5. La règle d'**arrondi** appliquée aux heures et aux taux.
6. Le **canal** d'import et sa fréquence attendue.

Un fichier d'exemple vaut mieux qu'une description : il tranche à lui seul la moitié des questions
ci-dessus.

---

## 2. Le particulier employeur est-il dans le périmètre ?

**À trancher avant le lot 2.**

Placer un intérimaire chez un particulier ne relève pas du même cadre juridique que la mise à
disposition auprès d'un SAAD. Ce n'est pas une variante du modèle actuel : c'est un second métier,
avec ses propres règles de contrat, de responsabilité et de facturation.

Si la réponse est oui, il faut le savoir avant de construire le moteur de matching et le dépôt de
besoin, qui supposent aujourd'hui un client personne morale avec un SIRET.

---

## 3. Qui saisit les heures, et que fait-on du silence du client ?

**À trancher avant le lot 3.**

La saisie par le candidat avec validation par le client est le schéma le plus fiable, et c'est celui
que porte le schéma actuel. Restent deux décisions qui changent le comportement du système :

- **Quel délai** le client a-t-il pour valider un relevé ?
- **Que se passe-t-il s'il ne fait rien ?** Validation tacite au bout du délai, ou blocage de la
  facturation ? La première option fait porter le risque à l'agence, la seconde retarde son
  encaissement. C'est un arbitrage commercial, pas technique.

Il faut aussi décider du traitement d'un **relevé contesté** : qui arbitre, et sur quelle base.

---

## 4. Multi-agence : confirmer la trajectoire

**Réponse proposée, à confirmer.**

Le cloisonnement multi-agence est en place et testé, y compris pour les comptes clients et
candidats. Ce choix est fait et ne coûte plus rien à conserver — l'ajouter après coup sur un schéma
vivant aurait coûté dix fois plus cher.

Reste à confirmer qu'il y aura bien plusieurs agences, et si oui, si certaines données doivent être
**partagées** entre elles : le référentiel des qualifications l'est déjà, mais la question se posera
pour les clients d'un même groupe, et pour un candidat qui travaillerait avec deux agences.

---

## 5. Durée de session

**Décision technique, à valider côté usage.**

La session dure douze heures et le jeton d'accès quinze minutes, renouvelé automatiquement. Une
personne qui commence à 6 h 30 n'est donc pas déconnectée de la journée, mais devra se reconnecter
le lendemain.

À confirmer avec l'agence : est-ce le bon compromis, ou faut-il une session plus longue sur les
postes du bureau ? Le changement est une variable d'environnement, mais la décision relève de la
sécurité autant que du confort.

---

## Rappel : ce qui a déjà été tranché

| Question                         | Réponse retenue                                                           |
| -------------------------------- | ------------------------------------------------------------------------- |
| Profil unique ou deux entités ?  | Un seul candidat, avec un tableau `filieres`                              |
| Client et lieu d'intervention    | Deux modèles distincts — un SAAD signe, on intervient ailleurs            |
| Convention collective            | Portée par le client, entreprise utilisatrice                             |
| Données de santé                 | Une date de visite et deux booléens, rien de plus                         |
| Bénéficiaire                     | Référence pseudonymisée, jamais nommé                                     |
| Durée de conservation des pièces | Un an, puis relance par courriel ; sans réponse sous 30 jours, effacement |
| Pièce d'identité et diplôme      | Même durée que le reste : un an, sans traitement particulier              |
