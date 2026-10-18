# CLAUDE.md

Orientation for working in this repository. Keep it current when the architecture, data flow or conventions change.

## What this is

**Anwurf** is a private fan project: a German-language handball prognosis web app for the women's team
**SC Teutonia 10** (handball.net team id 86088) in the *Bezirksoberliga Frauen Gruppe 2* of the Hamburg
handball federation. It computes win probabilities, a data-backed match plan for the coach, season
simulations and player statistics from public data on handball.net. Any team of the league can be selected
as focus; the own team is the default.

- Live: https://fnnshle.github.io/teutonia-prognose/ (GitHub Pages, served from `main`)
- Coach view: `app/index.html#trainerin` (shows per-player values, no access protection, only obscurity)
- User-facing readme: `LIESMICH.txt` (German, written for non-technical users)
- Not affiliated with SC Teutonia 10 or handball.net. Every page carries that disclaimer (`ABSENDER` in `app/app.js`).

## Repository layout

```
index.html                 Redirect + Open Graph metadata -> app/index.html
sw.js                      Service worker (offline cache). Must stay at the root, see "Vendored libraries and service worker"
README.md                  Developer readme with the to-do list
LIESMICH.txt               End-user readme (German)
abruf.sh                   Data fetch for CI and Linux/Mac (no browser opening)
Start (Mac).command        Same fetch as abruf.sh, then opens the app. Double-click entry for users.
Start (Windows).bat        Calls app/abruf.ps1
app/abruf.ps1              Windows port of the fetch (PowerShell, then opens the app)
app/index.html             Single page: all CSS (design tokens), DOM skeleton, script tags
app/lib/                   Vendored UMD builds of Preact, Preact hooks and htm + LIESMICH.txt (versions, URLs, sha256)
app/app.js                 UI, routing, rendering, data preparation (IIFE, ~1000 lines), registers sw.js at the end
app/modell.js              Team strength model, win probabilities, season simulation
app/spielerinnen.js        Player evaluation from match reports, lineup effects, match timelines
app/kennzahlen.js          Per-team metrics from live ticker (phases, 7m, suspensions, timeouts)
app/matchplan.js           Rule engine producing recommendations/findings for the next match + lineup optimiser
app/manifest.json, icons   PWA metadata
app/bilder/                Key visual, OG image, 3D icon
daten/team_id.txt          Focus team id (86088). League/phase is auto-detected from the team page.
daten/daten.js             Generated: window.HB_DATA (match list pages + standings)
daten/spielberichte.js     Generated: window.HB_DETAILS (lineups + events per finished match)
daten/cache/<id>_l.json    Raw lineups per match (handball.net response)
daten/cache/<id>_e.json    Raw live-ticker events per match
.github/workflows/daten.yml  Daily 05:00 UTC fetch, commits "Daten aktualisiert YYYY-MM-DD" as daten-bot
```

`Agency/` is git-ignored and referenced from a comment in `app/matchplan.js` (design/rule documents). It is
not in the repo and may not exist locally. Do not rely on it.

## Architecture in one paragraph

No build step, no package manager, no `package.json`, no tests. Plain HTML/CSS/JS, ES2018-ish, loaded as
classic scripts in a fixed order (see bottom of `app/index.html`): data files first, then the two vendored
libraries from `app/lib/` (Preact + hooks, htm), then `modell.js`, `spielerinnen.js`, `kennzahlen.js`,
`matchplan.js`, `app.js`. The module files define top-level functions and constants that `app.js` consumes
as globals. `app.js` wraps everything in an IIFE, prepares the data, fits the models once at load, and
renders pages as HTML strings into `#inhalt`. Every state change re-renders via `zeichne()`. The app works
from `file://` (the double-click launchers) and from GitHub Pages, where a service worker (`sw.js` at the
repository root) keeps it usable offline once it has been opened online.

## Vendored libraries and service worker

Pinned, unmodified UMD builds in `app/lib/`, file names carry the version; `app/lib/README.md` lists
source URL and sha256 for each. They define exactly three globals and nothing else:

