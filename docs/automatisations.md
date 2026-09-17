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
| Candidat | **Alerte urgente** : mission éligible qui démarre dans moins de 48 h, envoyée tout de suite, 3 par jour au plus, désactivable (préférence « notifications e-mail ») | E-mail (Mailpit) | SMS ou notification push | n8n — WF1 |
| Candidat | **Mission pourvue ou annulée**, pour les seuls candidats ayant une proposition en cours sur la mission | E-mail (Mailpit) | E-mail ou push | n8n — WF1 |
| Candidat | **Confirmation de mission** (mentions obligatoires), e-mail transactionnel envoyé quelle que soit la préférence | E-mail (Mailpit) | E-mail | n8n — WF3 |
| Agence | Propositions, acceptations, missions pourvues ou annulées | Slack `#missions-proposees` | Slack / Teams | n8n — WF1 |
| Agence | Relances des missions non pourvues, escalade à la 3e | Slack `#agence-relances` | Slack / Teams | n8n — WF2 |
| Agence (tech) | Erreurs des workflows | Slack `#ops` | Slack / Teams | n8n |

Pourquoi deux rythmes pour le candidat : le récapitulatif sert à **découvrir** des missions sans saturer la boîte ; l'alerte sert l'**urgence** (un remplacement du jour ne peut pas attendre le lendemain).

## Workflows prévus

| Workflow | Déclencheur | Rôle | Priorité |
|---|---|---|---|
| WF1 — Alertes | Webhook `mission.publiee` (urgente), `proposition.envoyee`, `proposition.acceptee`, `mission.pourvue`, `mission.annulee` | Alerte e-mail aux candidats éligibles pour une mission urgente ; suivi en temps réel pour l'agence sur Slack ; e-mail de clôture aux candidats en cours | MUST |
| WF2 — Relance des missions non pourvues | Planification (15 min ; 1 min en démo) | Relancer une mission ouverte au-delà du seuil, escalade après 3 relances | MUST |
| WF3 — Confirmation de mission | Webhook `mission.pourvue` | E-mail de confirmation au candidat retenu depuis un template, puis ligne « confirmation envoyée » sur Slack pour l'agence | MUST |

Un même événement peut déclencher plusieurs workflows : `mission.pourvue` met à jour le message Slack de l'agence et prévient les autres candidats (WF1), et déclenche la confirmation du candidat retenu (WF3).

Pour `mission.publiee`, l'API joint à l'événement les candidats éligibles (calculés par le service de matching) et un indicateur `urgente` (début dans moins de 48 h) :

```json
"mission": { "...": "...", "urgente": true },
"candidatsEligibles": [
  { "candidatRef": "CAN-19B0E4", "prenom": "Sophie", "email": "sophie@exemple.fr", "notificationsEmail": true }
]
```

Pour `mission.pourvue` et `mission.annulee`, elle joint `candidatRetenu` et `candidatsAPrevenir` (mêmes champs, sans `notificationsEmail`).

**Plafond anti-spam** : n8n incrémente dans Redis un compteur `n8n:alertes:<candidatRef>:<AAAA-MM-JJ>` (expiration 48 h) avant chaque alerte, et n'envoie pas au-delà de 3 par jour. Les candidats dont `notificationsEmail` vaut `false` ne reçoivent aucune alerte.

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

## Données personnelles

- Aucun nom, e-mail, téléphone ni adresse ne sort vers Slack ou Airtable. n8n, hébergé avec l'application, reçoit l'adresse e-mail des seuls candidats à prévenir, pour l'envoi.
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
