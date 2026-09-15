# Workflows n8n

Exports des automatisations de Relève (livrable « Workflows no-code »).

| Fichier | Workflow | Statut |
|---|---|---|
| `wf1-notification.json` | Cycle de notification des candidats proposés | À venir |
| `wf2-relance.json` | Relance des missions non pourvues + escalade | À venir |

Contrat d'échange avec l'API : [`docs/automatisations.md`](../docs/automatisations.md).

## Lancer n8n

```bash
pnpm infra:up                  # démarre aussi n8n sur http://localhost:5678
```

Au premier lancement, n8n demande de créer un compte propriétaire **local** : il reste dans le volume Docker `n8n_data` et ne sort pas de la machine.

Les secrets (`N8N_WEBHOOK_SECRET`, `INTERNAL_SERVICE_TOKEN`) sont lus dans `backend/.env` et transmis au conteneur par `docker compose --env-file`. Les URL Discord et le jeton Airtable se saisissent dans les **credentials** n8n : ils ne figurent jamais dans les exports.

## Exporter / importer

```bash
docker exec passerelle-n8n n8n export:workflow --all --separate --output=/home/node/workflows/
docker exec passerelle-n8n n8n import:workflow --separate --input=/home/node/workflows/
```
