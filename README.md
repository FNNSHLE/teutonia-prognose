# Anwurf · Handball-Prognose

Win probability, match plan, fixtures and table for the next handball match. Built for the women's team of
**SC Teutonia 10** (Bezirksoberliga Frauen, Hamburg), works for any team in that league.

Private fan project, not an offering of SC Teutonia 10 or handball.net. Data: [handball.net](https://www.handball.net).

- **Live app:** https://fnnshle.github.io/teutonia-prognose/
- **Coach view:** https://fnnshle.github.io/teutonia-prognose/app/index.html#trainerin
  (shows per-player values; no password, only an unlisted link)
- **End-user guide in German:** [`LIESMICH.txt`](LIESMICH.txt)
- **Developer orientation:** [`CLAUDE.md`](CLAUDE.md)

## What the app shows

| Area | Content |
| --- | --- |
| Start | Next match with win probability, table position, form, notable patterns |
| Matchplan | Data-backed recommendations for the next match: who is indispensable, who to ask, 7-metre order, half-time profiles, suspension risk, match phases, key opponents. Lineup optimiser for the coach (absences, pinned goalkeepers, best squad, resulting win chance). Printable as a locker-room sheet. |
| Spiele | Fixtures and results; tap a match for the timeline and lineups |
| Tabelle | Table, position history, season forecast, "what if" with fixed outcomes |
| Mehr | Durchspielen (lineup lab), Spielerinnen (player stats), Teams, "So rechnet Anwurf" (method and backtest), Torhüterin erfassen (live goalkeeper tracker, see below) |
| Erfassung | Prominent entry: own button in the sidebar, top of "Mehr", and a card on Start and Matchplan (moves to the top on match day or while a recording is running). Live goalkeeper tracker for the bench: pick the match and the goalkeepers, start the clock, tap the goal where the shot went, then "Gehalten" or "Tor"; a tap outside the frame logs a miss. Keyboard: 1–9 zone, 0 miss, Y save, N goal. Undo, keeper changes, half-time, draft survives reloads. Export as JSON via share sheet, clipboard or download. Deep link: `app/index.html#erfassung`. Committed records feed the player sheet, the match plan and the optimiser. |

Any team of the league can be chosen top left; the own team is restored on the next open. Light and dark
mode follow the device setting. Keys 1–8 switch areas on a keyboard.

## Getting started

### As a user

- **Mac:** double-click `Start (Mac).command`
- **Windows:** double-click `Start (Windows).bat`

The launcher fetches the current state from handball.net (a few seconds) and opens the app in the browser.
Without internet it shows the last fetched state and warns when the data is older than a week.

First start on macOS: Gatekeeper blocks downloaded scripts. Right-click the `.command` file, choose
"Open", confirm. On newer macOS versions: System Settings → Privacy & Security → "Open Anyway". Once is enough.

### As a developer

No build, no package manager. Plain HTML, CSS and JavaScript; Preact and htm are vendored as pinned UMD
files in `app/lib/`.

```sh
# serve the repo root, then open http://localhost:8000/app/
python3 -m http.server

# refresh data from handball.net (rewrites daten/ and the ?t= cache-busters in app/index.html)
bash abruf.sh

# syntax check without a browser
for f in app/*.js sw.js; do node --check "$f"; done

# goalkeeper records: validate all files in daten/torwart/, or create an empty one for the next match
node scripts/goalkeeper.mjs validate
node scripts/goalkeeper.mjs new next
node scripts/goalkeeper.mjs bundle     # regenerate daten/torwart.js after adding a record (the fetch scripts do it too)
node scripts/goalkeeper.mjs mark "Laura Kähler"   # permanent goalkeeper list (daten/torwart/goalkeepers.json); also unmark, list
```

Opening `app/index.html` straight from the file system also works.

## Data updates

A GitHub Action (`.github/workflows/daten.yml`) runs `abruf.sh` daily at 05:00 UTC and commits the result as
`Daten aktualisiert YYYY-MM-DD` to `main`. It can also be triggered by hand from the Actions tab. Match
reports (lineups and live ticker) are cached in `daten/cache/` and re-fetched for a week after the match, as
reports get corrected after the fact.

## Configuration

`daten/team_id.txt` holds the handball.net team id (`86088` = SC Teutonia 10). The id is in the URL of the
team page, e.g. `handball.net/team/86088`. The league and current phase are detected automatically.

## How it works

Short version; the "So rechnet Anwurf" page in the app and [`CLAUDE.md`](CLAUDE.md) have the details.

- **Team strength:** from all results, each team gets an attack and a defence value in goals relative to
  the league average, plus a home advantage. Early in the season everything is pulled towards the average.
  The goal difference of a match is modelled as a normal distribution around the expected difference,
  which yields win, draw and loss probabilities.
- **Players:** from the match reports, each player gets a "Torwirkung" (goal impact): a blend of shrunken
  goals per game and how the team performed with and without her. Lineup changes shift the expected goals
  and therefore the win chance.
- **Matchplan:** a small rule engine turns these numbers plus live-ticker metrics (phases, 7 m, suspensions)
  into a capped list of recommendations and findings with minimum sample sizes.
- **Season:** 5000 simulated seasons with a fixed seed, optionally with outcomes fixed by the user.
- **Backtest:** every played match is predicted with a model trained only on earlier matches; the method
  page reports hit rate, assigned probability and Brier score.

Known limits: handball.net reports contain no goalkeeper data (no saves, no minutes, goalkeepers are not
even flagged), no missed field shots and no defensive actions. See the to-dos.

## Project layout

```
app/            the app: index.html (CSS, skeleton), app.js (UI), modell.js, spielerinnen.js,
                kennzahlen.js, matchplan.js, tracker.js (goalkeeper tracker, Preact, English),
                goalkeepers.js (evaluation of the records, English),
                lib/ (vendored Preact, htm), assets/ (icons, images), PWA icons, images
app/lib/        vendored Preact, Preact hooks and htm (pinned UMD builds, see LIESMICH.txt there)
sw.js           service worker for offline use; must stay at the root so its scope covers app/ and daten/
daten/          generated data (daten.js, spielberichte.js, torwart.js), raw cache, team_id.txt,
                torwart/ (goalkeeper records from the tracker, schema.json, goalkeepers.json = permanent list)
scripts/        goalkeeper.mjs (validate records, create empty ones); plain Node, no dependencies
abruf.sh        data fetch for CI and Mac/Linux
Start (Mac).command, Start (Windows).bat, app/abruf.ps1   user launchers (fetch + open)
.github/        daily data workflow
```

## To-dos

Checklist we work through together. Tick items when done, add context in the commit that closes them.

### Next iteration: goalkeeper tracking

handball.net has no goalkeeper data at all, so goalkeepers are invisible to the model and the coach has to
pin them by hand.

Stack decision (2026-10-18, revised the same day): the tracker is built **into the existing app**, not as a
separate project, because the next match, both rosters, player ids and the coach's goalkeeper pins are
already on the page. Rendering with **Preact + htm**, vendored as two UMD scripts in `app/lib/`, so there
is still no build step and the app keeps working from `file://` and offline. The exchange format is a
**JSON Schema** with a Node validation script. The move to Vite, TypeScript and TSX follows as one
dedicated step (see backlog); htm templates convert to TSX mechanically, so nothing is thrown away.

- [x] **Vendor Preact and htm** into `app/lib/` and add a **service worker**, so the app opens in a hall
      without reception. Pin exact versions, note them in `CLAUDE.md`.
- [x] **Capture app** as Preact components in `app/tracker.js`: a new area "Torhüterin erfassen",
      open to everyone (not only the Trainerin view), mounted into the content area while active. Uses the
      next match and roster already loaded; goalkeeper pins preselect the goalkeepers. Logs saves, goals
      conceded, misses, 7 m and goalkeeper changes with a 3×3 shot zone grid on a tappable goal. Game clock
      with halves, undo, draft persisted after every event so a reload loses nothing. Exports a provisional
      v1 JSON (see `CLAUDE.md`, "Exchange format").
- [x] **Exchange format**: `daten/torwart/schema.json` (JSON Schema 2020-12) describes the tracker's
      export, keyed by handball.net `matchId`, `teamId` and `playerId`. `scripts/goalkeeper.mjs validate`
      checks every `daten/torwart/torwart-<matchId>-<teamId>.json` against the schema and the fixture
      list; `scripts/goalkeeper.mjs new next` creates an empty record for the next match. First real file:
      the 8 November 2026 match at TV Fischbek II.
- [x] **Integration**: the fetch scripts (and `scripts/goalkeeper.mjs bundle`) write the records into
      `daten/torwart.js` as `window.HB_TORWART`. `app/goalkeepers.js` (English) evaluates them: save rate,
      7 m, minutes in goal, zone picture, weak zones, and an estimated goal impact per goalkeeper that
      replaces the generic "Torwirkung" from 20 shots on target, so the optimiser values goalkeepers
      without pins. Shown in the player sheet (tiles + zone SVG), the player list (sort "Paraden"), the
      match plan ("Im Tor" module with the win chance per goalkeeper, rules TW1 "X ins Tor", TW2
      "Gegentore vor allem …", TW3 "Bei 7 m: X ins Tor" and TW4 first-leg memory with a zone picture of
      what the same opponent did last time) and the method page. Tracker shortcuts on a keyboard: 1–9
      zone, 0 miss, Y save, N goal, Escape.
- [x] **Permanent goalkeepers**: `daten/torwart/goalkeepers.json` lists who is a goalkeeper per team
      (`scripts/goalkeeper.mjs mark|unmark|list`). They are preselected in the tracker, kept in the squad by
      the optimiser like pinned players, and get no goal-based "Torwirkung" from the field-player evaluation;
      their value comes from the save rate once tracked. A goalkeeper who occasionally plays in the field is
      not evaluated as a field player for now.

### Backlog

- [ ] **Unify the fetch scripts.** `abruf.sh`, `Start (Mac).command` and `app/abruf.ps1` are near-copies;
      every fix lands three times. One shell script called by the Mac launcher, plus the PowerShell port.
- [ ] **Minimal regression check.** A Node script that loads `daten/*.js` and runs the model and player
      evaluation, so changes to `modell.js` and `spielerinnen.js` are caught without clicking through the app.
- [ ] **Split `app.js` by area.** One ~1000-line IIFE mixes data prep, rendering and events. Per-page
      renderers make the goalkeeper views easier to add.
- [ ] **Less disruptive data commits.** The daily bot push to `main` makes every feature branch drift.
      Write data to its own branch or rebase in CI.
- [ ] **Parse JSON properly in the fetch scripts.** Match ids are extracted with `grep`/`sed` over raw
      JSON and break silently if handball.net reorders fields. Use `jq` or Python.
- [ ] **Decide on a license** and add a `LICENSE` file.
- [ ] **Move Anwurf to Vite, TypeScript and TSX** in one dedicated step after the tracker ships: tracker
      first (htm templates become TSX), then the string-rendered pages one by one, then types for the model
      files. pnpm as package manager. The JSON Schema becomes the TypeScript type of the exchange format.
      Must keep the `file://` launchers working (relative base, inlined scripts) and the Methodik backtest
      numbers identical before and after.
- [ ] **Deploy GitHub Pages from a CI build** instead of serving `main` as-is, so built output no longer
      needs to be committed. Must coexist with the daily data commit.

## Conventions

- UI copy is German, with feminine forms (Spielerin, Trainerin, Torhüterin). The existing JS files are German
  too and stay that way; **every new JS or TS file is written in English** (identifiers, comments, CSS classes).
- Commit messages are German and short, like the existing ones.
- Bump `?v=` on the script tags in `app/index.html` whenever app JavaScript changes; GitHub Pages visitors
  keep the old files otherwise.
- Do not hand-edit the generated files in `daten/`; change the fetch scripts instead.
- Keep `LIESMICH.txt` in sync when user-visible behaviour changes.
