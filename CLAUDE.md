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
app/tracker.js             Goalkeeper tracker (Preact + htm components, own state, mounted by app.js; English)
app/goalkeepers.js         Evaluation of the goalkeeper records: stats, goal impact, zone SVG (English)
app/manifest.json          PWA metadata
app/assets/                Icons, favicon, key visual, OG image, 3D icon
daten/team_id.txt          Focus team id (86088). League/phase is auto-detected from the team page.
daten/daten.js             Generated: window.HB_DATA (match list pages + standings)
daten/spielberichte.js     Generated: window.HB_DETAILS (lineups + events per finished match)
daten/torwart.js           Generated: window.HB_TORWART (array of goalkeeper records, see daten/torwart/)
daten/cache/<id>_l.json    Raw lineups per match (handball.net response)
daten/cache/<id>_e.json    Raw live-ticker events per match
daten/torwart/schema.json  JSON Schema of the goalkeeper record (tracker export)
daten/torwart/torwart-<matchId>-<teamId>.json   Goalkeeper records, one per match and team
scripts/goalkeeper.mjs     Validate goalkeeper records, create empty ones (Node, no deps, English)
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
app. Strategy: precache the app shell on install (`SHELL` list), delete old caches on activate, and serve
every same-origin GET **network-first with cache fallback**; cross-origin requests (team logos) are
untouched. Cache keys drop `?v=`/`?t=`, so a version bump still finds the cached file while the network
fetch stays cache-busted. Network-first was chosen deliberately over stale-while-revalidate: without a
build step there is no single deploy version, and serving cached files one by one produced a page with
the new `app.js` and the old `index.html` (blank tracker area). Online visitors therefore always get one
consistent version; offline they get the last one seen. Bump `CACHE` in `sw.js` when the `SHELL` list
changes. On `localhost` the worker is active too; use "Update on reload" / "Bypass for network" in the
browser devtools while developing, and expect one extra reload after changing `sw.js` itself.

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

- **UI copy and commit messages are German**; so are the existing JS files. **Every new JS or TS file is
  written in English** (identifiers, comments, CSS classes), per the owner's rule of 2026-10-18; existing
  German files are not rewritten. Teams are women's teams, so
  the copy uses feminine forms (Spielerin, Trainerin, Torhüterin, Schützin). Keep that consistent.
- Typography helpers in `app.js`: `dez()`, `vz()`, `pct()`, `stand()`; narrow no-break space `NB`, real
  minus sign `MINUS` ("−"). Use them instead of ad-hoc formatting.
- Escape all data with `esc()` before putting it into HTML strings.
- Design tokens live at the top of `app/index.html` (light/dark via `prefers-color-scheme`). Reuse
  `modul()`, `kachel()`, `seitenkopf()`, `spielZeile()`, `tabelleHtml()` and the `ico()` icon set.
- Navigation: `BEREICHE` list in `app.js`; the mobile tab bar shows four of them plus "Mehr". Keys 1–9
  switch areas. Sheets (`<dialog id="sheet">`) show details for matches, teams and players.
- State in `localStorage` under `hbprog.*`: `bereich`, `fest`, `eigene`, `kader`, `intro`, `erfassung`. Focus team is
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
- Syntax check without a browser: `for f in app/*.js sw.js; do node --check "$f"; done`. Goalkeeper
  records: `node scripts/goalkeeper.mjs validate`, also before committing a new record. There is no test suite;
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
2. **Capture app** (done, see "Goalkeeper tracker" below): `app/tracker.js`, area `erfassung`, open to
   everyone. Uses the next match and the roster already on the page; the coach's goalkeeper pins
   (`kader[teamId].pins`) preselect the goalkeepers.
3. **Exchange format** (done): `daten/torwart/schema.json`, JSON Schema 2020-12, is the source of truth
   for the record shape; `scripts/goalkeeper.mjs` contains a validator for the schema subset used plus
   the checks a schema cannot express (goalkeeper ids referenced by events, seq order, miss ⇔ zone 0,
   match/team/home/date against `daten/daten.js`, file name). `validate` runs over all records,
   `new [matchId|next] [--team id]` writes an empty record. When the format changes: bump `version` in
   the schema and in `tracker.js`, and keep a migration path for committed files.
