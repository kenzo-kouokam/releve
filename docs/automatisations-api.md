# Automatisations : ce que l'API fournit

Ce document décrit le **côté API** du contrat d'automatisation : ce qui est
émis, ce qui peut être rappelé, et comment s'authentifier. Il répond au
brouillon `docs/automatisations.md` (branche `feat/data-n8n-airtable`) et en
confirme l'essentiel — les écarts sont listés en fin de page.

Tout ce qui suit est implémenté et couvert par `backend/test/evenements.spec.ts`.

---

## Principe

L'API **raconte**, l'automatisation **rappelle**. Aucun outil extérieur ne
touche la base.

```
API Relève ──(webhook signé HMAC)──▶ n8n ──▶ Slack
     ▲                                 │
     └───(POST/GET /api/interne/*)─────┘
             X-Service-Token
```

Deux conséquences à retenir :

- **Le journal est la vérité, l'émission n'en est qu'une copie.** Chaque
  transition est d'abord écrite dans `EvenementMission`, puis émise. Si n8n est
  arrêté, le métier continue et rien n'est perdu : le journal permet de rejouer.
- **Une panne d'automatisation ne fait jamais échouer une action métier.**
  L'émission est asynchrone, elle ne lève pas, et l'échec est journalisé en
  `error` après trois tentatives.

---

## Configuration

| Variable                  | Rôle                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `N8N_EVENTS_WEBHOOK_URL`  | Où poster les événements                                    |
| `N8N_WEBHOOK_SECRET`      | Secret HMAC, et sel de la pseudonymisation des candidats     |
| `INTERNAL_SERVICE_TOKEN`  | Secret des routes `/api/interne/*`                           |

Générer les deux secrets : `openssl rand -hex 32`.

Deux comportements à connaître :

- **Sans URL ou sans secret, l'API se tait.** Les transitions sont journalisées,
  rien ne sort. C'est l'état normal d'un poste qui ne fait pas tourner n8n, et
  celui des suites d'intégration.
- **Sans `INTERNAL_SERVICE_TOKEN`, les routes internes répondent `503`.** Un
  oubli de configuration ferme la porte, il ne l'ouvre pas.

---

## Événements émis

| Événement              | Transition                                   |
| ---------------------- | -------------------------------------------- |
| `mission.publiee`      | Création d'une mission (elle naît `PUBLIEE`)  |
| `proposition.envoyee`  | L'agence propose des candidats                |
| `proposition.acceptee` | Un candidat postule de lui-même               |
| `mission.pourvue`      | L'établissement retient un candidat           |
| `mission.annulee`      | Mission annulée                               |
| `mission.relancee`     | Relance enregistrée via `/api/interne`        |
| `mission.escaladee`    | Escalade enregistrée via `/api/interne`       |

La liste est fermée : `TYPES_EVENEMENT` dans `shared/src/evenements.ts`. Ajouter
un événement est une modification de contrat.

### En-têtes

| En-tête               | Contenu                                              |
| --------------------- | ---------------------------------------------------- |
| `X-Releve-Event`      | Nom de l'événement                                    |
| `X-Releve-Delivery`   | UUID de l'envoi, pour dédupliquer                     |
| `X-Releve-Signature`  | `sha256=` + HMAC SHA-256 du **corps brut**            |

La signature porte sur les octets envoyés, sérialisés une seule fois. Côté n8n,
le nœud Webhook doit donc être en `rawBody: true` — ce qui est déjà le cas dans
`wf1-notification.json`.

### Corps

```json
{
  "event": "proposition.envoyee",
  "occurredAt": "2026-09-22T08:02:12.000Z",
  "deliveryId": "5f0c…",
  "mission": {
    "id": "…",
    "reference": "M-2026-0042",
    "qualification": "AES",
    "commune": "Nantes",
    "departement": "44",
    "dateDebut": "2026-09-23",
    "dateFin": "2026-09-23",
    "heureDebut": "07:00",
    "heureFin": "09:00",
    "tauxHoraire": 13.5,
    "lienApp": "http://localhost:3000/missions/…"
  },
  "propositions": [{ "id": "…", "candidatRef": "CAN-7F3A2C", "score": 87.5 }],
  "candidatsEligibles": [
    {
      "candidatRef": "CAN-19B0E4",
      "prenom": "Sophie",
      "email": "sophie@exemple.fr",
      "notificationsEmail": true
    }
  ],
  "candidatRetenu": null,
  "candidatsAPrevenir": []
}
```

