// Torhüterinnen-Erfassung: Würfe aufs eigene Tor live von der Bank erfassen.
// Preact + htm (app/lib), eingebunden über erfassungMount/erfassungUnmount aus app.js.
// Zustand liegt in diesem Modul und in localStorage (hbprog.erfassung), damit ein Neuladen oder
// ein Neuzeichnen der Seite nichts verliert. Die Komponenten lesen ihn nur.
//
// Zonen: 1 bis 9 aus Sicht der Werferin, Zeile für Zeile von oben links (1) nach unten rechts (9), 0 = vorbei.
// Exportformat (vorläufig, Schema folgt): Schlüssel auf Englisch, matchId/teamId/playerId wie bei handball.net.

(function () {
  'use strict';
  const { h, render } = window.preact;
  const { useEffect } = window.preactHooks;
  const html = window.htm.bind(h);

  const SCHLUESSEL = 'hbprog.erfassung';
  const FORMAT = 'anwurf-goalkeeper', VERSION = 1;
  const HALBZEIT_SEK = 30 * 60;

  let zustand = lade();
  let wurzel = null, ctx = null;
  const ui = { zone: null, siebenmeter: false, meldung: '', loeschen: false, json: false, neu: { name: '', nummer: '' }, wahl: {} };

  function lade() { try { return JSON.parse(localStorage.getItem(SCHLUESSEL)) || null; } catch (e) { return null; } }
  function speichere() { try { if (zustand) localStorage.setItem(SCHLUESSEL, JSON.stringify(zustand)); else localStorage.removeItem(SCHLUESSEL); } catch (e) {} }
  function aendere(fn) { fn(); speichere(); zeichne(); }
  function zeichne() { if (wurzel) render(html`<${App} />`, wurzel); }
  function melde(t) { ui.meldung = t; zeichne(); setTimeout(() => { if (ui.meldung === t) { ui.meldung = ''; zeichne(); } }, 1800); }

  // ================= Uhr =================
  function sekunden(u) { return Math.floor((u.vorher + (u.laeuft ? Date.now() - u.seit : 0)) / 1000); }
  function mmss(s) { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function jetzt() { const u = zustand.uhr; return { hz: Math.max(1, Math.min(2, u.halbzeit)), sek: Math.min(HALBZEIT_SEK + 600, sekunden(u)) }; }

  // ================= Ereignisse =================
  function neuesEreignis(typ, rest) {
    const { hz, sek } = jetzt();
    const n = zustand.ereignisse.reduce((m, e) => Math.max(m, e.n), 0) + 1;
    return Object.assign({ n, typ, hz, sek, zeit: new Date().toISOString() }, rest);
  }
  function wurf(ergebnis) {
    const zone = ergebnis === 'vorbei' ? 0 : ui.zone;
    if (zone == null) return;
    aendere(() => {
      zustand.ereignisse.push(neuesEreignis('wurf', { zone, ergebnis, siebenmeter: ui.siebenmeter, torhueterin: zustand.aktiv }));
      ui.zone = null; ui.siebenmeter = false;
    });
  }
  function wechsel(id) {
    if (id === zustand.aktiv) return;
    aendere(() => { zustand.aktiv = id; zustand.ereignisse.push(neuesEreignis('wechsel', { torhueterin: id })); });
  }
  function loesche(n) {
    aendere(() => {
      zustand.ereignisse = zustand.ereignisse.filter(e => e.n !== n);
      const letzterWechsel = zustand.ereignisse.filter(e => e.typ === 'wechsel').pop();
      zustand.aktiv = letzterWechsel ? letzterWechsel.torhueterin : zustand.torhueterinnen[0].id;
    });
  }
  function statistik(id) {
    const w = zustand.ereignisse.filter(e => e.typ === 'wurf' && (id == null || e.torhueterin === id));
    const aufsTor = w.filter(e => e.ergebnis !== 'vorbei');
    const paraden = w.filter(e => e.ergebnis === 'parade').length;
    const zonen = {};
    w.forEach(e => { const z = zonen[e.zone] || (zonen[e.zone] = { tor: 0, parade: 0 }); if (e.ergebnis !== 'vorbei') z[e.ergebnis]++; });
    return { wuerfe: w.length, aufsTor: aufsTor.length, paraden, tore: aufsTor.length - paraden, quote: aufsTor.length ? paraden / aufsTor.length : null, zonen, siebenmeter: w.filter(e => e.siebenmeter).length };
  }

  // ================= Export =================
  function exportObjekt() {
    const z = zustand;
    const sekGlobal = e => (e.hz - 1) * HALBZEIT_SEK + e.sek;
    return {
      format: FORMAT, version: VERSION,
      matchId: z.matchId, teamId: z.teamId, opponentId: z.gegnerId, isHome: z.heim, date: z.datum,
      startedAt: z.begonnen, exportedAt: new Date().toISOString(),
      goalkeepers: z.torhueterinnen.map(t => ({ playerId: t.id, name: t.name, number: t.nummer })),
      events: z.ereignisse.map(e => e.typ === 'wurf'
        ? { seq: e.n, type: 'shot', half: e.hz, second: sekGlobal(e), goalkeeperId: e.torhueterin, zone: e.zone, result: { tor: 'goal', parade: 'save', vorbei: 'miss' }[e.ergebnis], sevenMeter: !!e.siebenmeter, at: e.zeit }
        : { seq: e.n, type: 'goalkeeperChange', half: e.hz, second: sekGlobal(e), goalkeeperId: e.torhueterin, at: e.zeit }),
    };
  }
  const exportJson = () => JSON.stringify(exportObjekt(), null, 2);
  const dateiname = () => `torwart-${zustand.matchId}-${zustand.teamId}.json`;
  function kopiere() {
    const t = exportJson();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => melde('Kopiert')).catch(() => { ui.json = true; zeichne(); });
    else { ui.json = true; zeichne(); }
  }
  function teile() {
    const t = exportJson(), titel = `Torhüterinnen ${ctx.kurz(zustand.teamId)} gegen ${ctx.kurz(zustand.gegnerId)}`;
    try {
      const datei = new File([t], dateiname(), { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [datei] })) return navigator.share({ files: [datei], title: titel }).catch(() => {});
      if (navigator.share) return navigator.share({ title: titel, text: t }).catch(() => {});
    } catch (e) {}
    kopiere();
  }
  function ladeHerunter() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    a.download = dateiname(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================= Komponenten =================
  const Modul = ({ titel, eyebrow, aktion, fuss, klasse, children }) => html`
    <section class="modul ${klasse || ''}">
      ${titel ? html`<div class="mkopf"><div>${eyebrow ? html`<span class="micro">${eyebrow}</span>` : null}<h2 class="titel">${titel}</h2></div>${aktion || null}</div>` : null}
      ${children}
      ${fuss ? html`<div class="fussnote">${fuss}</div>` : null}
    </section>`;

  function App() {
    return zustand ? html`<${Live} />` : html`<${Einrichtung} />`;
  }

  function Einrichtung() {
    const spiele = ctx.spiele;
    if (!ui.spiel && spiele.length) ui.spiel = spiele[0].id;
    const kader = ctx.kader.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || a.name.localeCompare(b.name));
    kader.forEach(s => { if (ui.wahl[s.id] == null) ui.wahl[s.id] = !!s.pin; });
    const manuell = ui.manuell || (ui.manuell = []);
    const gewaehlt = kader.filter(s => ui.wahl[s.id]).map(s => ({ id: s.id, name: s.name, nummer: s.nummer })).concat(manuell);
    const g = spiele.find(x => x.id === ui.spiel);
    const starte = () => {
      if (!g || !gewaehlt.length) return;
      aendere(() => {
        zustand = {
          matchId: g.id, teamId: ctx.fokus, gegnerId: g.gegnerId, heim: g.heim, datum: g.datum, begonnen: new Date().toISOString(),
          torhueterinnen: gewaehlt, aktiv: gewaehlt[0].id,
          uhr: { halbzeit: 0, laeuft: false, seit: null, vorher: 0 }, ereignisse: [],
        };
      });
    };
    const fuegeHinzu = () => {
      const name = ui.neu.name.trim(); if (!name) return;
      manuell.push({ id: `manuell:${name.toLowerCase().replace(/\s+/g, '-')}`, name, nummer: Number(ui.neu.nummer) || null });
      ui.neu = { name: '', nummer: '' }; zeichne();
    };
    return html`
      <${Modul} titel="Spiel" eyebrow=${ctx.kurz(ctx.fokus)}>
        ${spiele.length ? html`<select class="erf-select" id="erfSpiel" value=${ui.spiel} onChange=${e => { ui.spiel = Number(e.target.value); zeichne(); }}>
          ${spiele.map(s => html`<option value=${s.id}>${s.label}</option>`)}
        </select>` : html`<p class="meta">Für ${ctx.kurz(ctx.fokus)} ist kein Spiel bekannt.</p>`}
      <//>
      <${Modul} titel="Torhüterinnen" eyebrow="Wer steht heute im Tor?" fuss="Vorausgewählt sind die mit der Stecknadel markierten. Fehlt jemand in den Spielberichten, unten eintragen.">
        <div class="erf-kader">
          ${kader.map(s => html`<label class="erf-zeile ${ui.wahl[s.id] ? 'an' : ''}"><input type="checkbox" id=${'erfTw-' + s.id} checked=${!!ui.wahl[s.id]} onChange=${e => { ui.wahl[s.id] = e.target.checked; zeichne(); }} /><span class="nr">${s.nummer ? '#' + s.nummer : ''}</span><span class="nm">${s.name}</span>${s.pin ? html`<span class="etikett">fest</span>` : null}</label>`)}
          ${manuell.map((s, i) => html`<label class="erf-zeile an"><input type="checkbox" id=${'erfTwM-' + i} checked onChange=${() => { manuell.splice(i, 1); zeichne(); }} /><span class="nr">${s.nummer ? '#' + s.nummer : ''}</span><span class="nm">${s.name}</span><span class="etikett kontur">neu</span></label>`)}
        </div>
        <div class="erf-neu">
          <input class="erf-input" id="erfNeuName" placeholder="Name" value=${ui.neu.name} onInput=${e => { ui.neu.name = e.target.value; }} />
          <input class="erf-input nr" id="erfNeuNr" placeholder="Nr." inputmode="numeric" value=${ui.neu.nummer} onInput=${e => { ui.neu.nummer = e.target.value; }} />
          <button class="btn" type="button" onClick=${fuegeHinzu}>Hinzufügen</button>
        </div>
      <//>
      <button class="btn prim erf-breit" type="button" disabled=${!g || !gewaehlt.length} onClick=${starte}>Erfassung starten</button>
      <p class="fussnote">Die Erfassung bleibt auf diesem Gerät gespeichert, auch ohne Empfang. Am Ende als Datei teilen oder kopieren.</p>`;
  }

  function Live() {
    const z = zustand, u = z.uhr;
    useEffect(() => { if (!u.laeuft) return; const t = setInterval(zeichne, 1000); return () => clearInterval(t); }, [u.laeuft]);
    const aktiv = z.torhueterinnen.find(t => t.id === z.aktiv) || z.torhueterinnen[0];
    const st = statistik(aktiv.id), ges = statistik(null);
    const starte = () => aendere(() => { if (u.halbzeit === 0) u.halbzeit = 1; u.laeuft = true; u.seit = Date.now(); });
    const halte = () => aendere(() => { u.vorher += Date.now() - u.seit; u.laeuft = false; u.seit = null; });
    const naechsterAbschnitt = () => aendere(() => { if (u.laeuft) { u.vorher += Date.now() - u.seit; } u.laeuft = false; u.seit = null; u.halbzeit++; u.vorher = 0; });
    const abschnitt = ['Vor dem Anwurf', '1. Halbzeit', '2. Halbzeit', 'Spielende'][Math.min(3, u.halbzeit)];
    const letzte = z.ereignisse[z.ereignisse.length - 1];
    const zeile = e => {
      const t = z.torhueterinnen.find(x => x.id === e.torhueterin);
      const wer = t ? (t.nummer ? `#${t.nummer} ` : '') + t.name.split(' ').slice(-1)[0] : '?';
      const was = e.typ === 'wechsel' ? `Wechsel auf ${wer}` : `${{ tor: 'Tor', parade: 'Gehalten', vorbei: 'Vorbei' }[e.ergebnis]}${e.siebenmeter ? ' · 7 m' : ''}${e.zone ? ` · Zone ${e.zone}` : ''} · ${wer}`;
      return html`<div class="erf-ereignis ${e.typ === 'wurf' ? e.ergebnis : ''}" key=${e.n}><span class="zeit">${e.hz}. HZ ${mmss(e.sek)}</span><span class="was">${was}</span><button class="erf-x" type="button" aria-label="Eintrag löschen" onClick=${() => loesche(e.n)}>×</button></div>`;
    };
    return html`
      <${Modul} klasse="erf-kopf">
        <div class="erf-uhr">
          <div><span class="micro">${abschnitt}</span><div class="erf-zeit">${mmss(sekunden(u))}</div><div class="meta">${z.heim ? 'gegen' : 'bei'} ${ctx.kurz(z.gegnerId)} · ${z.datum}</div></div>
          <div class="erf-uhr-knoepfe">
            ${u.halbzeit >= 3 ? html`<span class="etikett">Abgepfiffen</span>`
              : u.laeuft ? html`<button class="btn" type="button" onClick=${halte}>Uhr anhalten</button>`
              : html`<button class="btn prim" type="button" onClick=${starte}>${u.halbzeit === 0 ? 'Anwurf' : 'Weiter'}</button>`}
            ${u.halbzeit === 1 ? html`<button class="btn" type="button" onClick=${naechsterAbschnitt}>Halbzeit</button>` : null}
            ${u.halbzeit === 2 ? html`<button class="btn" type="button" onClick=${naechsterAbschnitt}>Spielende</button>` : null}
          </div>
        </div>
      <//>
      <${Modul} titel="Im Tor" eyebrow="Antippen wechselt">
        <div class="erf-chips">${z.torhueterinnen.map(t => html`<button class="chip ${t.id === aktiv.id ? 'an' : ''}" type="button" onClick=${() => wechsel(t.id)}>${t.nummer ? `#${t.nummer} ` : ''}${t.name}</button>`)}</div>
      <//>
      <${Modul} titel="Wurf" eyebrow="Wo ging der Ball hin? Aus Sicht der Werferin" fuss=${ui.zone == null ? 'Ins Tor tippen, dann Tor oder Gehalten. Neben das Tor tippen heißt vorbei.' : null}>
        <${Tor} zonen=${st.zonen} />
        ${ui.zone != null ? html`
          <div class="erf-wahl">
            <button class="chip ${ui.siebenmeter ? 'an' : ''}" type="button" onClick=${() => { ui.siebenmeter = !ui.siebenmeter; zeichne(); }}>7 m</button>
            <span class="meta">Zone ${ui.zone} · ${aktiv.name.split(' ').slice(-1)[0]}</span>
            <button class="textaktion" type="button" onClick=${() => { ui.zone = null; zeichne(); }}>Abbrechen</button>
          </div>
          <div class="erf-ergebnis">
            <button class="btn parade" type="button" onClick=${() => wurf('parade')}>Gehalten</button>
            <button class="btn tor" type="button" onClick=${() => wurf('tor')}>Tor</button>
          </div>` : html`
          <div class="erf-wahl"><button class="chip ${ui.siebenmeter ? 'an' : ''}" type="button" onClick=${() => { ui.siebenmeter = !ui.siebenmeter; zeichne(); }}>7 m</button><span class="meta">${ui.siebenmeter ? 'Nächster Wurf ist ein Siebenmeter' : ''}</span></div>`}
      <//>
      <div class="kacheln">
        <div class="kachel"><div class="lab">${aktiv.name.split(' ').slice(-1)[0]} gehalten</div><div class="kpi"><span>${st.paraden}<span class="pz">von ${st.aufsTor}</span></span></div><div class="ctx">${st.quote == null ? 'noch kein Wurf aufs Tor' : `${Math.round(st.quote * 100)} % Quote · ${st.tore} Gegentor${st.tore === 1 ? '' : 'e'}`}</div></div>
        <div class="kachel"><div class="lab">Team gesamt</div><div class="kpi"><span>${ges.paraden}<span class="pz">von ${ges.aufsTor}</span></span></div><div class="ctx">${ges.wuerfe} Würfe, ${ges.wuerfe - ges.aufsTor} vorbei${ges.siebenmeter ? `, ${ges.siebenmeter}× 7 m` : ''}</div></div>
      </div>
      <${Modul} titel="Verlauf" eyebrow=${`${z.ereignisse.length} Einträge`} aktion=${letzte ? html`<button class="textaktion" type="button" onClick=${() => loesche(letzte.n)}>Letzten rückgängig</button>` : null}>
        ${z.ereignisse.length ? html`<div class="erf-liste">${z.ereignisse.slice().reverse().slice(0, 40).map(zeile)}</div>` : html`<p class="meta" style="margin:0">Noch nichts erfasst.</p>`}
      <//>
      <${Modul} titel="Weitergeben" eyebrow="Nach dem Spiel" fuss="Die Datei kommt in den Datensatz der App. Format: JSON, ein Eintrag je Wurf mit Zone, Ergebnis und Torhüterin.">
        <div class="erf-aktionen">
          ${navigator.share ? html`<button class="btn prim" type="button" onClick=${teile}>Teilen</button>` : null}
          <button class="btn ${navigator.share ? '' : 'prim'}" type="button" onClick=${kopiere}>Kopieren</button>
          <button class="btn" type="button" onClick=${ladeHerunter}>Herunterladen</button>
        </div>
        ${ui.meldung ? html`<div class="erf-meldung">${ui.meldung}</div>` : null}
        ${ui.json ? html`<textarea class="erf-json" id="erfJson" readonly>${exportJson()}</textarea>` : null}
        <div class="erf-aktionen" style="margin-top:12px">
          ${ui.loeschen
            ? html`<span class="meta">Wirklich alles löschen?</span><button class="btn tor" type="button" onClick=${() => aendere(() => { zustand = null; ui.loeschen = false; ui.zone = null; })}>Ja, löschen</button><button class="btn" type="button" onClick=${() => { ui.loeschen = false; zeichne(); }}>Nein</button>`
            : html`<button class="textaktion" type="button" onClick=${() => { ui.loeschen = true; zeichne(); }}>Erfassung beenden und löschen</button>`}
        </div>
      <//>`;
  }

  // Das Tor als 3×3-Raster, drumherum die Fläche für Würfe vorbei. Zahlen in den Zellen: Tore rot, Paraden grün.
  function Tor({ zonen }) {
    const X0 = 40, Y0 = 24, B = 300, H = 180, zb = B / 3, zh = H / 3;
    const zellen = [];
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3, x = X0 + c * zb, y = Y0 + r * zh, n = i + 1, st = zonen[n];
      zellen.push(html`<g key=${n} class="erf-zelle ${ui.zone === n ? 'an' : ''}" onClick=${() => { ui.zone = n; zeichne(); }}>
        <rect x=${x} y=${y} width=${zb} height=${zh} />
        ${st && (st.tor || st.parade) ? html`<text x=${x + 8} y=${y + 18}>${st.parade ? html`<tspan class="p">${st.parade}</tspan>` : null}${st.parade && st.tor ? html`<tspan class="s"> · </tspan>` : null}${st.tor ? html`<tspan class="t">${st.tor}</tspan>` : null}</text>` : null}
      </g>`);
    }
    return html`<svg class="erf-tor" viewBox="0 0 380 236" role="group" aria-label="Tor mit neun Zonen">
      <rect class="erf-aussen" x="0" y="0" width="380" height="236" rx="16" onClick=${() => { ui.zone = null; wurf('vorbei'); }} />
      <text class="erf-aussen-text" x="190" y="14" text-anchor="middle">vorbei</text>
      ${zellen}
      <path class="erf-pfosten" d=${`M${X0} ${Y0 + H} V${Y0} H${X0 + B} V${Y0 + H}`} />
    </svg>`;
  }

  // ================= Schnittstelle zu app.js =================
  window.erfassungMount = function (el, kontext) { wurzel = el; ctx = kontext; zeichne(); };
  window.erfassungUnmount = function () { if (wurzel) { render(null, wurzel); wurzel = null; } };
  window.erfassungAktiv = () => !!zustand;
})();
