# Automatisations — contrat d'événements (brouillon)

> Statut : **brouillon à valider avec le dev** avant implémentation.
> Périmètre : les workflows n8n exigés par le sujet (au moins deux) et leurs échanges avec l'API.

## Vue d'ensemble

```
API Relève ──(webhook signé HMAC)──▶ n8n ──▶ Slack (agence) · E-mail (candidats)
     ▲                                 │
     └──(GET/POST /api/interne/*, jeton de service)◀┘──▶ Airtable (base tampon)
```

- L'API reste la source de vérité. n8n ne modifie jamais la base directement : il passe par des routes internes.
- Si n8n est indisponible, le métier continue. L'émission est réessayée, puis l'échec est journalisé.

## Qui prévient qui, et par quel canal

Chaque canal a son public : l'e-mail pour les candidats (externes), Slack pour l'équipe de l'agence (interne).

| Destinataire | Message | Canal (POC) | En production | Porté par |
|---|---|---|---|---|
| Candidat | Récapitulatif quotidien des missions publiées qui lui correspondent, **missions urgentes incluses tant qu'elles ne sont pas pourvues** | E-mail (Mailpit) | E-mail | Backend (`notifier:missions`) |
| Candidat | **Alerte urgente** : mission éligible qui démarre dans moins de 48 h, envoyée tout de suite, 3 par jour au plus | E-mail (Mailpit) | SMS ou notification push | **n8n décide, l'API expédie** — WF1 |
| Candidat | **Mission pourvue ou annulée**, pour les seuls candidats ayant une proposition en cours sur la mission | E-mail (Mailpit) | E-mail ou push | **n8n décide, l'API expédie** — WF1 |
| Candidat | **Confirmation de mission** (mentions obligatoires), e-mail transactionnel envoyé quelle que soit la préférence | E-mail (Mailpit) | E-mail | n8n — WF3 |
| Agence | Propositions, acceptations, missions pourvues ou annulées | Slack `#missions-proposees` — le message de proposition est **mis à jour** à la clôture (son horodatage est gardé dans Redis, `n8n:slack:<missionId>`, 30 jours) | Slack / Teams | n8n — WF1 |
| Agence | Relances des missions non pourvues, escalade à la 3e | Slack `#agence-relances` | Slack / Teams | n8n — WF2 |
| Agence (tech) | Erreurs des workflows | Slack `#ops` — chaque appel à l'API a 2 tentatives puis bascule sur cette alerte, sans interrompre le reste du workflow | Slack / Teams | n8n |

Pourquoi deux rythmes pour le candidat : le récapitulatif sert à **découvrir** des missions sans saturer la boîte ; l'alerte sert l'**urgence** (un remplacement du jour ne peut pas attendre le lendemain).

## Workflows prévus

| Workflow | Déclencheur | Rôle | Priorité |
|---|---|---|---|
| WF1 — Alertes | Webhook `mission.publiee` (urgente), `proposition.envoyee`, `proposition.acceptee`, `mission.pourvue`, `mission.annulee` | Alerte e-mail aux candidats éligibles pour une mission urgente ; suivi en temps réel pour l'agence sur Slack ; e-mail de clôture aux candidats en cours | MUST |
| WF2 — Relance des missions non pourvues | Planification toutes les 15 min | `GET /interne/missions/non-pourvues?seuilMinutes=` puis, par mission : `POST /relances` et message dans `#agence-relances`, ou `POST /escalade` + alerte au canal à partir de la 3e relance. Le compteur vient de l'API, et le seuil se mesure depuis le **dernier mouvement** : une mission relancée sort de la liste jusqu'au seuil suivant, ce qui évite toute boucle. | MUST |
| WF3 — Confirmation de mission | Appelé par WF1 à la validation (`mission.pourvue`) | Demande à l'API le courriel `type: confirmation` pour le seul candidat retenu, puis trace « confirmation envoyée » dans `#missions-proposees`. Une annulation ne déclenche rien. | MUST |