Le bloc `mission` porte aussi **`urgente`** : vrai quand la vacation commence dans
moins de 48 h (`SEUIL_URGENCE_HEURES`). Calculé par l'API, avec l'heure de début
et pas seulement le jour — demain 7 h et demain 22 h ne laissent pas le même
délai. Deux workflows qui recalculeraient ce seuil chacun de leur côté
finiraient par ne plus s'accorder sur ce qui est urgent.

Trois listes désignent des personnes, toujours par référence seule :

| Champ | Renseigné sur | Contenu |
|---|---|---|
| `candidatsEligibles` | `mission.publiee` | Candidats à qui la mission peut être annoncée, **déjà filtrés sur leur préférence de notification** |
| `candidatRetenu` | `mission.pourvue` | Le candidat retenu |
| `candidatsAPrevenir` | `mission.pourvue`, `mission.annulee` | Ceux dont la candidature en cours vient de tomber, le retenu excepté |

Chacune porte `candidatRef`, `prenom` et `email` — de quoi écrire à la personne
depuis n8n. `notificationsEmail` n'apparaît que sur `candidatsEligibles`, où il
vaut toujours `true` : l'API a déjà écarté ceux qui ont coupé leurs alertes, et
le champ n'est conservé que pour que le nœud de filtre existant continue de
fonctionner. Il est absent des listes de clôture, où la préférence ne s'applique
pas.

**La forme ne change jamais d'un événement à l'autre** : ailleurs, ces listes
sont vides et `candidatRetenu` est nul, comme `propositions` l'est pour les
événements qui ne concernent aucune candidature. Un workflow peut donc lire le
même chemin partout, sans tester l'existence du champ.

### Données personnelles

**La frontière passe à l'intérieur de l'événement**, et c'est le point à ne pas
perdre de vue :

| Bloc | Contenu | Destination |
|---|---|---|
| `propositions` | `candidatRef` seul | Message Slack de l'agence — **hors UE** |
| `candidatsEligibles`, `candidatRetenu`, `candidatsAPrevenir` | `candidatRef`, `prenom`, `email` | Envoi des courriels par n8n — **même machine** |

n8n est hébergé avec l'application, dans le même `docker-compose` : lui
transmettre une adresse n'est pas un transfert vers un tiers. Slack et Airtable
le sont, et rien de nominatif ne part vers eux — d'où `propositions` qui reste
pseudonyme, puisque c'est lui qui alimente le salon d'équipe. Confondre les deux
ferait fuiter un nom dans Slack.

Ce qui sort se limite au strict nécessaire à un envoi : **ni nom de famille, ni
téléphone, ni adresse postale, ni identifiant technique**. Deux tests le
vérifient — `garde pseudonyme la liste qui alimente Slack` et `ne fait sortir
que le prenom et l adresse, jamais plus`.

`candidatRef` reste dérivée par HMAC avec `N8N_WEBHOOK_SECRET` : stable d'un
message à l'autre — on suit un dossier dans Slack — et non réversible sans le
secret.

Côté lieu, seuls la commune et le département sortent : jamais l'adresse
d'intervention.

---

## Routes internes

Préfixe `/api/interne`, en-tête `X-Service-Token`. Ces routes ignorent la notion
d'agence — l'appelant n'est pas un utilisateur — et ne rendent aucune donnée
personnelle. Elles sont absentes de la documentation Swagger publique.

### `GET /api/interne/missions/non-pourvues`

| Paramètre      | Défaut | Rôle                                  |
| -------------- | ------ | ------------------------------------- |
| `seuilMinutes` | `1440` | Attente minimale pour ressortir        |
| `limite`       | `50`   | Plafond de résultats                   |

Rend les missions ouvertes, sans candidat retenu, dont la date de début n'est
pas passée, et dont le **dernier mouvement** (publication, relance ou escalade)
dépasse le seuil.

```json
[
  {
    "mission": { "…": "même bloc que dans les événements" },
    "candidaturesEnAttente": 2,
    "relances": 1,
    "depuisLe": "2026-09-22T06:00:00.000Z",
    "ouverteDepuisMinutes": 180
  }
]
```