| File | Version | Global |
| --- | --- | --- |
| `preact-10.29.2.umd.js` | Preact 10.29.2 | `window.preact` (`h`, `render`, `Component`, …) |
| `preact-hooks-10.29.2.umd.js` | Preact hooks 10.29.2 | `window.preactHooks` (`useState`, `useEffect`, …); reads `window.preact`, so it must load after Preact |
| `htm-3.1.1.umd.js` | htm 3.1.1 | `window.htm`; use as `const html = htm.bind(preact.h)` |

Verified with `node --check` and in a Node `vm` context loaded as classic scripts (no `module`/`define`).
When updating: add the new file with its version in the name, update `LIESMICH.txt`, the script tags in
`app/index.html` and the `SHELL` list in `sw.js`, bump `?v=`.

`sw.js` gotcha: a service worker's scope cannot exceed the directory of its script. The page lives under
`app/` but loads `../daten/daten.js` and `../daten/spielberichte.js`, so the worker **must stay at the
repository root** (`/teutonia-prognose/sw.js` on GitHub Pages) and is registered from `app.js` as
`navigator.serviceWorker.register('../sw.js')`. Registration only happens when `'serviceWorker' in
navigator` and the protocol is not `file:`, wrapped in try/catch; a failed registration never affects the
app. Strategy: precache the app shell on install (`SHELL` list), delete old caches on activate, `daten/`
network-first with cache fallback, everything else same-origin stale-while-revalidate, cross-origin
requests (team logos) untouched. Cache keys drop `?v=`/`?t=`, so a version bump still finds the cached
file while the network fetch stays cache-busted. Because of stale-while-revalidate, a visitor who is online
sees new code on the **second** load after a deploy. On `localhost` the worker is active too; use "Update
on reload" / "Bypass for network" in the browser devtools while developing.

## Data pipeline

1. The fetch scripts load `https://www.handball.net/team/<id>`, scrape the `client-token` meta tag and the
   current `phaseId` from the page, then call the undocumented API `https://www.handball.net/api/new/...`
   with headers `x-client-token` and `Referer`. A browser-like `User-Agent` is required.
2. Endpoints used: `matches?phase_id=&per_page=100&page=`, `standings?phase_id=`,
   `matches/<id>/lineups`, `matches/<id>/events`.
3. Lineups and events are cached in `daten/cache/`. Finished matches are re-fetched only if the cache is
   missing or the match is less than 7 days old (reports get corrected after the fact).
4. `daten/daten.js` and `daten/spielberichte.js` are rewritten as JS assignments to `window.*`, so the app
   needs no fetch at runtime and works offline and from `file://`.
5. The scripts also rewrite the `?t=<unix>` cache-buster on the two data script tags in `app/index.html`.
   Code files carry a manual `?v=N` version. **Bump `?v=` on every change to the app JS files**, otherwise
   GitHub Pages visitors keep the old code.
6. The GitHub Action commits `daten/` and `app/index.html` daily. Expect a data commit almost every day;
   rebase local work on top of it before pushing.

The three fetch scripts are near-duplicates (`abruf.sh`, `Start (Mac).command`, `app/abruf.ps1`). A logic
change must be applied to all three.

## Data shapes worth knowing

Match (from `HB_DATA.pages[].data[]`, normalised in `app.js` to `spiele[]`):
`{id, runde, datum: Date, terminOffen, heim, gast, toreHeim, toreGast, gewertet, urteil, offen, halle, adresse, lat, lon}`.
`gewertet` = finished with a score, `urteil` = finished without a score (decided off court), `offen` = not finished.
Team ids are numbers, player ids are short strings like `"0ikpy6y"`.

Lineup player (`HB_DETAILS[matchId].l.data.local|visitor.players[]`):
`player{id, first_name, last_name, photo_url}, number, goals, seven_meter_goals, seven_meter_attempts, two_minutes, sanctions{warning, disqualification}, is_staff, is_starter, is_goalkeeper, is_captain, minutes_played`.

