#!/usr/bin/env bash
# Demonstration en direct des automatisations (WF1, WF2, WF3).
#
# Chaque scenario joue le vrai parcours contre l'API locale, pas a pas : le
# script s'arrete apres chaque action et dit ou regarder (Slack, Mailpit,
# Airtable, n8n). Entree pour passer a l'etape suivante.
#
#   ./n8n/demo-live.sh parcours     publication urgente -> proposition -> acceptation -> validation
#   ./n8n/demo-live.sh annulation   publication -> proposition a 2 candidats -> annulation
#   ./n8n/demo-live.sh plafond      4 alertes urgentes le meme jour : la 4e est bloquee
#   ./n8n/demo-live.sh signature    un appel non signe est rejete
#   ./n8n/demo-live.sh relance      mode d'emploi de la demonstration WF2
#   ./n8n/demo-live.sh nettoyer     efface les missions de test (M-2026-*) avant une repetition
#
# Prerequis : pnpm infra:up, API sur :3001, base semee, WF1/WF2/WF3 publies.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
API="http://localhost:3001/api"
MOT_DE_PASSE="Releve2026!"

pause() { printf '\n\033[1;36m👉 %s\033[0m\n' "$1"; read -r -p "   [Entrée pour continuer] " _; }
titre() { printf '\n\033[1;33m━━ %s ━━\033[0m\n' "$1"; }
sql() { docker exec passerelle-db psql -U passerelle -d passerelle -Atc "$1"; }
champ() { python3 -c "import json,sys; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(d.get('$1',''))"; }

jeton() {
  curl -sf "$API/auth/connexion" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"motDePasse\":\"$MOT_DE_PASSE\"}" | champ jeton
}

# Identifiants lus dans la base : ils different d'un poste a l'autre.
preparer() {
  LIEU=$(sql "select \"lieuId\" from mission where reference='DEMO-2026-0001';")
  DEAES=$(sql "select id from qualification where code='DEAES';")
  SOPHIE=$(sql "select id from candidat where email='sophie.marchand@example.org';")
  NADIA=$(sql "select id from candidat where email='nadia.benali@example.org';")
  EHPAD=$(jeton secteur@les-tilleuls.example)
  AGENCE=$(jeton charge@releve.example)
  CANDIDATE=$(jeton sophie.marchand@example.org)
}

publier() { # $1 = decalage en jours de la date de debut
  local debut
  debut=$(date -v+"$1"d +%Y-%m-%d 2>/dev/null || date -d "+$1 days" +%Y-%m-%d)
  local reponse
  reponse=$(curl -s "$API/missions" -H "Authorization: Bearer $EHPAD" -H 'Content-Type: application/json' \
    -d "{\"lieuId\":\"$LIEU\",\"qualificationRequiseId\":\"$DEAES\",\"dateDebut\":\"$debut\",\"dateFin\":\"$debut\",\"heureDebut\":\"07:00\",\"heureFin\":\"12:00\",\"motifRecours\":\"Remplacement d'un salarie absent\",\"tauxHoraire\":13.5}")
  MISSION=$(echo "$reponse" | champ id)
  REFERENCE=$(echo "$reponse" | champ reference)
  echo "   Mission $REFERENCE creee, debut le $debut"
}

proposer() { # $@ = identifiants candidats
  local ids
  ids=$(printf '"%s",' "$@"); ids="[${ids%,}]"
  local reponse
  reponse=$(curl -s "$API/missions/$MISSION/propositions" -H "Authorization: Bearer $AGENCE" \
    -H 'Content-Type: application/json' -d "{\"candidatIds\":$ids}")
  echo "$reponse" | grep -q '"statut":"ENVOYEE"' || { echo "   ⚠️  $reponse"; exit 1; }
  PROPOSITION_SOPHIE=$(sql "select id from proposition where \"missionId\"='$MISSION' and \"candidatId\"='$SOPHIE';")
  echo "   $# proposition(s) envoyee(s)"
}