Le seuil se mesure depuis le dernier mouvement et non depuis la création : une
mission relancée il y a une minute n'est pas « en attente depuis sa
publication ». **C'est ce qui empêche la boucle** — relancer sort la mission de
la liste jusqu'au prochain seuil. Un test le couvre.

Les missions créées avant la mise en place du journal n'ont aucun événement :
leur date de création fait alors foi, sinon elles resteraient invisibles.

### `POST /api/interne/missions/:id/relances`

### `POST /api/interne/missions/:id/escalade`

Corps : `{ "motif": "…" }`, facultatif, 500 caractères au plus. Le motif est
réaffiché dans le journal de la mission.

```json
{
  "missionId": "…",
  "type": "mission.relancee",
  "relances": 2,
  "enregistreeLe": "2026-09-22T09:00:00.000Z"
}
```

`relances` est le compteur **après** l'appel : c'est lui qui déclenche
l'escalade côté workflow, au troisième.

Répond `403` si la mission n'est plus ouverte ou vient d'être pourvue — le cas
arrive quand le workflow lit une liste et que l'établissement valide entre-temps.

### `POST /api/interne/missions/:id/alertes`

> **Optionnelle depuis que n8n expédie lui-même.** Les événements portent
> désormais `prenom` et `email`, et le workflow envoie directement par SMTP.
> Cette route reste en place et testée : elle évite de réécrire un gabarit dans
> un nœud n8n, ce qui vaut surtout pour la **confirmation de mission**, qui
> porte des mentions obligatoires et a meilleure place dans le backend.

L'événement désigne les personnes par référence ; le workflow applique son
plafond anti-spam, sa déduplication, son horaire ; puis il rend la main avec les
seules références retenues, et l'API expédie.

```json
{ "type": "urgente", "candidatRefs": ["CAN-7F3A2C", "CAN-19B0E4"] }
```

| `type` | Courriel | Destinataires possibles |
|---|---|---|
| `urgente` | Mission à pourvoir sous 48 h | Candidats éligibles à la mission |
| `cloture` | Mission pourvue, ou annulée | Ceux ayant postulé, le retenu excepté |
| `confirmation` | Confirmation au candidat retenu | Le seul candidat retenu |

```json
{ "missionId": "…", "type": "urgente", "demandees": 2, "envoyees": 2, "ignorees": [] }
```

**Chaque type borne ses destinataires possibles**, et c'est une protection
autant qu'une commodité : une référence hors de l'ensemble autorisé est
*ignorée* et rendue dans `ignorees`, jamais expédiée. Sans cette borne, un
appelant qui connaîtrait une référence pourrait écrire à n'importe qui sur
n'importe quelle mission. Un test le vérifie — demander une `confirmation` pour
quelqu'un qui n'est pas le candidat retenu n'envoie rien.

Le motif de clôture n'est pas passé par l'appelant : l'API lit le statut de la
mission. « Pourvue » et « annulée » ne sont pas la même nouvelle, et c'est la
plateforme qui sait laquelle est vraie.

Les gabarits vivent dans `backend/src/mail/gabarits.ts`, avec tous les autres
courriels — plutôt que réécrits dans un workflow, où ils dériveraient.

### `POST /api/interne/notifications/missions`

Corps : `{ "simulation": false }`.

Déclenche le balayage des courriels de missions correspondantes — le même que
`pnpm cli notifier:missions`, exposé pour un ordonnanceur qui ne peut pas lancer
un binaire sur l'hôte. Rend `{ examines, avertis, missions, simulation }`.

---

## La route qui manquait : l'agence propose

`POST /api/missions/:id/propositions` — réservée à l'agence
(`ADMIN_AGENCE`, `CHARGE_RECRUTEMENT`).

```json
{ "candidatIds": ["…", "…"], "message": "Profil qui correspond" }
```

C'est **le déclencheur de WF1**. Avant ce lot, le statut `ENVOYEE` était lu
partout mais écrit nulle part : aucune route ne permettait à l'agence de
proposer un candidat depuis le classement, donc `proposition.envoyee` ne pouvait
pas se produire.

Trois choix à connaître :

- **Par lot.** C'est le geste réel — on regarde un classement et on retient les
  trois premiers. Un appel par candidat produirait trois alertes Slack là où il
  s'est passé une seule chose. **Un envoi = un événement**, quel que soit le
  nombre de candidats.
