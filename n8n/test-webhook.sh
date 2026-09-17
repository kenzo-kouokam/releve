#!/usr/bin/env bash
# Envoie un evenement fictif, signe comme le fera l'API, au webhook de n8n.
#
#   ./n8n/test-webhook.sh                      -> proposition.envoyee sur l'URL de test
#   ./n8n/test-webhook.sh mission.pourvue prod -> mission.pourvue sur l'URL de production
#   FAUSSE_SIGNATURE=1 ./n8n/test-webhook.sh  -> signature volontairement fausse (doit etre rejetee)
#   ./n8n/test-webhook.sh mission.publiee      -> mission urgente : alerte aux candidats eligibles
#   URGENTE=0 ./n8n/test-webhook.sh mission.publiee -> mission non urgente : aucune alerte
#
# L'URL de test ne repond que lorsque « Execute workflow » est actif dans l'editeur.
set -euo pipefail

EVENEMENT="${1:-proposition.envoyee}"
CIBLE="${2:-test}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

SECRET="$(sed -n 's/^N8N_WEBHOOK_SECRET="\(.*\)"$/\1/p' "$RACINE/backend/.env")"
if [ -z "$SECRET" ]; then
  echo "N8N_WEBHOOK_SECRET absent de backend/.env" >&2
  exit 1
fi

if [ "$CIBLE" = "prod" ]; then
  URL="http://localhost:5678/webhook/releve/evenements"
else
  URL="http://localhost:5678/webhook-test/releve/evenements"
fi

# Pour une cloture, l'API joint le candidat retenu et les candidats a prevenir
# (adresses fictives : en local, Mailpit intercepte tout).
EXTRA=""
case "$EVENEMENT" in
  mission.pourvue|mission.annulee)
    EXTRA=',"candidatRetenu":"CAN-7F3A2C","candidatsAPrevenir":[{"candidatRef":"CAN-19B0E4","prenom":"Sophie","email":"sophie.test@example.org"},{"candidatRef":"CAN-5D21A8","prenom":"Karim","email":"karim.test@example.org"}]'
    ;;
  mission.publiee)
    # URGENTE=0 simule une mission qui demarre dans plus de 48 h (aucune alerte).
    URG="true"; [ "${URGENTE:-1}" = "0" ] && URG="false"
    EXTRA=',"candidatsEligibles":[{"candidatRef":"CAN-19B0E4","prenom":"Sophie","email":"sophie.test@example.org","notificationsEmail":true},{"candidatRef":"CAN-5D21A8","prenom":"Karim","email":"karim.test@example.org","notificationsEmail":true},{"candidatRef":"CAN-0A77F1","prenom":"Ines","email":"ines.test@example.org","notificationsEmail":false}]'
    ;;
esac

LIVRAISON="$(uuidgen | tr 'A-Z' 'a-z')"
MAINTENANT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CORPS=$(cat <<JSON
{"event":"$EVENEMENT","occurredAt":"$MAINTENANT","deliveryId":"$LIVRAISON","mission":{"id":"00000000-0000-4000-8000-000000000042","reference":"MIS-2026-0042","filiere":"DOMICILE","qualification":"AES","commune":"Nantes","departement":"44","dateDebut":"2026-09-23","dateFin":"2026-09-23","heureDebut":"07:00","heureFin":"09:00","tauxHoraire":13.5,"urgente":${URG:-false},"lienApp":"http://localhost:3000/missions/00000000-0000-4000-8000-000000000042"},"propositions":[{"id":"00000000-0000-4000-8000-0000000000a1","candidatRef":"CAN-7F3A2C","score":87.5},{"id":"00000000-0000-4000-8000-0000000000a2","candidatRef":"CAN-19B0E4","score":74.0}]$EXTRA}
JSON
)

SIGNATURE="sha256=$(printf '%s' "$CORPS" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"
if [ "${FAUSSE_SIGNATURE:-0}" = "1" ]; then
  SIGNATURE="sha256=0000000000000000000000000000000000000000000000000000000000000000"
fi

echo "-> $EVENEMENT vers $URL"
curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Releve-Event: $EVENEMENT" \
  -H "X-Releve-Delivery: $LIVRAISON" \
  -H "X-Releve-Signature: $SIGNATURE" \
  --data-raw "$CORPS"
echo