case "${1:-}" in
  parcours)
    preparer
    titre "1/4 · L'EHPAD publie une mission qui demarre demain (urgente)"
    publier 1
    pause "WF1 → e-mail « Une mission à pourvoir rapidement » aux candidats éligibles (Mailpit :8025) · Airtable : ligne urgente / ENVOYE"
    titre "2/4 · L'agence propose Sophie et Nadia"
    proposer "$SOPHIE" "$NADIA"
    pause "WF1 → Slack #missions-proposees : « 🔔 2 candidat(s) proposé(s) » · Airtable : ligne suivi / Slack agence"
    titre "3/4 · Sophie accepte depuis son espace"
    curl -s -X POST "$API/propositions/$PROPOSITION_SOPHIE/accepter" -H "Authorization: Bearer $CANDIDATE" | champ statut
    pause "WF1 → Slack : « ✅ CAN-… a accepté » · Airtable : ligne proposition.acceptee"
    titre "4/4 · L'EHPAD valide Sophie"
    curl -s -X POST "$API/propositions/$PROPOSITION_SOPHIE/valider" -H "Authorization: Bearer $EHPAD" | champ statut
    pause "WF1 → le message Slack devient « ✅ Mission pourvue » · WF3 → Sophie reçoit « Votre mission est confirmée » + Slack « 📄 Confirmation envoyée » · Airtable : ligne confirmation. Nadia n'a pas de compte vérifié : l'API l'écarte, pas d'e-mail de clôture (voulu)"
    ;;

  annulation)
    preparer
    titre "1/3 · L'EHPAD publie une mission dans 10 jours (pas urgente)"
    publier 10
    pause "WF1 → aucun e-mail : la mission n'est pas urgente (début > 48 h)"
    titre "2/3 · L'agence propose Sophie et Nadia"
    proposer "$SOPHIE" "$NADIA"
    pause "WF1 → Slack #missions-proposees : « 🔔 2 candidat(s) proposé(s) »"
    titre "3/3 · L'EHPAD annule la mission"
    curl -s -X POST "$API/missions/$MISSION/annuler" -H "Authorization: Bearer $EHPAD" | champ statut
    pause "WF1 → le message Slack devient « ❌ Mission annulée » · Sophie reçoit « Mission annulée » (Nadia, sans compte, est écartée) · WF3 ne part PAS · Airtable : ligne cloture"
    ;;

  plafond)
    titre "4 alertes urgentes le meme jour pour les memes candidats (evenements fictifs)"
    for ref in CAN-19B0E4 CAN-5D21A8 CAN-0A77F1; do
      docker exec passerelle-redis redis-cli DEL "n8n:alertes:$ref:$(date +%Y-%m-%d)" >/dev/null
    done
    for i in 1 2 3 4; do
      echo "   Alerte $i/4"; "$RACINE/n8n/test-webhook.sh" mission.publiee prod >/dev/null; sleep 3
    done
    pause "Airtable : 3 lignes urgente, puis 3 lignes PLAFOND (une par candidat bloqué) · Slack #ops : échec API attendu (mission fictive inconnue de l'API)"
    ;;

  signature)
    titre "Un appel avec une fausse signature"
    FAUSSE_SIGNATURE=1 "$RACINE/n8n/test-webhook.sh" proposition.envoyee prod
    pause "n8n → Executions de WF1 : exécution en erreur « Rejet : signature invalide » · rien dans Slack, Mailpit ni Airtable"
    ;;

  relance)
    cat <<'TXT'
WF2 tourne seul toutes les 15 minutes. Pour le montrer en direct :
  1. backend/.env : RELANCE_SEUIL_MIN=1   puis   pnpm infra:up
  2. n8n → WF2 → bouton « Execute workflow »
     → Slack #agence-relances : « ⏰ Relance 1/3 » par mission ouverte · Airtable Relances : lignes Relance
  3. Attendre 1 minute, relancer : 2/3, puis 3/3
  4. 4e passage : « 🚨 @here Escalade » · Airtable : lignes Escalade
  5. Remettre RELANCE_SEUIL_MIN=1440 puis pnpm infra:up
TXT
    ;;

  nettoyer)
    # Base LOCALE uniquement. Sophie est le seul compte candidat de demonstration :
    # chaque repetition la retient sur une date, et une candidate deja retenue ne
    # peut plus etre proposee sur la meme periode. On annule donc les missions
    # creees par les repetitions precedentes (M-2026-*), jamais celles du seed (DEMO-*).
    titre "Remise a zero des missions de test"
    sql "update proposition set statut='EXPIREE' where \"missionId\" in (select id from mission where reference like 'M-2026-%') and statut in ('ENVOYEE','ACCEPTEE_CANDIDAT');" >/dev/null
    sql "update mission set statut='ANNULEE', \"candidatRetenuId\"=null where reference like 'M-2026-%';" | sed 's/^/   /'
    for cle in $(docker exec passerelle-redis redis-cli --scan --pattern 'n8n:alertes:*'); do
      docker exec passerelle-redis redis-cli DEL "$cle" >/dev/null
    done
    echo "   Missions de test annulees, compteurs d'alertes remis a zero."
    ;;

  *)
    sed -n '4,14p' "$0"; exit 1 ;;
esac
