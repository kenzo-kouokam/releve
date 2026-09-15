# Automatisations — contrat d'événements (brouillon)

> Statut : **brouillon à valider avec le dev** avant implémentation.
> Périmètre : les workflows n8n exigés par le sujet (au moins deux) et leurs échanges avec l'API.

## Vue d'ensemble

```
API Relève ──(webhook signé HMAC)──▶ n8n ──▶ Discord (notifications)
     ▲                                 │
     └──(GET/POST /api/interne/*, jeton de service)◀┘──▶ Airtable (base tampon)
```

- L'API reste la source de vérité. n8n ne modifie jamais la base directement : il passe par des routes internes.
- Si n8n est indisponible, le métier continue. L'émission est réessayée, puis l'échec est journalisé.

## Workflows prévus

| Workflow | Déclencheur | Rôle | Priorité |
|---|---|---|---|
| WF1 — Cycle de notification | Webhook `proposition.envoyee`, `mission.pourvue`, `mission.annulee` | Notifier les candidats proposés, puis clôturer les autres | MUST |
| WF2 — Relance des missions non pourvues | Planification (15 min ; 1 min en démo) | Relancer une mission ouverte au-delà du seuil, escalade après 3 relances | MUST |
| WF3 — Confirmation de mission | Webhook `mission.pourvue` | Générer une confirmation depuis un template | SHOULD |

## Événements émis par l'API

| Événement | Transition métier | Consommé par |
|---|---|---|
| `mission.publiee` | `BROUILLON` → `PUBLIEE` | Journal, KPI |
| `proposition.envoyee` | Création d'une `Proposition` (`ENVOYEE`) | WF1 |
| `proposition.acceptee` | `ACCEPTEE_CANDIDAT` | WF1 |
| `mission.pourvue` | Mission → `VALIDEE` | WF1, WF3 |
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

## Données personnelles

- Aucun nom, e-mail, téléphone ni adresse ne sort vers n8n, Discord ou Airtable.
- Le candidat est désigné par une référence pseudonyme `CAN-XXXXXX`, dérivée de son identifiant par HMAC.
- Discord et Airtable sont hébergés hors UE : cette minimisation est la condition de leur usage.

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