Un même événement peut déclencher plusieurs workflows : `mission.pourvue` met à jour le message Slack de l'agence et prévient les autres candidats (WF1), et déclenche la confirmation du candidat retenu (WF3).

Pour `mission.publiee`, l'API joint à l'événement les candidats éligibles (calculés par le service de matching) et un indicateur `urgente` (début dans moins de 48 h) :

```json
"mission": { "...": "...", "urgente": true },
"candidatsEligibles": [
  { "candidatRef": "CAN-19B0E4", "prenom": "Sophie", "email": "sophie@exemple.fr", "notificationsEmail": true }
]
```

Pour `mission.pourvue` et `mission.annulee`, elle joint `candidatRetenu` et `candidatsAPrevenir` (mêmes champs, sans `notificationsEmail`).

**Aucune donnée personnelle ne sort de l'API** (décision du 17/09, avec le dev). L'événement ne porte que des références pseudonymes `candidatsAPrevenir: [{ candidatRef }]`, et les candidats qui ont coupé leurs notifications sont déjà écartés par l'API.

**Qui envoie quoi** : n8n **décide** (urgence, plafond, moment), l'**API expédie**. Après son filtrage, le workflow rassemble les références retenues et appelle :

```
POST {RELEVE_API_URL}/interne/missions/:id/alertes
X-Service-Token: <INTERNAL_SERVICE_TOKEN>
{ "type": "urgente" | "cloture" | "confirmation", "candidatRefs": ["CAN-19B0E4", "CAN-5D21A8"] }
→ { missionId, type, demandees, envoyees, ignorees }
```

Les trois types possibles sont `urgente`, `cloture` et `confirmation`. L'API borne les destinataires autorisés pour chacun : une référence hors de cet ensemble est ignorée et rendue dans `ignorees`.

```
```

Un seul appel par lot, pas un par candidat : un envoi correspond à un geste.

**Plafond anti-spam** : avant l'appel, n8n incrémente dans Redis un compteur `n8n:alertes:<candidatRef>:<AAAA-MM-JJ>` (expiration 48 h) et ne garde que les candidats sous la barre des 3 alertes du jour.

## Événements émis par l'API

| Événement | Transition métier | Consommé par |
|---|---|---|
| `mission.publiee` | `BROUILLON` → `PUBLIEE` | WF1 (si urgente), journal, KPI |
| `proposition.envoyee` | Création d'une `Proposition` (`ENVOYEE`) | WF1 |
| `proposition.acceptee` | `ACCEPTEE_CANDIDAT` | WF1 |
| `mission.pourvue` | Mission → `VALIDEE` | WF1 (Slack agence + e-mail aux candidats en cours), WF3 |
| `mission.annulee` | Mission → `ANNULEE` | WF1 |
| `mission.relancee` / `mission.escaladee` | Déclenchés par WF2 via l'API | Journal, KPI |

Chaque événement est aussi écrit dans `EvenementMission` : c'est ce journal qui alimente la relance et les indicateurs.

## Format d'un webhook

En-têtes :

| En-tête | Contenu |
|---|---|
| `X-Releve-Event` | Nom de l'événement |
| `X-Releve-Delivery` | UUID de l'envoi (idempotence côté n8n) |
| `X-Releve-Signature` | `sha256=` + HMAC SHA-256 du corps brut avec `N8N_WEBHOOK_SECRET` |

Corps (exemple `proposition.envoyee`) :

```json
{
  "event": "proposition.envoyee",
  "occurredAt": "2026-09-22T08:02:12Z",
  "deliveryId": "5f0c…",
  "mission": {
    "id": "…", "reference": "MIS-2026-0042", "filiere": "DOMICILE",
    "qualification": "AES", "commune": "Nantes", "departement": "44",
    "dateDebut": "2026-09-23", "dateFin": "2026-09-23",
    "heureDebut": "07:00", "heureFin": "09:00", "tauxHoraire": 13.5,
    "lienApp": "http://localhost:3000/missions/…"
  },
  "propositions": [{ "id": "…", "candidatRef": "CAN-7F3A2C", "score": 87.5 }]
}
```

