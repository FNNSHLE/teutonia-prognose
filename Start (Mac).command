#!/bin/bash
# Teutonia Prognose: holt Spielplan, Tabelle, Aufstellungen und Liveticker von handball.net und öffnet die App.
cd "$(dirname "$0")"
TEAM_ID=$(grep -o '[0-9]*' daten/team_id.txt 2>/dev/null | head -1)
[ -z "$TEAM_ID" ] && TEAM_ID=86088
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
REF="https://www.handball.net/team/$TEAM_ID"
TMP=$(mktemp -d)
mkdir -p daten/cache

hole_token() {
  curl -sfL --max-time 30 -A "$UA" "$REF" -o "$TMP/team.html" || return 1
  TOKEN=$(grep -o 'name="client-token" content="[^"]*"' "$TMP/team.html" | head -1 | sed 's/.*content="//;s/"$//')
  [ -n "$TOKEN" ]
}
# api <pfad> <zieldatei>: holt einen Endpunkt, bei abgelaufenem Token einmal mit neuem Token
api() {
  for versuch in 1 2; do
    if curl -sf --max-time 30 -A "$UA" -H "x-client-token: $TOKEN" -H "Referer: $REF" \
         "https://www.handball.net/api/new/$1" -o "$2" && ! grep -q '^{"error"' "$2"; then return 0; fi
    hole_token || return 1
  done
  return 1
}

echo "Hole aktuelle Daten von handball.net (Team $TEAM_ID) ..."
ok=0
if hole_token; then
  PHASE=$(grep -o "team/$TEAM_ID?season_id=[0-9]*&amp;phaseId=[0-9]*" "$TMP/team.html" | head -1 | sed 's/.*phaseId=//')
  if [ -n "$PHASE" ]; then
    printf 'window.HB_DATA = {"teamId": %s, "phaseId": %s, "fetchedAt": "%s", "pages": []};\n' "$TEAM_ID" "$PHASE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TMP/daten.js"
    page=1; ok=1
    while [ $page -le 20 ]; do
      if ! api "matches?phase_id=$PHASE&per_page=100&page=$page" "$TMP/p.json" || ! grep -q '"success":true' "$TMP/p.json"; then ok=0; break; fi
      { printf 'window.HB_DATA.pages.push('; cat "$TMP/p.json"; printf ');\n'; } >> "$TMP/daten.js"
      cat "$TMP/p.json" >> "$TMP/alle.json"
      grep -q "\"last_page\":$page[,}]" "$TMP/p.json" && break
      page=$((page+1))
    done
    if [ $ok = 1 ]; then
      if api "standings?phase_id=$PHASE" "$TMP/st.json"; then
        { printf 'window.HB_DATA.standings = '; cat "$TMP/st.json"; printf ';\n'; } >> "$TMP/daten.js"
      fi
      mv "$TMP/daten.js" daten/daten.js

      # Aufstellungen und Liveticker der gespielten Spiele (einmal holen, dann aus dem Zwischenspeicher)
      GRENZE=$(date -u -v-7d +%Y-%m-%d)
      grep -o '{"id":[0-9]*,"code":"[^"]*","parent_match_id":[^,]*,"round":[0-9]*,"order":[0-9]*,"date":"[^"]*","status":{"id":[0-9]*,"name":"[^"]*","short_name":"FIN"' "$TMP/alle.json" \
        | sed -E 's/^\{"id":([0-9]+).*"date":"([0-9-]{10}).*$/\1 \2/' > "$TMP/ids.txt"
      neu=0
      while read -r MID TAG; do
        if [ ! -s "daten/cache/${MID}_l.json" ] || [ ! -s "daten/cache/${MID}_e.json" ] || [[ "$TAG" > "$GRENZE" ]]; then
          api "matches/$MID/lineups" "$TMP/l.json" && grep -q '"success":true' "$TMP/l.json" && mv "$TMP/l.json" "daten/cache/${MID}_l.json"
          api "matches/$MID/events" "$TMP/e.json" && grep -q '"data":\[' "$TMP/e.json" && mv "$TMP/e.json" "daten/cache/${MID}_e.json"
          neu=$((neu+1)); printf '.'
        fi
      done < "$TMP/ids.txt"
      [ $neu -gt 0 ] && echo " $neu Spielberichte geladen."
    fi
  fi
fi

# Spielberichte für die App bündeln
{ echo 'window.HB_DETAILS = {};'
  for f in daten/cache/*_l.json; do
    [ -e "$f" ] || continue
    MID=$(basename "$f" _l.json)
    printf 'window.HB_DETAILS[%s] = {"l": ' "$MID"; cat "$f"
    printf ', "e": '; if [ -s "daten/cache/${MID}_e.json" ]; then cat "daten/cache/${MID}_e.json"; else printf 'null'; fi
    printf '};\n'
  done; } > daten/spielberichte.js

# Torhüterinnen-Erfassungen (daten/torwart/*.json, Schema daten/torwart/schema.json) für die App bündeln
{ printf 'window.HB_TORWART = {"goalkeepers": '
  if [ -s daten/torwart/goalkeepers.json ]; then cat daten/torwart/goalkeepers.json; else printf '{}'; fi
  printf ', "records": ['; erst=1
  for f in daten/torwart/torwart-*.json; do
    [ -e "$f" ] || continue
    [ $erst = 1 ] || printf ','; erst=0; cat "$f"
  done; printf ']};\n'; } > daten/torwart.js

# Spielerinnenfotos des eigenen Teams (nur mit Zustimmung, siehe scripts/fotos.sh)
bash scripts/fotos.sh || true

# Browser-Cache umgehen: Datenstand als Versionsmerkmal in die Seite schreiben
sed -i '' -E "s/\\?t=[0-9]+/?t=$(date +%s)/g" app/index.html

rm -rf "$TMP"
if [ $ok = 1 ]; then echo "Daten aktualisiert."; else echo "Kein Abruf möglich, die App zeigt den letzten gespeicherten Stand."; fi
open "app/index.html"
