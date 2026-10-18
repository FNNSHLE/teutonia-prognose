// Goalkeeper tracker: log shots on the own goal live from the bench.
// Preact + htm (app/lib), mounted by app.js through trackerMount/trackerUnmount.
// State lives in this module and in localStorage (hbprog.erfassung) so that neither a reload nor a
// re-render of the page shell loses anything. Components only read it and call `update()`.
//
// Zones: 1 to 9 from the shooter's point of view, row by row from top left (1) to bottom right (9), 0 = off target.
// Export format (provisional v1, schema to follow): English keys, matchId/teamId/playerId as on handball.net.
// UI copy is German like the rest of the app.

(function () {
  'use strict';
  const { h, render } = window.preact;
  const { useEffect } = window.preactHooks;
  const html = window.htm.bind(h);

  const STORAGE_KEY = 'hbprog.erfassung';
  const FORMAT = 'anwurf-goalkeeper', VERSION = 1;
  const SCHEMA = 1; // shape of the stored draft; bump when `state` changes incompatibly and add a migration in load()
  const HALF_SECONDS = 30 * 60;

  let state = load();
  let root = null, ctx = null;
  // Transient UI state, not persisted: selected zone, 7m toggle, confirmations, setup form.
  const ui = { zone: null, sevenMeter: false, notice: '', confirmDelete: false, showJson: false, draft: { name: '', number: '' }, picked: {} };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!s) return null;
      // Anything with another shape is not touched or overwritten; it stays in storage until a migration exists.
      if (s.schema !== SCHEMA || !s.clock || !Array.isArray(s.events) || !Array.isArray(s.goalkeepers)) { console.warn('Tracker: stored draft has an unknown shape, starting fresh'); return null; }
      return s;
    } catch (e) { return null; }
  }
  function save() { try { if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); else localStorage.removeItem(STORAGE_KEY); } catch (e) {} }
  function update(fn) { fn(); save(); draw(); }
  function draw() {
    if (!root) return;
    try { render(html`<${App} />`, root); }
    catch (e) {
      console.error('Tracker:', e);
      root.innerHTML = '<div class="modul"><b>Die Erfassung konnte nicht gezeichnet werden.</b><p class="meta">Seite neu laden. Bleibt der Fehler, die gespeicherte Erfassung über „Erfassung beenden und löschen“ entfernen oder die Entwicklerkonsole prüfen.</p></div>';
    }
  }
  function notify(text) { ui.notice = text; draw(); setTimeout(() => { if (ui.notice === text) { ui.notice = ''; draw(); } }, 1800); }

  // ================= Clock =================
  function elapsedSeconds(clock) { return Math.floor((clock.before + (clock.running ? Date.now() - clock.since : 0)) / 1000); }
  function mmss(s) { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function now() { const c = state.clock; return { half: Math.max(1, Math.min(2, c.half)), second: Math.min(HALF_SECONDS + 600, elapsedSeconds(c)) }; }

  // ================= Events =================
  function newEvent(type, rest) {
    const { half, second } = now();
    const seq = state.events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    return Object.assign({ seq, type, half, second, at: new Date().toISOString() }, rest);
  }
  function logShot(result) {
    const zone = result === 'miss' ? 0 : ui.zone;
    if (zone == null) return;
    update(() => {
      state.events.push(newEvent('shot', { zone, result, sevenMeter: ui.sevenMeter, goalkeeperId: state.active }));
      ui.zone = null; ui.sevenMeter = false;
    });
  }
  function changeGoalkeeper(id) {
    if (id === state.active) return;
    update(() => { state.active = id; state.events.push(newEvent('goalkeeperChange', { goalkeeperId: id })); });
  }
  function removeEvent(seq) {
    update(() => {
      state.events = state.events.filter(e => e.seq !== seq);
      const lastChange = state.events.filter(e => e.type === 'goalkeeperChange').pop();
      state.active = lastChange ? lastChange.goalkeeperId : state.goalkeepers[0].id;
    });
  }
  function stats(goalkeeperId) {
    const shots = state.events.filter(e => e.type === 'shot' && (goalkeeperId == null || e.goalkeeperId === goalkeeperId));
    const onTarget = shots.filter(e => e.result !== 'miss');
    const saves = shots.filter(e => e.result === 'save').length;
    const zones = {};
    shots.forEach(e => { const z = zones[e.zone] || (zones[e.zone] = { goal: 0, save: 0 }); if (e.result !== 'miss') z[e.result]++; });
    return { shots: shots.length, onTarget: onTarget.length, saves, goals: onTarget.length - saves, rate: onTarget.length ? saves / onTarget.length : null, zones, sevenMeters: shots.filter(e => e.sevenMeter).length };
  }

  // ================= Export =================
  function exportObject() {
    const s = state;
    const globalSecond = e => (e.half - 1) * HALF_SECONDS + e.second;
    return {
      format: FORMAT, version: VERSION,
      matchId: s.matchId, teamId: s.teamId, opponentId: s.opponentId, isHome: s.isHome, date: s.date,
      startedAt: s.startedAt, exportedAt: new Date().toISOString(),
      goalkeepers: s.goalkeepers.map(g => ({ playerId: g.id, name: g.name, number: g.number })),
      events: s.events.map(e => e.type === 'shot'
        ? { seq: e.seq, type: 'shot', half: e.half, second: globalSecond(e), goalkeeperId: e.goalkeeperId, zone: e.zone, result: e.result, sevenMeter: !!e.sevenMeter, at: e.at }
        : { seq: e.seq, type: 'goalkeeperChange', half: e.half, second: globalSecond(e), goalkeeperId: e.goalkeeperId, at: e.at }),
    };
  }
  const exportJson = () => JSON.stringify(exportObject(), null, 2);
  const fileName = () => `torwart-${state.matchId}-${state.teamId}.json`;
  function copy() {
    const text = exportJson();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => { if (!ui.notice) notify('Kopiert'); }).catch(() => { ui.showJson = true; draw(); });
    else { ui.showJson = true; draw(); }
  }
  function share() {
    const text = exportJson(), title = `Torhüterinnen ${ctx.shortName(state.teamId)} gegen ${ctx.shortName(state.opponentId)}`;
    // Web Share needs https or localhost and a user gesture; browsers also restrict which file types may be shared.
    // Anything but a cancel by the user falls back to the clipboard so the data never gets stuck.
    const fallback = err => { if (!err || err.name !== 'AbortError') { notify('Teilen nicht möglich, stattdessen kopiert'); copy(); } };
    try {
      const file = new File([text], fileName(), { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title }).catch(fallback);
      if (navigator.share) return navigator.share({ title, text }).catch(fallback);
    } catch (e) {}
    copy();
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================= Components =================
  const lastName = name => name.split(' ').slice(-1)[0];
  const Panel = ({ title, eyebrow, action, footer, className, children }) => html`
    <section class="modul ${className || ''}">
      ${title ? html`<div class="mkopf"><div>${eyebrow ? html`<span class="micro">${eyebrow}</span>` : null}<h2 class="titel">${title}</h2></div>${action || null}</div>` : null}
      ${children}
      ${footer ? html`<div class="fussnote">${footer}</div>` : null}
    </section>`;

  function App() {
    return state ? html`<${Live} />` : html`<${Setup} />`;
  }

  function Setup() {
    const matches = ctx.matches;
    if (!ui.matchId && matches.length) ui.matchId = matches[0].id;
    const roster = ctx.roster.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name));
    roster.forEach(p => { if (ui.picked[p.id] == null) ui.picked[p.id] = !!p.pinned; });
    const manual = ui.manual || (ui.manual = []);
    const chosen = roster.filter(p => ui.picked[p.id]).map(p => ({ id: p.id, name: p.name, number: p.number })).concat(manual);
    const match = matches.find(m => m.id === ui.matchId);
    const start = () => {
      if (!match || !chosen.length) return;
      update(() => {
        state = {
          schema: SCHEMA, matchId: match.id, teamId: ctx.teamId, opponentId: match.opponentId, isHome: match.isHome, date: match.date, startedAt: new Date().toISOString(),
          goalkeepers: chosen, active: chosen[0].id,
          clock: { half: 0, running: false, since: null, before: 0 }, events: [],
        };
      });
    };
    const addManual = () => {
      const name = ui.draft.name.trim(); if (!name) return;
      manual.push({ id: `manuell:${name.toLowerCase().replace(/\s+/g, '-')}`, name, number: Number(ui.draft.number) || null });
      ui.draft = { name: '', number: '' }; draw();
    };
    return html`
      <${Panel} title="Spiel" eyebrow=${ctx.shortName(ctx.teamId)}>
        ${matches.length ? html`<select class="gk-select" id="gkMatch" value=${ui.matchId} onChange=${e => { ui.matchId = Number(e.target.value); draw(); }}>
          ${matches.map(m => html`<option value=${m.id}>${m.label}</option>`)}
        </select>` : html`<p class="meta">Für ${ctx.shortName(ctx.teamId)} ist kein Spiel bekannt.</p>`}
      <//>
      <${Panel} title="Torhüterinnen" eyebrow="Wer steht heute im Tor?" footer="Vorausgewählt sind die mit der Stecknadel markierten. Fehlt jemand in den Spielberichten, unten eintragen.">
        <div class="gk-roster">
          ${roster.map(p => html`<label class="gk-row ${ui.picked[p.id] ? 'on' : ''}"><input type="checkbox" id=${'gkPick-' + p.id} checked=${!!ui.picked[p.id]} onChange=${e => { ui.picked[p.id] = e.target.checked; draw(); }} /><span class="nr">${p.number ? '#' + p.number : ''}</span><span class="nm">${p.name}</span>${p.pinned ? html`<span class="etikett">fest</span>` : null}</label>`)}
          ${manual.map((p, i) => html`<label class="gk-row on"><input type="checkbox" id=${'gkManual-' + i} checked onChange=${() => { manual.splice(i, 1); draw(); }} /><span class="nr">${p.number ? '#' + p.number : ''}</span><span class="nm">${p.name}</span><span class="etikett kontur">neu</span></label>`)}
        </div>
        <div class="gk-add">
          <input class="gk-input" id="gkNewName" placeholder="Name" value=${ui.draft.name} onInput=${e => { ui.draft.name = e.target.value; }} />
          <input class="gk-input nr" id="gkNewNumber" placeholder="Nr." inputmode="numeric" value=${ui.draft.number} onInput=${e => { ui.draft.number = e.target.value; }} />
          <button class="btn" type="button" onClick=${addManual}>Hinzufügen</button>
        </div>
      <//>
      <button class="btn prim gk-wide" type="button" disabled=${!match || !chosen.length} onClick=${start}>Erfassung starten</button>
      <p class="fussnote">Die Erfassung bleibt auf diesem Gerät gespeichert, auch ohne Empfang. Am Ende als Datei teilen oder kopieren.</p>`;
  }

  function Live() {
    const s = state, clock = s.clock;
    useEffect(() => { if (!clock.running) return; const t = setInterval(draw, 1000); return () => clearInterval(t); }, [clock.running]);
    const active = s.goalkeepers.find(g => g.id === s.active) || s.goalkeepers[0];
    const own = stats(active.id), team = stats(null);
    const startClock = () => update(() => { if (clock.half === 0) clock.half = 1; clock.running = true; clock.since = Date.now(); });
    const stopClock = () => update(() => { clock.before += Date.now() - clock.since; clock.running = false; clock.since = null; });
    const nextPeriod = () => update(() => { if (clock.running) clock.before += Date.now() - clock.since; clock.running = false; clock.since = null; clock.half++; clock.before = 0; });
    const periodLabel = ['Vor dem Anwurf', '1. Halbzeit', '2. Halbzeit', 'Spielende'][Math.min(3, clock.half)];
    const last = s.events[s.events.length - 1];
    const resultLabel = { goal: 'Tor', save: 'Gehalten', miss: 'Vorbei' };
    const row = e => {
      const g = s.goalkeepers.find(x => x.id === e.goalkeeperId);
      const who = g ? (g.number ? `#${g.number} ` : '') + lastName(g.name) : '?';
      const what = e.type === 'goalkeeperChange' ? `Wechsel auf ${who}` : `${resultLabel[e.result]}${e.sevenMeter ? ' · 7 m' : ''}${e.zone ? ` · Zone ${e.zone}` : ''} · ${who}`;
      return html`<div class="gk-event ${e.type === 'shot' ? e.result : ''}" key=${e.seq}><span class="time">${e.half}. HZ ${mmss(e.second)}</span><span class="what">${what}</span><button class="gk-x" type="button" aria-label="Eintrag löschen" onClick=${() => removeEvent(e.seq)}>×</button></div>`;
    };
    return html`
      <${Panel} className="gk-head">
        <div class="gk-clock">
          <div><span class="micro">${periodLabel}</span><div class="gk-time">${mmss(elapsedSeconds(clock))}</div><div class="meta">${s.isHome ? 'gegen' : 'bei'} ${ctx.shortName(s.opponentId)} · ${s.date}</div></div>
          <div class="gk-clock-buttons">
            ${clock.half >= 3 ? html`<span class="etikett">Abgepfiffen</span>`
              : clock.running ? html`<button class="btn" type="button" onClick=${stopClock}>Uhr anhalten</button>`
              : html`<button class="btn prim" type="button" onClick=${startClock}>${clock.half === 0 ? 'Anwurf' : 'Weiter'}</button>`}
            ${clock.half === 1 ? html`<button class="btn" type="button" onClick=${nextPeriod}>Halbzeit</button>` : null}
            ${clock.half === 2 ? html`<button class="btn" type="button" onClick=${nextPeriod}>Spielende</button>` : null}
          </div>
        </div>
      <//>
      <${Panel} title="Im Tor" eyebrow="Antippen wechselt">
        <div class="gk-chips">${s.goalkeepers.map(g => html`<button class="chip ${g.id === active.id ? 'an' : ''}" type="button" onClick=${() => changeGoalkeeper(g.id)}>${g.number ? `#${g.number} ` : ''}${g.name}</button>`)}</div>
      <//>
      <${Panel} title="Wurf" eyebrow="Wo ging der Ball hin? Aus Sicht der Werferin" footer=${ui.zone == null ? 'Ins Tor tippen, dann Tor oder Gehalten. Neben das Tor tippen heißt vorbei.' : null}>
        <${Goal} zones=${own.zones} />
        ${ui.zone != null ? html`
          <div class="gk-pick">
            <button class="chip ${ui.sevenMeter ? 'an' : ''}" type="button" onClick=${() => { ui.sevenMeter = !ui.sevenMeter; draw(); }}>7 m</button>
            <span class="meta">Zone ${ui.zone} · ${lastName(active.name)}</span>
            <button class="textaktion" type="button" onClick=${() => { ui.zone = null; draw(); }}>Abbrechen</button>
          </div>
          <div class="gk-result">
            <button class="btn save" type="button" onClick=${() => logShot('save')}>Gehalten</button>
            <button class="btn goal" type="button" onClick=${() => logShot('goal')}>Tor</button>
          </div>` : html`
          <div class="gk-pick"><button class="chip ${ui.sevenMeter ? 'an' : ''}" type="button" onClick=${() => { ui.sevenMeter = !ui.sevenMeter; draw(); }}>7 m</button><span class="meta">${ui.sevenMeter ? 'Nächster Wurf ist ein Siebenmeter' : ''}</span></div>`}
      <//>
      <div class="kacheln">
        <div class="kachel"><div class="lab">${lastName(active.name)} gehalten</div><div class="kpi"><span>${own.saves}<span class="pz">von ${own.onTarget}</span></span></div><div class="ctx">${own.rate == null ? 'noch kein Wurf aufs Tor' : `${Math.round(own.rate * 100)} % Quote · ${own.goals} Gegentor${own.goals === 1 ? '' : 'e'}`}</div></div>
        <div class="kachel"><div class="lab">Team gesamt</div><div class="kpi"><span>${team.saves}<span class="pz">von ${team.onTarget}</span></span></div><div class="ctx">${team.shots} Würfe, ${team.shots - team.onTarget} vorbei${team.sevenMeters ? `, ${team.sevenMeters}× 7 m` : ''}</div></div>
      </div>
      <${Panel} title="Verlauf" eyebrow=${`${s.events.length} Einträge`} action=${last ? html`<button class="textaktion" type="button" onClick=${() => removeEvent(last.seq)}>Letzten rückgängig</button>` : null}>
        ${s.events.length ? html`<div class="gk-list">${s.events.slice().reverse().slice(0, 40).map(row)}</div>` : html`<p class="meta" style="margin:0">Noch nichts erfasst.</p>`}
      <//>
      <${Panel} title="Weitergeben" eyebrow="Nach dem Spiel" footer="Die Datei kommt in den Datensatz der App. Format: JSON, ein Eintrag je Wurf mit Zone, Ergebnis und Torhüterin.">
        <div class="gk-actions">
          ${navigator.share ? html`<button class="btn prim" type="button" onClick=${share}>Teilen</button>` : null}
          <button class="btn ${navigator.share ? '' : 'prim'}" type="button" onClick=${copy}>Kopieren</button>
          <button class="btn" type="button" onClick=${download}>Herunterladen</button>
        </div>
        ${ui.notice ? html`<div class="gk-notice">${ui.notice}</div>` : null}
        ${ui.showJson ? html`<textarea class="gk-json" id="gkJson" readonly>${exportJson()}</textarea>` : null}
        <div class="gk-actions" style="margin-top:12px">
          ${ui.confirmDelete
            ? html`<span class="meta">Wirklich alles löschen?</span><button class="btn goal" type="button" onClick=${() => update(() => { state = null; ui.confirmDelete = false; ui.zone = null; })}>Ja, löschen</button><button class="btn" type="button" onClick=${() => { ui.confirmDelete = false; draw(); }}>Nein</button>`
            : html`<button class="textaktion" type="button" onClick=${() => { ui.confirmDelete = true; draw(); }}>Erfassung beenden und löschen</button>`}
        </div>
      <//>`;
  }

  // The goal as a 3×3 grid with the surrounding area for shots off target. Cell numbers: goals red, saves green.
  function Goal({ zones }) {
    const X0 = 40, Y0 = 24, W = 300, H = 180, cw = W / 3, ch = H / 3;
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3, x = X0 + c * cw, y = Y0 + r * ch, n = i + 1, z = zones[n];
      cells.push(html`<g key=${n} class="gk-cell ${ui.zone === n ? 'on' : ''}" onClick=${() => { ui.zone = n; draw(); }}>
        <rect x=${x} y=${y} width=${cw} height=${ch} />
        ${z && (z.goal || z.save) ? html`<text x=${x + 8} y=${y + 18}>${z.save ? html`<tspan class="s">${z.save}</tspan>` : null}${z.save && z.goal ? html`<tspan class="sep"> · </tspan>` : null}${z.goal ? html`<tspan class="g">${z.goal}</tspan>` : null}</text>` : null}
      </g>`);
    }
    return html`<svg class="gk-goal" viewBox="0 0 380 236" role="group" aria-label="Tor mit neun Zonen">
      <rect class="gk-outside" x="0" y="0" width="380" height="236" rx="16" onClick=${() => { ui.zone = null; logShot('miss'); }} />
      <text class="gk-outside-label" x="190" y="14" text-anchor="middle">vorbei</text>
      ${cells}
      <path class="gk-posts" d=${`M${X0} ${Y0 + H} V${Y0} H${X0 + W} V${Y0 + H}`} />
    </svg>`;
  }

  // ================= Interface to app.js =================
  // ctx: { teamId, shortName(id), longName(id), matches: [{id, label, opponentId, isHome, date}], roster: [{id, name, number, pinned}] }
  window.trackerMount = function (el, context) { root = el; ctx = context; draw(); };
  window.trackerUnmount = function () { if (root) { render(null, root); root = null; } };
})();
