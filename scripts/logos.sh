#!/usr/bin/env bash
# Teamlogos der Liga (club.logo aus daten/daten.js, gehostet bei Handball 360) lokal speichern.
# Das Ergebnis-Bild in der App zeichnet sie auf ein Canvas; fremd gehostete Bilder würden das Canvas sperren,
# deshalb liegen sie hier unter daten/logos/<teamId>.jpg (256 px). Dazu daten/logos.js mit window.HB_LOGOS.
# Aufruf aus abruf.sh und Start (Mac).command.
set -u
cd "$(dirname "$0")/.."
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
mkdir -p daten/logos
QUELLEN=daten/logos/quellen.txt
touch "$QUELLEN"
TMP=$(mktemp -d)

grep -oE '"id":[0-9]+,"name":"[^"]*","club":\{"id":"[^"]*","name":"[^"]*","logo":"https://[^"]*"' daten/daten.js 2>/dev/null \
  | sed -E 's/^"id":([0-9]+).*"logo":"([^"]*)"$/\1 \2/' | sort -u -k1,1 > "$TMP/liste.txt"

verkleinere() {
  if command -v magick >/dev/null 2>&1; then magick "$1" -resize 256x256 -strip -quality 88 "$1"
  elif command -v convert >/dev/null 2>&1; then convert "$1" -resize 256x256 -strip -quality 88 "$1"
  elif command -v sips >/dev/null 2>&1; then sips -Z 256 "$1" >/dev/null 2>&1
  fi
  return 0
}

neu=0
while read -r TID URL; do
  case "$TID" in *[!0-9]*|'') continue ;; esac
  ZIEL="daten/logos/$TID.jpg"
  if [ -s "$ZIEL" ] && grep -qxF "$TID $URL" "$QUELLEN"; then continue; fi
  if curl -sfL --max-time 30 -A "$UA" "$URL" -o "$TMP/bild" && [ -s "$TMP/bild" ]; then
    # PNG oder JPEG in JPEG umwandeln (weißer Hintergrund), damit die Endung stimmt
    if command -v convert >/dev/null 2>&1; then convert "$TMP/bild" -background white -flatten "$TMP/bild.jpg" && mv "$TMP/bild.jpg" "$TMP/bild"; fi
    mv "$TMP/bild" "$ZIEL"; verkleinere "$ZIEL"
    grep -v "^$TID " "$QUELLEN" > "$TMP/q"; echo "$TID $URL" >> "$TMP/q"; sort "$TMP/q" > "$QUELLEN"
    neu=$((neu+1))
  fi
done < "$TMP/liste.txt"

{ printf 'window.HB_LOGOS = {'; erst=1
  while read -r TID URL; do
    [ -s "daten/logos/$TID.jpg" ] || continue
    K=$(printf '%s' "$URL" | sed -E 's/.*_([0-9a-f]+)\.[a-z]+$/\1/' | tail -c 9)
    [ $erst = 1 ] || printf ','; erst=0; printf '"%s":"%s"' "$TID" "$K"
  done < "$QUELLEN"; printf '};\n'; } > daten/logos.js

rm -rf "$TMP"
echo "$neu Logos geladen."
exit 0
