(function () {
  'use strict';
  const APP = 'Anwurf';
  const ABSENDER = 'Anwurf ist ein privates Fan-Projekt, kein Angebot von SC Teutonia 10 oder handball.net. Daten: handball.net.';
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const merk = {
    get(k, d) { try { const v = localStorage.getItem('hbprog.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hbprog.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  // Trainerinnen-Modus: Werte je Spielerin nur über den Link mit #trainerin. Schutz vor dem beiläufigen Blick, kein Zugriffsschutz.
  let TRAINERIN = /trainerin/i.test(location.hash);

  // ================= Zahlensatz =================
  const NB = ' ', MINUS = '−';
  const dez = (x, n = 1) => x.toFixed(n).replace('.', ',').replace('-', MINUS);
  const vz = (x, n = 1) => { const r = Number(x.toFixed(n)); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r).toFixed(n).replace('.', ','); };
  const vzGanz = x => { const r = Math.round(x); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r); };
  const pct = x => Math.round(x * 100) + NB + '%';
  function drei(a, b, c) {
    const roh = [a, b, c].map(x => x * 100), ganz = roh.map(Math.floor);
    let rest = 100 - ganz.reduce((x, y) => x + y, 0);
    roh.map((x, i) => [x - ganz[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (rest > 0) { ganz[i]++; rest--; } });
    return ganz;
  }
  const stand = (a, b) => `${a}${NB}:${NB}${b}`;

  const D = window.HB_DATA;
  if (!D || !D.pages || !D.pages.length) {
    $('#inhalt').innerHTML = `<div class="leer" style="padding-top:20vh">${ico('tafel')}<b>Noch keine Daten</b><p>Öffne ${APP} über „Start (Mac)“ oder „Start (Windows)“. Beim ersten Start braucht es Internet.</p></div>`;
    return;
  }

  // ================= Daten =================
  const roh = D.pages.flatMap(p => p.data || []);
  const teams = {};
  const spiele = roh.map(m => {
    [m.local, m.visitor].forEach(t => { if (t && !teams[t.id]) teams[t.id] = { id: t.id, roh: t.name, logo: t.club && t.club.logo }; });
    const r = m.result || {};
    const hat = typeof r.local === 'number' && typeof r.visitor === 'number';
    const inst = m.field && m.field.installation;
    return {
      id: m.id, runde: m.round, datum: new Date(m.date), terminOffen: /T00:00:00/.test(m.date),
      heim: m.local.id, gast: m.visitor.id,
      toreHeim: hat ? r.local : null, toreGast: hat ? r.visitor : null,
      gewertet: m.status.is_finished && hat, urteil: m.status.is_finished && !hat, offen: !m.status.is_finished,
      halle: inst ? String(inst.name || '').replace(/^\d+\s*[-–]\s*/, '') : (m.field && m.field.name) || '',
      adresse: inst && inst.address ? inst.address : '',
      lat: inst && inst.latitude, lon: inst && inst.longitude,
    };
  }).filter(g => g.heim && g.gast).sort((a, b) => a.datum - b.datum || a.runde - b.runde);
  const spielNach = {}; spiele.forEach(g => spielNach[g.id] = g);
  const teamIds = Object.keys(teams).map(Number);
  const gewertet = spiele.filter(g => g.gewertet);
  const offen = spiele.filter(g => g.offen);
  const urteile = spiele.filter(g => g.urteil);
  const ligaName = normalisiere((roh[0] && roh[0].phase && roh[0].phase.name) || 'Liga').replace(/\s*\(\d+\)$/, '');
  const DETAILS = window.HB_DETAILS || {};

  function normalisiere(s) {
    return String(s).replace(/\s+[–—-]\s+/g, ' · ').split(' ').map(w => {
      if (/^(SC|TSV|TV|FC|HT|TH|SG|HSG|SV|TUS|VFL|MTV|TSG|HG|HL|II|III|IV|V|VI)$/.test(w)) return w === 'TUS' ? 'TuS' : w === 'VFL' ? 'VfL' : w;
      if (w.length > 1 && w === w.toUpperCase() && /[A-ZÄÖÜ]{2,}/.test(w)) return w.split('-').map(t => t.charAt(0) + t.slice(1).toLowerCase()).join('-');
      return w;
    }).join(' ');
  }
  // Adresse wie „NEUMOORSTüCK 1, 21147 HAMBURG“ in Titelschreibung
  const adresseSchoen = a => String(a).toLowerCase().replace(/(^|[\s,/-])([a-zäöüß])/g, (m, p, c) => p + c.toUpperCase()).replace(/(\d)([A-Z])/g, '$1$2');
  teamIds.forEach(id => {
    const t = teams[id];
    t.lang = normalisiere(t.roh);
    t.kurz = t.lang.replace(/^(SC|TSV|TV|FC|HT|TH|SG|HSG|SV|TuS|VfL|MTV|TSG)\s+/, '');
    t.mono = t.kurz.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2).toUpperCase();
  });
  const kurz = id => teams[id] ? teams[id].kurz : '?';
  const lang = id => teams[id] ? teams[id].lang : '?';
  window.kurzname = kurz;
  const UNSER = D.teamId;

  // ================= Modelle =================
  const modell = schaetzeModell(gewertet, teamIds);
  const vorher = {}, cache = {};
  gewertet.forEach(g => {
    const tag = g.datum.toISOString().slice(0, 10);
    if (!cache[tag]) cache[tag] = schaetzeModell(gewertet.filter(x => x.datum.toISOString().slice(0, 10) < tag), teamIds);
    vorher[g.id] = prognose(cache[tag], g.heim, g.gast);
  });
  const B = werteSpielberichteAus(DETAILS, spiele, modell, goalkeeperIds(window.HB_TORWART));
  const muster = teamMuster(spiele, B.verlaeufe, teamIds);
  const K = teamKennzahlen(DETAILS, spiele, B.verlaeufe, teamIds);
  const LIGA = ligaKennzahlen(K);
  const alleSp = Object.values(B.teams).flatMap(t => t.liste);
  const spNach = {}; alleSp.forEach(s => spNach[s.id] = s);
  // Torhüterinnen aus der eigenen Erfassung (window.HB_TORWART, app/goalkeepers.js): Kennzahlen an die
  // Spielerin hängen; ab genug Würfen ersetzt die Paradenquote die generische Torwirkung.
  const TW = evaluateGoalkeepers(window.HB_TORWART || []);
  Object.values(TW.players).forEach(t => {
    const s = spNach[t.playerId]; if (!s) return;
    s.torwart = true; s.tw = t;
    if (t.reliable) s.einfluss = Math.max(SPIELERIN.MIN, Math.min(SPIELERIN.MAX, t.influence));
  });
  Object.values(B.teams).forEach(t => t.liste.sort((a, b) => b.einfluss - a.einfluss || b.tore - a.tore));

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
  // Der Fokus wird bewusst nicht gespeichert: Beim Öffnen zeigt die App immer das eigene Team.
  let fokus = teams[UNSER] ? UNSER : teamIds[0];
  let bereich = merk.get('bereich', 'heute');
  const ui = { spieleTeam: 'fokus', spieleStatus: 'alle', tabelleAnsicht: 'tabelle', spSuche: '', spTeam: UNSER, spSort: 'tore', tmSort: 'staerke', tmAb: true };
  let fest = merk.get('fest', {}); Object.keys(fest).forEach(k => { if (!spielNach[k] || !spielNach[k].offen) delete fest[k]; });
  const labor = { spiel: null, dabei: {}, eigene: merk.get('eigene', {}), form: { f: 0, g: 0 }, neutral: false, offen: null };
  const kader = merk.get('kader', {});
  const kaderVon = id => (kader[id] = kader[id] || { verf: {}, pins: {} });

  // ================= Perspektive =================
  function sicht(g) {
    const dabei = g.heim === fokus || g.gast === fokus;
    return { dabei, heim: g.heim === fokus, gegner: dabei ? (g.heim === fokus ? g.gast : g.heim) : null };
  }
  function ausFokus(p, g) {
    const s = sicht(g);
    if (!s.dabei) return { a: p.pHeim, u: p.pRemis, b: p.pGast, neutral: true };
    return s.heim ? { a: p.pHeim, u: p.pRemis, b: p.pGast } : { a: p.pGast, u: p.pRemis, b: p.pHeim };
  }
  // Streifen aus Fokus-Sicht: Sieg links
  function streifen(w, dick) {
    const r = drei(w.a, w.u, w.b);
    const c = w.neutral ? ['h', 'u', 'g'] : ['s', 'u', 'n'];
    const lab = w.neutral ? ['Heim', 'Remis', 'Gast'] : ['Sieg', 'Remis', 'Niederlage'];
    return `<div class="streifen${dick ? '' : ' d'}" role="img" aria-label="${lab.map((l, i) => l + ' ' + r[i] + ' Prozent').join(', ')}">${r.map((v, i) => `<i class="${c[i]}" style="flex:${Math.max(v, 1)} 1 0"></i>`).join('')}</div>`;
  }
  // Streifen räumlich an Heim und Gast gebunden (Spiel-Sheet, Labor): Farbe aus Fokus-Sicht
  function streifenHG(p, g, dick) {
    const s = sicht(g), r = drei(p.pHeim, p.pRemis, p.pGast);
    const c = !s.dabei ? ['h', 'u', 'g'] : s.heim ? ['s', 'u', 'n'] : ['n', 'u', 's'];
    return `<div class="streifen${dick ? '' : ' d'}" role="img" aria-label="Sieg ${esc(kurz(g.heim))} ${r[0]} Prozent, Remis ${r[1]} Prozent, Sieg ${esc(kurz(g.gast))} ${r[2]} Prozent">${r.map((v, i) => `<i class="${c[i]}" style="flex:${Math.max(v, 1)} 1 0"></i>`).join('')}</div>`;
  }
  function dreiHG(p, g) {
    const s = sicht(g), r = drei(p.pHeim, p.pRemis, p.pGast);
    const farbe = i => !s.dabei || i === 1 ? '' : ((i === 0) === s.heim ? 'plus' : 'minus');
    const lab = [`Sieg ${esc(kurz(g.heim))}`, 'Remis', `Sieg ${esc(kurz(g.gast))}`];
    return `<div class="ergebnis3">${r.map((v, i) => `<div><div class="w ${farbe(i)}">${v}<span class="pz">%</span></div><div class="lab">${lab[i]}</div></div>`).join('')}</div>`;
  }
  const erwartet = (p, g) => `Erwartet etwa ${esc(kurz(g.heim))} ${Math.round(p.eHeim)}, ${esc(kurz(g.gast))} ${Math.round(p.eGast)}`;
  const ergebnisAus = (g, id) => { const e = g.heim === id ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim; return e > 0 ? 'S' : e < 0 ? 'N' : 'U'; };
  const SUN = { S: 'Sieg', U: 'Remis', N: 'Niederlage' };

  // ================= Icons =================
  function ico(n, k) {
    const P = {
      tafel: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>',
      stern: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
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
      uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      teilen: '<path d="M12 4v11M8 8l4-4 4 4M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5"/>',
      pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
      ort: '<path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
      schloss: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
      tor: '<path d="M4 20V6h16v14"/><path d="M4 11h16M9.3 6v14M14.7 6v14M4 15.5h16"/>',
    };
    return `<svg class="ico${k ? ' k' : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  }
  const wortmarke = gr => `<span class="wortmarke"${gr ? ` style="font-size:${gr}px"` : ''}>${APP}<span class="ws" aria-hidden="true"><i></i><i></i><i></i></span></span>`;

  function logo(id, g = 20) {
    const t = teams[id];
    const img = t && t.logo ? `<img alt="" loading="lazy" src="${esc(t.logo)}" onload="this.classList.add('da')" onerror="this.remove()">` : '';
    return `<span class="logo l${g}" aria-hidden="true"><span class="mono">${esc(t ? t.mono : '?')}</span>${img}</span>`;
  }
  // Spielerin als runder Avatar. Fotos gibt es nur fürs eigene Team (nur dieses hat zugestimmt, scripts/fotos.sh);
  // alle anderen, auch ohne Foto, bekommen Initialen.
  const FOTOS = window.HB_FOTOS || {};
  const initialen = name => String(name || '').trim().split(/\s+/).filter(Boolean).map((w, i, a) => i === 0 || i === a.length - 1 ? w.charAt(0) : '').join('').toUpperCase() || '?';
  function avatar(id, name, team, g = 32) {
    const k = Number(team) === Number(UNSER) && FOTOS[id];
    const img = k ? `<img alt="" loading="lazy" src="../daten/fotos/${encodeURIComponent(id)}.jpg?u=${encodeURIComponent(k)}" onload="this.classList.add('da')" onerror="this.remove()">` : '';
    return `<span class="ava a${g}" aria-hidden="true"><span class="ini">${esc(initialen(name))}</span>${img}</span>`;
  }
  const ava = (s, g) => avatar(s.id, s.name, s.team, g);
  // Von Hand gepflegte Positionen und ein Satz je Spielerin des eigenen Teams (daten/profile.js)
  const PROFIL = window.HB_PROFILE || {};
  const POS = { TW: 'Torhüterin', LA: 'Linksaußen', RL: 'Rückraum links', RM: 'Rückraum Mitte', RR: 'Rückraum rechts', RA: 'Rechtsaußen', KM: 'Kreis' };
  const profil = s => Number(s.team) === Number(UNSER) ? PROFIL[s.id] || null : null;
  const positionen = s => { const p = profil(s); return p && Array.isArray(p.position) ? p.position.filter(x => POS[x]) : []; };
  const posKurz = s => positionen(s).join('/');
  const mitPos = s => posKurz(s) ? `${posKurz(s)} · ` : '';

  // ================= Datum (Ortszeit mit falscher UTC-Kennung, UTC-Werte direkt lesen) =================
  const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const zeit = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const tagKurz = d => String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.';
  const tagLang = d => `${WT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`;
  function tageBis(d) {
    const h = new Date(); const heute = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - heute) / 864e5);
  }
  const naechstes = id => offen.filter(g => g.heim === id || g.gast === id)[0];
  const spieleVon = id => gewertet.filter(g => g.heim === id || g.gast === id);
  const routeLink = g => g.lat && g.lon ? `<a class="route" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.lat + ',' + g.lon)}" target="_blank" rel="noopener">Route</a>` : '';

  // ================= Bereiche =================
  const BEREICHE = [
    { id: 'heute', name: 'Start', kurz: 'Start', ico: 'tafel' },
    { id: 'matchplan', name: 'Matchplan', kurz: 'Matchplan', ico: 'plan' },
    { id: 'spiele', name: 'Spiele', kurz: 'Spiele', ico: 'kalender' },
    { id: 'tabelle', name: 'Tabelle', kurz: 'Tabelle', ico: 'tabelle' },
    { id: 'labor', name: 'Durchspielen', kurz: 'Durchspielen', ico: 'labor' },
    { id: 'spielerinnen', name: 'Spielerinnen', kurz: 'Spielerinnen', ico: 'trikot' },
    { id: 'teams', name: 'Teams', kurz: 'Teams', ico: 'schilde' },
    { id: 'erfassung', name: 'Torhüterin erfassen', kurz: 'Erfassung', ico: 'tor' },
    { id: 'methodik', name: 'So rechnet Anwurf', kurz: 'Methodik', ico: 'info' },
  ];
  // Bereich per Link öffnen, z. B. app/index.html#erfassung für die Bank
  const bereichAusHash = () => { const h = location.hash.replace('#', '').toLowerCase(); return BEREICHE.some(b => b.id === h) ? h : null; };
  if (bereichAusHash()) bereich = bereichAusHash();
  const geholt = new Date(D.fetchedAt);
  const datenstand = `Datenstand ${geholt.toLocaleDateString('de-DE')} ${geholt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;

  function gerüst() {
    $('#seitenleiste').innerHTML = `
      <div class="marke">${wortmarke(24)}</div>
      <button class="wechsler" data-aktion="team">${logo(fokus, 28)}<span class="txt"><span class="n" style="display:block">${esc(kurz(fokus))}</span><small>Platz ${platz(fokus)} · ${(tabelle.find(z => z.id === fokus) || {}).pkt || 0} Punkte</small></span>${ico('chev', 1)}</button>
      <button class="btn prim erfassen-knopf${bereich === 'erfassung' ? ' an' : ''}" data-bereich="erfassung">${ico('tor', 1)}<span>${erfassungLaeuft() ? 'Erfassung läuft' : 'Torhüterin erfassen'}</span>${erfassungLaeuft() ? '<span class="punkt" aria-hidden="true"></span>' : ''}</button>
      <nav>${BEREICHE.filter(b => b.id !== 'erfassung').map((b, i) => `${i === 4 ? '<div class="luecke"></div>' : ''}<button data-bereich="${b.id}" class="${bereich === b.id ? 'an' : ''}">${ico(b.ico)}${b.name}</button>`).join('')}</nav>
      <div class="fuss">${TRAINERIN ? `<span class="etikett" style="margin-bottom:8px">${ico('schloss', 1)} Ansicht Trainerin</span><br>` : ''}${esc(datenstand)}<div class="absender">${esc(ABSENDER)}</div></div>`;
    $('#kopf').innerHTML = `<button class="wechsler" data-aktion="team" aria-label="Team wählen">${logo(fokus, 24)}<span class="n">${esc(kurz(fokus))}</span>${ico('chev', 1)}</button><span class="platz"></span>
      ${TRAINERIN ? `<span class="etikett">${ico('schloss', 1)} Trainerin</span>` : ''}`;
    const tabs = ['heute', 'matchplan', 'spiele', 'tabelle'];
    $('#tabbar').innerHTML = tabs.map(id => { const b = BEREICHE.find(x => x.id === id); return `<button data-bereich="${id}" class="${bereich === id ? 'an' : ''}">${ico(b.ico)}<span>${b.kurz}</span></button>`; }).join('') +
      `<button data-aktion="mehr" class="${tabs.includes(bereich) ? '' : 'an'}">${ico('mehr')}<span>Mehr</span></button>`;
  }

  // ================= Sheet =================
  const sheet = $('#sheet');
  function oeffneSheet(titel, html) {
    sheet.innerHTML = `<div class="skopf"><h2 class="titel" id="sheetTitel">${titel}</h2><button class="zu" data-aktion="zu" aria-label="Schließen"><span>${ico('zu', 1)}</span></button></div><div class="sinhalt">${html}</div>`;
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
  const ausSpielen = n => etikett(`aus ${n} Spiel${n === 1 ? '' : 'en'}`);
  const breite = (abzug = 0) => {
    const el = $('#inhalt'); const cs = getComputedStyle(document.documentElement);
    const rand = parseFloat(cs.getPropertyValue('--rand')) || 16, pad = parseFloat(cs.getPropertyValue('--pad')) || 16;
    return Math.max(260, Math.min(1040, el.clientWidth - 2 * rand) - 2 * pad - 2 - abzug);
  };

  function hinweisFokus() {
    if (fokus === UNSER) return '';
    return `<div class="hinweis">${ico('info')}<span>Du schaust auf ${esc(kurz(fokus))}.</span><button class="textaktion" data-fokus="${UNSER}">Zurück zu ${esc(kurz(UNSER))}</button></div>`;
  }

  function tafel(id) {
    const g = naechstes(id);
    if (!g) {
      const erw = simBasis.plaetze[id].indexOf(Math.max(...simBasis.plaetze[id])) + 1;
      return `<section class="tafel"><div class="zone-a"><span class="micro">Saison</span></div><div class="zahl"><div><div class="hero">${erw}.</div><div class="lab">Platz am Saisonende erwartet</div></div></div><div class="aktionen"><button class="btn prim" data-bereich="tabelle">Zur Tabelle</button></div></section>`;
    }
    const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
    const s = sicht(g), t = tageBis(g.datum);
    const count = g.terminOffen ? '' : t === 0 ? '' : t === 1 ? '<span class="count">morgen</span>' : t > 1 ? `<span class="count">in ${t} Tagen</span>` : '';
    const seite = (tid, rolle) => `<div>${logo(tid, 48)}<div class="nm">${esc(kurz(tid))}</div><div class="pl">${rolle} · Platz ${platz(tid)}</div>${tid === fokus ? '<div class="fstrich"></div>' : ''}</div>`;
    const eyebrow = t === 0 && !g.terminOffen ? `Heute ist Anwurf · ${zeit(g.datum)} Uhr` : id === UNSER ? `Nächstes Spiel · Spieltag ${g.runde}` : `Nächstes Spiel von ${esc(kurz(id))}`;
    const eF = s.heim ? p.eHeim : p.eGast, eG = s.heim ? p.eGast : p.eHeim;
    return `<section class="tafel">
      <div class="zone-a"><span class="micro">${eyebrow}</span>${count}</div>
      <div class="termin">${g.terminOffen ? 'Termin noch offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr · ${s.heim ? 'zu Hause' : 'auswärts'}`}</div>
      ${g.halle ? `<div class="halle">${esc(normalisiere(g.halle))}${g.adresse ? ` · ${esc(adresseSchoen(g.adresse))}` : ''} ${routeLink(g)}</div>` : ''}
      <div class="kern">
        <button class="paarung" data-spiel="${g.id}" aria-label="Spieldetails">${seite(g.heim, 'Heim')}<div class="vs">${s.heim ? 'gegen' : 'bei'}</div>${seite(g.gast, 'Gast')}</button>
        <div>
          <div class="zahl"><div><div class="hero">${r[0]}<span class="pz">%</span></div><div class="lab">Siegchance ${esc(kurz(id))}</div></div>
          <div class="neben">Remis <b>${r[1]}${NB}%</b><br>Niederlage <b>${r[2]}${NB}%</b></div></div>
          ${streifen(w, true)}
          <div class="erw">Erwartet etwa ${Math.round(eF)}${NB}:${NB}${Math.round(eG)} · aus je ${B.teams[id] ? B.teams[id].spiele.length : 0} Spielen mit Spielbericht</div>
        </div>
      </div>
      <div class="aktionen"><button class="btn prim" data-bereich="matchplan">Matchplan</button><button class="btn" data-labor="${g.id}">Durchspielen</button></div>
    </section>`;
  }

  function spielZeile(g, opt = {}) {
    const s = sicht(g), d = g.datum;
    const datum = g.terminOffen ? `<div class="wt">Termin</div><div class="tg t3">offen</div>` : `<div class="wt">${WT[d.getUTCDay()]}</div><div class="tg">${tagKurz(d)}</div>${g.offen ? `<div class="cap t2">${zeit(d)}</div>` : ''}`;
    let paar, rechts;
    if (g.gewertet) {
      const hs = g.toreHeim > g.toreGast ? 'sieger' : g.toreHeim < g.toreGast ? 'verl' : '';
      const gs = g.toreGast > g.toreHeim ? 'sieger' : g.toreGast < g.toreHeim ? 'verl' : '';
      paar = `<div class="${hs}">${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div class="${gs}">${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      const v = B.verlaeufe[g.id];
      const e = s.dabei ? ergebnisAus(g, fokus) : null;
      rechts = `<div class="ergbox">${e ? `<span class="sun ${e}" aria-label="${SUN[e]}">${e}</span>` : ''}<div class="tz" style="grid-template-columns:auto"><span>${g.toreHeim}</span><span>${g.toreGast}</span></div></div>${v ? `<div class="cap t3">Halbzeit ${stand(v.halbzeit.heim, v.halbzeit.gast)}</div>` : ''}`;
    } else {
      paar = `<div>${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div>${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      if (g.urteil) rechts = '<span class="cap t2">am grünen Tisch</span>';
      else {
        const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
        rechts = `<div class="chance">${s.dabei ? `${r[0]}${NB}%` : `<span class="cap t2">Heim ${r[0]}${NB}%</span>`}</div>${streifen(w)}`;
      }
    }
    return `<button class="spiel${s.dabei && !opt.ohneMarke ? ' fokus' : ''}" data-spiel="${g.id}"><div class="dat">${datum}</div><div class="paar">${paar}</div><div class="erg">${rechts}</div></button>`;
  }

  function formSun(g, id, gr) { const e = ergebnisAus(g, id); return `<span class="sun ${e}${gr ? ' gross' : ''}" aria-label="${SUN[e]}"${gr ? '' : ' style="width:18px;height:18px;font-size:11px"'}>${e}</span>`; }
  function tabelleHtml(zeilen, kompakt) {
    return `<div class="${kompakt ? 'kompakt' : 'scrollx'}"><table class="tab"><thead><tr><th>#</th><th class="l">Team</th><th>Sp</th><th class="opt">S</th><th class="opt">U</th><th class="opt">N</th><th class="opt tore">Tore</th><th>Diff</th><th>${kompakt ? 'Pkt' : 'Punkte'}</th><th class="opt l form" style="padding-left:12px">Form</th></tr></thead><tbody>
      ${zeilen.map(z => { const i = platz(z.id), d = z.tp - z.tm; return `<tr class="klick${z.id === fokus ? ' f' : ''}" data-team="${z.id}"><td class="t2">${i}</td><td class="l tw"><span class="team">${logo(z.id)}<span>${esc(kurz(z.id))}</span></span></td><td>${z.sp}</td><td class="opt">${z.s}</td><td class="opt">${z.u}</td><td class="opt">${z.n}</td><td class="opt tore">${stand(z.tp, z.tm)}</td><td>${d > 0 ? '+' : d < 0 ? MINUS : ''}${Math.abs(d)}</td><td class="pk">${z.pkt}</td><td class="opt l form" style="padding-left:12px"><span style="display:inline-flex;gap:3px">${spieleVon(z.id).slice(-5).reverse().map(g => formSun(g, z.id)).join('')}</span></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  // ================= Diagramme =================
  function siegchanceVerlauf(id) {
    const liste = spiele.filter(g => (g.heim === id || g.gast === id) && !g.urteil);
    if (liste.length < 2) return '';
    const W = breite(), H = 184, L = 4, R = 8, T = 16, Bt = 28;
    const x = i => L + 44 + i * (W - L - R - 44) / (liste.length - 1);
    const y = v => T + (1 - v) * (H - T - Bt);
    const jede = Math.ceil(liste.length / Math.max(4, Math.floor(W / 64)));
    let pfad = '', punkte = '';
    liste.forEach((g, i) => {
      const p = g.gewertet ? vorher[g.id] : prognose(modell, g.heim, g.gast);
      const v = g.heim === id ? p.pHeim : p.pGast;
      pfad += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      const geg = kurz(g.heim === id ? g.gast : g.heim);
      const e = g.gewertet ? ergebnisAus(g, id) : null;
      const farbe = e ? { S: 'var(--sieg)', U: 'var(--remis)', N: 'var(--niederlage)' }[e] : 'var(--bg-1)';
      const info = `${g.terminOffen ? 'Termin offen' : tagKurz(g.datum)} ${g.heim === id ? 'gegen' : 'bei'} ${geg} · Siegchance ${pct(v)}` + (g.gewertet ? ` · ${stand(g.toreHeim, g.toreGast)}` : '');
      punkte += `<g class="pkt" data-wert="${esc(info)}" data-spiel="${g.id}" style="cursor:pointer"><circle cx="${x(i)}" cy="${y(v)}" r="14" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${farbe}" stroke="${e ? farbe : 'var(--accent)'}" stroke-width="2"/></g>`;
      if (i % jede === 0) punkte += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--text-3)">${g.terminOffen ? 'offen' : tagKurz(g.datum)}</text>`;
    });
    const gitter = [0, .5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-1)"/><text x="${L}" y="${y(v) - 4}" font-size="12" fill="var(--text-3)">${v * 100}${NB}%</text>`).join('');
    return modul('Siegchance je Spiel', `<div class="wertzeile" data-wertzeile>Punkt antippen für Details</div><svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Siegchance je Spiel der Saison">${gitter}<path d="${pfad}" fill="none" stroke="var(--line-2)" stroke-width="1.5"/>${punkte}</svg>`,
      { fuss: 'Gefüllt: gespielt, die Farbe zeigt das Ergebnis, der Wert die Chance vor dem Anpfiff. Leer: noch offen.' });
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
      return `<g data-team="${id}" style="cursor:pointer"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}" fill="none" stroke="${f ? 'var(--accent)' : 'var(--text-3)'}" stroke-width="${f ? 2.5 : 1.25}" stroke-linejoin="round"/>
        ${f ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"/>`).join('') : ''}
        <text x="${letzte[0] + 8}" y="${letzte[1] + 4}" font-size="12" fill="${f ? 'var(--accent)' : 'var(--text-2)'}" font-weight="${f ? 600 : 400}">${esc(kurz(id).slice(0, lab > 100 ? 18 : 12))}</text></g>`;
    }).join('');
    const achse = runden.map(r => `<text x="${x(r)}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--text-3)">${r}</text>`).join('') +
      Array.from({ length: n }, (_, i) => `<text x="${L - 8}" y="${y(i + 1) + 4}" text-anchor="end" font-size="12" fill="var(--text-3)">${i + 1}</text>`).join('');
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tabellenplatz je Spieltag">${achse}${linien}</svg>`;
  }

  function phasenGrafik(mp) {
    const ph = mp.phasen; if (!ph.fokus || !ph.gegner) return '';
    const W = breite(), rowH = 76, kopfH = 22, zw = 18, H = kopfH + rowH + zw + kopfH + rowH + 24;
    const hzL = 20, abst = 4, sw = (W - hzL - abst * 4) / 6;
    const sx = i => i * (sw + abst) + (i >= 3 ? hzL - abst : 0);
    const max = Math.max(5, ...ph.fokus.map(Math.abs), ...ph.gegner.map(Math.abs));
    const bw = Math.min(28, sw * .5);
    const reihe = (werte, y0, eigen, name) => {
      const mitte = y0 + kopfH + rowH / 2, halb = rowH / 2 - 16;
      let s = `<text x="0" y="${y0 + 12}" font-size="12" font-weight="600" fill="var(--text-1)">${esc(name)}</text><line x1="0" x2="${W}" y1="${mitte}" y2="${mitte}" stroke="var(--line-2)"/>`;
      werte.forEach((v, i) => {
        const h = Math.abs(v) / max * halb, bx = sx(i) + sw / 2 - bw / 2, by = v >= 0 ? mitte - h : mitte;
        const fill = eigen ? (v >= 0 ? 'var(--sieg)' : 'var(--niederlage)') : (v >= 0 ? 'var(--text-2)' : 'none');
        if (v !== 0) s += `<rect class="b" x="${bx}" y="${by}" width="${bw}" height="${Math.max(h, 1.5)}" rx="2" fill="${fill}" stroke="${eigen ? 'none' : 'var(--text-2)'}" stroke-width="${eigen ? 0 : 1.5}" style="animation-delay:${i * 30}ms"/>`;
        s += `<text x="${sx(i) + sw / 2}" y="${v >= 0 ? by - 5 : by + h + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text-2)">${vzGanz(v)}</text>`;
      });
      return s;
    };
    let svg = reihe(ph.fokus, 0, true, kurz(fokus)) + reihe(ph.gegner, kopfH + rowH + zw, false, kurz(mp.gegner));
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
    const ziele = v.tore.map(t => `<rect x="${x(t.min) - 6}" y="${T}" width="12" height="${H - T - Bt}" fill="transparent" data-wert="${t.min}. Minute · ${stand(t.heim, t.gast)}${t.name ? ' · ' + esc(t.name) : ''}${t.sm ? ' · 7m' : ''}"/>`).join('');
    let hoch = 0, tief = 0; pts.forEach(p => { hoch = Math.max(hoch, p[1]); tief = Math.min(tief, p[1]); });
    const obenName = s.dabei ? kurz(fokus) : kurz(g.heim), untenName = s.dabei ? kurz(s.gegner) : kurz(g.gast);
    return `<div class="wertzeile" data-wertzeile>Größte Führung ${esc(obenName)} ${hoch > 0 ? '+' + hoch : '0'}, ${esc(untenName)} ${tief < 0 ? '+' + (-tief) : '0'}</div>
      <svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Spielverlauf">
      <clipPath id="ob${g.id}"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="un${g.id}"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath>
      <path d="${fl}" fill="${oben}" opacity="${dk}" clip-path="url(#ob${g.id})"/><path d="${fl}" fill="${unten}" opacity="${dk}" clip-path="url(#un${g.id})"/>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/>
      <line x1="${x(30)}" x2="${x(30)}" y1="${T}" y2="${H - Bt}" stroke="var(--line-2)"/><text x="${x(30) + 4}" y="${T + 8}" font-size="11" font-weight="600" fill="var(--text-3)">Halbzeit</text>
      <path d="${pfad}" fill="none" stroke="var(--text-1)" stroke-width="1.5"/>
      <text x="${W - R + 6}" y="${y(pts[pts.length - 1][1]) + 4}" font-size="12" font-weight="600" fill="var(--text-1)">${vzGanz(pts[pts.length - 1][1])}</text>
      ${[0, 15, 30, 45, 60].map(m => `<text x="${x(m)}" y="${H - 4}" text-anchor="${m === 0 ? 'start' : m === 60 ? 'end' : 'middle'}" font-size="12" fill="var(--text-3)">${m}'</text>`).join('')}
      <text x="${L}" y="${T + 8}" font-size="11" fill="var(--text-3)">${esc(obenName)} führt</text><text x="${L}" y="${H - Bt - 4}" font-size="11" fill="var(--text-3)">${esc(untenName)} führt</text>
      ${ziele}</svg>`;
  }

  function verteilungSvg(p, basis, g) {
    const W = breite(), H = 150, T = 18, Bt = 22, von = W < 500 ? -12 : -14, bis = -von;
    const n = bis - von + 1, bw = W / n, s = sicht(g);
    const sd = modell.sigma;
    const pd = (d, m) => normCdf((d + .5 - m) / sd) - normCdf((d - .5 - m) / sd);
    let mx = 0; for (let d = von; d <= bis; d++) mx = Math.max(mx, pd(d, p.diff), pd(d, basis.diff));
    const hh = v => v / mx * (H - T - Bt);
    // x-Achse Heim links, Gast rechts: Differenz Gast minus Heim nach rechts
    let bars = '', huelle = '';
    for (let d = von; d <= bis; d++) {
      const xx = (d - von) * bw, diffHeim = -d;
      const heimGewinnt = diffHeim > 0, gastGewinnt = diffHeim < 0;
      const c = !s.dabei ? (heimGewinnt ? 'var(--neutral-heim)' : gastGewinnt ? 'var(--neutral-gast)' : 'var(--remis)')
        : (diffHeim === 0 ? 'var(--remis)' : (heimGewinnt === s.heim) ? 'var(--sieg)' : 'var(--niederlage)');
      const v = pd(diffHeim, p.diff), vb = pd(diffHeim, basis.diff);
      bars += `<rect x="${xx + bw * .18}" y="${H - Bt - hh(v)}" width="${bw * .64}" height="${hh(v)}" rx="1.5" fill="${c}"/>`;
      huelle += (d === von ? 'M' : 'L') + xx.toFixed(1) + ' ' + (H - Bt - hh(vb)).toFixed(1) + 'H' + (xx + bw).toFixed(1);
    }
    const achse = [-10, -5, 0, 5, 10].map(d => `<text x="${(d - von + .5) * bw}" y="${H - 4}" text-anchor="middle" font-size="12" fill="${d === 0 ? 'var(--text-2)' : 'var(--text-3)'}" font-weight="${d === 0 ? 600 : 400}">${d === 0 ? 'Remis' : '+' + Math.abs(d)}</text>`).join('');
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Verteilung der Tordifferenz"><text x="0" y="10" font-size="12" fill="var(--text-3)">${esc(kurz(g.heim))} gewinnt</text><text x="${W}" y="10" text-anchor="end" font-size="12" fill="var(--text-3)">${esc(kurz(g.gast))} gewinnt</text>${bars}<path d="${huelle}" fill="none" stroke="var(--text-1)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>${achse}</svg>`;
  }

  // ================= Start =================
  function auffaelligkeiten(id) {
    const t = B.teams[id], m = muster[id], kz = K[id], liste = [];
    const r = rang.indexOf(id) + 1, pl = platz(id);
    if (r - pl >= 2) liste.push(`Die Tabelle schmeichelt: Platz <b>${pl}</b>, nach Toren und Gegnern eher Platz <b>${r}</b>.`);
    if (pl - r >= 2) liste.push(`Stärker als der Tabellenplatz: Platz <b>${pl}</b>, nach Toren und Gegnern eher Platz <b>${r}</b>.`);
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
      if (Math.abs(h2 - h1) >= 1) liste.push(`Erste Hälfte im Schnitt <b>${vz(h1)}</b> Tore, zweite Hälfte <b>${vz(h2)}</b>.`);
      if (m.knapp) liste.push(`${m.knapp} Spiel${m.knapp > 1 ? 'e' : ''} mit höchstens zwei Toren Unterschied, davon ${m.knappGewonnen} gewonnen.`);
    }
    if (kz && kz.spiele) liste.push(`${dez(kz.zweiProSpiel)} Zeitstrafen pro Spiel, Ligaschnitt ${dez(LIGA.zweiProSpiel)}.`);
    return liste;
  }

  function seiteHeute() {
    const z = tabelle.find(x => x.id === fokus) || { pkt: 0, tp: 0, tm: 0, sp: 0 };
    const r = rang.indexOf(fokus) + 1, pl = platz(fokus), diff = z.tp - z.tm;
    const alter = (Date.now() - geholt) / 864e5;
    const alt = alter > 7 ? `<div class="hinweis">${ico('uhr')}<span>Die Daten sind ${Math.floor(alter)} Tage alt. ${location.protocol === 'file:' ? 'Für den aktuellen Stand die App über die Start-Datei neu öffnen.' : 'Neue Daten kommen, sobald sie eingespielt sind.'}</span></div>` : '';
    const intro = merk.get('intro', false) ? '' : `<section class="intro">${bildDa.keyvisual ? `<div class="bild" style="background-image:url('assets/keyvisual-1600x900.png')"></div>` : ''}
      <div>${wortmarke(26)}</div>
      <p><b style="color:var(--text-1)">${APP} rechnet aus Ergebnissen und Spielberichten von handball.net aus, wie die Chancen im nächsten Spiel stehen.</b> Die Zahlen sind Richtwerte aus wenigen Spielen, keine Gewissheit.</p>
      <p class="cap">${esc(ABSENDER)}</p>
      <div class="aktionen"><button class="btn prim" data-aktion="introWeg">Verstanden</button><button class="btn" data-bereich="methodik">Wie entsteht die Zahl?</button></div></section>`;
    const sim = simBasis.plaetze[fokus];
    const kach = `<div class="kacheln">
      ${kachel('Tabellenplatz', `${pl}.`, r === pl ? 'passt zu Toren und Gegnern' : `nach Toren und Gegnern eher ${r}.`)}
      ${kachel('Punkte', `${z.pkt}`, `aus ${z.sp || 0} Spielen`)}
      ${kachel('Tordifferenz', `${diff > 0 ? '+' : diff < 0 ? MINUS : ''}${Math.abs(diff)}`, `${stand(z.tp, z.tm)} Tore`)}
      ${kachel('Platz 1 am Saisonende', `${Math.round(sim[0] * 100)}<span class="pz">%</span>`, `unter die ersten 3: ${pct(sim[0] + sim[1] + sim[2])}`)}
    </div>`;
    const form = spieleVon(fokus).slice(-5).reverse();
    const letztes = form[0];
    let moment = '';
    if (letztes) {
      const e = ergebnisAus(letztes, fokus), geg = kurz(letztes.heim === fokus ? letztes.gast : letztes.heim), wo = letztes.heim === fokus ? 'gegen' : 'bei';
      const st = letztes.heim === fokus ? stand(letztes.toreHeim, letztes.toreGast) : stand(letztes.toreGast, letztes.toreHeim);
      moment = e === 'S' ? `Sieg ${wo} ${esc(geg)}, ${st}!` : e === 'U' ? `Remis ${wo} ${esc(geg)}, ${st}` : `${st} ${wo} ${esc(geg)}`;
    }
    const formHtml = form.length ? `${letztes ? `<p style="margin:0 0 12px">Zuletzt: <b>${moment}</b> <span class="t2">${tagLang(letztes.datum)}</span></p>` : ''}
      <div class="formreihe">${form.map((g, i) => { const geg = g.heim === fokus ? g.gast : g.heim; return `<button data-spiel="${g.id}">${i === 0 ? '<span class="micro" style="font-size:11px">zuletzt</span>' : '<span class="micro" style="font-size:11px;visibility:hidden">.</span>'}${formSun(g, fokus, true)}<span>${esc(kurz(geg).split(' ')[0])}</span><span class="t3">${g.heim === fokus ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}</span></button>`; }).join('')}</div>
      <div class="legende-sun"><span>${'<span class="sun S" style="width:16px;height:16px;font-size:10px">S</span>'} Sieg</span><span><span class="sun U" style="width:16px;height:16px;font-size:10px">U</span> Remis</span><span><span class="sun N" style="width:16px;height:16px;font-size:10px">N</span> Niederlage</span></div>` : '<p class="meta">Noch keine Spiele.</p>';
    const ins = auffaelligkeiten(fokus);
    const pIdx = tabelle.findIndex(x => x.id === fokus), start = Math.max(0, Math.min(pIdx - 2, tabelle.length - 5)), mini = tabelle.slice(start, start + 5);
    const bald = offen.filter(g => !g.terminOffen).slice(0, 5);
    // Am Spieltag oder während einer laufenden Erfassung steht die Erfassen-Karte ganz oben
    const erfassungOben = !!erfassungLaeuft() || tageBisSpiel(naechstes(fokus)) === 0;
    return `${seitenkopf(esc(kurz(fokus)), `Platz ${pl} · ${z.pkt} Punkte · ${esc(ligaName)}`)}${alt}${intro}
      ${erfassungOben ? erfassungKarte(naechstes(fokus)) : ''}<div class="hero-raster">${tafel(fokus)}${kach}</div>
      ${erfassungOben ? '' : erfassungKarte(naechstes(fokus))}
      ${teamKarussell()}
      <div class="zwei-sp">${modul('Form', formHtml, { eyebrow: 'Letzte Spiele', aktion: `<button class="textaktion" data-kader="${fokus}">Kader</button>` })}
      ${modul('Auffälligkeiten', ins.slice(0, 4).map(x => `<div class="satz">${x}</div>`).join('') || '<p class="meta">Noch zu wenig Daten.</p>', { aktion: ins.length > 4 ? '<button class="textaktion" data-aktion="alleInsights">Alle</button>' : '', fuss: `Aus ${B.teams[fokus] ? B.teams[fokus].spiele.length : 0} Spielen mit Spielbericht.` })}</div>
      ${siegchanceVerlauf(fokus)}
      <div class="zwei-sp">${modul('Tabelle', tabelleHtml(mini, true), { aktion: '<button class="textaktion" data-bereich="tabelle">Ganze Tabelle</button>' })}
      ${modul('Nächste Spiele der Liga', `<div class="zeilen">${bald.map(g => spielZeile(g)).join('') || '<p class="meta">Keine terminierten Spiele.</p>'}</div>`, { aktion: '<button class="textaktion" data-aktion="alleSpiele">Alle</button>' })}</div>
      <div class="datenfuss">${esc(datenstand)}<br>${esc(ABSENDER)}</div>`;
  }

  // ================= Karussell „Get to know the team“ =================
  // Nur das eigene Team: Foto, Nummer, Positionen und Satz aus daten/profile.js. Läuft von selbst weiter,
  // hält bei Berührung, Maus oder Fokus an und bleibt bei „weniger Bewegung“ ganz stehen.
  function teamKarussell() {
    if (fokus !== UNSER || !B.teams[UNSER]) return '';
    const liste = B.teams[UNSER].liste.slice().sort((a, b) => a.nummer - b.nummer || a.name.localeCompare(b.name));
    if (!liste.length) return '';
    const karte = s => {
      const pos = positionen(s), p = profil(s);
      return `<button class="kk" data-spielerin="${esc(s.id)}" aria-label="${esc(s.name)}, Nummer ${s.nummer}">
        <span class="kk-bild">${ava(s, 96)}<span class="kk-nr">${s.nummer}</span></span>
        <span class="kk-name">${esc(s.name)}</span>
        ${pos.length ? `<span class="kk-pos">${pos.map((x, i) => i === 0 ? `<span class="etikett lieb">${ico('stern', 1)}${POS[x]}</span>` : etikett(POS[x], true)).join('')}</span>` : ''}
        ${p && p.satz ? `<span class="kk-satz">„${esc(p.satz)}“</span>` : ''}
      </button>`;
    };
    const pfeile = `<span class="kk-pfeile"><button class="icobtn" data-karussell="-1" aria-label="Zurück"><span style="display:inline-block;transform:scaleX(-1)">${ico('chevr', 1)}</span></button><button class="icobtn" data-karussell="1" aria-label="Weiter">${ico('chevr', 1)}</button></span>`;
    return modul('Get to know the team', `<div class="karussell" id="karussell" tabindex="0" aria-label="Spielerinnen von ${esc(kurz(UNSER))}">${liste.map(karte).join('')}</div>`,
      { eyebrow: `${esc(kurz(UNSER))} · ${liste.length} Spielerinnen`, aktion: pfeile, klasse: 'karussell-modul' });
  }
  let karussellUhr = null, karussellPause = 0;
  function karussellSchritt(r) {
    const el = $('#karussell'); if (!el) return;
    const k = el.querySelector('.kk'); if (!k) return;
    const w = k.getBoundingClientRect().width + 12;
    const ende = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (r > 0 && ende) el.scrollTo({ left: 0, behavior: 'smooth' });
    else if (r < 0 && el.scrollLeft <= 4) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    else el.scrollBy({ left: r * w, behavior: 'smooth' });
  }
  function karussellStart() {
    clearInterval(karussellUhr); karussellUhr = null;
    const el = $('#karussell'); if (!el) return;
    const halt = () => { karussellPause = Date.now() + 8000; };
    ['pointerdown', 'pointerenter', 'wheel', 'focusin', 'touchstart'].forEach(ev => el.addEventListener(ev, halt, { passive: true }));
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    karussellUhr = setInterval(() => {
      if (!document.body.contains(el)) { clearInterval(karussellUhr); karussellUhr = null; return; }
      if (document.hidden || Date.now() < karussellPause || (sheet && sheet.open)) return;
      karussellSchritt(1);
    }, 3500);
  }

  // ================= Matchplan =================
  const kurzName = n => { const t = n.split(' '); return t.length > 1 ? `${t[0]} ${t[t.length - 1][0]}.` : n; };
  function seiteMatchplan() {
    const g = naechstes(fokus);
    if (!g) return seitenkopf('Matchplan') + modul('', `<div class="leer">${ico('plan')}<b>Kein offenes Spiel</b><p>Für ${esc(kurz(fokus))} steht kein Spiel mehr an.</p></div>`);
    const s = sicht(g);
    const mp = erzeugeMatchplan({ modell, B, K, liga: LIGA, g, fokus, eigene: labor.eigene, tw: TW });
    const r = drei(mp.basis.s, mp.basis.u, mp.basis.n), n = Math.min(mp.n || 0, mp.nG || 0);
    const au1 = mp.empfehlungen.filter(e => e.id === 'AU1'), au2 = mp.empfehlungen.filter(e => e.id === 'AU2'), au6 = mp.empfehlungen.find(e => e.id === 'AU6');
    const ph1 = mp.befunde.find(b => b.id === 'PH1');
    const wichtig = [];
    if (au1.length) wichtig.push(['Einplanen', au1.map(e => esc(e.person.name)).join(', ')]);
    if (au2.length) wichtig.push(['Anfragen', au2.map(e => esc(e.person.name)).join(', ')]);
    if (au6) wichtig.push(['7-Meter', au6.siebenmeter.slice(0, 3).map((x, i) => `${i + 1}. ${esc(kurzName(x.s.name))}`).join(' · ')]);
    const tw1 = mp.empfehlungen.find(e => e.id === 'TW1'), tw3 = mp.empfehlungen.find(e => e.id === 'TW3');
    if (tw1 || tw3) wichtig.push(['Im Tor', [tw1 ? esc(tw1.person.name) : '', tw3 ? `bei 7 m ${esc(tw3.person.name)}` : ''].filter(Boolean).join(' · ')]);
    if (ph1) wichtig.push(['Achtung', esc(ph1.titel)]);
    const kopf = seitenkopf('Matchplan', `${s.heim ? 'gegen' : 'bei'} ${esc(kurz(mp.gegner))} · ${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr`}`,
      `<div style="text-align:right"><div class="kpi">${r[0]}<span class="pz">%</span></div><div class="cap t2">Siegchance</div></div>`);
    const aktionen = `<div style="display:flex;gap:8px;margin-bottom:var(--gap)" class="nicht-druck"><button class="btn prim" data-aktion="kabine">${ico('druck', 1)} Kabinenblatt</button>${navigator.share ? `<button class="btn" data-aktion="teilen">${ico('teilen', 1)} Teilen</button>` : ''}</div>`;
    const das = wichtig.length ? `<section class="wichtigstes"><div class="mkopf"><div><span class="micro">Auf einen Blick</span><h2 class="titel">Das Wichtigste</h2></div></div>${wichtig.map(([k, v]) => `<div class="zeile"><span class="micro">${k}</span><span>${v}</span></div>`).join('')}</section>` : '';
    const hinweis = `<div class="hinweis">${ico('info')}<span>${n || 'Wenige'} Spielberichte je Team. Genug für eine Richtung, zu wenig für Gewissheit.</span></div>`;
    const maxEff = Math.max(1, ...mp.empfehlungen.map(e => Math.abs(e.eff || 0)));
    const karte = e => {
      let links = '';
      if (e.id === 'AU1') links = `<span class="kpi">${Math.round(e.eff)}<span class="pz">%</span></span><small>Siegchance hängt an ihr</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU2') links = `<span class="kpi gut">+${Math.round(e.eff)}<span class="pz">%</span></span><small>Siegchance mit ihr</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU5') links = `<span class="kpi">${Math.round(B.teams[fokus].liste.slice().sort((a, b) => b.tore - a.tore).slice(0, 2).reduce((a, x) => a + x.anteil, 0) * 100)}<span class="pz">%</span></span><small>der Tore von zwei</small>`;
      else if (e.id === 'AU7') links = `<span class="kpi">${e.text.match(/^(\d+)/)[1]}/${e.text.match(/ihrer (\d+)/)[1]}</span><small>Tore ${/zweiten/.test(e.titel) ? '2.' : '1.'} Hälfte</small>`;
      else if (e.id === 'DI1') links = `<span class="kpi">${e.text.match(/hat (\d+)/)[1]}</span><small>Zeitstrafen</small>`;
      else if (e.id === 'DI2') links = `<span class="kpi">${dez(K[fokus].zweiProSpiel)}</span><small>Zeitstrafen pro Spiel</small>`;
      else if (e.id === 'TW1') links = `<span class="kpi gut">${Math.round(e.person.tw.rate * 100)}<span class="pz">%</span></span><small>gehalten</small>`;
      else if (e.id === 'TW3') links = `<span class="kpi gut">${e.person.tw.sevenMeter.saves}<span class="pz">/${e.person.tw.sevenMeter.onTarget}</span></span><small>7 m gehalten</small>`;
      return `<article class="karte"><div class="eff">${links}</div><div><span class="micro">${e.kat}</span><h3${e.person ? ' style="display:flex;gap:8px;align-items:center"' : ''}>${e.person ? ava(e.person, 28) : ''}<span>${esc(e.titel)}</span></h3><p>${esc(e.text)}</p><div class="belege">${ausSpielen(e.n)}</div></div></article>`;
    };
    const karten = mp.empfehlungen.filter(e => e.id !== 'AU6');
    const empf = karten.length ? `<div class="karten zwei">${karten.map(karte).join('')}</div>` : modul('', `<div class="leer">${ico('plan')}<b>Noch zu früh für Empfehlungen</b><p>Ab 2 Spielberichten je Team stehen hier Hinweise zur Aufstellung. Bisher: ${n || 0}.</p></div>`);
    const siebenmeter = au6 ? modul('7-Meter-Reihenfolge', `<div class="siebenmeter">${au6.siebenmeter.slice(0, 4).map((x, i) => `<div class="platz7"><span class="nr">${i + 1}.</span><span style="display:flex;gap:12px;align-items:center;min-width:0">${ava(x.s, 40)}<span style="min-width:0"><b style="font-weight:600">${esc(x.s.name)}</b><span class="cap t2" style="display:block">#${x.s.nummer}</span></span></span><span style="font-weight:600">${x.s.sm} von ${x.s.smVers}</span></div>`).join('')}</div>`,
      { id: 'mp7m', fuss: `Reihenfolge nach Trefferquote, bei wenigen Würfen vorsichtig Richtung Ligaschnitt (${pct(LIGA.smQuote)}) gezogen. Das Team trifft ${B.teams[fokus].liste.reduce((a, x) => a + x.sm, 0)} von ${B.teams[fokus].liste.reduce((a, x) => a + x.smVers, 0)}.` }) : '';
    const befund = b => `<div class="satz"><span class="micro">${b.kat}</span><div style="font-weight:600;margin:2px 0">${esc(b.titel)}</div><div class="t2">${esc(b.text)}</div></div>`;
    const phasenBef = mp.befunde.filter(b => b.id === 'PH1' || b.id === 'PH2'), weitere = mp.befunde.filter(b => b.id !== 'PH1' && b.id !== 'PH2' && b.id !== 'TW4');
    const gegnerinnen = mp.gegnerinnen.length ? `<div class="mkopf" style="margin-top:8px"><div><span class="micro">${esc(kurz(mp.gegner))}</span><h2 class="titel">Gegnerinnen im Blick</h2></div></div><div class="karten zwei">${mp.gegnerinnen.map(x => `<article class="karte"><div class="eff"><span class="kpi">#${x.s.nummer}</span></div><div><h3 style="margin-top:0;display:flex;gap:8px;align-items:center">${ava(x.s, 28)}<span>${esc(x.s.name)}</span></h3><div class="tags">${x.tags.map(t => etikett(esc(t.replace(/(\d)× 2'/, '$1 Zeitstrafen').replace(' Sp.', ' Spielen').replace('HZ', 'Hälfte')))).join('')}</div></div></article>`).join('')}</div>` : '';
    const twTeam = TW.teams[fokus];
    // Siegchance je Torhüterin: sie im Tor, die anderen Torhüterinnen nicht, sonst die übliche Besetzung
    const keeperinnen = B.teams[fokus].liste.filter(x => x.tw || x.torwart);
    const basisDabei = ueblicheBesetzung(B, [fokus, mp.gegner]);
    const mitIhr = k => { const d = Object.assign({}, basisDabei); keeperinnen.forEach(x => d[x.id] = x.id === k.id); return chanceFokus(modell, g, fokus, B, d, labor.eigene).s; };
    const belegbar = keeperinnen.some(x => x.tw && x.tw.reliable);
    const imTor = twTeam ? modul('Im Tor', `<div class="zeilen">${keeperinnen.filter(x => x.tw).sort((a, b) => mitIhr(b) - mitIhr(a) || b.tw.onTarget - a.tw.onTarget).map(x => `<button class="spiel" style="grid-template-columns:40px minmax(0,1fr) auto;min-height:56px" data-spielerin="${esc(x.id)}">${ava(x, 40)}<span class="paar"><div style="height:auto"><span style="font-weight:500">${esc(x.name)}</span></div><div style="height:auto"><span class="cap t2">#${x.nummer} · ${x.tw.saves} von ${x.tw.onTarget} gehalten (${x.tw.onTarget ? pct(x.tw.rate) : '–'})${x.tw.sevenMeter.onTarget ? ` · 7 m ${x.tw.sevenMeter.saves}/${x.tw.sevenMeter.onTarget}` : ''} · ${x.tw.matches} Spiel${x.tw.matches === 1 ? '' : 'e'}</span></div></span><span style="text-align:right"><span style="font-weight:600;font-size:17px">${pct(mitIhr(x))}</span><span class="cap t3" style="display:block">Siegchance mit ihr</span></span></button>`).join('')}</div>`,
      { eyebrow: 'Eigene Erfassung', fuss: `Siegchance mit ihr im Tor und der üblichen Besetzung sonst${belegbar ? '' : `, vorerst gleich für alle: ab ${GOALKEEPER.MIN_SHOTS} Würfen aufs Tor zählt die Paradenquote`}. Team hält ${pct(twTeam.rate)} aus ${twTeam.matches} erfassten Spiel${twTeam.matches === 1 ? '' : 'en'}${TW.league.records > twTeam.matches ? `, alle erfassten Teams ${pct(TW.league.rate)}` : ''}.` }) : '';
    const tw4 = mp.befunde.find(b => b.id === 'TW4');
    const hinspiel = tw4 ? modul(`Letztes Spiel gegen ${esc(kurz(mp.gegner))}`, `${goalZoneSvg(tw4.zonen, 320)}<div class="satz" style="margin-top:8px"><div style="font-weight:600;margin:2px 0">${esc(tw4.titel)}</div><div class="t2">${esc(tw4.text)}</div></div>`, { eyebrow: 'Wohin die Gegentore kamen', fuss: 'Gehalten von Würfen aufs Tor je Zone aus Sicht der Werferin, dunkler heißt mehr Gegentore. Aus der eigenen Erfassung.' }) : '';
    const trainerin = TRAINERIN ? optimiererModul(g) : modul('Aufstellung durchrechnen', `<p class="meta" style="margin:0 0 12px">Für die Trainerin: Absagen eintragen, Torhüterinnen festlegen und sehen, wie sich die Siegchance verändert. Die Ansicht zeigt Werte je Spielerin und ist deshalb nicht für die ganze Gruppe gedacht.</p><button class="btn" data-aktion="trainerin">${ico('schloss', 1)} Ansicht für die Trainerin öffnen</button>`, { eyebrow: 'Für die Trainerin', klasse: 'nicht-druck', fuss: 'Diese Ansicht hat keinen Passwortschutz. Sie ist über den Link mit #trainerin am Ende erreichbar.' });
    return `${kopf}${aktionen}${das}${erfassungKarte(g)}${hinweis}
      <div class="mkopf" style="margin-top:8px"><div><span class="micro">Aufstellung und Disziplin</span><h2 class="titel">Empfehlungen</h2></div></div>
      ${empf}${siebenmeter}${imTor}${hinspiel}${trainerin}
      ${mp.phasen.fokus && mp.phasen.gegner ? modul('Spielphasen', `${phasenGrafik(mp)}${phasenBef.map(befund).join('')}`, { eyebrow: 'Befund', fuss: `Tordifferenz je 10 Minuten, Summe aus ${mp.phasen.nF === mp.phasen.nG ? 'je ' + mp.phasen.nF : mp.phasen.nF + ' und ' + mp.phasen.nG} Spielen mit Spielbericht. Gestrichelt: Halbzeit. Warum die Phasen so verlaufen, zeigen die Daten nicht.` }) : ''}
      ${gegnerinnen}
      ${weitere.length ? modul('Weitere Befunde', weitere.map(befund).join('')) : ''}
      ${kabinenblatt(g, mp, r, wichtig)}`;
  }

  function kabinenblatt(g, mp, r, wichtig) {
    const t = B.teams[fokus], kd = kaderVon(fokus);
    const kaderListe = t ? t.liste.slice().sort((a, b) => a.nummer - b.nummer).filter(s => TRAINERIN ? kd.verf[s.id] !== false : ueblichDabei(s)) : [];
    const au6 = mp.empfehlungen.find(e => e.id === 'AU6');
    return `<section class="kabinenblatt" aria-hidden="true">
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><h1>${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}</h1><div>${wortmarke(16)}</div></div>
      <div>${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr`}${g.halle ? ` · ${esc(normalisiere(g.halle))}${g.adresse ? ', ' + esc(adresseSchoen(g.adresse)) : ''}` : ''}</div>
      <div class="gross" style="margin-top:3mm">Siegchance ${esc(kurz(fokus))}: ${r[0]} % · Remis ${r[1]} % · Niederlage ${r[2]} %</div>
      <h2>Das Wichtigste</h2><table>${wichtig.map(([k, v]) => `<tr><th style="width:28mm">${k}</th><td>${v}</td></tr>`).join('')}</table>
      <div class="spalten"><div>${au6 ? `<h2>7-Meter</h2><table>${au6.siebenmeter.slice(0, 4).map((x, i) => `<tr><td class="gross" style="width:10mm">${i + 1}.</td><td>#${x.s.nummer} ${esc(x.s.name)}</td><td>${x.s.sm}/${x.s.smVers}</td></tr>`).join('')}</table>` : ''}
        <h2>Kader</h2><table>${kaderListe.map(s => `<tr><td style="width:10mm">${s.nummer}</td><td>${esc(s.name)}${kd.pins[s.id] ? ' (immer dabei)' : ''}</td></tr>`).join('')}</table></div>
      <div><h2>Gegnerinnen im Blick</h2><table>${mp.gegnerinnen.map(x => `<tr><td style="width:10mm">${x.s.nummer}</td><td>${esc(x.s.name)}<br><span style="color:#555">${esc(x.tags.join(' · ').replace(' Sp.', ' Spielen'))}</span></td></tr>`).join('')}</table>
        <h2>Spielphasen</h2>${mp.befunde.filter(b => b.id === 'PH1' || b.id === 'PH2').map(b => `<p style="margin:0 0 2mm">${esc(b.titel)}. ${esc(b.text)}</p>`).join('')}</div></div>
      <div class="fuss">${esc(datenstand)} · Grundlage je ${Math.min(mp.n, mp.nG)} Spielberichte. Richtwerte, keine Gewissheit. ${esc(ABSENDER)}</div>
    </section>`;
  }

  function optimiererModul(g) {
    const t = B.teams[fokus]; if (!t) return '';
    const kd = kaderVon(fokus);
    const o = optimiereAufstellung(modell, g, fokus, B, kd.verf, kd.pins, labor.eigene);
    const verf = t.liste.filter(s => kd.verf[s.id] !== false).length;
    const rO = drei(o.chance.s, o.chance.u, o.chance.n), rU = drei(o.chanceUeblich.s, o.chanceUeblich.u, o.chanceUeblich.n);
    const delta = rO[0] - rU[0];
    const wertVon = s => { const a = o.auswahl.find(x => x.s === s); if (a) return a.wert; const gst = o.gestrichen.find(x => x.s === s); return gst ? gst.wert : null; };
    const anders = t.liste.filter(s => (kd.verf[s.id] !== false) !== ueblichDabei(s));
    const sortiert = t.liste.slice().sort((a, b) => (kd.verf[a.id] === false) - (kd.verf[b.id] === false) || (wertVon(b) || 0) - (wertVon(a) || 0));
    const zeile = s => {
      const an = kd.verf[s.id] !== false, w = wertVon(s), pin = !!kd.pins[s.id], im = o.auswahl.some(x => x.s === s);
      const info = [`${s.anz}/${t.spiele.length} Sp.`];
      if (s.torwart) info.push(s.tw && s.tw.onTarget ? `${s.tw.saves} von ${s.tw.onTarget} gehalten (${pct(s.tw.rate)})` : 'noch keine Paraden erfasst');
      else info.push(`${dez(s.toreProSpiel)} Tore/Sp.`);
      if (s.smVers) info.push(`7m ${s.sm}/${s.smVers}`);
      if (s.zwei) info.push(`${s.zwei}× Zeitstrafe`);
      const tag = s.torwart ? 'Torhüterin' : !ueblichDabei(s) ? (belegt(s, labor.eigene) ? 'selten dabei' : 'noch keine Tore erfasst') : '';
      const wert = !an ? '<small>nicht dabei</small>' : w == null || w < 1 ? `<small>${s.torwart && !(s.tw && s.tw.reliable) ? 'ohne Erfassung' : 'keine Daten'}</small>` : `${Math.round(w)}<small>%</small>`;
      // Torhüterinnen aus der festen Liste stehen immer im Kader, die Stecknadel entfällt für sie.
      const nadel = s.torwart ? `<span class="pin an" title="Torhüterin, steht immer im Kader" aria-label="Torhüterin, immer dabei">${ico('pin')}</span>`
        : `<button type="button" class="pin${pin ? ' an' : ''}" data-pin="${esc(s.id)}" aria-pressed="${pin}" aria-label="${esc(s.name)} immer dabei" title="Immer dabei, etwa Torhüterin">${ico('pin')}</button>`;
      return `<label class="sz label mitbild${an && im ? '' : ' aus'}">
        <input type="checkbox" role="switch" class="schalter" data-verf="${esc(s.id)}" ${an ? 'checked' : ''} aria-label="${esc(s.name)} dabei">
        <span class="nr">#${s.nummer}</span>${ava(s, 28)}
        <span class="wer"><b><span>${esc(s.name)}</span>${tag ? etikett(tag, tag !== 'Torhüterin') : ''}</b><span class="cap zwei"><span class="nur-mobil">#${s.nummer} · ${tag && tag !== 'Torhüterin' ? tag + ' · ' : ''}</span>${mitPos(s)}${info.join(' · ')}</span></span>
        <span style="display:flex;align-items:center;gap:4px">${nadel}<span class="wirk">${wert}</span></span></label>`;
    };
    const fehlen = anders.filter(s => kd.verf[s.id] === false), dazu = anders.filter(s => kd.verf[s.id] !== false && belegt(s, labor.eigene));
    const nameListe = l => l.length > 3 ? `${l.slice(0, 2).map(s => esc(s.name)).join(', ')} und ${l.length - 2} weitere` : l.map(s => esc(s.name)).join(', ');
    const vergleich = [fehlen.length ? `Nicht dabei: ${nameListe(fehlen)}.` : '', dazu.length ? `Zusätzlich zur Stammbesetzung: ${nameListe(dazu)}.` : ''].join(' ').trim() || 'Gleich wie die Stammbesetzung.';
    const ergebnis = `<div class="kacheln" style="margin-bottom:12px">${kachel('Mit diesem Kader', `${rO[0]}<span class="pz">%</span>`, `${o.auswahl.length} im Spielbericht (höchstens ${MATCHPLAN.K})`, delta ? `<span class="delta ${delta > 0 ? 'plus' : 'minus'}">${delta > 0 ? '+' : MINUS}${Math.abs(delta)}</span>` : '')}${kachel('Stammbesetzung', `${rU[0]}<span class="pz">%</span>`, 'wer bei mindestens der Hälfte der Spiele dabei war')}</div><p class="meta" style="margin:0 0 8px">${vergleich}</p>`;
    const warn = [];
    if (o.ohnePins && !TW.teams[fokus]) warn.push('Torhüterinnen erfassen die Spielberichte nicht. Markiere sie mit der Stecknadel, dann stehen sie immer im Kader.');
    if (o.gestrichen.length) warn.push(`Nicht im Spielbericht (Grenze ${MATCHPLAN.K}): ${o.gestrichen.map(x => esc(x.s.name)).join(', ')}.`);
    return modul('Aufstellung durchrechnen', `${ergebnis}
      <div class="listenkopf"><span class="meta">${verf} von ${t.liste.length} verfügbar</span><button class="textaktion" data-aktion="alleVerf">Alle verfügbar</button></div>
      <div class="zeilen">${sortiert.map(zeile).join('')}</div>`,
      { eyebrow: 'Ansicht Trainerin', id: 'optimierer', fuss: `Zeile antippen schaltet: an heißt dabei. Die Zahl rechts sagt, wie viele Prozentpunkte Siegchance an ihr hängen, verglichen mit der Stammbesetzung. Mehr als die Stammbesetzung bringt höchstens ein Tor, weil sieben auf dem Feld stehen. Torhüterinnen zählen über ihre Paradenquote aus der eigenen Erfassung (ab ${GOALKEEPER.MIN_SHOTS} Würfen aufs Tor), vorher neutral. Abwehrarbeit erfassen die Spielberichte nicht, eine niedrige Zahl heißt nicht, dass jemand wenig bringt. ${warn.join(' ')}` });
  }

  // ================= Spiele =================
  function seiteSpiele() {
    let liste = ui.spieleTeam === 'fokus' ? spiele.filter(g => g.heim === fokus || g.gast === fokus) : spiele;
    if (ui.spieleStatus === 'offen') liste = liste.filter(g => g.offen);
    if (ui.spieleStatus === 'gespielt') liste = liste.filter(g => !g.offen);
    const segT = `<div class="seg">${[['fokus', kurz(fokus)], ['alle', 'Alle Teams']].map(([k, l]) => `<button data-ui="spieleTeam" data-wert="${k}" class="${ui.spieleTeam === k ? 'an' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const segS = `<div class="seg">${[['alle', 'Alle'], ['offen', 'Offen'], ['gespielt', 'Gespielt']].map(([k, l]) => `<button data-ui="spieleStatus" data-wert="${k}" class="${ui.spieleStatus === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    let html;
    if (ui.spieleTeam === 'fokus') {
      // chronologisch, Spieltag als Etikett
      const nxt = liste.find(g => g.offen);
      html = `<div class="zeilen">${liste.map(g => `${g === nxt ? '<div class="spieltag micro" data-naechste>Als Nächstes</div>' : ''}${spielZeile(g, { ohneMarke: true })}`).join('')}</div>`;
    } else if (ui.spieleStatus === 'offen') {
      // offene Spiele aller Teams: nach Datum, Monat als Etikett, Spiele ohne Termin am Ende
      const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      const gruppe = g => g.terminOffen ? 'Termin noch offen' : `${MONAT[g.datum.getUTCMonth()]} ${g.datum.getUTCFullYear()}`;
      const sortiert = liste.filter(g => !g.terminOffen).sort((a, b) => a.datum - b.datum || a.runde - b.runde)
        .concat(liste.filter(g => g.terminOffen).sort((a, b) => a.runde - b.runde || a.datum - b.datum));
      const gruppen = [...new Set(sortiert.map(gruppe))];
      html = gruppen.map((k, i) => `<div class="spieltag micro"${i === 0 ? ' data-naechste' : ''}>${k}</div><div class="zeilen">${sortiert.filter(g => gruppe(g) === k).map(g => spielZeile(g)).join('')}</div>`).join('');
    } else {
      const runden = [...new Set(liste.map(g => g.runde))].sort((a, b) => a - b);
      const naechsteRunde = (offen[0] || {}).runde;
      html = runden.map(r => `<div class="spieltag micro"${r === naechsteRunde ? ' data-naechste' : ''}>Spieltag ${r}</div><div class="zeilen">${liste.filter(g => g.runde === r).map(g => spielZeile(g)).join('')}</div>`).join('');
    }
    return `${seitenkopf('Spiele', `${esc(ligaName)} · ${gewertet.length} gespielt, ${offen.length} offen`)}${hinweisFokus()}${segT}${segS}
      ${modul('', html || `<div class="leer">${ico('kalender')}<b>Keine Spiele</b></div>`, { fuss: 'Prozent: Siegchance des eigenen Teams, bei fremden Spielen die Chance des Heimteams. Spiel antippen für Details, Halle und Route.' })}`;
  }

  // ================= Tabelle =================
  function seiteTabelle() {
    const seg = `<div class="seg">${[['tabelle', 'Tabelle'], ['verlauf', 'Verlauf'], ['saison', 'Saisonende']].map(([k, l]) => `<button data-ui="tabelleAnsicht" data-wert="${k}" class="${ui.tabelleAnsicht === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    let inhalt = '';
    if (ui.tabelleAnsicht === 'tabelle') inhalt = modul('', tabelleHtml(tabelle), { fuss: `Tabelle laut handball.net. Team antippen für Details.${urteile.length ? ` ${urteile.length} Spiel${urteile.length > 1 ? 'e' : ''} am grünen Tisch gewertet.` : ''}` });
    if (ui.tabelleAnsicht === 'verlauf') inhalt = modul('Platz je Spieltag', tabellenVerlauf(), { fuss: 'Linie antippen für Details zum Team.' });
    if (ui.tabelleAnsicht === 'saison') {
      const nFest = Object.keys(fest).length;
      const sim = nFest ? simuliereSaison(modell, gewertet, offen, teamIds, 5000, fest, bonus) : simBasis;
      const top3 = (s, id) => s.plaetze[id][0] + s.plaetze[id][1] + s.plaetze[id][2];
      const dl = (a, b) => { const d = Math.round((a - b) * 100); return nFest && d ? ` <span class="delta ${d > 0 ? 'plus' : 'minus'}">${d > 0 ? '+' : MINUS}${Math.abs(d)}</span>` : ''; };
      const stufe = v => v < .01 ? null : v < .05 ? 1 : v < .15 ? 2 : v < .30 ? 3 : v < .50 ? 4 : v < .75 ? 5 : 6;
      const zelle = v => { const s = stufe(v); return s ? `<td class="z" style="background:var(--seq-${s});color:${s >= 5 ? `var(--seq-${s}-text)` : 'var(--text-1)'}">${Math.round(v * 100)}</td>` : '<td class="z"></td>'; };
      const reihe = teamIds.slice().sort((a, b) => sim.punkte[b] - sim.punkte[a]);
      const heat = `<div class="scroll-hinweis"><div class="scrollx"><table class="tab heat"><thead><tr><th class="l">Team</th><th>Punkte</th>${teamIds.map((_, i) => `<th style="text-align:center;padding:0">${i + 1}.</th>`).join('')}</tr></thead><tbody>
        ${reihe.map(id => `<tr class="klick${id === fokus ? ' f' : ''}" data-team="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td>${dez(sim.punkte[id])}</td>${sim.plaetze[id].map(zelle).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      const runden = [...new Set(offen.map(g => g.runde))].sort((a, b) => a - b);
      const wi = runden.map(r => `<div class="spieltag micro">Spieltag ${r}</div>` + offen.filter(g => g.runde === r).map(g => {
        const p = prognose(modell, g.heim, g.gast), rr = drei(p.pHeim, p.pRemis, p.pGast), sv = sicht(g);
        return `<div class="sz" style="grid-template-columns:minmax(0,1fr) auto;${sv.dabei ? 'box-shadow:inset 3px 0 0 var(--accent)' : ''}"><span class="wer"><b><span>${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}</span></b><span class="cap">${g.terminOffen ? 'Termin offen' : tagKurz(g.datum)} · Heim ${rr[0]} % · Remis ${rr[1]} % · Gast ${rr[2]} %</span></span>
          <span class="mini-seg">${['H', 'U', 'G'].map(k => `<button data-fest="${g.id}" data-wert="${k}" class="${fest[g.id] === k ? 'an' : ''}" aria-label="${k === 'H' ? 'Heimsieg' : k === 'U' ? 'Unentschieden' : 'Gastsieg'} festlegen">${k}</button>`).join('')}</span></div>`;
      }).join('')).join('');
      inhalt = `<div class="kacheln">${kachel(`Platz 1 · ${esc(kurz(fokus))}`, `${Math.round(sim.plaetze[fokus][0] * 100)}<span class="pz">%</span>`, `erwartet ${dez(sim.punkte[fokus])} Punkte`, dl(sim.plaetze[fokus][0], simBasis.plaetze[fokus][0]))}${kachel('Unter die ersten 3', `${Math.round(top3(sim, fokus) * 100)}<span class="pz">%</span>`, nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : 'ohne Festlegungen', dl(top3(sim, fokus), top3(simBasis, fokus)))}</div>
        ${modul('Wo landet wer am Ende?', heat, { eyebrow: '5.000 durchgespielte Saisons', fuss: 'Prozent je Endplatz. Je dunkler, desto wahrscheinlicher. Zur Seite wischen für alle Plätze.' })}
        ${modul('Was wäre wenn?', `<div class="listenkopf" style="padding:0"><span class="meta">${nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : 'Lege Ergebnisse fest (H Heimsieg, U Remis, G Gastsieg), die Saison rechnet sofort neu.'}</span>${nFest ? '<button class="textaktion" data-aktion="festWeg">Zurücksetzen</button>' : `<button class="textaktion" data-aktion="fokusSiegt">${esc(kurz(fokus))} gewinnt alles</button>`}</div><div class="zeilen">${wi}</div>`, { id: 'wasWaere' })}`;
    }
    return `${seitenkopf('Tabelle', `${esc(ligaName)} · nach ${maxRunde} Spieltagen`)}${hinweisFokus()}${seg}${inhalt}`;
  }

  // ================= Durchspielen (Labor) =================
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
    if (!offen.length) return seitenkopf('Durchspielen') + modul('', `<div class="leer">${ico('labor')}<b>Keine offenen Spiele</b></div>`);
    if (!labor.spiel || !spielNach[labor.spiel] || !spielNach[labor.spiel].offen) { const n = naechstes(fokus) || offen[0]; labor.spiel = n.id; laborStandard(n); }
    const g = spielNach[labor.spiel], s = sicht(g);
    const reihen = offen.filter(o => o.heim === fokus || o.gast === fokus).concat(offen.filter(o => o.heim !== fokus && o.gast !== fokus)).slice(0, 24);
    const chips = `<div class="chipreihe">${reihen.map(o => `<button class="chip${o.id === g.id ? ' an' : ''}" data-labor="${o.id}">${esc(kurz(o.heim))} · ${esc(kurz(o.gast))} · ${o.terminOffen ? 'offen' : tagKurz(o.datum)}</button>`).join('')}</div>`;
    const seiten = [g.heim, g.gast];
    const h2h = gewertet.filter(x => (x.heim === g.heim && x.gast === g.gast) || (x.heim === g.gast && x.gast === g.heim));
    return `${seitenkopf('Durchspielen', 'Wer spielt, wer nicht, wie ist die Tagesform')}${hinweisFokus()}${chips}
      <div class="modul labor-leiste" id="laborErgebnis"></div>
      <div class="zwei-sp">${seiten.map(tid => kaderModul(g, tid)).join('')}</div>
      ${modul('Tagesform und Halle', `${regler('formF', s.dabei ? kurz(fokus) : kurz(g.heim), labor.form.f)}${regler('formG', s.dabei ? kurz(s.gegner) : kurz(g.gast), labor.form.g)}
        <label class="sz label" style="padding:6px 0;grid-template-columns:44px minmax(0,1fr)"><input type="checkbox" role="switch" class="schalter" id="neutral" ${labor.neutral ? 'checked' : ''}><span class="meta" style="color:var(--text-1)">Neutrale Halle, ohne Heimvorteil von ${dez(modell.heim)} Toren</span></label>`, { fuss: 'Tagesform: besser oder schlechter als sonst, in Toren.' })}
      ${modul('So könnte es ausgehen', '<div id="laborVerteilung"></div>', { fuss: 'Wahrscheinlichkeit je Tordifferenz. Balken: mit deinen Einstellungen. Gestrichelt: ohne Kaderinfo.' })}
      ${TRAINERIN ? modul('An wem hängt am meisten?', '<div id="laborWichtig"></div>', { eyebrow: 'Ansicht Trainerin', fuss: 'Um so viele Prozentpunkte sinkt die Siegchance, wenn nur diese eine Spielerin zusätzlich nicht dabei ist.' }) : ''}
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
    return modul(`${logo(tid, 24)} ${esc(kurz(tid))}`, `<div class="listenkopf" style="padding:0 0 4px"><span class="meta">${an} von ${t.liste.length} dabei</span><button class="textaktion" data-aktion="laborUeblich">Stammbesetzung</button></div>
      <div class="zeilen">${t.liste.slice().sort((a, b) => a.nummer - b.nummer).map(s => {
        const dab = !!labor.dabei[s.id], eig = labor.eigene[s.id], w = eig != null ? eig : s.einfluss;
        const tagText = s.torwart ? 'Torhüterin' : !ueblichDabei(s) ? (belegt(s, labor.eigene) ? 'selten dabei' : 'noch keine Tore erfasst') : '';
        const rechts = TRAINERIN ? `<button type="button" class="wirk" data-einfluss="${esc(s.id)}" title="Eigene Einschätzung">${vz(w)}<small>Tore</small></button>` : `<span class="wirk"><small>${s.torwart ? (s.tw && s.tw.onTarget ? `${pct(s.tw.rate)} gehalten` : 'Torhüterin') : `${dez(s.toreProSpiel)} Tore/Sp.`}</small></span>`;
        return `<label class="sz label mitbild${dab ? '' : ' aus'}" data-zeile="${esc(s.id)}"><input type="checkbox" role="switch" class="schalter" data-dabei="${esc(s.id)}" ${dab ? 'checked' : ''} aria-label="${esc(s.name)} spielt mit">
          <span class="nr">#${s.nummer}</span>${ava(s, 28)}<span class="wer"><b><span>${esc(s.name)}</span>${tagText ? etikett(tagText, tagText !== 'Torhüterin') : ''}</b><span class="cap"><span class="nur-mobil">#${s.nummer} · ${tagText && tagText !== 'Torhüterin' ? tagText + ' · ' : ''}</span>${mitPos(s)}${s.anz} von ${t.spiele.length} Spielen${s.smVers ? ` · 7m ${s.sm}/${s.smVers}` : ''}</span></span>
          ${rechts}
          ${TRAINERIN && labor.offen === s.id ? `<div class="regelzeile">${reglerEigen(s.id, w)}</div>` : ''}</label>`;
      }).join('')}</div>`, { fuss: TRAINERIN ? 'Zahl rechts: Torwirkung, also so viele Tore Unterschied macht sie im Schnitt. Antippen, um sie selbst einzuschätzen. Torhüterinnen bekommen sie aus der Paradenquote der eigenen Erfassung, vorher 0.' : 'Zeile antippen: dabei oder nicht dabei. Die Chancen oben rechnen sofort neu.' });
  }
  function reglerEigen(pid, w) {
    const pos = (w + 2) / 10 * 100;
    return `<div class="regler"><label class="t2">Eigene Einschätzung</label><input type="range" data-eigen="${esc(pid)}" min="-2" max="8" step="0.5" value="${w}" style="--f0:${Math.min(20, pos)}%;--f1:${Math.max(20, pos)}%"><output>${vz(w)}</output></div>`;
  }
  function laborErgebnis() {
    const g = spielNach[labor.spiel]; if (!g || !$('#laborErgebnis')) return;
    const basis = prognose(modell, g.heim, g.gast), p = laborRechne(g);
    const rb = drei(basis.pHeim, basis.pRemis, basis.pGast), rp = drei(p.pHeim, p.pRemis, p.pGast);
    const s = sicht(g);
    const d = i => { const x = rp[i] - rb[i]; if (!x) return ''; const gut = !s.dabei || i === 1 ? null : ((i === 0) === s.heim) === (x > 0); return `<span class="d ${gut == null ? 't2' : gut ? 'plus' : 'minus'}">${x > 0 ? '+' : MINUS}${Math.abs(x)}</span>`; };
    const lab = [`Sieg ${esc(kurz(g.heim))}`, 'Remis', `Sieg ${esc(kurz(g.gast))}`];
    const farbe = i => !s.dabei || i === 1 ? '' : ((i === 0) === s.heim ? 'plus' : 'minus');
    $('#laborErgebnis').innerHTML = `<div class="ergebnis3">${rp.map((v, i) => `<div><div class="w ${farbe(i)}">${v}<span class="pz">%</span>${d(i)}</div><div class="lab">${lab[i]}</div></div>`).join('')}</div>
      ${streifenHG(p, g, true)}<div class="cap t2" style="text-align:center;margin-top:8px">Ohne Kaderinfo ${rb.join(' / ')} % · ${erwartet(p, g)}</div>`;
    $('#laborVerteilung').innerHTML = verteilungSvg(p, basis, g);
    if (!TRAINERIN || !$('#laborWichtig')) return;
    $('#laborWichtig').innerHTML = `<div class="zwei-sp" style="margin:0">${[g.heim, g.gast].map(tid => {
      const t = B.teams[tid]; if (!t) return '<div></div>';
      const sv = q => (g.heim === tid ? q.pHeim : q.pGast), b0 = sv(p);
      const l = t.liste.filter(x => labor.dabei[x.id]).map(x => ({ x, d: sv(laborRechne(g, x.id)) - b0 })).sort((a, b) => a.d - b.d).slice(0, 5);
      const mx = Math.max(.01, ...l.map(z => -z.d));
      return `<div><div class="cap" style="font-weight:600;margin-bottom:6px;display:flex;gap:8px;align-items:center">${logo(tid)} ${esc(kurz(tid))}</div>${l.map(z => `<div class="bl"><span class="nm"><span>${esc(z.x.name)}</span></span><span class="spur"><i class="${tid === fokus ? 'f' : ''}" style="left:0;width:${Math.max(0, -z.d) / mx * 100}%"></i></span><span class="w">${vzGanz(z.d * 100)}${NB}%</span></div>`).join('')}</div>`;
    }).join('')}</div>`;
  }

  // ================= Spielerinnen =================
  const SORT = { tore: ['Tore', s => s.tore], tps: ['pro Spiel', s => s.toreProSpiel], sm: ['7-Meter', s => s.smVers ? s.sm / s.smVers + s.smVers / 1000 : -1], tw: ['Paraden', s => s.tw && s.tw.onTarget ? s.tw.rate + s.tw.onTarget / 10000 : -1] };
  if (TRAINERIN) SORT.einfluss = ['Torwirkung', s => s.einfluss];
  function seiteSpielerinnen() {
    if (!SORT[ui.spSort]) ui.spSort = 'tore';
    // Eigenes Team zuerst und als eigener Knopf, alle anderen Teams im Auswahlfeld daneben
    const eigen = String(ui.spTeam) === String(UNSER);
    const chips = `<div class="team-filter"><button class="chip${eigen ? ' an' : ''}" data-ui="spTeam" data-wert="${UNSER}">${logo(UNSER, 16)}${esc(kurz(UNSER))}</button>
      <select class="gk-select${eigen ? '' : ' an'}" id="spTeamWahl" aria-label="Anderes Team wählen">
        <option value="" ${eigen ? 'selected' : ''} disabled>Andere Teams …</option>
        <option value="alle" ${ui.spTeam === 'alle' ? 'selected' : ''}>Alle Teams</option>
        ${tabelle.filter(z => z.id !== UNSER).map(z => `<option value="${z.id}" ${String(ui.spTeam) === String(z.id) ? 'selected' : ''}>${esc(kurz(z.id))}</option>`).join('')}
      </select></div>`;
    const seg = `<div class="seg">${Object.entries(SORT).map(([k, [l]]) => `<button data-ui="spSort" data-wert="${k}" class="${ui.spSort === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    const abh = teamIds.filter(id => B.teams[id]).sort((a, b) => B.teams[b].top1 - B.teams[a].top1);
    return `${seitenkopf('Spielerinnen', `${alleSp.length} Spielerinnen aus ${Object.keys(B.teams).length} Teams`)}
      <input class="chip" style="width:100%;height:44px;border-radius:var(--r-m);padding:0 14px;margin-bottom:12px;font-size:16px" id="spSuche" type="search" placeholder="Name suchen" value="${esc(ui.spSuche)}" autocomplete="off">
      ${chips}${seg}<div id="spListe"></div>
      ${modul('Wie sehr hängt jedes Team an seiner besten Werferin?', abh.map(id => { const t = B.teams[id];
        return `<button class="bl" data-team="${id}"><span class="nm">${logo(id)}<span>${esc(kurz(id))}</span></span><span class="spur"><i class="${id === fokus ? 'f' : ''}" style="left:0;width:${Math.min(100, t.top1 * 100 / .5)}%"></i></span><span class="w">${pct(t.top1)}</span></button>`; }).join(''),
        { fuss: 'Anteil der besten Werferin an allen Toren des Teams.' })}`;
  }
  function spListe() {
    const q = ui.spSuche.trim().toLowerCase(), f = SORT[ui.spSort][1];
    const liste = alleSp.filter(s => (ui.spTeam === 'alle' || String(s.team) === String(ui.spTeam)) && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => f(b) - f(a));
    const wert = s => ui.spSort === 'einfluss' ? vz(s.einfluss) : ui.spSort === 'tore' ? s.tore : ui.spSort === 'tps' ? dez(s.toreProSpiel) : ui.spSort === 'tw' ? (s.tw && s.tw.onTarget ? pct(s.tw.rate) : '') : (s.smVers ? `${s.sm}/${s.smVers}` : '');
    const zeile2 = s => s.tw ? `Torhüterin · ${s.tw.saves} von ${s.tw.onTarget} gehalten` : s.torwart ? `Torhüterin · ${s.anz} Spiel${s.anz > 1 ? 'e' : ''}` : `${s.tore} Tore in ${s.anz} Spiel${s.anz > 1 ? 'en' : ''}`;
    const el = $('#spListe'); if (!el) return;
    el.innerHTML = liste.length ? modul('', `<div class="zeilen">${liste.slice(0, 120).map((s, i) => `<button class="spiel${s.team === fokus ? ' fokus' : ''}" style="grid-template-columns:24px 40px minmax(0,1fr) auto;min-height:56px" data-spielerin="${esc(s.id)}">
        <span class="cap t3" style="text-align:right">${i + 1}</span>${ava(s, 40)}<span class="paar"><div style="height:auto"><span style="font-weight:500">${esc(s.name)}</span></div><div style="height:auto;gap:6px">${logo(s.team, 16)}<span class="cap t2">#${s.nummer} · ${mitPos(s)}${esc(kurz(s.team))} · ${zeile2(s)}</span></div></span>
        <span style="font-weight:600;font-size:17px">${wert(s)}</span></button>`).join('')}</div>`) :
      modul('', `<div class="leer">${ico('trikot')}<b>Keine Spielerin gefunden</b><p>Keine Treffer für „${esc(ui.spSuche)}“.</p><button class="textaktion" data-aktion="filterWeg" style="margin:0">Filter zurücksetzen</button></div>`);
  }

  // ================= Torhüterin erfassen (Preact, app/tracker.js) =================
  // Läuft gerade eine Erfassung? Der Tracker speichert den Entwurf unter hbprog.erfassung (tracker.js).
  function erfassungLaeuft() {
    try { const d = JSON.parse(localStorage.getItem('hbprog.erfassung')); return d && d.matchId ? d : null; } catch (e) { return null; }
  }
  const tageBisSpiel = g => g && !g.terminOffen ? tageBis(g.datum) : null;
  // Auffällige Karte zum Erfassen am Spieltag, für Start und Matchplan. Nur fürs eigene Team, denn erfasst wird von der eigenen Bank.
  function erfassungKarte(g) {
    if (fokus !== UNSER) return '';
    const lauf = erfassungLaeuft();
    const tw = TW.teams[fokus], n = tw ? tw.matches : 0;
    const t = tageBisSpiel(g);
    const wann = lauf ? 'Erfassung läuft' : t === 0 ? 'Heute ist Spieltag' : t === 1 ? 'Morgen ist Spieltag' : g ? `Am Spieltag${g.terminOffen ? '' : ` · ${tagLang(g.datum)}`}` : 'Am Spieltag';
    const geg = g ? `${g.heim === fokus ? 'gegen' : 'bei'} ${esc(kurz(g.heim === fokus ? g.gast : g.heim))}` : '';
    const titel = lauf ? 'Weiter erfassen, wo du aufgehört hast' : `Torhüterin erfassen${geg ? ` ${geg}` : ''}`;
    const text = lauf ? 'Die angefangene Erfassung ist auf diesem Gerät gespeichert. Am Ende als Datei teilen, damit sie in die App einfließt.'
      : 'Auf der Bank jeden Wurf aufs eigene Tor antippen: Zone, gehalten oder Tor. Daraus entstehen Paradenquote, 7-Meter-Werte und die Torhüterinnen-Empfehlung im Matchplan.';
    return `<section class="erfassen-karte nicht-druck${lauf || t === 0 ? ' heute' : ''}">
      <span class="erfassen-ico" aria-hidden="true">${ico('tor')}</span>
      <div class="erfassen-txt"><span class="micro">${wann}${lauf ? '<span class="punkt" aria-hidden="true"></span>' : ''}</span><h2 class="titel">${titel}</h2><p>${text}</p>
        <p class="cap">${n ? `Bisher ${n} Spiel${n === 1 ? '' : 'e'} erfasst.` : 'Noch kein Spiel erfasst. Jede Erfassung macht die Torhüterinnen-Werte genauer.'}</p></div>
      <button class="btn prim" data-bereich="erfassung">${ico('tor', 1)} ${lauf ? 'Fortsetzen' : 'Erfassung starten'}</button>
    </section>`;
  }
  // Kontext für den Tracker: nur das, was er braucht; englische Schlüssel, weil tracker.js auf Englisch ist.
  function erfassungKontext() {
    const kd = kaderVon(fokus), t = B.teams[fokus];
    const label = g => `${g.terminOffen ? 'Termin offen' : tagLang(g.datum)} · ${g.heim === fokus ? 'gegen' : 'bei'} ${kurz(g.heim === fokus ? g.gast : g.heim)}${g.gewertet ? ` (${g.heim === fokus ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)})` : ''}`;
    const eintrag = g => ({ id: g.id, label: label(g), opponentId: g.heim === fokus ? g.gast : g.heim, isHome: g.heim === fokus, date: g.datum.toISOString().slice(0, 10) });
    const meine = spiele.filter(g => g.heim === fokus || g.gast === fokus);
    return {
      teamId: fokus, shortName: kurz, longName: lang,
      matches: meine.filter(g => g.offen).map(eintrag).concat(meine.filter(g => g.gewertet).slice(-2).reverse().map(eintrag)),
      roster: t ? t.liste.map(s => ({ id: s.id, name: s.name, number: s.nummer, pinned: !!kd.pins[s.id] || !!s.torwart })) : [],
    };
  }
  function seiteErfassung() {
    return `${seitenkopf('Torhüterin erfassen', `${esc(kurz(fokus))} · Würfe aufs eigene Tor live von der Bank`)}${hinweisFokus()}<div id="erfassung-wurzel"></div>`;
  }

  // ================= Teams =================
  const TM = [
    ['name', 'Team', id => kurz(id)], ['staerke', 'Teamstärke', id => staerke(modell, id)], ['att', 'Tore mehr', id => modell.att[id] || 0], ['def', 'Gegentore weniger', id => modell.def[id] || 0],
    ['hz1', '1. Hälfte', id => muster[id].n ? muster[id].hz1 / muster[id].n : 0], ['hz2', '2. Hälfte', id => muster[id].n ? muster[id].hz2 / muster[id].n : 0],
    ['schluss', 'Letzte 10 Min.', id => muster[id].n ? muster[id].schluss / muster[id].n : 0],
    ['smq', '7m-Quote', id => K[id].smQuote == null ? -1 : K[id].smQuote], ['zwei', 'Zeitstr./Sp.', id => K[id].zweiProSpiel], ['top1', 'Beste Werferin', id => B.teams[id] ? B.teams[id].top1 : 0],
  ];
  function seiteTeams() {
    const sp = TM.find(c => c[0] === ui.tmSort);
    const liste = teamIds.slice().sort((a, b) => { const x = sp[2](a), y = sp[2](b); const c = typeof x === 'string' ? x.localeCompare(y, 'de') : x - y; return ui.tmAb ? -c : c; });
    const mx = Math.max(1, ...teamIds.map(id => Math.abs(staerke(modell, id))));
    const balken = rang.map(id => { const s = staerke(modell, id), w = Math.abs(s) / mx * 50;
      return `<button class="bl" data-team="${id}"><span class="nm">${logo(id)}<span style="${id === fokus ? 'font-weight:600' : ''}">${esc(kurz(id))}</span></span><span class="spur"><span class="null"></span><i class="${id === fokus ? 'f' : ''}" style="left:${s >= 0 ? 50 : 50 - w}%;width:${w}%"></i></span><span class="w">${vz(s)}</span></button>`; }).join('');
    const tab = `<div class="scroll-hinweis"><div class="scrollx"><table class="tab"><thead><tr>${TM.map(c => `<th class="sort${c[0] === 'name' ? ' l' : ''}${ui.tmSort === c[0] ? ' an' : ''}" data-tmsort="${c[0]}">${c[1]}${ui.tmSort === c[0] ? (ui.tmAb ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>
      ${liste.map(id => { const m = muster[id], k = K[id], t = B.teams[id];
        return `<tr class="klick${id === fokus ? ' f' : ''}" data-team="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td style="font-weight:700">${vz(staerke(modell, id))}</td><td>${vz(modell.att[id] || 0)}</td><td>${vz(modell.def[id] || 0)}</td>
        <td>${m.n ? vz(m.hz1 / m.n) : ''}</td><td>${m.n ? vz(m.hz2 / m.n) : ''}</td><td>${m.n ? vz(m.schluss / m.n) : ''}</td><td>${k.smQuote == null ? '' : pct(k.smQuote)}</td><td>${k.spiele ? dez(k.zweiProSpiel) : ''}</td><td>${t ? pct(t.top1) : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    return `${seitenkopf('Teams', 'Stärke und Profile im Vergleich')}
      ${modul('Teamstärke in Toren', balken, { fuss: '+0,3 heißt: im Schnitt 0,3 Tore besser als ein Durchschnittsteam auf neutralem Platz.' })}
      ${modul('Vergleich', tab, { fuss: 'Tore mehr geworfen und Gegentore weniger kassiert als der Ligaschnitt. Hälften und letzte 10 Minuten: durchschnittliche Tordifferenz in diesem Abschnitt. Spaltenkopf sortiert, zur Seite wischen für alle Spalten.' })}`;
  }

  // ================= Methodik =================
  function seiteMethodik() {
    let treffer = 0, summe = 0, brier = 0;
    gewertet.forEach(g => {
      const p = vorher[g.id], real = g.toreHeim > g.toreGast ? 0 : g.toreHeim === g.toreGast ? 1 : 2, arr = [p.pHeim, p.pRemis, p.pGast];
      if (arr.indexOf(Math.max(...arr)) === real) treffer++;
      summe += arr[real]; brier += arr.reduce((s, q, i) => s + (q - (i === real ? 1 : 0)) ** 2, 0);
    });
    const n = gewertet.length || 1;
    const GLOSSAR = [
      ['Siegchance', 'Wie wahrscheinlich ein Sieg laut den bisherigen Ergebnissen ist. Remis und Niederlage ergänzen sie auf 100 %.'],
      ['Prozentpunkte', 'Unterschied zwischen zwei Prozentwerten. Von 42 % auf 27 % sind 15 Prozentpunkte.'],
      ['Teamstärke', 'So viele Tore ist ein Team im Schnitt besser oder schlechter als ein Durchschnittsteam der Liga, auf neutralem Platz.'],
      ['Spielbericht', 'Spiel mit Aufstellung, Torschützinnen und Liveticker auf handball.net.'],
      ['Stammbesetzung', 'Alle, die bei mindestens der Hälfte der Spiele dabei waren.'],
      ['Torwirkung', 'Nur in der Ansicht für die Trainerin: so viele Tore Unterschied macht eine Spielerin im Schnitt, wenn sie spielt. Torhüterinnen und Abwehrarbeit fehlen darin.'],
      ['Am grünen Tisch', 'Spiel, das per Urteil gewertet wurde.'],
      ['Paradenquote', 'Anteil der Würfe aufs Tor, die die Torhüterin hält. Kommt aus der eigenen Erfassung von der Bank, nicht von handball.net.'],
    ];
    return `${seitenkopf(wortmarke(32), 'So rechnet die App und wie gut sie bisher lag')}
      ${bildDa.keyvisual ? `<div style="border-radius:var(--r-xl);overflow:hidden;margin-bottom:var(--gap);background:var(--tafel)"><img src="assets/keyvisual-1600x900.png" alt="" style="display:block;width:100%;height:auto"></div>` : ''}
      <div class="kacheln vier">${kachel('Favorit gewann', `${treffer} von ${gewertet.length}`, 'gemessen vor dem Anpfiff')}${kachel('Chance fürs echte Ergebnis', `${Math.round(summe / n * 100)}<span class="pz">%</span>`, 'im Schnitt')}${kachel('Treffsicherheit', dez(brier / n, 2), '0 wäre perfekt, 0,67 wäre Raten')}${kachel('Heimvorteil', `${vz(modell.heim)}`, 'Tore in dieser Liga')}</div>
      ${modul('Teamstärke und Siegchance', `<div class="fliess"><p>Aus allen Ergebnissen schätzt ${APP} für jedes Team, wie viele Tore es mehr wirft und weniger kassiert als der Schnitt, dazu den Heimvorteil. Am Saisonanfang zieht die Rechnung alle Teams Richtung Durchschnitt und wird mit jedem Ergebnis mutiger.</p><p>Daraus ergibt sich für jedes Spiel eine erwartete Tordifferenz. Weil Handball streut, wird sie als Glockenkurve behandelt: Die Flächen links, in der Mitte und rechts sind Niederlage, Remis und Sieg. Die Zahlen oben sind ehrlich gemessen, jedes Spiel nur mit dem, was vor dem Anpfiff bekannt war.</p></div>`)}
      ${modul('Matchplan', `<div class="fliess"><p>Der Matchplan zeigt nur, was die Spielberichte belegen: wer unverzichtbar ist, wen es lohnt anzufragen, die 7-Meter-Reihenfolge nach Quote, in welcher Hälfte wer trifft, Zeitstrafen, Spielphasen und die wichtigsten Gegnerinnen. Taktische Ratschläge gibt es bewusst nicht, weil Positionen, Einsatzzeiten und Paraden fehlen. Jede Karte sagt, aus wie vielen Spielen sie stammt.</p><p>Werte je Spielerin zeigt ${APP} nur in der Ansicht für die Trainerin. Sie ist über einen eigenen Link erreichbar und hat keinen Passwortschutz.</p></div>`)}
      ${modul('Begriffe', GLOSSAR.map(([k, v]) => `<div class="satz"><b>${k}</b><div class="t2">${v}</div></div>`).join(''))}
      ${modul('Grenzen', `<div class="fliess"><p>Torhüterinnen sind in den Spielberichten nicht gekennzeichnet, Paraden kennt handball.net nicht. Sie kommen nur aus der eigenen Erfassung von der Bank (Bereich „Torhüterin erfassen“)${TW.records ? `, bisher ${TW.records} Spiel${TW.records === 1 ? '' : 'e'}` : ', bisher kein Spiel'}. Ab ${GOALKEEPER.MIN_SHOTS} erfassten Würfen aufs Tor ersetzt die Paradenquote die generische Torwirkung einer Torhüterin. Verletzungen, Trainingsstand und die Vorsaison kennt die Rechnung nicht. Bei drei bis vier Spielen je Team sind alle Werte Richtwerte.</p></div>`)}
      ${modul('Absender', `<div class="meta">${esc(ABSENDER)}<br>${esc(datenstand)}. ${gewertet.length} gewertete Spiele, ${Object.keys(DETAILS).length} Spielberichte, ${TW.records} Torhüterinnen-Erfassung${TW.records === 1 ? '' : 'en'}, ${offen.length} offene Spiele.</div>`)}`;
  }

  // ================= Detail-Sheets =================
  function spielDetail(id) {
    const g = spielNach[id]; if (!g) return;
    const v = B.verlaeufe[id], d = DETAILS[id];
    const W = Math.min(448, window.innerWidth) - 2 * 16 - 2;
    let html = `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;text-align:center;align-items:center;margin:4px 0 16px">
      <button data-team="${g.heim}" style="border:0;background:none;color:inherit">${logo(g.heim, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.heim))}</div><div class="cap t2">Heim</div></button>
      <div>${g.gewertet ? `<div style="font:700 40px/40px var(--font-display);letter-spacing:-.03em">${stand(g.toreHeim, g.toreGast)}</div>${v ? `<div class="meta">Halbzeit ${stand(v.halbzeit.heim, v.halbzeit.gast)}</div>` : ''}` : `<div class="meta">${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)}<br>${zeit(g.datum)} Uhr`}</div>`}</div>
      <button data-team="${g.gast}" style="border:0;background:none;color:inherit">${logo(g.gast, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.gast))}</div><div class="cap t2">Gast</div></button></div>`;
    if (g.halle) html += `<div class="hinweis" style="margin-bottom:16px">${ico('ort')}<span>${esc(normalisiere(g.halle))}${g.adresse ? `<br><span class="t2">${esc(adresseSchoen(g.adresse))}</span>` : ''}</span>${routeLink(g) ? `<span style="margin-left:auto">${routeLink(g)}</span>` : ''}</div>`;
    if (g.gewertet) {
      html += `<div class="micro">Chance vor dem Spiel</div>${dreiHG(vorher[g.id], g)}${streifenHG(vorher[g.id], g, true)}`;
      if (v && v.tore.length) html += `<div class="micro" style="margin:20px 0 4px">Spielverlauf</div>${spielverlaufSvg(g, v, W)}`;
      if (d && d.l && d.l.data) {
        const spalte = (seite, tid) => {
          const ps = (d.l.data[seite].players || []).filter(p => !p.is_staff).sort((a, b) => b.goals - a.goals || a.number - b.number);
          return `<div class="micro" style="margin:20px 0 4px;display:flex;gap:8px;align-items:center">${logo(tid, 16)} ${esc(kurz(tid))}</div><table class="tab"><thead><tr><th>#</th><th class="l">Spielerin</th><th>Tore</th><th>7m</th><th>Zeitstr.</th></tr></thead><tbody>
            ${ps.map(p => `<tr class="klick" data-spielerin="${esc(p.player.id)}"><td class="t3">${p.number}</td><td class="l" style="max-width:190px"><span style="display:flex;gap:8px;align-items:center;min-width:0">${avatar(p.player.id, p.player.first_name + ' ' + p.player.last_name, tid, 24)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.player.first_name + ' ' + p.player.last_name)}</span></span></td><td style="font-weight:600">${p.goals || ''}</td><td class="t2">${p.seven_meter_attempts ? p.seven_meter_goals + '/' + p.seven_meter_attempts : ''}</td><td class="t2">${p.two_minutes || ''}</td></tr>`).join('')}</tbody></table>`;
        };
        html += spalte('local', g.heim) + spalte('visitor', g.gast);
      } else html += `<div class="leer">${ico('info')}<b>Kein Spielbericht</b><p>Für dieses Spiel gibt es keinen Spielbericht. Ergebnis und Chance stehen oben.</p></div>`;
    } else if (g.urteil) {
      html += '<p class="meta">Dieses Spiel wurde am grünen Tisch gewertet. handball.net zeigt dazu kein Ergebnis.</p>';
    } else {
      const p = prognose(modell, g.heim, g.gast), s = sicht(g);
      html += `${dreiHG(p, g)}${streifenHG(p, g, true)}<div class="cap t2" style="text-align:center;margin-top:8px">${erwartet(p, g)}</div>
        <div class="kacheln" style="margin-top:20px">${[g.heim, g.gast].map(tid => kachel(esc(kurz(tid)), `${platz(tid)}.`, `Teamstärke ${vz(staerke(modell, tid))} Tore · zuletzt ${spieleVon(tid).slice(-3).reverse().map(x => ergebnisAus(x, tid)).join(' ') || 'noch nichts'}`)).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${s.dabei ? '<button class="btn prim" data-bereich="matchplan">Matchplan</button>' : ''}<button class="btn${s.dabei ? '' : ' prim'}" data-labor="${g.id}" style="${s.dabei ? '' : 'grid-column:1/-1'}">Durchspielen</button></div>`;
    }
    oeffneSheet(`${g.gewertet ? 'Ergebnis' : 'Vorschau'} · Spieltag ${g.runde}`, html);
  }

  function teamDetail(id) {
    const z = tabelle.find(x => x.id === id) || { pkt: 0, tp: 0, tm: 0, sp: 0 };
    const nx = naechstes(id), letzte = spieleVon(id).slice(-5).reverse();
    oeffneSheet(`${esc(kurz(id))}`, `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">${logo(id, 48)}<div><div style="font-weight:600">${esc(lang(id))}</div><div class="meta">Platz ${platz(id)} · ${z.pkt} Punkte · ${stand(z.tp, z.tm)} Tore</div></div></div>
      <div class="kacheln">${kachel('Teamstärke', vz(staerke(modell, id)), 'Tore gegenüber dem Schnitt')}${kachel('Platz 1 am Ende', `${Math.round(simBasis.plaetze[id][0] * 100)}<span class="pz">%</span>`, `unter die ersten 3: ${pct(simBasis.plaetze[id][0] + simBasis.plaetze[id][1] + simBasis.plaetze[id][2])}`)}</div>
      ${letzte.length ? `<div class="micro" style="margin:4px 0 8px">Zuletzt, neuestes zuerst</div><div class="formreihe" style="margin-bottom:16px">${letzte.map(g => `<button data-spiel="${g.id}">${formSun(g, id, true)}<span>${esc(kurz(g.heim === id ? g.gast : g.heim).split(' ')[0])}</span><span class="t3">${g.heim === id ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}</span></button>`).join('')}</div>` : ''}
      ${nx ? `<div class="micro" style="margin-bottom:4px">Nächstes Spiel</div><div class="zeilen" style="margin:0 -16px 16px">${spielZeile(nx, { ohneMarke: true })}</div>` : ''}
      <div style="display:grid;gap:8px">${id !== fokus ? `<button class="btn" data-fokus="${id}">Aus Sicht von ${esc(kurz(id))} ansehen</button>` : ''}<button class="btn" data-kader="${id}">Kader ansehen</button></div>`);
  }

  function spielerinDetail(pid) {
    const s = spNach[pid]; if (!s) return;
    const t = B.teams[s.team];
    const zeilen = t.spiele.map(mid => spielNach[mid]).sort((a, b) => b.datum - a.datum).map(g => {
      const dabei = s.spiele.includes(g.id);
      let tore = '';
      if (dabei && DETAILS[g.id]) { const seite = g.heim === s.team ? 'local' : 'visitor'; const p = DETAILS[g.id].l.data[seite].players.find(x => x.player.id === pid); tore = p ? p.goals : ''; }
      const geg = g.heim === s.team ? g.gast : g.heim;
      return `<tr class="klick" data-spiel="${g.id}" style="${dabei ? '' : 'opacity:.5'}"><td class="l t2">${tagKurz(g.datum)}</td><td class="l" style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${g.heim === s.team ? 'gegen' : 'bei'} ${esc(kurz(geg))}</td><td>${formSun(g, s.team)}</td><td style="font-weight:600">${dabei ? `${tore} Tore` : '<span class="cap t3">nicht dabei</span>'}</td></tr>`;
    }).join('');
    const hz = (K[s.team].torHz[s.name] || [0, 0]);
    oeffneSheet(`#${s.nummer} ${esc(s.name)}`, `<div class="meta" style="display:flex;gap:16px;align-items:center;margin-bottom:16px">${ava(s, 72)}<span style="display:grid;gap:8px"><span style="display:flex;gap:8px;align-items:center">${logo(s.team)} ${esc(lang(s.team))}</span>${positionen(s).length ? `<span class="profiltags">${positionen(s).map((x, i) => i === 0 ? `<span class="etikett lieb" title="Lieblingsposition">${ico('stern', 1)}${POS[x]}</span>` : etikett(POS[x], true)).join('')}</span>` : ''}</span></div>
      ${profil(s) && profil(s).satz ? `<p class="profilsatz">${esc(profil(s).satz)}</p>` : ''}
      ${s.tw ? `<div class="kacheln">${kachel('Paradenquote', s.tw.rate == null ? '–' : `${Math.round(s.tw.rate * 100)}<span class="pz">%</span>`, `${s.tw.saves} von ${s.tw.onTarget} Würfen aufs Tor`)}${kachel('7-Meter gehalten', s.tw.sevenMeter.onTarget ? `${s.tw.sevenMeter.saves} von ${s.tw.sevenMeter.onTarget}` : 'keine', s.tw.sevenMeter.onTarget ? pct(s.tw.sevenMeter.rate) + ' Quote' : 'noch kein Siebenmeter erfasst')}${kachel('Erfasste Spiele', `${s.tw.matches}`, `${s.tw.minutes} Minuten im Tor`)}${TRAINERIN ? kachel('Torwirkung', vz(s.einfluss), s.tw.reliable ? 'aus der Paradenquote' : `Paradenquote zählt ab ${GOALKEEPER.MIN_SHOTS} Würfen`) : kachel('Vorbei', `${s.tw.misses}`, 'Würfe neben das Tor')}</div>
      ${modul('Gehalten je Zone', goalZoneSvg(s.tw.zones, 320), { eyebrow: 'Aus Sicht der Werferin', fuss: 'Gehalten von Würfen aufs Tor je Zone, dunkler heißt mehr Gegentore. Aus der eigenen Erfassung von der Bank.' })}` : `${s.torwart ? `<div class="hinweis">${ico('tor')}<span>Torhüterin. Paraden gibt es erst, wenn ein Spiel von der Bank erfasst wurde.</span></div>` : ''}
      <div class="kacheln">${kachel('Tore pro Spiel', dez(s.toreProSpiel), `${s.tore} Tore in ${s.anz} von ${t.spiele.length} Spielen`)}${kachel('Anteil an den Teamtoren', `${Math.round(s.anteil * 100)}<span class="pz">%</span>`, `erste Hälfte ${hz[0]}, zweite ${hz[1]}`)}${kachel('7-Meter', s.smVers ? `${s.sm} von ${s.smVers}` : 'keine', s.smVers ? pct(s.sm / s.smVers) + ' Quote' : 'noch keine Würfe')}${TRAINERIN ? kachel('Torwirkung', vz(s.einfluss), 'Tore Unterschied, wenn sie spielt') : kachel('Zeitstrafen', `${s.zwei}`, `in ${s.anz} Spiel${s.anz > 1 ? 'en' : ''}`)}</div>
      ${TRAINERIN ? `<div class="fussnote" style="margin-top:0">Tore mehr als eine Ersatzspielerin: ${vz(s.torbeitrag)}. ${s.mitOhne == null ? 'Noch kein Spiel ohne sie.' : !s.gewichtMitOhne ? `So lief es mit und ohne sie: ${vz(s.mitOhne)} Tore, zählt erst ab zwei Spielen mit und zwei ohne sie.` : `So lief es mit und ohne sie: ${vz(s.mitOhne)} Tore.`}</div>` : ''}
`}
      <div class="micro" style="margin:20px 0 4px">Spiele, neuestes zuerst</div><table class="tab"><tbody>${zeilen}</tbody></table>`);
  }

  function teamWechsler() {
    oeffneSheet('Team wählen', tabelle.map(z => `<button class="listezeile" data-fokus="${z.id}"><span class="platz">${platz(z.id)}</span>${logo(z.id, 28)}<span class="nm">${esc(kurz(z.id))} ${z.id === UNSER ? etikett('eigenes Team') : ''}</span>${z.id === fokus ? ico('haken', 1) : ''}</button>`).join('') + `<p class="cap t2" style="margin:12px 0 0">Beim nächsten Öffnen zeigt ${APP} wieder ${esc(kurz(UNSER))}.</p>`);
  }
  function mehrSheet() {
    oeffneSheet('Mehr', `<button class="btn prim erfassen-knopf" data-bereich="erfassung" style="width:100%;margin-bottom:12px">${ico('tor', 1)}<span>${erfassungLaeuft() ? 'Erfassung läuft · fortsetzen' : 'Torhüterin erfassen'}</span></button>` + BEREICHE.slice(4).filter(b => b.id !== 'erfassung').map(b => `<button class="listezeile" data-bereich="${b.id}">${ico(b.ico)}<span class="nm">${b.name}</span>${bereich === b.id ? ico('haken', 1) : ico('chevr', 1).replace('class="ico k"', 'class="ico k t3"')}</button>`).join('') +
      `<button class="listezeile" data-aktion="${TRAINERIN ? 'trainerinAus' : 'trainerin'}">${ico('schloss')}<span class="nm">${TRAINERIN ? 'Ansicht Trainerin verlassen' : 'Ansicht für die Trainerin'}</span></button>`);
  }

  // ================= Bilder vorhanden? =================
  const bildDa = { keyvisual: false };
  (function () { const i = new Image(); i.onload = () => { bildDa.keyvisual = true; if (bereich === 'heute' || bereich === 'methodik') zeichne(); }; i.src = 'assets/keyvisual-1600x900.png'; })();

  // ================= Zeichnen =================
  let letzteBreite = 0;
  function zeichne(scrollOben) {
    const seiten = { heute: seiteHeute, matchplan: seiteMatchplan, spiele: seiteSpiele, tabelle: seiteTabelle, labor: seiteLabor, spielerinnen: seiteSpielerinnen, teams: seiteTeams, methodik: seiteMethodik, erfassung: seiteErfassung };
    if (!seiten[bereich]) bereich = 'heute';
    if (window.trackerUnmount) trackerUnmount(); // Preact-Baum sauber abbauen, bevor der Inhalt ersetzt wird
    gerüst();
    $('#inhalt').innerHTML = seiten[bereich]();
    if (bereich === 'erfassung' && window.trackerMount) trackerMount($('#erfassung-wurzel'), erfassungKontext());
    document.title = `${(BEREICHE.find(b => b.id === bereich) || {}).name} · ${APP}`;
    if (bereich === 'labor') laborErgebnis();
    if (bereich === 'spielerinnen') spListe();
    if (bereich === 'heute') karussellStart(); else { clearInterval(karussellUhr); karussellUhr = null; }
    letzteBreite = window.innerWidth;
    if (scrollOben) {
      window.scrollTo(0, 0);
      if (bereich === 'spiele') { const el = document.querySelector('[data-naechste]'); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }
    }
  }
  function wechsle(b) { bereich = b; merk.set('bereich', b); if (bereichAusHash() && bereichAusHash() !== b) history.replaceState(null, '', location.pathname + location.search); schliesseSheet(); zeichne(true); }
  function setzeFokus(id) { fokus = id; labor.spiel = null; schliesseSheet(); zeichne(true); }

  // ================= Ereignisse =================
  document.addEventListener('click', e => {
    if (e.target.matches('input')) return;
    const el = e.target.closest('[data-aktion],[data-bereich],[data-fokus],[data-team],[data-kader],[data-spiel],[data-spielerin],[data-labor],[data-ui],[data-fest],[data-tmsort],[data-einfluss],[data-pin],[data-wert],[data-karussell]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.wert && !el.closest('.pkt') && !ds.ui && !ds.fest && el.tagName !== 'BUTTON') {
      const z = el.closest('.modul, .sinhalt'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz) wz.textContent = ds.wert; return;
    }
    if (ds.pin) { e.preventDefault(); const kd = kaderVon(UNSER === fokus ? fokus : fokus); kd.pins[ds.pin] = !kd.pins[ds.pin]; merk.set('kader', kader); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.karussell) { karussellPause = Date.now() + 8000; return karussellSchritt(Number(ds.karussell)); }
    if (ds.einfluss) { e.preventDefault(); labor.offen = labor.offen === ds.einfluss ? null : ds.einfluss; const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.aktion) {
      const a = ds.aktion;
      if (a === 'zu') return schliesseSheet();
      if (a === 'team') return teamWechsler();
      if (a === 'mehr') return mehrSheet();
      if (a === 'kabine') { document.body.classList.add('druck-kabine'); window.print(); return; }
      if (a === 'teilen') { navigator.share({ title: `${APP}: Matchplan`, url: location.href.split('#')[0] }).catch(() => {}); return; }
      if (a === 'trainerin') { location.hash = 'trainerin'; return; }
      if (a === 'trainerinAus') { history.replaceState(null, '', location.pathname + location.search); TRAINERIN = false; delete SORT.einfluss; schliesseSheet(); return zeichne(); }
      if (a === 'introWeg') { merk.set('intro', true); return zeichne(); }
      if (a === 'alleInsights') return oeffneSheet('Auffälligkeiten', auffaelligkeiten(fokus).map(x => `<div class="satz">${x}</div>`).join(''));
      if (a === 'alleSpiele') { ui.spieleTeam = 'alle'; return wechsle('spiele'); }
      if (a === 'filterWeg') { ui.spSuche = ''; ui.spTeam = UNSER; return zeichne(); }
      if (a === 'festWeg') { fest = {}; merk.set('fest', fest); return zeichne(); }
      if (a === 'fokusSiegt') { offen.forEach(o => { if (o.heim === fokus) fest[o.id] = 'H'; if (o.gast === fokus) fest[o.id] = 'G'; }); merk.set('fest', fest); return zeichne(); }
      if (a === 'alleVerf') { kaderVon(fokus).verf = {}; merk.set('kader', kader); return zeichne(); }
      if (a === 'laborUeblich') { laborStandard(spielNach[labor.spiel]); return zeichne(); }
      return;
    }
    if (ds.bereich) return wechsle(ds.bereich);
    if (ds.fokus) return setzeFokus(Number(ds.fokus));
    if (ds.team) return teamDetail(Number(ds.team));
    if (ds.kader) { ui.spTeam = ds.kader; ui.spSuche = ''; return wechsle('spielerinnen'); }
    if (ds.labor) { const g = spielNach[ds.labor]; labor.spiel = g.id; laborStandard(g); labor.offen = null; if (bereich !== 'labor') return wechsle('labor'); return zeichne(); }
    if (el.closest('.pkt')) { const p = el.closest('.pkt'); const z = p.closest('.modul'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz && wz.textContent !== p.dataset.wert) { wz.textContent = p.dataset.wert; return; } return spielDetail(Number(p.dataset.spiel)); }
    if (ds.spiel) return spielDetail(Number(ds.spiel));
    if (ds.spielerin) return spielerinDetail(ds.spielerin);
    if (ds.ui) {
      const k = ds.ui; ui[k] = ds.wert;
      if (k === 'spTeam') { const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
      if (k === 'spSort') { $$(`[data-ui="${k}"]`).forEach(b => b.classList.toggle('an', b.dataset.wert === ds.wert)); return spListe(); }
      return zeichne(k === 'spieleTeam');
    }
    if (ds.fest) { if (fest[ds.fest] === ds.wert) delete fest[ds.fest]; else fest[ds.fest] = ds.wert; merk.set('fest', fest); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.tmsort) { if (ui.tmSort === ds.tmsort) ui.tmAb = !ui.tmAb; else { ui.tmSort = ds.tmsort; ui.tmAb = ds.tmsort !== 'name'; } return zeichne(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, y = window.scrollY;
    if (t.dataset.verf) { const kd = kaderVon(fokus); if (t.checked) delete kd.verf[t.dataset.verf]; else kd.verf[t.dataset.verf] = false; merk.set('kader', kader); zeichne(); window.scrollTo(0, y); return; }
    if (t.dataset.dabei) { labor.dabei[t.dataset.dabei] = t.checked; t.closest('.sz').classList.toggle('aus', !t.checked); const m = t.closest('.modul'); const kopf = m.querySelector('.listenkopf .meta'); if (kopf) { const alle = m.querySelectorAll('[data-dabei]'); kopf.textContent = `${[...alle].filter(x => x.checked).length} von ${alle.length} dabei`; } return laborErgebnis(); }
    if (t.id === 'neutral') { labor.neutral = t.checked; return laborErgebnis(); }
    if (t.id === 'spTeamWahl') { ui.spTeam = t.value === 'alle' ? 'alle' : Number(t.value); return zeichne(); }
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
  window.addEventListener('hashchange', () => { TRAINERIN = /trainerin/i.test(location.hash); if (TRAINERIN) SORT.einfluss = ['Torwirkung', s => s.einfluss]; else delete SORT.einfluss; if (bereichAusHash()) { bereich = bereichAusHash(); merk.set('bereich', bereich); } schliesseSheet(); zeichne(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('druck-kabine'));
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && BEREICHE[Number(e.key) - 1]) wechsle(BEREICHE[Number(e.key) - 1].id);
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(window.innerWidth - letzteBreite) > 40) { const y = window.scrollY; zeichne(); window.scrollTo(0, y); } }, 180); });

  // Service Worker für die Halle ohne Empfang. Liegt im Wurzelverzeichnis, weil der Geltungsbereich auf das Verzeichnis
  // der Datei begrenzt ist und app/ die Daten aus ../daten/ lädt. Scheitert die Registrierung, läuft die App wie bisher.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('../sw.js').catch(() => {}); } catch (e) {}
  }

  zeichne(true);
})();