- **La même porte d'éligibilité que partout ailleurs.** Un candidat hors rayon,
  sans diplôme vérifié ou déjà engagé fait échouer l'envoi entier, avec son nom
  et le motif. Écarter en silence laisserait le chargé de recrutement croire que
  trois profils sont partis quand il n'y en a que deux.
- **Un candidat déjà proposé est ignoré, pas refusé.** Seules les nouvelles
  lignes sont rendues, et rien n'est émis s'il n'y en a aucune.

---

## Écarts avec le brouillon

| Point du brouillon                        | Ce qui est fait                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `mission.filiere` dans le payload          | **Retiré.** Le modèle n'a pas ce champ, et `TypeClient` ne porte qu'une valeur — la filière serait une constante. |
| Seuil de relance côté API                  | **Côté appelant.** `seuilMinutes` est un paramètre de requête : la démo tourne à 1 minute, l'exploitation à 1440, et ce n'est pas à l'API d'arbitrer. `RELANCE_SEUIL_MIN` reste donc une variable n8n. |
| Airtable comme base tampon                 | **Rien côté API.** Aucune route ne lui est dédiée ; si un besoin apparaît, il passera par une route interne comme les autres. |
| `candidatsEligibles` avec `prenom` et `email` | **Conforme au brouillon.** Les trois listes les portent. `POST /api/interne/missions/:id/alertes` existe en plus, pour les envois qu'on préfère garder côté backend. |
| Route de déclenchement du balayage         | **Ajoutée**, elle n'était pas au brouillon. |

### Deux points de vigilance, maintenant que n8n expédie

- **La liste des destinataires est figée à la publication.** Un candidat devenu
  inéligible entre l'événement et l'envoi — il s'est engagé ailleurs, son
  diplôme a expiré — recevra quand même l'alerte. La route
  `POST /alertes` ne souffre pas de ça, elle revalide au moment d'expédier.
- **Les gabarits existent en deux endroits.** Ceux du backend
  (`backend/src/mail/gabarits.ts`) et ceux des nœuds n8n. Un changement de pied
  de page ou de mention légale doit être fait des deux côtés, sans quoi ils
  divergent silencieusement.

### Réponses aux trois points à trancher

1. **Écriture des `EvenementMission`** — faite, dans `missions.service.ts`
   (publication, annulation) et `propositions.service.ts` (proposition,
   acceptation, mission pourvue). Toujours **après** la transaction, jamais
   dedans : un événement émis depuis une transaction annulée décrirait quelque
   chose qui n'a pas eu lieu.

2. **Effet métier d'une relance** — aucun, délibérément. Une relance journalise
   et émet, elle ne recalcule pas le classement et ne crée pas de propositions.
   Faire naître des propositions depuis un workflow reviendrait à confier à une
   automatisation le choix de qui est proposé à qui : c'est une décision de
   l'agence, et elle doit rester tracée à son nom. Le workflow alerte, l'humain
   propose — via la route ci-dessus.

3. **Nommage des en-têtes et préfixe `/api/interne`** — confirmés tels quels.

---

## Un point à corriger dans le plan

Le récapitulatif quotidien au candidat est décrit comme « missions urgentes
incluses **tant qu'elles ne sont pas pourvues** ». Ce n'est pas ce que fait le
code aujourd'hui, et ce lot ne l'a pas changé.

`notifications-missions.service.ts` envoie un **delta**, pas un récapitulatif :
il ne retient que les missions créées depuis le dernier envoi
(`createdAt: { gt: depuis }`), et la date de dernier envoi avance **même quand
aucun courriel ne part**. Une mission publiée lundi et toujours ouverte vendredi
a donc été annoncée une seule fois, lundi.

Ce n'est pas un défaut : le choix évite huit courriels quand une agence dépose
huit besoins dans l'après-midi. Mais « tant qu'elles ne sont pas pourvues »
demande un vrai changement de logique, à arbitrer — il change le comportement
pour tous les candidats.

Par ailleurs, **la notion d'urgence (moins de 48 h) n'existe nulle part** dans le
domaine, et le courriel est plafonné à cinq missions
(`MISSIONS_PAR_COURRIEL = 5`). Les deux sont à créer si le besoin est confirmé.

**L'alerte urgente, elle, est servie** : `mission.publiee` porte `urgente` et
`candidatsEligibles`, et `POST /api/interne/missions/:id/alertes` expédie. Le
manque ne porte donc plus que sur le récapitulatif quotidien, qui reste un
delta.
