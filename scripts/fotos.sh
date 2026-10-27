#!/usr/bin/env bash
# Spielerinnenfotos nur für das eigene Team (daten/team_id.txt) aus den Spielberichten in daten/cache/.
# Die Fotos liegen bei Handball 360 (photo_url in den Aufstellungen). Nur das eigene Team hat der Nutzung
# zugestimmt, deshalb lädt dieses Skript ausschließlich dessen Spielerinnen (ohne Staff) und nie Gegnerinnen.
# Ergebnis: daten/fotos/<spielerinId>.jpg (klein, 128 px) und daten/fotos.js mit window.HB_FOTOS.
# Aufruf aus abruf.sh und Start (Mac).command; die Windows-Version steht in app/abruf.ps1.
set -u
cd "$(dirname "$0")/.."
TEAM_ID=$(grep -o '[0-9]*' daten/team_id.txt 2>/dev/null | head -1)
[ -z "$TEAM_ID" ] && TEAM_ID=86088
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
mkdir -p daten/fotos
QUELLEN=daten/fotos/quellen.txt   # "<spielerinId> <photo_url>" je Zeile, damit nur geänderte Fotos neu geladen werden
touch "$QUELLEN"
TMP=$(mktemp -d)

# Spielerinnen des eigenen Teams sammeln: der Aufstellungsblock vor "visitor" ist das Heimteam, danach der Gast.
for f in daten/cache/*_l.json; do
  [ -e "$f" ] || continue
  heim=$(sed 's/"visitor":{"team".*//' "$f")
  gast=$(sed -n 's/.*\("visitor":{"team".*\)/\1/p' "$f")
  for block in "$heim" "$gast"; do
    printf '%s' "$block" | grep -q "^[^[]*\"team\":{\"id\":$TEAM_ID," || continue
    printf '%s' "$block" | grep -oE '"player":\{"id":"[^"]*","first_name":"[^"]*","last_name":"[^"]*","photo_url":"https://[^"]*"\},"number":[^,]*,"role":\{[^}]*\},"is_staff":false' \
      | sed -E 's/^"player":\{"id":"([^"]*)".*"photo_url":"([^"]*)".*$/\1 \2/'
  done
done | sort -u -k1,1 > "$TMP/liste.txt"

verkleinere() {
  if command -v magick >/dev/null 2>&1; then magick "$1" -resize 128x128^ -gravity center -extent 128x128 -strip -quality 82 "$1"
  elif command -v convert >/dev/null 2>&1; then convert "$1" -resize 128x128^ -gravity center -extent 128x128 -strip -quality 82 "$1"
  elif command -v sips >/dev/null 2>&1; then sips -Z 128 "$1" >/dev/null 2>&1
  fi
  return 0
}

neu=0
while read -r PID URL; do
  case "$PID" in *[!A-Za-z0-9]*|'') continue ;; esac
  ZIEL="daten/fotos/$PID.jpg"
  if [ -s "$ZIEL" ] && grep -qxF "$PID $URL" "$QUELLEN"; then continue; fi
  if curl -sfL --max-time 30 -A "$UA" "$URL" -o "$TMP/bild" && [ -s "$TMP/bild" ] && head -c 3 "$TMP/bild" | od -An -tx1 | grep -q 'ff d8 ff'; then
    mv "$TMP/bild" "$ZIEL"; verkleinere "$ZIEL"
    grep -v "^$PID " "$QUELLEN" > "$TMP/q" ; echo "$PID $URL" >> "$TMP/q"; sort "$TMP/q" > "$QUELLEN"
    neu=$((neu+1))
  fi
done < "$TMP/liste.txt"

# Für die App: Spielerin -> Kurzkennung der Quelle (wechselt das Foto, wechselt die Kennung und damit der Cache).
{ printf 'window.HB_FOTOS = {'; erst=1
  while read -r PID URL; do
    [ -s "daten/fotos/$PID.jpg" ] || continue
    K=$(printf '%s' "$URL" | sed -E 's/.*_([0-9a-f]+)\.[a-z]+$/\1/' | tail -c 9)
    [ $erst = 1 ] || printf ','; erst=0; printf '"%s":"%s"' "$PID" "$K"
  done < "$QUELLEN"; printf '};\n'; } > daten/fotos.js

rm -rf "$TMP"
echo "$neu Fotos geladen."
exit 0
