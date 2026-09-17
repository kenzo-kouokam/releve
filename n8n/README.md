# Workflows n8n

Exports des automatisations de Relève (livrable « Workflows no-code »).

| Fichier | Workflow | Statut |
|---|---|---|
| `wf1-notification.json` | Cycle de notification des candidats proposés | En cours : webhook, vérification HMAC et aiguillage faits ; Slack et Airtable à brancher |
| `wf2-relance.json` | Relance des missions non pourvues + escalade | À venir |

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

À l'import, le nœud « Calcul signature HMAC » demande un credential **Crypto** : son champ *Hmac Secret* reçoit la valeur de `N8N_WEBHOOK_SECRET` du `backend/.env`.

## Exporter / importer

```bash
docker exec passerelle-n8n n8n export:workflow --all --separate --output=/home/node/workflows/
docker exec passerelle-n8n n8n import:workflow --separate --input=/home/node/workflows/
```
