(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const merk = {
    get(k, d) { try { const v = localStorage.getItem('hbprog.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hbprog.' + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ================= Zahlensatz =================
  const NB = ' ', MINUS = '−';
  const dez = (x, n = 1) => x.toFixed(n).replace('.', ',').replace('-', MINUS);
  const vz = (x, n = 1) => { const r = Number(x.toFixed(n)); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r).toFixed(n).replace('.', ','); };
  const vzGanz = x => { const r = Math.round(x); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r); };
  const pct = x => Math.round(x * 100) + NB + '%';
  const pctGross = x => `${Math.round(x * 100)}<span class="pz">%</span>`;
  // Drei Wahrscheinlichkeiten so runden, dass sie exakt 100 ergeben (Largest Remainder)
  function drei(a, b, c) {
    const roh = [a, b, c].map(x => x * 100), ganz = roh.map(Math.floor);
    let rest = 100 - ganz.reduce((x, y) => x + y, 0);
    roh.map((x, i) => [x - ganz[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (rest > 0) { ganz[i]++; rest--; } });
    return ganz;
  }
  const stand = (a, b) => `${a}${NB}:${NB}${b}`;

  const D = window.HB_DATA;
  if (!D || !D.pages || !D.pages.length) {
    $('#inhalt').innerHTML = `<div class="leer" style="padding-top:20vh">${ico('tafel')}<b>Noch keine Daten</b><p>Die App über „Start (Mac)“ oder „Start (Windows)“ öffnen. Beim ersten Start braucht sie Internet.</p></div>`;
    return;
  }

  // ================= Daten =================
  const roh = D.pages.flatMap(p => p.data || []);
  const teams = {};
  const spiele = roh.map(m => {
    [m.local, m.visitor].forEach(t => { if (t && !teams[t.id]) teams[t.id] = { id: t.id, roh: t.name, logo: t.club && t.club.logo }; });
    const r = m.result || {};
    const hat = typeof r.local === 'number' && typeof r.visitor === 'number';
    return {
      id: m.id, runde: m.round, datum: new Date(m.date), terminOffen: /T00:00:00/.test(m.date),
      heim: m.local.id, gast: m.visitor.id,
      toreHeim: hat ? r.local : null, toreGast: hat ? r.visitor : null,
      gewertet: m.status.is_finished && hat, urteil: m.status.is_finished && !hat, offen: !m.status.is_finished,
      halle: m.field && (m.field.installation && m.field.installation.name || m.field.name),
    };
  }).filter(g => g.heim && g.gast).sort((a, b) => a.datum - b.datum || a.runde - b.runde);
  const spielNach = {}; spiele.forEach(g => spielNach[g.id] = g);
  const teamIds = Object.keys(teams).map(Number);
  const gewertet = spiele.filter(g => g.gewertet);
  const offen = spiele.filter(g => g.offen);
  const urteile = spiele.filter(g => g.urteil);
  const ligaName = normalisiere((roh[0] && roh[0].phase && roh[0].phase.name) || 'Liga').replace(/\s*\(\d+\)$/, '');
  const DETAILS = window.HB_DETAILS || {};

  // Namensnormalisierung: Versalien in Titelschreibung, Kürzel und römische Ziffern bleiben
  function normalisiere(s) {
    return String(s).replace(/\s+[\u2013\u2014-]\s+/g, ' · ').split(' ').map(w => {
      if (/^(SC|TSV|TV|FC|HT|TH|SG|HSG|SV|TUS|VFL|MTV|TSG|HG|HL|II|III|IV|V|VI)$/.test(w)) return w === 'TUS' ? 'TuS' : w === 'VFL' ? 'VfL' : w;
      if (w.length > 1 && w === w.toUpperCase() && /[A-ZÄÖÜ]{2,}/.test(w)) return w.split('-').map(t => t.charAt(0) + t.slice(1).toLowerCase()).join('-');
      return w;
    }).join(' ');
  }
  teamIds.forEach(id => {
    const t = teams[id];
    t.lang = normalisiere(t.roh);
    t.kurz = t.lang.replace(/^(SC|TSV|TV|FC|HT|TH|SG|HSG|SV|TuS|VfL|MTV|TSG)\s+/, '');
    t.mono = t.kurz.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2).toUpperCase();
  });
  const kurz = id => teams[id] ? teams[id].kurz : '?';
  const lang = id => teams[id] ? teams[id].lang : '?';
  window.kurzname = kurz; // für matchplan.js
  const UNSER = D.teamId;

  // ================= Modelle =================
  const modell = schaetzeModell(gewertet, teamIds);
  const vorher = {}, cache = {};
  gewertet.forEach(g => {
    const tag = g.datum.toISOString().slice(0, 10);
    if (!cache[tag]) cache[tag] = schaetzeModell(gewertet.filter(x => x.datum.toISOString().slice(0, 10) < tag), teamIds);
    vorher[g.id] = prognose(cache[tag], g.heim, g.gast);
  });
  const B = werteSpielberichteAus(DETAILS, spiele, modell);
  const muster = teamMuster(spiele, B.verlaeufe, teamIds);
  const K = teamKennzahlen(DETAILS, spiele, B.verlaeufe, teamIds);
  const LIGA = ligaKennzahlen(K);
  const alleSp = Object.values(B.teams).flatMap(t => t.liste);
  const spNach = {}; alleSp.forEach(s => spNach[s.id] = s);

  const eigeneTab = tabelleAus(gewertet, teamIds);
  const stRoh = (D.standings && D.standings.data) || [];
  const maxRunde = Math.max(0, ...gewertet.map(g => g.runde));
  const offiziell = {};
  stRoh.forEach(z => { const id = z.team.id; if (!offiziell[id] || z.round > offiziell[id].round) offiziell[id] = z; });
  const tabelle = Object.keys(offiziell).length === teamIds.length
    ? Object.values(offiziell).sort((a, b) => a.position - b.position).map(z => ({ id: z.team.id, sp: z.played, s: z.won, u: z.drawn, n: z.lost, tp: z.goals_for, tm: z.goals_against, pkt: z.points }))
    : eigeneTab.map(z => ({ id: z.id, sp: z.sp, s: z.s, u: z.u, n: z.n, tp: z.tp, tm: z.tm, pkt: z.pkt }));
  const bonus = {};
  tabelle.forEach(z => { const e = eigeneTab.find(x => x.id === z.id); bonus[z.id] = Math.max(0, z.pkt - e.pkt); });
  const platz = id => tabelle.findIndex(z => z.id === id) + 1;
  const verlaufTab = {};
  stRoh.forEach(z => { if (z.round <= maxRunde) (verlaufTab[z.team.id] = verlaufTab[z.team.id] || {})[z.round] = z.position; });
  const simBasis = simuliereSaison(modell, gewertet, offen, teamIds, 5000, {}, bonus);
  const rang = teamIds.slice().sort((a, b) => staerke(modell, b) - staerke(modell, a));

  // ================= Zustand =================
  let fokus = Number(merk.get('fokus', UNSER)); if (!teams[fokus]) fokus = teams[UNSER] ? UNSER : teamIds[0];
  let bereich = merk.get('bereich', 'heute');
  const ui = {
    spieleTeam: merk.get('spieleTeam', 'fokus'), spieleStatus: 'alle', tabelleAnsicht: 'tabelle',
    spSuche: '', spTeam: 'alle', spSort: 'einfluss', tmSort: 'staerke', tmAb: true,
  };
  let fest = merk.get('fest', {}); Object.keys(fest).forEach(k => { if (!spielNach[k] || !spielNach[k].offen) delete fest[k]; });
  const labor = { spiel: null, dabei: {}, eigene: merk.get('eigene', {}), form: { f: 0, g: 0 }, neutral: false, offen: null };
  const kader = merk.get('kader', {}); // {teamId: {verf: {}, pins: {}}}
  const kaderVon = id => (kader[id] = kader[id] || { verf: {}, pins: {} });

  // ================= Perspektive (Designkonzept Detail 1) =================
  // Für jedes Spiel: ist das Fokus-Team dabei, und auf welcher Seite. Nur dann gibt es Grün und Rot.
  function sicht(g) {
    const dabei = g.heim === fokus || g.gast === fokus;
    return { dabei, heim: g.heim === fokus, gegner: dabei ? (g.heim === fokus ? g.gast : g.heim) : null };
  }
  function ausFokus(p, g) { // Prognose aus Sicht des Fokus-Teams, sonst Heimsicht
    const s = sicht(g);
    if (!s.dabei) return { a: p.pHeim, u: p.pRemis, b: p.pGast, neutral: true };
    return s.heim ? { a: p.pHeim, u: p.pRemis, b: p.pGast } : { a: p.pGast, u: p.pRemis, b: p.pHeim };
  }
  function streifen(w, dick) {
    const r = drei(w.a, w.u, w.b);
    const c = w.neutral ? ['h', 'u', 'g'] : ['s', 'u', 'n'];
    const lab = w.neutral ? ['Heim', 'Remis', 'Gast'] : ['Sieg', 'Remis', 'Niederlage'];
    return `<div class="streifen${dick ? '' : ' d'}" role="img" aria-label="${lab.map((l, i) => l + ' ' + r[i] + ' Prozent').join(', ')}">${r.map((v, i) => `<i class="${c[i]}" style="flex:${Math.max(v, 1)} 1 0"></i>`).join('')}</div>`;
  }
  const ergebnisAus = (g, id) => { const e = g.heim === id ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim; return e > 0 ? 'S' : e < 0 ? 'N' : 'U'; };

  // ================= Icons =================
  function ico(n, k) {
    const P = {
      tafel: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>',
      plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 12l2 2 4-4"/>',
      kalender: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
      tabelle: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
      labor: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
      trikot: '<path d="M8 3l-4 3 2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
      schilde: '<path d="M8 4l5 2v5c0 4-2.5 6.5-5 8-2.5-1.5-5-4-5-8V6zM16 4l5 2v5c0 4-2.5 6.5-5 8"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
      mehr: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
      chev: '<path d="M8 10l4 4 4-4"/>', chevr: '<path d="M10 7l5 5-5 5"/>',
      zu: '<path d="M7 7l10 10M17 7L7 17"/>', haken: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      druck: '<path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
      kreis: '<circle cx="12" cy="12" r="7"/>', uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      balken: '<path d="M6 18V12M12 18V8M18 18v-4"/>',
    };
    return `<svg class="ico${k ? ' k' : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  }

  // ================= Logo-Kachel mit Monogramm (Detail 4) =================
  function logo(id, g = 20) {
    const t = teams[id];
    const img = t && t.logo ? `<img alt="" loading="lazy" src="${esc(t.logo)}" onload="this.classList.add('da')" onerror="this.remove()">` : '';
    return `<span class="logo l${g}" aria-hidden="true"><span class="mono">${esc(t ? t.mono : '?')}</span>${img}</span>`;
  }

  // ================= Datum =================
  const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  // Die Zeiten von handball.net sind Ortszeit mit falscher UTC-Kennung, also UTC-Werte direkt lesen
  const zeit = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const tagKurz = d => String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.';
  const tagLang = d => `${WT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`;
  function tageBis(d) {
    const h = new Date(); const heute = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - heute) / 864e5);
  }
  const naechstes = id => offen.filter(g => g.heim === id || g.gast === id)[0];
  const spieleVon = id => gewertet.filter(g => g.heim === id || g.gast === id);

  // ================= Bereiche und Navigation =================
  const BEREICHE = [
    { id: 'heute', name: 'Übersicht', kurz: 'Heute', ico: 'tafel' },
    { id: 'matchplan', name: 'Matchplan', kurz: 'Matchplan', ico: 'plan' },
    { id: 'spiele', name: 'Spielplan', kurz: 'Spiele', ico: 'kalender' },
    { id: 'tabelle', name: 'Tabelle & Szenarien', kurz: 'Tabelle', ico: 'tabelle' },
    { id: 'labor', name: 'Spiel-Labor', kurz: 'Labor', ico: 'labor' },
    { id: 'spielerinnen', name: 'Spielerinnen', kurz: 'Spielerinnen', ico: 'trikot' },
    { id: 'teams', name: 'Teams', kurz: 'Teams', ico: 'schilde' },
    { id: 'methodik', name: 'So rechnet die App', kurz: 'Methodik', ico: 'info' },
  ];
  const geholt = new Date(D.fetchedAt);
  const datenstand = `Datenstand ${geholt.toLocaleDateString('de-DE')} ${geholt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;

  function gerüst() {
    $('#seitenleiste').innerHTML = `
      <button class="wechsler" data-aktion="team">${logo(fokus, 28)}<span class="txt"><span class="n" style="display:block">${esc(kurz(fokus))}</span><small>Platz ${platz(fokus)} · ${(tabelle.find(z => z.id === fokus) || {}).pkt || 0} Punkte</small></span>${ico('chev', 1)}</button>
      <nav>${BEREICHE.map((b, i) => `${i === 4 ? '<div class="luecke"></div>' : ''}<button data-bereich="${b.id}" class="${bereich === b.id ? 'an' : ''}">${ico(b.ico)}${b.name}</button>`).join('')}</nav>
      <div class="fuss">${esc(datenstand)}<br>${gewertet.length} Spiele gewertet · ${Object.keys(DETAILS).length} Spielberichte</div>`;
    $('#kopf').innerHTML = `<button class="wechsler" data-aktion="team">${logo(fokus, 24)}<span class="n">${esc(kurz(fokus))}</span>${ico('chev', 1)}</button><span class="platz"></span>
      ${bereich === 'matchplan' ? `<button class="icobtn" data-aktion="drucken" aria-label="Matchplan drucken">${ico('druck')}</button>` : ''}`;
    const tabs = ['heute', 'matchplan', 'spiele', 'tabelle'];
    $('#tabbar').innerHTML = tabs.map(id => { const b = BEREICHE.find(x => x.id === id); return `<button data-bereich="${id}" class="${bereich === id ? 'an' : ''}" aria-label="${b.name}">${ico(b.ico)}<span>${b.kurz}</span></button>`; }).join('') +
      `<button data-aktion="mehr" class="${tabs.includes(bereich) ? '' : 'an'}">${ico('mehr')}<span>Mehr</span></button>`;
  }

  // ================= Sheet =================
  const sheet = $('#sheet');
  function oeffneSheet(titel, html) {
    sheet.innerHTML = `<div class="griff"></div><div class="skopf"><h2 class="titel" id="sheetTitel">${titel}</h2><button class="zu" data-aktion="zu" aria-label="Schließen"><span>${ico('zu', 1)}</span></button></div><div class="sinhalt">${html}</div>`;
    sheet.setAttribute('aria-labelledby', 'sheetTitel');
    if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); }
    sheet.querySelector('.sinhalt').scrollTop = 0;
  }
  function schliesseSheet() { if (sheet.open) sheet.close ? sheet.close() : sheet.removeAttribute('open'); }
  sheet.addEventListener('click', e => { if (e.target === sheet) schliesseSheet(); });

  // ================= Bausteine =================
  const seitenkopf = (titel, metaZeile, rechts) => `<div class="seitenkopf"><div><h1 class="h1">${titel}</h1>${metaZeile ? `<div class="meta">${metaZeile}</div>` : ''}</div>${rechts || ''}</div>`;
  const modul = (titel, inhalt, opt = {}) => `<section class="modul${opt.klasse ? ' ' + opt.klasse : ''}"${opt.id ? ` id="${opt.id}"` : ''}>${titel ? `<div class="mkopf"><div>${opt.eyebrow ? `<span class="micro">${opt.eyebrow}</span>` : ''}<h2 class="titel">${titel}</h2></div>${opt.aktion || ''}</div>` : ''}${inhalt}${opt.fuss ? `<div class="fussnote">${opt.fuss}</div>` : ''}</section>`;
  const kachel = (lab, wert, ctx, delta) => `<div class="kachel"><div class="lab">${lab}</div><div class="kpi"><span>${wert}</span>${delta || ''}</div>${ctx ? `<div class="ctx">${ctx}</div>` : ''}</div>`;
  const etikett = (t, kontur) => `<span class="etikett${kontur ? ' kontur' : ''}">${t}</span>`;
  const stichprobe = n => etikett(`n${NB}=${NB}${n}`);
  const breite = (abzug = 0) => {
    const el = $('#inhalt'); const cs = getComputedStyle(document.documentElement);
    const rand = parseFloat(cs.getPropertyValue('--rand')) || 16, pad = parseFloat(cs.getPropertyValue('--pad')) || 16;
    return Math.max(260, Math.min(1040, el.clientWidth - 2 * rand) - 2 * pad - 2 - abzug);
  };

  function tafel(id) {
    const g = naechstes(id);
    if (!g) {
      const erw = simBasis.plaetze[id].indexOf(Math.max(...simBasis.plaetze[id])) + 1;
      return `<section class="tafel"><div class="zone-a"><span class="micro">Saison</span></div><div class="zahl"><div><div class="hero">${erw}.</div><div class="lab">Platz am Saisonende erwartet</div></div></div><div class="aktionen"><button class="btn prim" data-bereich="tabelle">Zur Tabelle</button></div></section>`;
    }
    const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
    const s = sicht(g), t = tageBis(g.datum);
    const count = g.terminOffen ? '' : t === 0 ? `<span class="count heute">Heute ${zeit(g.datum)}</span>` : t === 1 ? '<span class="count">morgen</span>' : t > 1 ? `<span class="count">in ${t} Tagen</span>` : '';
    const seite = (tid, rolle) => `<div>${logo(tid, 48)}<div class="nm">${esc(kurz(tid))}</div><div class="pl">${rolle} · Platz ${platz(tid)}</div>${tid === fokus ? '<div class="fstrich"></div>' : ''}</div>`;
    const eyebrow = id === UNSER ? `Nächstes Spiel · Spieltag ${g.runde}` : `Nächstes Spiel von ${esc(kurz(id))}`;
    return `<section class="tafel">
      <div class="zone-a"><span class="micro">${eyebrow}</span>${count}</div>
      <div class="termin">${g.terminOffen ? 'Termin noch offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} · ${s.heim ? 'zu Hause' : 'auswärts'}`}</div>
      ${g.halle ? `<div class="halle">${esc(normalisiere(g.halle))}</div>` : ''}
      <div class="kern">
        <button class="paarung" data-spiel="${g.id}" aria-label="Spieldetails">${seite(g.heim, 'Heim')}<div class="vs">${s.heim ? 'gegen' : 'bei'}</div>${seite(g.gast, 'Gast')}</button>
        <div>
          <div class="zahl"><div><div class="hero">${r[0]}<span class="pz">%</span></div><div class="lab">Siegchance ${esc(kurz(id))}</div></div>
          <div class="neben">Remis <b>${r[1]}${NB}%</b><br>Niederlage <b>${r[2]}${NB}%</b></div></div>
          ${streifen(w, true)}
          <div class="erw">Erwartet ${stand(dez(s.heim ? p.eHeim : p.eGast), dez(s.heim ? p.eGast : p.eHeim))} · Basis: ${B.teams[id] ? B.teams[id].spiele.length : 0} Spielberichte je Team</div>
        </div>
      </div>
      <div class="aktionen"><button class="btn prim" data-bereich="matchplan">Matchplan</button><button class="btn" data-labor="${g.id}">Im Labor</button></div>
    </section>`;
  }

  function spielZeile(g, opt = {}) {
    const s = sicht(g);
    const d = g.datum;
    const datum = g.terminOffen ? `<div class="wt">Termin</div><div class="tg t3">offen</div>` : `<div class="wt">${WT[d.getUTCDay()]}</div><div class="tg">${tagKurz(d)}</div>`;
    let paar, rechts;
    if (g.gewertet) {
      const hs = g.toreHeim > g.toreGast ? 'sieger' : g.toreHeim < g.toreGast ? 'verl' : '';
      const gs = g.toreGast > g.toreHeim ? 'sieger' : g.toreGast < g.toreHeim ? 'verl' : '';
      paar = `<div class="${hs}">${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div class="${gs}">${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      const v = B.verlaeufe[g.id], p = vorher[g.id];
      const tipp = p.pHeim >= p.pGast && p.pHeim >= p.pRemis ? 'H' : p.pGast >= p.pRemis ? 'G' : 'U';
      const real = g.toreHeim > g.toreGast ? 'H' : g.toreHeim < g.toreGast ? 'G' : 'U';
      const treffer = `<svg class="treffer" viewBox="0 0 24 24" aria-label="${tipp === real ? 'Prognose lag richtig' : 'Prognose lag daneben'}" fill="none" stroke="currentColor" stroke-width="2">${tipp === real ? '<path d="M5 12.5l4.5 4.5L19 7.5"/>' : '<circle cx="12" cy="12" r="7"/>'}</svg>`;
      rechts = `<div class="ergbox">${opt.sun && s.dabei ? `<span class="sun ${ergebnisAus(g, fokus)}">${ergebnisAus(g, fokus)}</span>` : treffer}<div class="tz">
        <span class="hz">${v ? v.halbzeit.heim : ''}</span><span>${g.toreHeim}</span><span class="hz">${v ? v.halbzeit.gast : ''}</span><span>${g.toreGast}</span></div></div>`;
    } else {
      paar = `<div>${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div>${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      if (g.urteil) rechts = '<span class="cap t2">Urteil</span>';
      else {
        const w = ausFokus(prognose(modell, g.heim, g.gast), g), r = drei(w.a, w.u, w.b);
        rechts = `<div class="chance">${s.dabei ? `${r[0]}${NB}%` : `<span class="cap t2">H ${r[0]} · G ${r[2]}</span>`}</div>${streifen(w)}`;
      }
    }
    return `<button class="spiel${s.dabei && !opt.ohneMarke ? ' fokus' : ''}" data-spiel="${g.id}"><div class="dat">${datum}</div><div class="paar">${paar}</div><div class="erg">${rechts}</div></button>`;
  }

  function tabelleHtml(zeilen, kompakt) {
    return `<div class="${kompakt ? '' : 'scrollx'}"><table class="tab"><thead><tr><th>#</th><th class="l">Team</th><th>Sp</th><th class="opt">S</th><th class="opt">U</th><th class="opt">N</th><th class="opt">Tore</th><th>Diff</th><th>Pkt</th><th class="opt l" style="padding-left:12px">Form</th></tr></thead><tbody>
      ${zeilen.map(z => { const i = platz(z.id), d = z.tp - z.tm; return `<tr class="klick${z.id === fokus ? ' f' : ''}" data-fokus="${z.id}"><td class="t2">${i}</td><td class="l tw"><span class="team">${logo(z.id)}<span>${esc(kurz(z.id))}</span></span></td><td>${z.sp}</td><td class="opt">${z.s}</td><td class="opt">${z.u}</td><td class="opt">${z.n}</td><td class="opt">${stand(z.tp, z.tm)}</td><td>${d > 0 ? '+' : d < 0 ? MINUS : ''}${Math.abs(d)}</td><td class="pk">${z.pkt}</td><td class="opt l" style="padding-left:12px"><span style="display:inline-flex;gap:3px">${spieleVon(z.id).slice(-5).map(g => `<span class="sun" style="width:18px;height:18px;font-size:11px">${''}</span>`.replace('class="sun"', `class="sun ${ergebnisAus(g, z.id)}"`).replace('></span>', `>${ergebnisAus(g, z.id)}</span>`)).join('')}</span></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  // ================= Diagramme =================
  function siegchanceVerlauf(id) {
    const liste = spiele.filter(g => (g.heim === id || g.gast === id) && !g.urteil);
    if (liste.length < 2) return '';
    const W = breite(), H = 180, L = 4, R = 8, T = 16, Bt = 24;
    const x = i => L + 44 + i * (W - L - R - 44) / (liste.length - 1);
    const y = v => T + (1 - v) * (H - T - Bt);
    let pfad = '', punkte = '';
    liste.forEach((g, i) => {
      const p = g.gewertet ? vorher[g.id] : prognose(modell, g.heim, g.gast);
      const v = g.heim === id ? p.pHeim : p.pGast;
      pfad += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      const geg = kurz(g.heim === id ? g.gast : g.heim);
      const e = g.gewertet ? ergebnisAus(g, id) : null;
      const farbe = e ? { S: 'var(--sieg)', U: 'var(--remis)', N: 'var(--niederlage)' }[e] : 'var(--bg-1)';
      const info = `${geg} (${g.heim === id ? 'H' : 'A'}) · Siegchance ${pct(v)}` + (g.gewertet ? ` · ${stand(g.toreHeim, g.toreGast)}` : ' · offen');
      punkte += `<g class="pkt" data-wert="${esc(info)}" data-spiel="${g.id}" style="cursor:pointer"><circle cx="${x(i)}" cy="${y(v)}" r="14" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${farbe}" stroke="${e ? farbe : 'var(--accent)'}" stroke-width="2"/></g>`;
      punkte += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="12" fill="var(--text-3)">${g.runde}</text>`;
    });
    const gitter = [0, .5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-1)"/><text x="${L}" y="${y(v) - 4}" font-size="12" fill="var(--text-3)">${v * 100}${NB}%</text>`).join('');
    return modul('Siegchance je Spiel', `<div class="wertzeile" data-wertzeile>Punkt antippen für Details</div><svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Siegchance je Spiel der Saison">${gitter}<path d="${pfad}" fill="none" stroke="var(--line-2)" stroke-width="1.5"/>${punkte}</svg>`,
      { fuss: 'Gefüllt: gespielt, Farbe zeigt das Ergebnis, Wert ist die Prognose vor dem Anpfiff. Leer: offen, aktuelle Prognose. Unten die Spieltage.' });
  }

  function tabellenVerlauf() {
    const runden = []; for (let r = 1; r <= maxRunde; r++) runden.push(r);
    if (runden.length < 2 || !Object.keys(verlaufTab).length) return `<div class="leer">${ico('tabelle')}<b>Noch kein Verlauf</b><p>Der Verlauf erscheint ab dem zweiten Spieltag.</p></div>`;
    const n = teamIds.length, W = breite(), lab = W < 500 ? 96 : 130, H = 28 * n + 30, L = 22, R = lab, T = 10, Bt = 22;
    const x = r => L + (r - 1) * (W - L - R) / (runden.length - 1);
    const y = p => T + (p - 1) * (H - T - Bt) / (n - 1);
    const reihen = teamIds.slice().sort((a, b) => (a === fokus) - (b === fokus));
    const linien = reihen.map(id => {
      const v = verlaufTab[id] || {};
      const pts = runden.filter(r => v[r]).map(r => [x(r), y(v[r])]);
      if (!pts.length) return '';
      const f = id === fokus, letzte = pts[pts.length - 1];
      return `<g data-fokus="${id}" style="cursor:pointer"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}" fill="none" stroke="${f ? 'var(--accent)' : 'var(--text-3)'}" stroke-width="${f ? 2.5 : 1.25}" stroke-linejoin="round"/>
        ${f ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"/>`).join('') : ''}
        <text x="${letzte[0] + 8}" y="${letzte[1] + 4}" font-size="12" fill="${f ? 'var(--accent)' : 'var(--text-2)'}" font-weight="${f ? 600 : 400}">${esc(kurz(id).slice(0, lab > 100 ? 18 : 12))}</text></g>`;
    }).join('');
    const achse = runden.map(r => `<text x="${x(r)}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--text-3)">${r}</text>`).join('') +
      Array.from({ length: n }, (_, i) => `<text x="${L - 8}" y="${y(i + 1) + 4}" text-anchor="end" font-size="12" fill="var(--text-3)">${i + 1}</text>`).join('');
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tabellenplatz je Spieltag">${achse}${linien}</svg>`;
  }

  // Phasenplan: Tordifferenz je 10-Minuten-Abschnitt, zwei Reihen
  function phasenGrafik(mp) {
    const ph = mp.phasen; if (!ph.fokus || !ph.gegner) return '';
    const W = breite(), rowH = 76, kopfH = 22, zw = 18, H = kopfH + rowH + zw + kopfH + rowH + 24;
    const spalten = 6, hzL = 20, abst = 4;
    const sw = (W - hzL - abst * 4) / spalten;
    const sx = i => i * (sw + abst) + (i >= 3 ? hzL - abst : 0);
    const max = Math.max(5, ...ph.fokus.map(Math.abs), ...ph.gegner.map(Math.abs));
    const bw = Math.min(28, sw * .5);
    const reihe = (werte, y0, eigen, name) => {
      const mitte = y0 + kopfH + rowH / 2, halb = rowH / 2 - 16;
      let s = `<text x="0" y="${y0 + 12}" font-size="12" font-weight="600" fill="var(--text-1)">${esc(name)}</text><line x1="0" x2="${W}" y1="${mitte}" y2="${mitte}" stroke="var(--line-2)"/>`;
      werte.forEach((v, i) => {
        const h = Math.abs(v) / max * halb, bx = sx(i) + sw / 2 - bw / 2;
        const by = v >= 0 ? mitte - h : mitte;
        const fill = eigen ? (v >= 0 ? 'var(--sieg)' : 'var(--niederlage)') : (v >= 0 ? 'var(--text-2)' : 'none');
        if (v !== 0) s += `<rect class="b" x="${bx}" y="${by}" width="${bw}" height="${Math.max(h, 1.5)}" rx="2" fill="${fill}" stroke="${eigen ? 'none' : 'var(--text-2)'}" stroke-width="${eigen ? 0 : 1.5}" style="animation-delay:${i * 30}ms"/>`;
        s += `<text x="${sx(i) + sw / 2}" y="${v >= 0 ? by - 5 : by + h + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text-2)">${vzGanz(v)}</text>`;
      });
      return s;
    };
    const y2 = kopfH + rowH + zw;
    let svg = reihe(ph.fokus, 0, true, kurz(fokus)) + reihe(ph.gegner, y2, false, kurz(mp.gegner));
    const hzX = sx(3) - hzL / 2 - abst / 2 + 2;
    svg += `<line x1="${hzX}" x2="${hzX}" y1="${kopfH}" y2="${H - 22}" stroke="var(--line-2)" stroke-dasharray="3 3"/>`;
    const grenze = i => i === 0 ? 0 : i === 6 ? W : i === 3 ? hzX : sx(i) - abst / 2;
    for (let i = 0; i <= 6; i++) svg += `<text x="${grenze(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === 6 ? 'end' : 'middle'}" font-size="12" fill="var(--text-3)">${i * 10}'</text>`;
    return `<svg class="diagramm wachsen" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tordifferenz je Zehn-Minuten-Abschnitt">${svg}</svg>`;
  }

  function spielverlaufSvg(g, v, W) {
    const s = sicht(g), vzF = s.dabei && !s.heim ? -1 : 1;
    const H = W > 420 ? 200 : 160, L = 4, R = 36, T = 12, Bt = 22;
    const pts = [[0, 0]].concat(v.tore.map(t => [t.min, vzF * (t.heim - t.gast)])); pts.push([60, vzF * (g.toreHeim - g.toreGast)]);
    const mx = Math.max(4, ...pts.map(p => Math.abs(p[1])));
    const x = m => L + Math.min(60, m) / 60 * (W - L - R);
    const y = d => T + (mx - d) / (2 * mx) * (H - T - Bt);
    let pfad = `M${x(0)} ${y(0)}`;
    for (let i = 1; i < pts.length; i++) pfad += `H${x(pts[i][0]).toFixed(1)}V${y(pts[i][1]).toFixed(1)}`;
    const fl = pfad + `H${x(60)}V${y(0)}H${x(0)}Z`;
    const oben = s.dabei ? 'var(--sieg)' : 'var(--text-3)', unten = s.dabei ? 'var(--niederlage)' : 'var(--text-3)', dk = s.dabei ? .16 : .12;
    const ziele = v.tore.map(t => `<rect x="${x(t.min) - 6}" y="${T}" width="12" height="${H - T - Bt}" fill="transparent" data-wert="${t.min}' · ${stand(t.heim, t.gast)}${t.name ? ' · ' + esc(t.name) : ''}${t.sm ? ' · 7m' : ''}"/>`).join('');
    let hoch = 0, tief = 0; pts.forEach(p => { hoch = Math.max(hoch, p[1]); tief = Math.min(tief, p[1]); });
    const obenName = s.dabei ? kurz(fokus) : kurz(g.heim), untenName = s.dabei ? kurz(s.gegner) : kurz(g.gast);
    return `<div class="wertzeile" data-wertzeile>Größte Führung ${esc(obenName)} ${hoch > 0 ? '+' + hoch : '0'}, ${esc(untenName)} ${tief < 0 ? '+' + (-tief) : '0'}</div>
      <svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Spielverlauf">
      <clipPath id="ob${g.id}"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="un${g.id}"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath>
      <path d="${fl}" fill="${oben}" opacity="${dk}" clip-path="url(#ob${g.id})"/><path d="${fl}" fill="${unten}" opacity="${dk}" clip-path="url(#un${g.id})"/>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/>
      <line x1="${x(30)}" x2="${x(30)}" y1="${T}" y2="${H - Bt}" stroke="var(--line-2)"/><text x="${x(30) + 4}" y="${T + 8}" font-size="11" font-weight="600" fill="var(--text-3)">HZ</text>
      <path d="${pfad}" fill="none" stroke="var(--text-1)" stroke-width="1.5"/>
      <text x="${W - R + 6}" y="${y(pts[pts.length - 1][1]) + 4}" font-size="12" font-weight="600" fill="var(--text-1)">${vzGanz(pts[pts.length - 1][1])}</text>
      ${[0, 15, 30, 45, 60].map(m => `<text x="${x(m)}" y="${H - 4}" text-anchor="${m === 0 ? 'start' : m === 60 ? 'end' : 'middle'}" font-size="12" fill="var(--text-3)">${m}'</text>`).join('')}
      <text x="${L}" y="${T + 8}" font-size="11" fill="var(--text-3)">${esc(obenName)} führt</text><text x="${L}" y="${H - Bt - 4}" font-size="11" fill="var(--text-3)">${esc(untenName)} führt</text>
      ${ziele}</svg>`;
  }

  function verteilungSvg(p, basis, g) {
    const s = sicht(g), f = s.dabei && !s.heim ? -1 : 1;
    const W = breite(), H = 150, T = 18, Bt = 22, von = W < 500 ? -12 : -14, bis = -von;
    const n = bis - von + 1, bw = W / n;
    const mu = f * p.diff, mb = f * basis.diff, sd = modell.sigma;
    const pd = (d, m) => normCdf((d + .5 - m) / sd) - normCdf((d - .5 - m) / sd);
    let mx = 0; for (let d = von; d <= bis; d++) mx = Math.max(mx, pd(d, mu), pd(d, mb));
    const hh = v => v / mx * (H - T - Bt);
    let bars = '', huelle = '';
    for (let d = von; d <= bis; d++) {
      const xx = (d - von) * bw;
      const c = !s.dabei ? (d > 0 ? 'var(--neutral-heim)' : d < 0 ? 'var(--neutral-gast)' : 'var(--remis)') : (d > 0 ? 'var(--sieg)' : d < 0 ? 'var(--niederlage)' : 'var(--remis)');
      bars += `<rect x="${xx + bw * .18}" y="${H - Bt - hh(pd(d, mu))}" width="${bw * .64}" height="${hh(pd(d, mu))}" rx="1.5" fill="${c}"/>`;
      huelle += (d === von ? 'M' : 'L') + xx.toFixed(1) + ' ' + (H - Bt - hh(pd(d, mb))).toFixed(1) + 'H' + (xx + bw).toFixed(1);
    }
    const achse = [-10, -5, 0, 5, 10].map(d => `<text x="${(d - von + .5) * bw}" y="${H - 4}" text-anchor="middle" font-size="12" fill="${d === 0 ? 'var(--text-2)' : 'var(--text-3)'}" font-weight="${d === 0 ? 600 : 400}">${d > 0 ? '+' + d : d < 0 ? MINUS + (-d) : 0}</text>`).join('');
    const li = s.dabei ? 'Niederlage' : `${kurz(g.gast)} gewinnt`, re = s.dabei ? 'Sieg' : `${kurz(g.heim)} gewinnt`;
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Verteilung der Tordifferenz"><text x="0" y="10" font-size="12" fill="var(--text-3)">${esc(li)}</text><text x="${W}" y="10" text-anchor="end" font-size="12" fill="var(--text-3)">${esc(re)}</text>${bars}<path d="${huelle}" fill="none" stroke="var(--text-1)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>${achse}</svg>`;
  }

  // ================= Seiten =================
  function auffaelligkeiten(id) {
    const t = B.teams[id], m = muster[id], kz = K[id], liste = [];
    const r = rang.indexOf(id) + 1, pl = platz(id);
    if (r - pl >= 2) liste.push(`Die Tabelle schmeichelt: Platz <b>${pl}</b>, nach Toren und Gegnern aber nur das <b>${r}.</b> stärkste Team.`);
    if (pl - r >= 2) liste.push(`Stärker als der Tabellenplatz: Platz <b>${pl}</b>, laut Modell das <b>${r}.</b> stärkste Team.`);
    if (t && t.liste.length) {
      const top = t.liste.slice().sort((a, b) => b.tore - a.tore)[0];
      liste.push(`<b>${esc(top.name)}</b> wirft ${pct(top.anteil)} der Teamtore, ${top.tore} in ${top.anz} Spiel${top.anz > 1 ? 'en' : ''}.`);
    }
    if (kz && kz.spiele >= 2) {
      const d = kz.diffAbschnitt; const best = d.indexOf(Math.max(...d)), worst = d.indexOf(Math.min(...d));
      if (d[best] >= 1.5) liste.push(`Stärkste Phase: Minute ${best * 10} bis ${best * 10 + 10}, im Schnitt <b>${vz(d[best])}</b> Tore pro Spiel.`);
      if (d[worst] <= -1.5) liste.push(`Schwächste Phase: Minute ${worst * 10} bis ${worst * 10 + 10}, im Schnitt <b>${vz(d[worst])}</b> Tore pro Spiel.`);
    }
    if (m && m.n) {
      const h1 = m.hz1 / m.n, h2 = m.hz2 / m.n;
      if (Math.abs(h2 - h1) >= 1) liste.push(`Halbzeiten: <b>${vz(h1)}</b> vor der Pause, <b>${vz(h2)}</b> danach, im Schnitt pro Spiel.`);
      if (m.knapp) liste.push(`${m.knapp} Spiel${m.knapp > 1 ? 'e' : ''} mit höchstens zwei Toren Unterschied, davon ${m.knappGewonnen} gewonnen.`);
    }
    if (kz && kz.spiele) liste.push(`${dez(kz.zweiProSpiel)} Zeitstrafen pro Spiel, Ligaschnitt ${dez(LIGA.zweiProSpiel)}.`);
    return liste;
  }

  function seiteHeute() {
    const z = tabelle.find(x => x.id === fokus) || { pkt: 0, tp: 0, tm: 0 };
    const r = rang.indexOf(fokus) + 1, pl = platz(fokus), diff = z.tp - z.tm;
    const hinweis = fokus !== UNSER ? `<div class="hinweis">${ico('info')}<span>Du schaust auf ${esc(kurz(fokus))}</span><button class="textaktion" data-fokus="${UNSER}">Zurück zu ${esc(kurz(UNSER))}</button></div>` : '';
    const alter = (Date.now() - geholt) / 864e5;
    const alt = alter > 7 ? `<div class="hinweis">${ico('uhr')}<span>Die Daten sind ${Math.floor(alter)} Tage alt. Für den aktuellen Stand die App über die Start-Datei neu öffnen.</span></div>` : '';
    const sim = simBasis.plaetze[fokus];
    const kach = `<div class="kacheln">
      ${kachel('Tabellenplatz', `${pl}.`, `Modell sieht Platz ${r}`)}
      ${kachel('Punkte', `${z.pkt}`, `${z.sp || 0} Spiele`)}
      ${kachel('Tordifferenz', `${diff > 0 ? '+' : diff < 0 ? MINUS : ''}${Math.abs(diff)}`, `${stand(z.tp, z.tm)} Tore`)}
      ${kachel('Platz 1 am Ende', `${Math.round(sim[0] * 100)}<span class="pz">%</span>`, `Top 3: ${pct(sim[0] + sim[1] + sim[2])}`)}
    </div>`;
    const form = spieleVon(fokus).slice(-5);
    const formHtml = form.length ? `<div class="formreihe">${form.map(g => { const e = ergebnisAus(g, fokus); const geg = g.heim === fokus ? g.gast : g.heim; return `<button data-spiel="${g.id}"><span class="sun gross ${e}">${e}</span><span>${esc(kurz(geg).split(' ')[0])}</span><span class="t3">${g.heim === fokus ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}</span></button>`; }).join('')}</div>` : '<p class="meta">Noch keine Spiele.</p>';
    const ins = auffaelligkeiten(fokus);
    const pIdx = tabelle.findIndex(x => x.id === fokus), mini = tabelle.slice(Math.max(0, Math.min(pIdx - 2, tabelle.length - 5)), Math.max(0, Math.min(pIdx - 2, tabelle.length - 5)) + 5);
    const bald = offen.filter(g => !g.terminOffen).slice(0, 5);
    return `${seitenkopf(esc(kurz(fokus)), `Platz ${pl} · ${z.pkt} Punkte · ${esc(ligaName)}`)}${hinweis}${alt}
      <div class="hero-raster">${tafel(fokus)}${kach}</div>
      <div class="zwei-sp">${modul('Form', formHtml, { eyebrow: 'Letzte Spiele' })}
      ${modul('Auffälligkeiten', ins.slice(0, 4).map(x => `<div class="satz">${x}</div>`).join('') || '<p class="meta">Noch zu wenig Daten.</p>', { aktion: ins.length > 4 ? '<button class="textaktion" data-aktion="alleInsights">Alle</button>' : '', fuss: `Grundlage: ${B.teams[fokus] ? B.teams[fokus].spiele.length : 0} Spielberichte.` })}</div>
      ${siegchanceVerlauf(fokus)}
      <div class="zwei-sp">${modul('Tabelle', tabelleHtml(mini, true), { aktion: '<button class="textaktion" data-bereich="tabelle">Ganze Tabelle</button>' })}
      ${modul('Nächste Spiele der Liga', `<div class="zeilen">${bald.map(g => spielZeile(g)).join('') || '<p class="meta">Keine terminierten Spiele.</p>'}</div>`, { aktion: '<button class="textaktion" data-bereich="spiele">Alle</button>' })}</div>
      <div class="datenfuss">${esc(datenstand)} · Quelle handball.net</div>`;
  }

  // ---------- Matchplan ----------
  function seiteMatchplan() {
    const g = naechstes(fokus);
    if (!g) return seitenkopf('Matchplan') + modul('', `<div class="leer">${ico('plan')}<b>Kein offenes Spiel</b><p>Für ${esc(kurz(fokus))} steht kein Spiel mehr an.</p></div>`);
    const s = sicht(g);
    const mp = erzeugeMatchplan({ modell, B, K, liga: LIGA, g, fokus, eigene: labor.eigene });
    const r = drei(mp.basis.s, mp.basis.u, mp.basis.n);
    const n = Math.min(mp.n || 0, mp.nG || 0);
    const kopf = seitenkopf('Matchplan', `${s.heim ? 'gegen' : 'bei'} ${esc(kurz(mp.gegner))} · ${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)} · ${zeit(g.datum)}`}`,
      `<div style="text-align:right"><div class="kpi">${r[0]}<span class="pz">%</span></div><div class="cap t2">Siegchance</div></div>`);
    const druckKopf = `<div class="nur-druck meta" style="margin-bottom:6px">${esc(lang(g.heim))} gegen ${esc(lang(g.gast))} · Sieg ${r[0]} %, Remis ${r[1]} %, Niederlage ${r[2]} % · ${esc(datenstand)}</div>`;
    const hinweis = `<div class="hinweis">${ico('info')}<span>Grundlage: je ${n || 'wenige'} Spiele mit Spielbericht. Die Zahlen sind Richtwerte, keine Gewissheit.</span></div>`;
    const maxEff = Math.max(1, ...mp.empfehlungen.map(e => Math.abs(e.eff || 0)));
    const karte = e => {
      let links;
      if (e.id === 'AU1') links = `<span class="kpi">${Math.round(e.eff)}</span><small>Punkte hängen an ihr</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU2') links = `<span class="kpi gut">+${Math.round(e.eff)}</span><small>Punkte mit ihr</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU6') { const b0 = e.siebenmeter[0].s; links = `<span class="kpi">${b0.sm}/${b0.smVers}</span><small>7m der Ersten</small>`; }
      else if (e.id === 'AU5') links = `<span class="kpi">${Math.round(B.teams[fokus].liste.slice().sort((a, b) => b.tore - a.tore).slice(0, 2).reduce((a, x) => a + x.anteil, 0) * 100)}<span class="pz">%</span></span><small>Tore von zwei</small>`;
      else if (e.id === 'AU7') links = `<span class="kpi">${e.text.match(/^(\d+)/)[1]}/${e.text.match(/ihrer (\d+)/)[1]}</span><small>Tore ${/zweiten/.test(e.titel) ? '2.' : '1.'} HZ</small>`;
      else if (e.id === 'DI1') links = `<span class="kpi">${e.text.match(/hat (\d+)/)[1]}</span><small>Zeitstrafen</small>`;
      else if (e.id === 'DI2') links = `<span class="kpi">${dez(K[fokus].zweiProSpiel)}</span><small>2' pro Spiel</small>`;
      else links = '';
      return `<article class="karte"><div class="eff">${links}</div><div><span class="micro">${e.kat}</span><h3>${esc(e.titel)}</h3><p>${esc(e.text)}</p><div class="belege">${etikett(ico('balken', 1) + 'Daten')}${stichprobe(e.n)}</div></div></article>`;
    };
    const empf = mp.empfehlungen.length ? `<div class="karten zwei">${mp.empfehlungen.map(karte).join('')}</div>` : modul('', `<div class="leer">${ico('plan')}<b>Zu wenig Spiele für Empfehlungen</b><p>Ab zwei Spielberichten je Team erscheinen hier Tipps zur Aufstellung.</p></div>`);
    const befundKarte = b => `<div class="satz"><span class="micro">${b.kat}</span><div style="font-weight:600;margin:2px 0 2px">${esc(b.titel)}</div><div class="t2">${esc(b.text)}</div></div>`;
    const phasenBef = mp.befunde.filter(b => b.id === 'PH1' || b.id === 'PH2');
    const weitere = mp.befunde.filter(b => b.id !== 'PH1' && b.id !== 'PH2');
    const gegnerinnen = mp.gegnerinnen.length ? `<div class="karten zwei">${mp.gegnerinnen.map(x => `<article class="karte"><div class="eff"><span class="kpi">#${x.s.nummer}</span></div><div><h3 style="margin-top:0">${esc(x.s.name)}</h3><div class="tags">${x.tags.map(t => etikett(esc(t))).join('')}</div><p>${esc(x.text)}</p></div></article>`).join('')}</div>` : '';
    return `${kopf}${druckKopf}${hinweis}
      <div class="mkopf" style="margin-top:8px"><div><span class="micro">Aufstellung und Disziplin</span><h2 class="titel">Empfehlungen</h2></div></div>
      ${empf}
      ${optimiererModul(g)}
      ${mp.phasen.fokus && mp.phasen.gegner ? modul('Spielphasen', `${phasenGrafik(mp)}${phasenBef.map(befundKarte).join('')}`, { eyebrow: 'Befund', fuss: `Tordifferenz je 10 Minuten, Summe aus ${mp.phasen.nF === mp.phasen.nG ? 'je ' + mp.phasen.nF : mp.phasen.nF + ' und ' + mp.phasen.nG} Spielen mit Spielbericht. Gestrichelt: Halbzeit. Warum die Phasen so verlaufen, zeigen die Daten nicht.` }) : ''}
      ${gegnerinnen ? `<div class="mkopf" style="margin-top:8px"><div><span class="micro">${esc(kurz(mp.gegner))}</span><h2 class="titel">Gegnerinnen im Blick</h2></div></div>${gegnerinnen}` : ''}
      ${weitere.length ? modul('Weitere Befunde', weitere.map(befundKarte).join('')) : ''}
      <div class="fussnote nicht-druck">So entstehen die Empfehlungen: <button class="textaktion" style="margin:0;min-height:0" data-bereich="methodik">Methodik</button></div>`;
  }

  function optimiererModul(g) {
    const t = B.teams[fokus]; if (!t) return '';
    const kd = kaderVon(fokus);
    const o = optimiereAufstellung(modell, g, fokus, B, kd.verf, kd.pins, labor.eigene);
    const verf = t.liste.filter(s => kd.verf[s.id] !== false).length;
    const rO = drei(o.chance.s, o.chance.u, o.chance.n), rU = drei(o.chanceUeblich.s, o.chanceUeblich.u, o.chanceUeblich.n);
    const delta = rO[0] - rU[0];
    const sortiert = t.liste.slice().sort((a, b) => (ueblichDabei(b) ? 1 : 0) - (ueblichDabei(a) ? 1 : 0) || b.einfluss - a.einfluss);
    const wertVon = s => { const a = o.auswahl.find(x => x.s === s); if (a) return a.wert; const gst = o.gestrichen.find(x => x.s === s); return gst ? gst.wert : null; };
    const zeile = s => {
      const an = kd.verf[s.id] !== false, w = wertVon(s), pin = !!kd.pins[s.id];
      const im = o.auswahl.some(x => x.s === s);
      const hz = (K[fokus].torHz[s.name] || [0, 0]);
      const info = [`${s.anz}/${t.spiele.length} Sp.`, `${dez(s.toreProSpiel)} Tore/Sp.`];
      if (s.smVers) info.push(`7m ${s.sm}/${s.smVers}`);
      if (s.zwei) info.push(`${s.zwei}× 2'`);
      if (hz[0] + hz[1] >= 3) info.push(`HZ ${hz[0]}/${hz[1]}`);
      const tags = [];
      if (!ueblichDabei(s)) tags.push(belegt(s, labor.eigene) ? 'selten dabei' : 'kein Beleg');
      return `<div class="sz${an && im ? '' : ' aus'}">
        <input type="checkbox" role="switch" class="schalter" data-verf="${esc(s.id)}" ${an ? 'checked' : ''} aria-label="${esc(s.name)} verfügbar">
        <span class="nr">#${s.nummer}</span>
        <span class="wer"><b><span>${esc(s.name)}</span>${tags.map(x => etikett(x, true)).join('')}</b><span class="cap"><span class="nur-mobil">${tags.length ? tags[0] + ' · ' : ''}</span>${info.join(' · ')}</span></span>
        <span style="display:flex;align-items:center;gap:10px"><button class="pinbtn${pin ? ' an' : ''}" data-pin="${esc(s.id)}" title="Fester Platz, etwa Torhüterin">${etikett('fest')}</button>
        <span class="wirk">${w != null && an ? `${Math.round(w)}<small>Pkt.</small>` : '<small>fehlt</small>'}</span></span></div>`;
    };
    const ergebnis = `<div class="kacheln" style="margin-bottom:12px">${kachel('Mit dieser Besetzung', `${rO[0]}<span class="pz">%</span>`, `${o.auswahl.length} Spielerinnen auf dem Bogen`, delta ? `<span class="delta ${delta > 0 ? 'plus' : 'minus'}">${delta > 0 ? '+' : MINUS}${Math.abs(delta)}</span>` : '')}${kachel('Übliche Besetzung', `${rU[0]}<span class="pz">%</span>`, 'alle mit mindestens der Hälfte der Spiele')}</div>`;
    const warn = [];
    if (o.ohnePins) warn.push('Torhüterinnen sind in den Spielberichten nicht gekennzeichnet. Markiere sie mit „fest“, damit sie immer auf dem Bogen stehen.');
    if (o.gestrichen.length) warn.push(`Nicht auf dem Bogen (Grenze ${MATCHPLAN.K}): ${o.gestrichen.map(x => esc(x.s.name)).join(', ')}.`);
    return modul('Aufstellung', `${ergebnis}
      <div class="listenkopf"><span class="meta">${verf} von ${t.liste.length} verfügbar</span><button class="textaktion" data-aktion="alleVerf">Alle verfügbar</button></div>
      <div class="zeilen">${sortiert.map(zeile).join('')}</div>`,
      { eyebrow: 'Optimierer', fuss: `Schalter aus = sagt ab. Die Zahl rechts zeigt, wie viele Prozentpunkte Siegchance an ihr hängen, verglichen mit der üblichen Besetzung. Mehr als die übliche Besetzung bringt höchstens ein Tor, weil nur sieben auf dem Feld stehen. ${warn.join(' ')}`, id: 'optimierer' });
  }

  // ---------- Spielplan ----------
  function seiteSpiele() {
    let liste = ui.spieleTeam === 'fokus' ? spiele.filter(g => g.heim === fokus || g.gast === fokus) : spiele;
    if (ui.spieleStatus === 'offen') liste = liste.filter(g => g.offen);
    if (ui.spieleStatus === 'gespielt') liste = liste.filter(g => !g.offen);
    const runden = [...new Set(liste.map(g => g.runde))].sort((a, b) => a - b);
    const segT = `<div class="seg" role="tablist">${[['alle', 'Alle Teams'], ['fokus', kurz(fokus)]].map(([k, l]) => `<button data-ui="spieleTeam" data-wert="${k}" class="${ui.spieleTeam === k ? 'an' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const segS = `<div class="seg" role="tablist">${[['alle', 'Alle'], ['offen', 'Offen'], ['gespielt', 'Gespielt']].map(([k, l]) => `<button data-ui="spieleStatus" data-wert="${k}" class="${ui.spieleStatus === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    const naechsteRunde = (offen.find(g => ui.spieleTeam !== 'fokus' || g.heim === fokus || g.gast === fokus) || {}).runde;
    return `${seitenkopf('Spielplan', `${esc(ligaName)} · ${gewertet.length} gespielt, ${offen.length} offen`)}${segT}${segS}
      ${modul('', runden.map(r => `<div class="spieltag micro" id="runde${r}"${r === naechsteRunde ? ' data-naechste' : ''}>Spieltag ${r}</div><div class="zeilen">${liste.filter(g => g.runde === r).map(g => spielZeile(g, { sun: ui.spieleTeam === 'fokus', ohneMarke: ui.spieleTeam === 'fokus' })).join('')}</div>`).join('') || `<div class="leer">${ico('kalender')}<b>Keine Spiele</b></div>`,
        { fuss: 'Kleine graue Zahlen: Halbzeitstand. Haken: Prognose lag richtig, Kreis: daneben. Prozent: Siegchance des Teams im Fokus.' })}`;
  }

  // ---------- Tabelle & Szenarien ----------
  function seiteTabelle() {
    const seg = `<div class="seg">${[['tabelle', 'Tabelle'], ['verlauf', 'Verlauf'], ['saison', 'Saisonende']].map(([k, l]) => `<button data-ui="tabelleAnsicht" data-wert="${k}" class="${ui.tabelleAnsicht === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    let inhalt = '';
    if (ui.tabelleAnsicht === 'tabelle') inhalt = modul('', tabelleHtml(tabelle), { fuss: `Offizielle Tabelle von handball.net. Zeile antippen nimmt das Team in den Fokus.${urteile.length ? ` ${urteile.length} Spiel${urteile.length > 1 ? 'e' : ''} per Urteil gewertet.` : ''}` });
    if (ui.tabelleAnsicht === 'verlauf') inhalt = modul('Tabellenplatz je Spieltag', tabellenVerlauf(), { fuss: 'Linie antippen nimmt das Team in den Fokus.' });
    if (ui.tabelleAnsicht === 'saison') {
      const nFest = Object.keys(fest).length;
      const sim = nFest ? simuliereSaison(modell, gewertet, offen, teamIds, 5000, fest, bonus) : simBasis;
      const top3 = (s, id) => s.plaetze[id][0] + s.plaetze[id][1] + s.plaetze[id][2];
      const dl = (a, b) => { const d = Math.round((a - b) * 100); return nFest && d ? ` <span class="delta ${d > 0 ? 'plus' : 'minus'}">${d > 0 ? '+' : MINUS}${Math.abs(d)}</span>` : ''; };
      const stufe = v => v < .01 ? null : v < .05 ? 1 : v < .15 ? 2 : v < .30 ? 3 : v < .50 ? 4 : v < .75 ? 5 : 6;
      const zelle = v => { const s = stufe(v); return s ? `<td class="z" style="background:var(--seq-${s});color:${s >= 5 ? `var(--seq-${s}-text)` : 'var(--text-1)'}">${Math.round(v * 100)}</td>` : '<td class="z"></td>'; };
      const reihe = teamIds.slice().sort((a, b) => sim.punkte[b] - sim.punkte[a]);
      const heat = `<div class="scrollx"><table class="tab heat"><thead><tr><th class="l">Team</th><th>Pkt</th>${teamIds.map((_, i) => `<th style="text-align:center;padding:0">${i + 1}.</th>`).join('')}</tr></thead><tbody>
        ${reihe.map(id => `<tr class="klick${id === fokus ? ' f' : ''}" data-fokus="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td>${dez(sim.punkte[id])}</td>${sim.plaetze[id].map(zelle).join('')}</tr>`).join('')}</tbody></table></div>`;
      const runden = [...new Set(offen.map(g => g.runde))].sort((a, b) => a - b);
      const wi = runden.map(r => `<div class="spieltag micro">Spieltag ${r}</div>` + offen.filter(g => g.runde === r).map(g => {
        const p = prognose(modell, g.heim, g.gast), rr = drei(p.pHeim, p.pRemis, p.pGast), sv = sicht(g);
        return `<div class="sz" style="grid-template-columns:minmax(0,1fr) auto;${sv.dabei ? 'box-shadow:inset 3px 0 0 var(--accent)' : ''}"><span class="wer"><b><span>${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}</span></b><span class="cap">${g.terminOffen ? 'Termin offen' : tagKurz(g.datum)} · Modell H ${rr[0]} · U ${rr[1]} · G ${rr[2]}</span></span>
          <span class="mini-seg">${['H', 'U', 'G'].map(k => `<button data-fest="${g.id}" data-wert="${k}" class="${fest[g.id] === k ? 'an' : ''}" aria-label="${k === 'H' ? 'Heimsieg' : k === 'U' ? 'Unentschieden' : 'Gastsieg'} festlegen">${k}</button>`).join('')}</span></div>`;
      }).join('')).join('');
      inhalt = `<div class="kacheln">${kachel(`Platz 1 · ${esc(kurz(fokus))}`, `${Math.round(sim.plaetze[fokus][0] * 100)}<span class="pz">%</span>`, `erwartete Punkte ${dez(sim.punkte[fokus])}`, dl(sim.plaetze[fokus][0], simBasis.plaetze[fokus][0]))}${kachel('Top 3', `${Math.round(top3(sim, fokus) * 100)}<span class="pz">%</span>`, nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : 'ohne Festlegungen', dl(top3(sim, fokus), top3(simBasis, fokus)))}</div>
        ${modul('Wo landet wer?', heat, { eyebrow: '5.000 simulierte Spielzeiten', fuss: 'Werte in Prozent. Je dunkler, desto wahrscheinlicher.' })}
        ${modul('Was wäre wenn?', `<div class="listenkopf" style="padding:0"><span class="meta">${nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : 'Lege Ergebnisse fest, die Simulation rechnet sofort neu.'}</span>${nFest ? '<button class="textaktion" data-aktion="festWeg">Zurücksetzen</button>' : `<button class="textaktion" data-aktion="fokusSiegt">${esc(kurz(fokus))} gewinnt alles</button>`}</div><div class="zeilen">${wi}</div>`, { id: 'wasWaere' })}`;
    }
    return `${seitenkopf('Tabelle', `${esc(ligaName)} · nach ${maxRunde} Spieltagen`)}${seg}${inhalt}`;
  }

  // ---------- Spiel-Labor ----------
  function laborStandard(g) { labor.dabei = ueblicheBesetzung(B, [g.heim, g.gast]); labor.form = { f: 0, g: 0 }; labor.neutral = false; }
  function laborRechne(g, ohne) {
    const s = sicht(g), fHeim = s.dabei ? s.heim : true;
    const dab = ohne ? Object.assign({}, labor.dabei, { [ohne]: false }) : labor.dabei;
    let eh = besetzungsEffekt(B.teams[g.heim], dab, labor.eigene) + (fHeim ? labor.form.f : labor.form.g);
    const eg = besetzungsEffekt(B.teams[g.gast], dab, labor.eigene) + (fHeim ? labor.form.g : labor.form.f);
    if (labor.neutral) eh -= modell.heim;
    return prognoseMitBesetzung(modell, g.heim, g.gast, eh, eg);
  }
  function seiteLabor() {
    if (!offen.length) return seitenkopf('Spiel-Labor') + modul('', `<div class="leer">${ico('labor')}<b>Keine offenen Spiele</b></div>`);
    if (!labor.spiel || !spielNach[labor.spiel] || !spielNach[labor.spiel].offen) { const n = naechstes(fokus) || offen[0]; labor.spiel = n.id; laborStandard(n); }
    const g = spielNach[labor.spiel], s = sicht(g);
    const reihen = offen.filter(o => o.heim === fokus || o.gast === fokus).concat(offen.filter(o => o.heim !== fokus && o.gast !== fokus)).slice(0, 24);
    const chips = `<div class="chipreihe">${reihen.map(o => `<button class="chip${o.id === g.id ? ' an' : ''}" data-labor="${o.id}">${esc(kurz(o.heim))} · ${esc(kurz(o.gast))} · ${o.terminOffen ? 'offen' : tagKurz(o.datum)}</button>`).join('')}</div>`;
    const seiten = s.dabei ? [fokus, s.gegner] : [g.heim, g.gast];
    const h2h = gewertet.filter(x => (x.heim === g.heim && x.gast === g.gast) || (x.heim === g.gast && x.gast === g.heim));
    return `${seitenkopf('Spiel-Labor', 'Wer spielt, wer fehlt, wie ist die Tagesform')}${chips}
      <div class="modul labor-leiste" id="laborErgebnis"></div>
      <div class="zwei-sp">${seiten.map(tid => kaderModul(g, tid)).join('')}</div>
      ${modul('Tagesform und Halle', `${regler('formF', s.dabei ? kurz(fokus) : kurz(g.heim), labor.form.f)}${regler('formG', s.dabei ? kurz(s.gegner) : kurz(g.gast), labor.form.g)}
        <div class="sz" style="padding:6px 0;grid-template-columns:44px minmax(0,1fr)"><input type="checkbox" role="switch" class="schalter" id="neutral" ${labor.neutral ? 'checked' : ''}><label for="neutral" class="meta" style="color:var(--text-1)">Neutrale Halle, ohne Heimvorteil von ${dez(modell.heim)} Toren</label></div>`, { fuss: 'Tagesform in Toren: plus heißt besser als üblich.' })}
      ${modul('Verteilung der Tordifferenz', '<div id="laborVerteilung"></div>', { fuss: 'Balken: mit deinen Einstellungen. Gestrichelt: Standardprognose ohne Kaderinfo.' })}
      ${modul('Wer würde am meisten fehlen?', '<div id="laborWichtig"></div>', { fuss: 'Um so viele Prozentpunkte sinkt die Siegchance des Teams, wenn nur diese eine Spielerin zusätzlich fehlt.' })}
      ${modul('Direktvergleich', h2h.length ? `<div class="zeilen">${h2h.map(x => spielZeile(x)).join('')}</div>` : '<p class="meta" style="margin:0">Die beiden Teams haben in dieser Saison noch nicht gegeneinander gespielt.</p>')}`;
  }
  function regler(id, name, wert) {
    const pos = (wert + 4) / 8 * 100;
    return `<div class="regler"><label for="${id}">${esc(name)}</label><input type="range" id="${id}" min="-4" max="4" step="0.5" value="${wert}" style="--f0:${Math.min(50, pos)}%;--f1:${Math.max(50, pos)}%" aria-valuetext="${vz(wert)} Tore"><output id="${id}W" class="${wert ? '' : 'null'}">${wert ? vz(wert) : '0'}</output></div>`;
  }
  function kaderModul(g, tid) {
    const t = B.teams[tid];
    if (!t) return modul(esc(kurz(tid)), '<p class="meta" style="margin:0">Für dieses Team liegen noch keine Spielberichte vor.</p>');
    const an = t.liste.filter(s => labor.dabei[s.id]).length;
    return modul(`${logo(tid, 24)} ${esc(kurz(tid))}`, `<div class="listenkopf" style="padding:0 0 4px"><span class="meta">${an} von ${t.liste.length} dabei</span><button class="textaktion" data-aktion="laborUeblich">Übliche Besetzung</button></div>
      <div class="zeilen">${t.liste.map(s => {
        const dab = !!labor.dabei[s.id], eig = labor.eigene[s.id], w = eig != null ? eig : s.einfluss;
        const tagText = !ueblichDabei(s) ? (belegt(s, labor.eigene) ? 'selten dabei' : 'kein Beleg') : '';
        const tag = tagText ? etikett(tagText, true) : '';
        return `<div class="sz${dab ? '' : ' aus'}" data-zeile="${esc(s.id)}"><input type="checkbox" role="switch" class="schalter" data-dabei="${esc(s.id)}" ${dab ? 'checked' : ''} aria-label="${esc(s.name)} spielt mit">
          <span class="nr">#${s.nummer}</span><span class="wer"><b><span>${esc(s.name)}</span>${tag}</b><span class="cap"><span class="nur-mobil">${tagText ? tagText + ' · ' : ''}</span>${dez(s.toreProSpiel)} Tore/Sp. · ${s.anz}/${t.spiele.length} Sp.${s.smVers ? ` · 7m ${s.sm}/${s.smVers}` : ''}</span></span>
          <button class="wirk" data-einfluss="${esc(s.id)}" title="Eigene Einschätzung">${vz(w)}<small>Tore</small></button>
          ${labor.offen === s.id ? `<div class="regelzeile">${reglerEigen(s.id, w)}</div>` : ''}</div>`;
      }).join('')}</div>`, { fuss: 'Zahl rechts: Einfluss auf die Tordifferenz. Antippen, um ihn selbst einzuschätzen, etwa für eine Torhüterin. Alle Werte sind vorläufig, solange es weniger als zwei Spiele mit und zwei ohne die Spielerin gibt.' });
  }
  function reglerEigen(pid, w) {
    const pos = (w + 2) / 10 * 100, mitte = 20;
    return `<div class="regler" style="grid-template-columns:minmax(0,120px) 1fr 48px"><label class="t2">Eigene Einschätzung</label><input type="range" data-eigen="${esc(pid)}" min="-2" max="8" step="0.5" value="${w}" style="--f0:${Math.min(mitte, pos)}%;--f1:${Math.max(mitte, pos)}%"><output>${vz(w)}</output></div>`;
  }
  function laborErgebnis() {
    const g = spielNach[labor.spiel]; if (!g || !$('#laborErgebnis')) return;
    const s = sicht(g);
    const basis = prognose(modell, g.heim, g.gast), p = laborRechne(g);
    const wb = ausFokus(basis, g), wp = ausFokus(p, g);
    const rp = drei(wp.a, wp.u, wp.b), rb = drei(wb.a, wb.u, wb.b);
    const lab = wp.neutral ? ['Heimsieg', 'Remis', 'Gastsieg'] : ['Sieg', 'Remis', 'Niederlage'];
    const d = i => { const x = rp[i] - rb[i]; return x ? `<span class="d ${(i === 0 && !wp.neutral) ? (x > 0 ? 'plus' : 'minus') : (i === 2 && !wp.neutral) ? (x > 0 ? 'minus' : 'plus') : 't2'}">${x > 0 ? '+' : MINUS}${Math.abs(x)}</span>` : ''; };
    $('#laborErgebnis').innerHTML = `<div class="micro" style="text-align:center">${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}${s.dabei ? ` · Sicht ${esc(kurz(fokus))}` : ''}</div>
      <div class="ergebnis3">${rp.map((v, i) => `<div><div class="w">${v}<span class="pz">%</span>${d(i)}</div><div class="lab">${lab[i]}</div></div>`).join('')}</div>
      ${streifen(wp, true)}<div class="cap t2" style="text-align:center;margin-top:8px">Ohne Kaderinfo ${rb.join(' / ')} · erwartet ${stand(dez(s.dabei && !s.heim ? p.eGast : p.eHeim), dez(s.dabei && !s.heim ? p.eHeim : p.eGast))}</div>`;
    $('#laborVerteilung').innerHTML = verteilungSvg(p, basis, g);
    const seiten = s.dabei ? [fokus, s.gegner] : [g.heim, g.gast];
    $('#laborWichtig').innerHTML = `<div class="zwei-sp" style="margin:0">${seiten.map(tid => {
      const t = B.teams[tid]; if (!t) return '<div></div>';
      const sichtVon = q => (g.heim === tid ? q.pHeim : q.pGast);
      const b0 = sichtVon(p);
      const l = t.liste.filter(x => labor.dabei[x.id]).map(x => ({ x, d: sichtVon(laborRechne(g, x.id)) - b0 })).sort((a, b) => a.d - b.d).slice(0, 5);
      const mx = Math.max(.01, ...l.map(z => -z.d));
      return `<div><div class="cap" style="font-weight:600;margin-bottom:6px;display:flex;gap:8px;align-items:center">${logo(tid)} ${esc(kurz(tid))}</div>${l.map(z => `<div class="bl"><span class="nm"><span>${esc(z.x.name)}</span></span><span class="spur"><i class="${tid === fokus ? 'f' : ''}" style="left:0;width:${Math.max(0, -z.d) / mx * 100}%"></i></span><span class="w">${vzGanz(z.d * 100)}</span></div>`).join('')}</div>`;
    }).join('')}</div>`;
  }

  // ---------- Spielerinnen ----------
  const SORT = { einfluss: ['Einfluss', s => s.einfluss], tore: ['Tore', s => s.tore], tps: ['je Spiel', s => s.toreProSpiel], sm: ['7m', s => s.smVers ? s.sm / s.smVers + s.smVers / 1000 : -1] };
  function seiteSpielerinnen() {
    const chips = `<div class="chipreihe"><button class="chip${ui.spTeam === 'alle' ? ' an' : ''}" data-ui="spTeam" data-wert="alle">Alle</button>${tabelle.map(z => `<button class="chip${String(ui.spTeam) === String(z.id) ? ' an' : ''}" data-ui="spTeam" data-wert="${z.id}">${logo(z.id, 16)}${esc(kurz(z.id))}</button>`).join('')}</div>`;
    const seg = `<div class="seg">${Object.entries(SORT).map(([k, [l]]) => `<button data-ui="spSort" data-wert="${k}" class="${ui.spSort === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    const abh = teamIds.filter(id => B.teams[id]).sort((a, b) => B.teams[b].top1 - B.teams[a].top1);
    return `${seitenkopf('Spielerinnen', `${alleSp.length} Spielerinnen aus ${Object.keys(B.teams).length} Teams`)}
      <input class="chip" style="width:100%;height:40px;border-radius:var(--r-m);padding:0 14px;margin-bottom:12px;font-size:15px" id="spSuche" type="search" placeholder="Name suchen" value="${esc(ui.spSuche)}" autocomplete="off">
      ${chips}${seg}<div id="spListe"></div>
      ${modul('Abhängigkeit von der besten Torschützin', abh.map(id => { const t = B.teams[id]; const top = t.liste.slice().sort((a, b) => b.tore - a.tore)[0];
        return `<button class="bl" data-fokus="${id}"><span class="nm">${logo(id)}<span>${esc(kurz(id))}</span></span><span class="spur"><i class="${id === fokus ? 'f' : ''}" style="left:0;width:${Math.min(100, t.top1 * 100 / .5)}%"></i></span><span class="w">${pct(t.top1)}</span></button>`; }).join(''),
        { fuss: 'Anteil der besten Torschützin an allen Teamtoren. Je höher, desto mehr hängt das Team an ihr.' })}`;
  }
  function spListe() {
    const q = ui.spSuche.trim().toLowerCase(), f = SORT[ui.spSort][1];
    const liste = alleSp.filter(s => (ui.spTeam === 'alle' || String(s.team) === String(ui.spTeam)) && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => f(b) - f(a));
    const wert = s => ui.spSort === 'einfluss' ? vz(s.einfluss) : ui.spSort === 'tore' ? s.tore : ui.spSort === 'tps' ? dez(s.toreProSpiel) : (s.smVers ? `${s.sm}/${s.smVers}` : '–'.replace('–', ''));
    const el = $('#spListe'); if (!el) return;
    el.innerHTML = liste.length ? modul('', `<div class="zeilen">${liste.slice(0, 120).map((s, i) => `<button class="spiel${s.team === fokus ? ' fokus' : ''}" style="grid-template-columns:28px minmax(0,1fr) auto;min-height:56px" data-spielerin="${esc(s.id)}">
        <span class="cap t3" style="text-align:right">${i + 1}</span><span class="paar"><div style="height:auto"><span style="font-weight:500">${esc(s.name)}</span></div><div style="height:auto;gap:6px">${logo(s.team, 16)}<span class="cap t2">#${s.nummer} · ${esc(kurz(s.team))} · ${s.tore} Tore in ${s.anz} Sp.</span></div></span>
        <span style="font-weight:600;font-size:17px">${wert(s)}</span></button>`).join('')}</div>`) :
      modul('', `<div class="leer">${ico('trikot')}<b>Keine Spielerin gefunden</b><p>Keine Treffer für „${esc(ui.spSuche)}“.</p></div>`);
  }

  // ---------- Teams ----------
  const TM = [
    ['name', 'Team', id => kurz(id)], ['staerke', 'Stärke', id => staerke(modell, id)], ['att', 'Angriff', id => modell.att[id] || 0], ['def', 'Abwehr', id => modell.def[id] || 0],
    ['hz1', '1. HZ', id => muster[id].n ? muster[id].hz1 / muster[id].n : 0], ['hz2', '2. HZ', id => muster[id].n ? muster[id].hz2 / muster[id].n : 0],
    ['schluss', 'ab 50.', id => muster[id].n ? muster[id].schluss / muster[id].n : 0],
    ['smq', '7m', id => K[id].smQuote == null ? -1 : K[id].smQuote], ['zwei', "2'/Sp", id => K[id].zweiProSpiel], ['top1', 'Top-Anteil', id => B.teams[id] ? B.teams[id].top1 : 0],
  ];
  function seiteTeams() {
    const sp = TM.find(c => c[0] === ui.tmSort);
    const liste = teamIds.slice().sort((a, b) => { const x = sp[2](a), y = sp[2](b); const c = typeof x === 'string' ? x.localeCompare(y, 'de') : x - y; return ui.tmAb ? -c : c; });
    const mx = Math.max(1, ...teamIds.map(id => Math.abs(staerke(modell, id))));
    const balken = rang.map(id => { const s = staerke(modell, id), w = Math.abs(s) / mx * 50;
      return `<button class="bl" data-fokus="${id}"><span class="nm">${logo(id)}<span style="${id === fokus ? 'font-weight:600' : ''}">${esc(kurz(id))}</span></span><span class="spur"><span class="null"></span><i class="${id === fokus ? 'f' : ''}" style="left:${s >= 0 ? 50 : 50 - w}%;width:${w}%"></i></span><span class="w">${vz(s)}</span></button>`; }).join('');
    const tab = `<div class="scrollx"><table class="tab"><thead><tr>${TM.map(c => `<th class="sort${c[0] === 'name' ? ' l' : ''}${ui.tmSort === c[0] ? ' an' : ''}" data-tmsort="${c[0]}">${c[1]}${ui.tmSort === c[0] ? (ui.tmAb ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>
      ${liste.map(id => { const m = muster[id], k = K[id], t = B.teams[id];
        return `<tr class="klick${id === fokus ? ' f' : ''}" data-fokus="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td style="font-weight:700">${vz(staerke(modell, id))}</td><td>${vz(modell.att[id] || 0)}</td><td>${vz(modell.def[id] || 0)}</td>
        <td>${m.n ? vz(m.hz1 / m.n) : ''}</td><td>${m.n ? vz(m.hz2 / m.n) : ''}</td><td>${m.n ? vz(m.schluss / m.n) : ''}</td><td>${k.smQuote == null ? '' : pct(k.smQuote)}</td><td>${k.spiele ? dez(k.zweiProSpiel) : ''}</td><td>${t ? pct(t.top1) : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    return `${seitenkopf('Teams', 'Stärke und Profile im Vergleich')}
      ${modul('Teamstärke laut Modell', balken, { fuss: 'Tore besser oder schlechter als ein Durchschnittsteam auf neutralem Platz.' })}
      ${modul('Vergleich', tab, { fuss: 'Angriff und Abwehr in Toren gegenüber dem Ligaschnitt. 1. HZ, 2. HZ und ab 50.: durchschnittliche Tordifferenz in diesem Abschnitt. Spaltenkopf sortiert.' })}`;
  }

  // ---------- Methodik ----------
  function seiteMethodik() {
    let treffer = 0, summe = 0, brier = 0;
    gewertet.forEach(g => {
      const p = vorher[g.id], real = g.toreHeim > g.toreGast ? 0 : g.toreHeim === g.toreGast ? 1 : 2, arr = [p.pHeim, p.pRemis, p.pGast];
      if (arr.indexOf(Math.max(...arr)) === real) treffer++;
      summe += arr[real]; brier += arr.reduce((s, q, i) => s + (q - (i === real ? 1 : 0)) ** 2, 0);
    });
    const n = gewertet.length || 1;
    return `${seitenkopf('So rechnet die App', 'Modell, Grenzen und Trefferquote')}
      <div class="kacheln vier">${kachel('Favorit gewann', `${treffer}/${gewertet.length}`, 'Prognose vor dem Anpfiff')}${kachel('Ø fürs echte Ergebnis', `${Math.round(summe / n * 100)}<span class="pz">%</span>`, 'Wahrscheinlichkeit, die das Modell gab')}${kachel('Brier-Score', dez(brier / n, 2), '0 perfekt, 0,67 Raten')}${kachel('Heimvorteil', vz(modell.heim), `Tore · Streuung ±${dez(modell.sigma)}`)}</div>
      ${modul('Teamstärke und Siegchance', `<div class="fliess"><p>Aus allen gewerteten Ergebnissen schätzt die App für jedes Team eine Angriffs- und eine Abwehrstärke plus einen Heimvorteil. Am Saisonanfang zieht sie alle Teams Richtung Durchschnitt und wird mit jedem Ergebnis mutiger.</p><p>Daraus ergibt sich für jedes Spiel eine erwartete Tordifferenz. Weil Handball streut, wird sie als Glockenkurve behandelt. Die Flächen links, in der Mitte und rechts sind Niederlage, Remis und Sieg. Die Trefferquote oben ist ehrlich gemessen: Jedes Spiel wurde nur mit den Ergebnissen bewertet, die vor dem Anpfiff feststanden.</p></div>`)}
      ${modul('Spielerinnen und Aufstellung', `<div class="fliess"><p>Der Einfluss einer Spielerin stützt sich vor allem auf ihre Tore je Spiel. Davon fangen die Mitspielerinnen bei einem Ausfall rechnerisch die Hälfte auf. Bei wenigen Spielen wird der Wert Richtung des halben Teamschnitts gezogen. Ein Vergleich, wie das Team mit und ohne sie abschneidet, zählt erst ab zwei Spielen mit und zwei ohne sie, und auch dann nur gedämpft.</p><p>Die Teamstärke enthält schon, wie oft eine Spielerin sonst dabei ist. Fehlt eine Stammspielerin, wird ihr Einfluss mal ihrer Einsatzquote abgezogen. Zusätzliche Spielerinnen bringen nur so viel, wie sie fehlende ersetzen, plus höchstens ein Tor Kadertiefe, weil nur sieben auf dem Feld stehen. Wer selten dabei war und nie getroffen hat, bekommt keinen Mehrwert zugeschrieben.</p></div>`)}
      ${modul('Matchplan', `<div class="fliess"><p>Der Matchplan zeigt nur datenbelegte Aussagen: unverzichtbare Spielerinnen, Spielerinnen mit Mehrwert, 7-Meter-Reihenfolge nach Quote, Halbzeitprofile, Zeitstrafen-Risiko, Spielphasen und die wichtigsten Gegnerinnen. Taktische Ratschläge gibt es bewusst nicht, weil die Daten keine Positionen, Einsatzminuten oder Paraden enthalten. Jede Karte trägt die Zahl der Spiele, auf denen sie beruht.</p></div>`)}
      ${modul('Grenzen', `<div class="fliess"><p>Torhüterinnen sind in den Spielberichten nicht gekennzeichnet, ihre Paraden fehlen. Verletzungen, Trainingsstand und die Vorsaison kennt das Modell nicht. Bei drei bis vier Spielen je Team sind alle Werte Richtwerte.</p></div>`)}
      ${modul('Daten', `<div class="meta">${esc(datenstand)}. Quelle: handball.net. ${gewertet.length} gewertete Spiele, ${Object.keys(DETAILS).length} Spielberichte mit Aufstellung und Liveticker, ${offen.length} offene Spiele.</div>`)}`;
  }

  // ================= Detail-Sheets =================
  function spielDetail(id) {
    const g = spielNach[id]; if (!g) return;
    const v = B.verlaeufe[id], d = DETAILS[id], s = sicht(g);
    const W = Math.min(448, window.innerWidth) - 2 * 16 - 2;
    const kopfH = `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;text-align:center;align-items:center;margin:4px 0 16px">
      <button data-fokus="${g.heim}" style="border:0;background:none;color:inherit">${logo(g.heim, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.heim))}</div></button>
      <div>${g.gewertet ? `<div style="font:700 40px/40px var(--font-display);letter-spacing:-.03em">${stand(g.toreHeim, g.toreGast)}</div>${v ? `<div class="meta">Halbzeit ${stand(v.halbzeit.heim, v.halbzeit.gast)}</div>` : ''}` : `<div class="meta">${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)}<br>${zeit(g.datum)} Uhr`}</div>`}</div>
      <button data-fokus="${g.gast}" style="border:0;background:none;color:inherit">${logo(g.gast, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.gast))}</div></button></div>`;
    let html = kopfH;
    if (g.gewertet) {
      const w = ausFokus(vorher[g.id], g), r = drei(w.a, w.u, w.b);
      html += `<div class="micro">Prognose vor dem Spiel</div><div class="meta" style="margin:4px 0 6px">${w.neutral ? `Heim ${r[0]} · Remis ${r[1]} · Gast ${r[2]}` : `Sieg ${r[0]} · Remis ${r[1]} · Niederlage ${r[2]}`} %</div>${streifen(w, true)}`;
      if (v && v.tore.length) html += `<div class="micro" style="margin:20px 0 4px">Spielverlauf</div>${spielverlaufSvg(g, v, W)}`;
      if (d && d.l && d.l.data) {
        const spalte = (seite, tid) => {
          const ps = (d.l.data[seite].players || []).filter(p => !p.is_staff).sort((a, b) => b.goals - a.goals || a.number - b.number);
          return `<div class="micro" style="margin:20px 0 4px;display:flex;gap:8px;align-items:center">${logo(tid, 16)} ${esc(kurz(tid))}</div><table class="tab"><thead><tr><th>#</th><th class="l">Spielerin</th><th>Tore</th><th>7m</th><th>2'</th></tr></thead><tbody>
            ${ps.map(p => `<tr class="klick" data-spielerin="${esc(p.player.id)}"><td class="t3">${p.number}</td><td class="l" style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(p.player.first_name + ' ' + p.player.last_name)}</td><td style="font-weight:600">${p.goals || ''}</td><td class="t2">${p.seven_meter_attempts ? p.seven_meter_goals + '/' + p.seven_meter_attempts : ''}</td><td class="t2">${p.two_minutes || ''}</td></tr>`).join('')}</tbody></table>`;
        };
        html += spalte('local', g.heim) + spalte('visitor', g.gast);
      } else html += `<div class="leer">${ico('info')}<b>Kein Spielbericht</b><p>Für dieses Spiel gibt es keinen Spielbericht. Ergebnis und Prognose stehen oben.</p></div>`;
    } else if (g.urteil) {
      html += '<p class="meta">Dieses Spiel wurde per Urteil gewertet. handball.net zeigt dazu kein Ergebnis.</p>';
    } else {
      const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
      const lab = w.neutral ? ['Heimsieg', 'Remis', 'Gastsieg'] : ['Sieg', 'Remis', 'Niederlage'];
      html += `<div class="ergebnis3">${r.map((x, i) => `<div><div class="w">${x}<span class="pz">%</span></div><div class="lab">${lab[i]}</div></div>`).join('')}</div>${streifen(w, true)}
        <div class="cap t2" style="text-align:center;margin-top:8px">Erwartet ${stand(dez(p.eHeim), dez(p.eGast))}${g.halle ? ' · ' + esc(normalisiere(g.halle)) : ''}</div>
        <div class="kacheln" style="margin-top:20px">${[g.heim, g.gast].map(tid => kachel(esc(kurz(tid)), `${platz(tid)}.`, `Stärke ${vz(staerke(modell, tid))} · Form ${spieleVon(tid).slice(-3).map(x => ergebnisAus(x, tid)).join(' ') || 'offen'}`)).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${s.dabei ? '<button class="btn prim" data-bereich="matchplan">Matchplan</button>' : ''}<button class="btn${s.dabei ? '' : ' prim'}" data-labor="${g.id}" style="${s.dabei ? '' : 'grid-column:1/-1'}">Im Labor durchspielen</button></div>`;
    }
    oeffneSheet(`Spieltag ${g.runde}`, html);
  }

  function spielerinDetail(pid) {
    const s = spNach[pid]; if (!s) return;
    const t = B.teams[s.team];
    const zeilen = t.spiele.map(mid => spielNach[mid]).sort((a, b) => a.datum - b.datum).map(g => {
      const dabei = s.spiele.includes(g.id);
      let tore = '';
      if (dabei && DETAILS[g.id]) { const seite = g.heim === s.team ? 'local' : 'visitor'; const p = DETAILS[g.id].l.data[seite].players.find(x => x.player.id === pid); tore = p ? p.goals : ''; }
      const e = ergebnisAus(g, s.team), geg = g.heim === s.team ? g.gast : g.heim;
      return `<tr class="klick" data-spiel="${g.id}" style="${dabei ? '' : 'opacity:.45'}"><td class="l t2">${tagKurz(g.datum)}</td><td class="l" style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${g.heim === s.team ? 'gegen' : 'bei'} ${esc(kurz(geg))}</td><td><span class="sun ${e}" style="width:18px;height:18px;font-size:11px">${e}</span></td><td style="font-weight:600">${dabei ? tore : '<span class="cap t3">nicht dabei</span>'}</td></tr>`;
    }).join('');
    const hz = (K[s.team].torHz[s.name] || [0, 0]);
    oeffneSheet(`#${s.nummer} ${esc(s.name)}`, `<div class="meta" style="display:flex;gap:8px;align-items:center;margin-bottom:16px">${logo(s.team)} ${esc(lang(s.team))}</div>
      <div class="kacheln">${kachel('Tore je Spiel', dez(s.toreProSpiel), `${s.tore} Tore in ${s.anz} von ${t.spiele.length} Spielen`)}${kachel('Anteil Teamtore', `${Math.round(s.anteil * 100)}<span class="pz">%</span>`, `Halbzeiten ${hz[0]} / ${hz[1]}`)}${kachel('7-Meter', s.smVers ? `${s.sm}/${s.smVers}` : '0', s.smVers ? pct(s.sm / s.smVers) + ' Quote' : 'keine Versuche')}${kachel('Einfluss', vz(s.einfluss), 'Tore auf die Tordifferenz')}</div>
      <div class="fussnote" style="margin-top:0">Torbeitrag über Ersatzniveau ${vz(s.torbeitrag)}. ${s.mitOhne == null ? 'Noch kein Spiel ohne sie, deshalb zählt nur der Torbeitrag.' : !s.gewichtMitOhne ? `Mit/Ohne-Vergleich ${vz(s.mitOhne)} Tore, zählt erst ab zwei Spielen mit und zwei ohne sie.` : `Mit/Ohne-Vergleich ${vz(s.mitOhne)} Tore, Gewicht ${pct(s.gewichtMitOhne)}.`}</div>
      <div class="micro" style="margin:20px 0 4px">Spiele</div><table class="tab"><tbody>${zeilen}</tbody></table>`);
  }

  function teamWechsler() {
    oeffneSheet('Team wählen', tabelle.map(z => `<button class="listezeile" data-fokus="${z.id}"><span class="platz">${platz(z.id)}</span>${logo(z.id, 28)}<span class="nm">${esc(kurz(z.id))} ${z.id === UNSER ? etikett('Unser Team') : ''}</span>${z.id === fokus ? ico('haken', 1) : ''}</button>`).join(''));
  }
  function mehrSheet() {
    oeffneSheet('Mehr', BEREICHE.slice(4).map(b => `<button class="listezeile" data-bereich="${b.id}">${ico(b.ico)}<span class="nm">${b.name}</span>${bereich === b.id ? ico('haken', 1) : ico('chevr', 1).replace('class="ico k"', 'class="ico k t3"')}</button>`).join(''));
  }

  // ================= Zeichnen =================
  let letzteBreite = 0;
  function zeichne(scrollOben) {
    const seiten = { heute: seiteHeute, matchplan: seiteMatchplan, spiele: seiteSpiele, tabelle: seiteTabelle, labor: seiteLabor, spielerinnen: seiteSpielerinnen, teams: seiteTeams, methodik: seiteMethodik };
    if (!seiten[bereich]) bereich = 'heute';
    gerüst();
    $('#inhalt').innerHTML = seiten[bereich]();
    document.title = `${(BEREICHE.find(b => b.id === bereich) || {}).name} · ${kurz(fokus)}`;
    if (bereich === 'labor') laborErgebnis();
    if (bereich === 'spielerinnen') spListe();
    letzteBreite = window.innerWidth;
    if (scrollOben) {
      window.scrollTo(0, 0);
      if (bereich === 'spiele') { const el = document.querySelector('[data-naechste]'); if (el && el.id !== 'runde1') el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }
    }
  }
  function wechsle(b) { bereich = b; merk.set('bereich', b); schliesseSheet(); zeichne(true); }
  function setzeFokus(id) { fokus = id; merk.set('fokus', id); labor.spiel = null; schliesseSheet(); zeichne(true); }

  // ================= Ereignisse =================
  document.addEventListener('click', e => {
    if (e.target.matches('input')) return;
    const el = e.target.closest('[data-aktion],[data-bereich],[data-fokus],[data-spiel],[data-spielerin],[data-labor],[data-ui],[data-fest],[data-tmsort],[data-einfluss],[data-pin],[data-wert]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.wert && el.closest('.pkt') == null && !ds.ui && !ds.fest && el.tagName !== 'BUTTON') {
      const z = el.closest('.modul, .sinhalt'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz) wz.textContent = ds.wert; return;
    }
    if (ds.aktion) {
      const a = ds.aktion;
      if (a === 'zu') return schliesseSheet();
      if (a === 'team') return teamWechsler();
      if (a === 'mehr') return mehrSheet();
      if (a === 'drucken') return window.print();
      if (a === 'alleInsights') return oeffneSheet('Auffälligkeiten', auffaelligkeiten(fokus).map(x => `<div class="satz">${x}</div>`).join(''));
      if (a === 'festWeg') { fest = {}; merk.set('fest', fest); return zeichne(); }
      if (a === 'fokusSiegt') { offen.forEach(o => { if (o.heim === fokus) fest[o.id] = 'H'; if (o.gast === fokus) fest[o.id] = 'G'; }); merk.set('fest', fest); return zeichne(); }
      if (a === 'alleVerf') { kaderVon(fokus).verf = {}; merk.set('kader', kader); return zeichne(); }
      if (a === 'laborUeblich') { laborStandard(spielNach[labor.spiel]); return zeichne(); }
      return;
    }
    if (ds.bereich) return wechsle(ds.bereich);
    if (ds.fokus) return setzeFokus(Number(ds.fokus));
    if (ds.labor) { const g = spielNach[ds.labor]; labor.spiel = g.id; laborStandard(g); labor.offen = null; if (bereich !== 'labor') return wechsle('labor'); return zeichne(); }
    if (el.closest('.pkt')) { const p = el.closest('.pkt'); const z = p.closest('.modul'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz && wz.textContent !== p.dataset.wert) { wz.textContent = p.dataset.wert; return; } return spielDetail(Number(p.dataset.spiel)); }
    if (ds.spiel) return spielDetail(Number(ds.spiel));
    if (ds.spielerin) return spielerinDetail(ds.spielerin);
    if (ds.ui) {
      const k = ds.ui; ui[k] = ds.wert; if (k === 'spieleTeam') merk.set('spieleTeam', ds.wert);
      if (k === 'spTeam' || k === 'spSort') { $$(`[data-ui="${k}"]`).forEach(b => b.classList.toggle('an', b.dataset.wert === ds.wert)); return spListe(); }
      return zeichne();
    }
    if (ds.fest) { if (fest[ds.fest] === ds.wert) delete fest[ds.fest]; else fest[ds.fest] = ds.wert; merk.set('fest', fest); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.tmsort) { if (ui.tmSort === ds.tmsort) ui.tmAb = !ui.tmAb; else { ui.tmSort = ds.tmsort; ui.tmAb = ds.tmsort !== 'name'; } return zeichne(); }
    if (ds.einfluss) { labor.offen = labor.offen === ds.einfluss ? null : ds.einfluss; const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.pin) { const kd = kaderVon(fokus); kd.pins[ds.pin] = !kd.pins[ds.pin]; merk.set('kader', kader); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
  });
  document.addEventListener('change', e => {
    const t = e.target, y = window.scrollY;
    if (t.dataset.verf) { kaderVon(fokus).verf[t.dataset.verf] = t.checked ? undefined : false; if (t.checked) delete kaderVon(fokus).verf[t.dataset.verf]; merk.set('kader', kader); zeichne(); window.scrollTo(0, y); return; }
    if (t.dataset.dabei) { labor.dabei[t.dataset.dabei] = t.checked; t.closest('.sz').classList.toggle('aus', !t.checked); const kopf = t.closest('.modul').querySelector('.listenkopf .meta'); if (kopf) { const alle = t.closest('.modul').querySelectorAll('[data-dabei]'); kopf.textContent = `${[...alle].filter(x => x.checked).length} von ${alle.length} dabei`; } return laborErgebnis(); }
    if (t.id === 'neutral') { labor.neutral = t.checked; return laborErgebnis(); }
    if (t.dataset.eigen) { merk.set('eigene', labor.eigene); return; }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'formF' || t.id === 'formG') {
      const v = Number(t.value); labor.form[t.id === 'formF' ? 'f' : 'g'] = v;
      const pos = (v + 4) / 8 * 100; t.style.setProperty('--f0', Math.min(50, pos) + '%'); t.style.setProperty('--f1', Math.max(50, pos) + '%');
      const o = $('#' + t.id + 'W'); o.textContent = v ? vz(v) : '0'; o.classList.toggle('null', !v);
      return laborErgebnis();
    }
    if (t.dataset.eigen) {
      const v = Number(t.value); labor.eigene[t.dataset.eigen] = v;
      const pos = (v + 2) / 10 * 100; t.style.setProperty('--f0', Math.min(20, pos) + '%'); t.style.setProperty('--f1', Math.max(20, pos) + '%');
      t.parentNode.querySelector('output').textContent = vz(v);
      const btn = t.closest('.sz').querySelector('.wirk'); if (btn) btn.innerHTML = `${vz(v)}<small>Tore</small>`;
      return laborErgebnis();
    }
    if (t.id === 'spSuche') { ui.spSuche = t.value; return spListe(); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key >= '1' && e.key <= '8' && !e.metaKey && !e.ctrlKey) wechsle(BEREICHE[Number(e.key) - 1].id);
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(window.innerWidth - letzteBreite) > 40) { const y = window.scrollY; zeichne(); window.scrollTo(0, y); } }, 180); });

  zeichne(true);
})();