## Canal de notification : Slack

Une application Slack dédiée (jeton bot `xoxb-…`, portées `chat:write` et `chat:write.public`) publie dans trois salons :

| Salon | Usage |
|---|---|
| `#missions-proposees` | WF1 : proposition aux candidats, puis mise à jour du message à la clôture (`chat.update`) |
| `#agence-relances` | WF2 : relances et escalades (`@here` sur escalade) |
| `#ops` | Erreurs des workflows |

Le jeton bot est enregistré dans les credentials n8n, jamais dans le dépôt.

## Journal Airtable : base « Relève — Tampon n8n »

Chaque workflow écrit une ligne après chaque envoi. L'application ne lit jamais cette base : c'est le journal des automatisations, et le cockpit de l'agence.

| Table | Écrite par | Une ligne quand… | Statuts |
|---|---|---|---|
| `Notifications` | WF1, WF3 | un message Slack de suivi part, un lot d'e-mails (urgente, clôture, confirmation) est confié à l'API, ou le plafond bloque une alerte | `ENVOYE`, `ECHEC`, `PLAFOND` |
| `Relances` | WF2 | une relance ou une escalade est enregistrée | `OK`, `ECHEC` |

- Colonnes : clé (`deliveryId` + type, pour repérer un rejeu), date, workflow, événement, mission, canal, type, références candidats, envoyés / écartés (réponse de `/alertes`), statut.
- Chaque ligne est préparée par un nœud « Journal : … » aux noms exacts des colonnes, puis un seul nœud Airtable par workflow l'écrit (correspondance automatique, `typecast`).
- **Le journal ne bloque jamais un envoi** : le nœud Airtable continue en cas d'erreur (quota, panne, jeton expiré).
- Quota du plan gratuit : 1 000 appels par mois. On n'écrit que sur événement, une ligne par lot, jamais une par candidat (sauf `PLAFOND`).
- Interface **Cockpit agence** (F64) : compteurs, répartition par type et par statut, onglets « Échecs », « Plafond atteint », « Escalades ».
- Identifiant de base : `AIRTABLE_BASE_ID` (non secret, dans `backend/.env`). Jeton : credential n8n « Airtable — Relève », limité à cette base.
- Conservation : 90 jours, puis purge.

## Données personnelles

- Aucun nom, e-mail, téléphone ni adresse ne sort vers Slack ou Airtable : les nœuds « Journal » et les messages Slack ne lisent que `candidatRef`.
- n8n, hébergé avec l'application, reçoit le prénom et l'e-mail des candidats visés (`candidatsEligibles`, `candidatRetenu`, `candidatsAPrevenir`). Les workflows n'en font rien : ils confient l'envoi à `POST /alertes`, qui revalide les destinataires.
- Une référence `CAN-XXXXXX` reste une donnée **pseudonyme**, donc personnelle au sens du RGPD tant que le secret HMAC existe : Slack et Airtable doivent figurer comme sous-traitants dans le registre.
- Le candidat est désigné par une référence pseudonyme `CAN-XXXXXX`, dérivée de son identifiant par HMAC.
- Slack et Airtable sont hébergés hors UE : cette minimisation est la condition de leur usage.

## Routes internes appelées par n8n

| Route | Rôle |
|---|---|
| `GET /api/interne/missions/non-pourvues?seuilMinutes=` | Missions ouvertes sans candidat retenu, dont le dernier événement de publication ou de relance dépasse le seuil |
| `POST /api/interne/missions/:id/relances` | Enregistre une relance |
| `POST /api/interne/missions/:id/escalade` | Enregistre une escalade (après 3 relances) |

Protection : en-tête `X-Service-Token` égal à `INTERNAL_SERVICE_TOKEN`, en plus des routes métier protégées par JWT.

## Points à valider avec le dev

1. Écriture des `EvenementMission` dans `missions.service.ts` et `propositions.service.ts`.
2. Effet métier d'une relance : recalcul du classement et nouvelles propositions ?
3. Nommage des en-têtes et du préfixe de routes `/api/interne`.
