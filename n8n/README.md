# Workflows n8n

Exports des automatisations de Relève (livrable « Workflows no-code »).

| Fichier | Workflow | Statut |
|---|---|---|
| `wf1-notification.json` | Alertes : e-mail urgent aux candidats éligibles, e-mail de clôture, suivi Slack de l'agence | ✅ Signature, aiguillage, alerte urgente (3/jour, Redis), clôture, Slack agence, journal Airtable (Notifications) |
| `wf2-relance.json` | Relance des missions non pourvues + escalade | ✅ Planification, relance, escalade à la 3e, alertes Slack, journal Airtable (Relances) |
| `wf3-confirmation.json` | Confirmation de mission au candidat retenu | ✅ Appelé par WF1 à la validation, courriel via l'API + ligne Slack, journal Airtable (Notifications) |

Contrat d'échange avec l'API : [`docs/automatisations.md`](../docs/automatisations.md).

## Lancer n8n

```bash
pnpm infra:up                  # démarre aussi n8n sur http://localhost:5678
```

Au premier lancement, n8n demande de créer un compte propriétaire **local** : il reste dans le volume Docker `n8n_data` et ne sort pas de la machine.

Les secrets (`N8N_WEBHOOK_SECRET`, `INTERNAL_SERVICE_TOKEN`) sont lus dans `backend/.env` et transmis au conteneur par `docker compose --env-file`. Le jeton bot Slack et le jeton Airtable se saisissent dans les **credentials** n8n : ils ne figurent jamais dans les exports.

## Tester sans l'API

`test-webhook.sh` envoie un événement fictif signé comme le fera l'API :

```bash
./n8n/test-webhook.sh                         # proposition.envoyee, URL de test
./n8n/test-webhook.sh mission.pourvue         # autre type d'événement
./n8n/test-webhook.sh mission.pourvue prod    # URL de production (workflow publié)
FAUSSE_SIGNATURE=1 ./n8n/test-webhook.sh      # doit être rejeté
```

L'URL de test ne répond que pendant un « Execute workflow » dans l'éditeur, et pour un seul appel.

Credentials à recréer après import (aucun n'est exporté) :

| Credential | Type | Valeurs en local |
|---|---|---|
| Crypto account | Crypto | *Hmac Secret* = `N8N_WEBHOOK_SECRET` du `backend/.env` |
| Mailpit (local) | SMTP | hôte `mailpit`, port `1025`, sans utilisateur ni mot de passe, SSL désactivé |
| Redis (local) | Redis | hôte `redis`, port `6379`, base `0`, sans mot de passe |
| Slack — Relève | Slack API | jeton bot `xoxb-…` de l'app Slack « Releve » (scopes `chat:write`, `chat:write.public`) |
| Airtable — Relève | Airtable Token | Personal access token Airtable, scopes `data.records:read`, `data.records:write`, `schema.bases:read`, limité à la base « Relève — Tampon n8n » |

La base Airtable est désignée par `AIRTABLE_BASE_ID` dans `backend/.env` (identifiant `app…`, non secret). Sans elle, ou sans jeton, les workflows tournent normalement : seul le journal échoue, sans rien bloquer.

Le plafond de 3 alertes urgentes par jour s'appuie sur des compteurs Redis `n8n:alertes:<candidat>:<date>`, qui expirent au bout de 48 h.

## Demonstration en direct

`demo-live.sh` joue les parcours reels contre l'API locale, en s'arretant apres chaque
etape pour dire ou regarder (Slack, Mailpit, Airtable, n8n) :

```bash
./n8n/demo-live.sh parcours     # publication urgente -> proposition -> acceptation -> validation
./n8n/demo-live.sh annulation   # publication -> propositions -> annulation (WF3 ne part pas)
./n8n/demo-live.sh plafond      # 4 alertes le meme jour : la 4e est bloquee
./n8n/demo-live.sh signature    # un appel non signe est rejete
./n8n/demo-live.sh relance      # mode d'emploi de la demonstration WF2
./n8n/demo-live.sh nettoyer     # remise a zero avant une repetition
```

Sophie est le seul compte candidat verifie du seed : une fois retenue sur une date,
elle ne peut plus etre proposee sur la meme periode, d'ou `nettoyer` avant chaque
repetition. Laisser quelques secondes entre deux etapes : enchainees en moins d'une
seconde, WF1 n'a pas encore memorise le message Slack qu'il doit mettre a jour.

## Publication

WF1 et WF3 doivent être **publiés** pour fonctionner : WF1 écoute le webhook de production, et WF3 est appelé par WF1 (un workflow non publié ne peut pas être appelé). WF2 se publie quand on veut la planification automatique ; en démonstration, « Execute workflow » suffit.

## Mode démonstration

`RELANCE_SEUIL_MIN` (dans `backend/.env`, transmis au conteneur) fixe l'attente avant relance : `1440` en exploitation, `1` pour une démonstration. Après l'avoir changé :

```bash
pnpm infra:up      # recrée le conteneur n8n avec la nouvelle valeur
```

WF2 se déclenche seul toutes les 15 minutes une fois publié ; en démonstration, le bouton « Execute workflow » suffit.

## Exporter / importer

```bash
docker exec passerelle-n8n n8n export:workflow --all --separate --output=/home/node/workflows/
docker exec passerelle-n8n n8n import:workflow --separate --input=/home/node/workflows/
```