Event (`HB_DETAILS[matchId].e.data[]`): `{minute "mm:ss", global_minute, block, event_type{id, name, is_goal, is_sanction}, player, team, is_home, score{local, visitor}, timestamp}`.
Event types seen so far: Tor (15), Siebenmeter Tor (39), Siebenmeter Fehlwurf (1004), Zwei Minuten (13),
Verwarnung (2), Disqualifikation (8), Auszeit (30), Spieler aufgestellt (40), Spieler aus der Aufstellung
entfernt (41), Schnelle Anmeldung (38), plus structural markers Startseite Teil (10000), Spielende (10001),
Teilende (10002). `block` is `" 1. Halbzeit"` (leading space), `"Halbzeitpause"`, `"2. Halbzeit"`, …

**Known gaps in the source data** (this drives the roadmap below):
- `is_goalkeeper` is `false` for every player in every report so far; `minutes_played` is always `null`;
  `is_starter` is unreliable. There are no saves, no shots against, no substitutions. Goalkeepers are
  invisible in the data, which is why the coach view asks to pin them manually ("Stecknadel").
- Missed field shots are not recorded, only goals and 7m misses. Defensive work is invisible.
- Match dates arrive as local Hamburg time with a bogus `+00:00` suffix. The app therefore reads the
  **UTC** components of `Date` objects for display (`zeit`, `tagKurz`, `tagLang` in `app.js`). Keep that
  convention; do not "fix" it to local time.
- A `T00:00:00` time means the kick-off is not scheduled yet (`terminOffen`).

## The models (short)

- `modell.js`: additive model `goals = mu + home + att[team] − def[opponent]`, fitted by iterated
  shrinkage (ridge-like, constants in `MODELL`). Goal difference ~ Normal(diff, sigma). Win/draw/loss via
  `normCdf` at ±0.5. Season simulation with a seeded PRNG so results are stable for a given data state;
  user-fixed outcomes (`fest`) and off-court bonus points are supported.
- `spielerinnen.js`: per player a "Torwirkung" (`einfluss`) in goals, blending shrunken goals-per-game with
  a with/without residual comparison; constants in `SPIELERIN`. `besetzungsEffekt()` converts a lineup
  into an expected-goal shift, `prognoseMitBesetzung()` turns it into probabilities. `ueblichDabei()`
  (played ≥ 50 % of games) defines the usual squad.
- `kennzahlen.js`: 10-minute phase splits, 7m stats, suspensions, timeouts, goal runs, per-player
  half-time split. League averages in `ligaKennzahlen()`.
- `matchplan.js`: rule ids AU1, AU2, AU5, AU6, AU7, DI1, DI2, PH1, PH2, GE1, GE2, GE3. Each rule has a
  priority `p` and minimum sample sizes. Output is capped (`MAX_EMPF`, `MAX_BEFUNDE`). The lineup
  optimiser picks up to `K = 14` players honouring availability and pins.
- Backtesting happens on the "Methodik" page: every played match is predicted with a model fitted only on
  earlier dates (`vorher` in `app.js`), reporting hit rate, average assigned probability and Brier score.

## App conventions

- **Everything is German**: identifiers, comments, UI copy, commit messages. Teams are women's teams, so
  the copy uses feminine forms (Spielerin, Trainerin, Torhüterin, Schützin). Keep that consistent.
- Typography helpers in `app.js`: `dez()`, `vz()`, `pct()`, `stand()`; narrow no-break space `NB`, real
  minus sign `MINUS` ("−"). Use them instead of ad-hoc formatting.
- Escape all data with `esc()` before putting it into HTML strings.
- Design tokens live at the top of `app/index.html` (light/dark via `prefers-color-scheme`). Reuse
  `modul()`, `kachel()`, `seitenkopf()`, `spielZeile()`, `tabelleHtml()` and the `ico()` icon set.
- Navigation: `BEREICHE` list in `app.js`; the mobile tab bar shows four of them plus "Mehr". Keys 1–8
  switch areas. Sheets (`<dialog id="sheet">`) show details for matches, teams and players.