4. **Integration** (done): all three fetch scripts and `scripts/goalkeeper.mjs bundle` write
   `daten/torwart.js` (`window.HB_TORWART = [record, …]`), loaded after `spielberichte.js`.
   `app/goalkeepers.js` → `evaluateGoalkeepers(records)` returns `{ players, teams, league, records }`;
   `app.js` attaches `s.tw` and `s.torwart = true` to the matching player in `B.teams[].liste` and, once
   `tw.reliable` (≥ `GOALKEEPER.MIN_SHOTS` shots on target), replaces `s.einfluss` with `tw.influence`
   (= (shrunk save rate − league rate) × team shots on target per match, clamped), then re-sorts the lists.
   That is how goalkeeper quality reaches `besetzungsEffekt()` and the optimiser. Goalkeepers added by
   name in the tracker (`manuell:` ids) are evaluated but cannot be attached to a lineup player.
   `matchplan.js` gets `ctx.tw` and adds TW1 (better goalkeeper by shrunk rate, ≥ 5 pp apart) and TW2
   (weakest zone of the team, `weakZones()`); `seiteMatchplan()` adds the "Im Tor" module. The player
   sheet swaps the scoring tiles for goalkeeper tiles plus `goalZoneSvg()`; the player list gets the sort
   "Paraden"; Methodik counts the records. The starter is logged by the tracker as a `goalkeeperChange`
   at second 0; `timeInGoal()` falls back to the first shot's goalkeeper for older files.

When this lands, update "Known gaps", the Methodik "Grenzen" text and `LIESMICH.txt`.

## Goalkeeper tracker (`app/tracker.js`)

- Area id `erfassung`, listed last in `BEREICHE`, reachable via "Mehr", key 9, or the deep link
  `app/index.html#erfassung`. Any area id works as a hash; `wechsle()` clears an area hash when the user
  switches away so a reload does not drag them back.
- Boundary with `app.js`: `seiteErfassung()` renders the page header plus an empty `#erfassung-wurzel`;
  `zeichne()` calls `trackerUnmount()` before replacing `#inhalt` and `trackerMount(el, ctx)` after.
  The context (`erfassungKontext()` in `app.js`, English keys) carries `teamId`, `shortName`, `longName`,
  `matches` (open ones first, then the two most recent played, with ready-made labels) and `roster` with
  `pinned` flags. Nothing
  else from `app.js` is reachable from the tracker; extend the context rather than adding globals.
- State lives in the module (`state`) and in `localStorage` under `hbprog.erfassung`, written after
  every change. Components only read it and call `update()`. The draft carries `schema: 1`; `load()`
  ignores anything with another shape instead of crashing (add a migration there when the shape changes),
  and `draw()` catches render errors and shows a message instead of a blank area. This is deliberate: `zeichne()` remounts
  the tree on resize, hash change and tab switches, and nothing may be lost mid-game. Transient UI state
  (selected zone, 7m toggle, confirmations) lives in `ui` and is not persisted.
- Game clock: `clock = { half 0..3, running, since, before }`, seconds per half, stopped by hand for
  timeouts. Events record `half` and `second` within the half; the export converts to a global second
  (`(half-1)*1800 + second`).
- Shot zones: 1..9 from the shooter's point of view, row by row from top left; 0 = off target. A tap
  outside the frame logs a miss immediately; a tap inside asks "Gehalten" or "Tor". The goal SVG shows
  saves (green) and goals (red) per zone for the active goalkeeper.
- Goalkeepers not in any match report yet can be added by name; they get ids `manuell:<slug>`.
- Export (format `anwurf-goalkeeper` v1, frozen in `daten/torwart/schema.json`), English keys:
  `{ format: "anwurf-goalkeeper", version: 1, matchId, teamId, opponentId, isHome, date, startedAt,
  exportedAt, goalkeepers: [{ playerId, name, number }], events: [...] }` with event types
  `shot { seq, half, second, goalkeeperId, zone, result: goal|save|miss, sevenMeter, at }` and
  `goalkeeperChange { seq, half, second, goalkeeperId, at }`. Share sheet (file if supported, else text),
  clipboard, or download as `torwart-<matchId>-<teamId>.json`.
- Keyboard on desktop (captured in `tracker.js` before `app.js` sees the key): 1–9 zone, 0 miss, Y save,
  N goal, Escape cancel. The area-switching digits of `app.js` are therefore inactive while a session runs.
- Testing: two CDP scripts drive headless Chrome, one through a whole tracker session (setup, clock,
  shots by tap and by key, undo, reload, export, reset) and one through the integration (match plan rules
  with a synthetic 60-shot record, player list sort, player sheet, method page). They live outside the
  repo for now; see the regression-check backlog item.

## To-dos

The working to-do list (goalkeeper tracking plus backlog) lives in `README.md`. Tick items there when
they are done and keep this file's roadmap section consistent with it.