- State in `localStorage` under `hbprog.*`: `bereich`, `fest`, `eigene`, `kader`, `intro`. Focus team is
  intentionally not persisted.
- `TRAINERIN` mode is toggled by `#trainerin` in the URL hash; it exposes player influence values, the
  lineup optimiser and influence overrides. Treat it as a privacy courtesy, not security.
- Printing: the Matchplan has a "Kabinenblatt" print layout (`body.druck-kabine`, `.nicht-druck`).
- `window.kurzname` is deliberately exported from `app.js` for `matchplan.js`. Avoid adding more globals
  in that direction; pass what the rule engine needs through its `ctx` argument.

## Working here

- Run locally: open `app/index.html` directly, or `python3 -m http.server` in the repo root and open
  `http://localhost:8000/app/`. Fresh data: `bash abruf.sh` (needs internet, rewrites `daten/` and the
  `?t=` stamps).
- Syntax check without a browser: `for f in app/*.js sw.js; do node --check "$f"; done`. There is no test suite;
  verify changes by loading the app and clicking through Start, Matchplan, Spiele, Tabelle, Durchspielen,
  Spielerinnen, Teams, Methodik, in light and dark mode, on a phone-sized viewport.
- Data commits by the bot touch `daten/` and `app/index.html`. Do not hand-edit generated data files; fix
  the fetch scripts instead.
- Commit messages: German, short, imperative or descriptive like the existing ones.
- Keep `LIESMICH.txt` in sync when user-visible behaviour changes.
- Do not commit `Agency/`, `*.bak`, `.DS_Store` (already ignored).

## Roadmap: goalkeeper tracking (next iteration)

handball.net has no goalkeeper data at all (see "Known gaps"). The plan is a three-part extension.

Stack decision (2026-10-18, revised the same day): the tracker is part of this app, not a separate
project. It is rendered with Preact + htm, vendored as pinned UMD scripts in `app/lib/` and loaded as
classic scripts, so there is still no build step, no `package.json`, and the app keeps working from
`file://` and offline. The tracker mounts a Preact tree into `#inhalt` while its area is active and unmounts
when `zeichne()` switches away; the other pages stay string-rendered. The exchange format is defined as a
JSON Schema with a Node validation script. The migration to Vite, TypeScript and TSX (pnpm, not yarn) is a
later dedicated step recorded in the README backlog; htm templates convert to TSX mechanically.

1. **Groundwork** (done 2026-10-18): vendor Preact and htm into `app/lib/`, add a service worker so the app
   opens in a hall without reception. See "Vendored libraries and service worker".
2. **Capture app** in `app/erfassung.js`, reached from the Trainerin view. Uses the next match and the
   roster already on the page; the coach's goalkeeper pins (`kader[teamId].pins`) preselect the
   goalkeepers. Logs saves, goals conceded, 7m, goalkeeper changes, maybe shot zones. Big touch targets,
   undo, draft persisted after every event.
3. **Exchange format**: JSON Schema keyed by handball.net `matchId`, `teamId` and `playerId` so it joins
   cleanly with `HB_DETAILS`. Export via share sheet or clipboard; files are committed under
   `daten/torwart/<matchId>.json` and validated by a Node script.
4. **Integration**: bundle the files into a generated `window.HB_TORWART` next to the other data files,
   extend `spielerinnen.js` (goalkeeper stats per player), `kennzahlen.js` (team-level save rate),
   `matchplan.js` (new rule ids, e.g. TW1…), the player sheet and the Trainerin view in `app.js`.
   Goalkeeper influence should flow into `besetzungsEffekt()` so the optimiser no longer needs manual pins.

When this lands, update "Known gaps", the Methodik "Grenzen" text and `LIESMICH.txt`.

## To-dos

The working to-do list (goalkeeper tracking plus backlog) lives in `README.md`. Tick items there when
they are done and keep this file's roadmap section consistent with it.
