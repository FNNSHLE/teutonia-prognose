// Auswertung der Spielberichte: Spielerinnen, Einfluss auf die Tordifferenz, Spielverläufe.

const SPIELERIN = {
  ERSATZ: 0.5,       // Anteil ihrer Tore, den die Mitspielerinnen bei einem Ausfall auffangen
  SCHRUMPF_TORE: 2,  // Tore je Spiel werden um so viele Spiele Richtung Ziel gezogen
  SCHRUMPF_ZIEL: 0.5, // Ziel ist der halbe Teamschnitt: selten eingesetzte Spielerinnen werfen im Schnitt weniger
  TIEFE_MAX: 1,       // mehr als die übliche Besetzung bringt höchstens so viele Tore (nur 7 stehen auf dem Feld)
  SCHRUMPF_ONOFF: 6, // ab wie vielen Vergleichsspielen der Mit/Ohne-Vergleich halbes Gewicht bekommt
  MIN_VERGLEICH: 2,  // so viele Spiele mit UND ohne sie braucht es, bevor der Vergleich zählt
  MAX_ONOFF: 5,      // Mit/Ohne-Differenz wird auf diese Tore begrenzt
  MIN: -2, MAX: 8,
};

// details: window.HB_DETAILS, spiele: aufbereitete Spiele, modell: aktuelles Teammodell,
// torhueterinnen: {pid: true} aus der eigenen Erfassung (app/goalkeepers.js). Torhüterinnen bekommen keine
// Torwirkung aus Toren und Mit/Ohne-Vergleich; die kommt, wenn überhaupt, aus der Paradenquote (app.js).
function werteSpielberichteAus(details, spiele, modell, torhueterinnen = {}) {
  const teams = {};       // teamId -> { spiele: [matchId], spielerinnen: {pid: {...}} }
  const verlaeufe = {};   // matchId -> { tore: [{min, heim, gast, team, name}], halbzeit: {heim, gast} }
  const nachId = {};
  spiele.forEach(g => nachId[g.id] = g);

  Object.keys(details || {}).forEach(mid => {
    const g = nachId[mid];
    const d = details[mid];
    if (!g || !g.gewertet || !d || !d.l || !d.l.data) return;
    [['local', g.heim], ['visitor', g.gast]].forEach(([seite, tid]) => {
      const block = d.l.data[seite];
      if (!block || !block.players || !block.players.length) return;
      const t = teams[tid] || (teams[tid] = { spiele: [], spielerinnen: {} });
      t.spiele.push(g.id);
      block.players.forEach(p => {
        if (p.is_staff) return;
        const pid = p.player.id;
        const s = t.spielerinnen[pid] || (t.spielerinnen[pid] = {
          id: pid, team: tid, name: `${p.player.first_name} ${p.player.last_name}`.trim(),
          nummern: {}, spiele: [], tore: 0, sm: 0, smVers: 0, zwei: 0, disq: 0, torwart: false,
        });
        s.spiele.push(g.id);
        s.nummern[p.number] = (s.nummern[p.number] || 0) + 1;
        s.tore += p.goals || 0;
        s.sm += p.seven_meter_goals || 0;
        s.smVers += p.seven_meter_attempts || 0;
        s.zwei += p.two_minutes || 0;
        if (p.sanctions && p.sanctions.disqualification) s.disq++;
        if (p.is_goalkeeper || torhueterinnen[pid]) s.torwart = true;
      });
    });

    if (d.e && d.e.data) {
      const tore = d.e.data.filter(e => e.event_type && e.event_type.is_goal && e.score)
        .map(e => ({
          min: e.global_minute != null ? e.global_minute : 0,
          heim: e.score.local, gast: e.score.visitor,
          team: e.is_home ? g.heim : g.gast,
          name: e.player ? `${e.player.first_name} ${e.player.last_name}` : '',
          sm: /Siebenmeter/.test(e.event_type.name),
          hz: /1\. Halbzeit|Halbzeitpause/.test(e.block || '') ? 1 : 2,
        }))
        .sort((a, b) => (a.heim + a.gast) - (b.heim + b.gast));
      const hz1 = tore.filter(t => t.hz === 1).pop();
      verlaeufe[g.id] = { tore, halbzeit: hz1 ? { heim: hz1.heim, gast: hz1.gast } : { heim: 0, gast: 0 } };
    }
  });

  // Residuum je Spiel und Team: echte Tordifferenz minus erwartete (aus Sicht des Teams)
  const residuum = (g, tid) => {
    const p = prognose(modell, g.heim, g.gast);
    const echt = g.toreHeim - g.toreGast;
    return tid === g.heim ? echt - p.diff : -(echt - p.diff);
  };

  Object.keys(teams).forEach(tid => {
    tid = Number(tid);
    const t = teams[tid];
    const n = t.spiele.length;
    const liste = Object.values(t.spielerinnen);
    const einsaetze = liste.reduce((s, x) => s + x.spiele.length, 0);
    const teamTore = liste.reduce((s, x) => s + x.tore, 0);
    const schnitt = einsaetze ? teamTore / einsaetze : 0;
    const res = {};
    t.spiele.forEach(mid => res[mid] = residuum(nachId[mid], tid));
    t.teamTore = teamTore;

    liste.forEach(s => {
      s.nummer = Number(Object.entries(s.nummern).sort((a, b) => b[1] - a[1])[0][0]);
      s.anz = s.spiele.length;
      s.verfuegbar = n ? s.anz / n : 0;
      s.toreProSpiel = s.anz ? s.tore / s.anz : 0;
      s.anteil = teamTore ? s.tore / teamTore : 0;
      const tps = (s.tore + SPIELERIN.SCHRUMPF_TORE * SPIELERIN.SCHRUMPF_ZIEL * schnitt) / (s.anz + SPIELERIN.SCHRUMPF_TORE);
      s.torbeitrag = tps * (1 - SPIELERIN.ERSATZ);
      const mit = t.spiele.filter(m => s.spiele.includes(m)), ohne = t.spiele.filter(m => !s.spiele.includes(m));
      s.mitOhne = null; s.gewichtMitOhne = 0;
      if (mit.length && ohne.length) {
        const mean = a => a.reduce((x, m) => x + res[m], 0) / a.length;
        s.mitOhne = Math.max(-SPIELERIN.MAX_ONOFF, Math.min(SPIELERIN.MAX_ONOFF, mean(mit) - mean(ohne)));
        const k = Math.min(mit.length, ohne.length);
        s.gewichtMitOhne = k >= SPIELERIN.MIN_VERGLEICH ? k / (k + SPIELERIN.SCHRUMPF_ONOFF) : 0;
      }
      const roh = !s.gewichtMitOhne ? s.torbeitrag : (1 - s.gewichtMitOhne) * s.torbeitrag + s.gewichtMitOhne * s.mitOhne;
      s.einfluss = Math.max(SPIELERIN.MIN, Math.min(SPIELERIN.MAX, roh));
      if (s.torwart) { s.torbeitrag = 0; s.mitOhne = null; s.gewichtMitOhne = 0; s.einfluss = 0; }
      s.ohneMit = ohne.length;
    });

    // Abhängigkeit: wie stark konzentrieren sich die Tore auf wenige Spielerinnen
    const anteile = liste.map(s => s.anteil).sort((a, b) => b - a);
    t.top1 = anteile[0] || 0;
    t.top3 = anteile.slice(0, 3).reduce((a, b) => a + b, 0);
    t.konzentration = anteile.reduce((a, b) => a + b * b, 0); // Herfindahl-Index
    t.effektiv = t.konzentration ? 1 / t.konzentration : 0;   // "effektive Zahl" Torschützinnen
    t.liste = liste.sort((a, b) => b.einfluss - a.einfluss || b.tore - a.tore);
  });

  return { teams, verlaeufe };
}

// Übliche Besetzung: wer in mindestens der Hälfte der Spiele dabei war.
function ueblichDabei(s) { return s.verfuegbar >= 0.5; }

// Verschiebung der erwarteten Tore eines Teams, wenn die Besetzung von der üblichen abweicht.
// Die Teamstärke enthält schon, wie oft eine Spielerin sonst fehlt. Fehlt eine Stammspielerin,
// zählt ihr Einfluss deshalb mit ihrer Einsatzquote, spielt eine Seltene, mit ihrer Fehlquote.
// dabei: {pid: true/false}, eigene: {pid: Einfluss-Überschreibung}
function besetzungsEffekt(teamInfo, dabei, eigene) {
  if (!teamInfo) return 0;
  let verlust = 0, gewinn = 0;
  teamInfo.liste.forEach(s => {
    const wert = eigene && eigene[s.id] != null ? eigene[s.id] : s.einfluss;
    const ist = dabei[s.id] ? 1 : 0, ueblich = ueblichDabei(s) ? 1 : 0;
    if (ist === ueblich) return;
    if (ueblich) verlust += wert * s.verfuegbar;          // Stammspielerin fehlt
    else if (belegt(s, eigene)) gewinn += wert * (1 - s.verfuegbar); // Seltene ist dabei
  });
  // Zusätzliche Spielerinnen ersetzen zuerst fehlende, darüber hinaus zählt nur begrenzte Kadertiefe
  return -verlust + Math.min(gewinn, verlust + SPIELERIN.TIEFE_MAX);
}

// Belegschranke: Wer selten dabei war und nie getroffen hat, bekommt keinen Mehrwert zugeschrieben,
// außer die Trainerin setzt eine eigene Einschätzung.
function belegt(s, eigene) {
  return ueblichDabei(s) || s.tore > 0 || (eigene && eigene[s.id] != null) || !!(s.tw && s.tw.reliable);
}

function prognoseMitBesetzung(m, heimId, gastId, effHeim, effGast) {
  const basis = prognose(m, heimId, gastId);
  const eHeim = basis.eHeim + effHeim, eGast = basis.eGast + effGast;
  const diff = eHeim - eGast;
  const pGast = normCdf((-0.5 - diff) / m.sigma);
  const pHeim = 1 - normCdf((0.5 - diff) / m.sigma);
  return { pHeim, pRemis: 1 - pHeim - pGast, pGast, eHeim, eGast, diff };
}

// Teamprofile aus den Spielverläufen: Halbzeiten, Schlussphase, Aufholjagden
function teamMuster(spiele, verlaeufe, teamIds) {
  const r = {};
  teamIds.forEach(id => r[id] = { n: 0, hz1: 0, hz2: 0, schluss: 0, gedreht: 0, verspielt: 0, rueckstandPause: 0, fuehrungPause: 0, groessteFuehrung: 0, knapp: 0, knappGewonnen: 0, zwei: 0, sm: 0, smVers: 0 });
  spiele.filter(g => g.gewertet).forEach(g => {
    const v = verlaeufe[g.id];
    [[g.heim, 1], [g.gast, -1]].forEach(([tid, vz]) => {
      const x = r[tid];
      const end = vz * (g.toreHeim - g.toreGast);
      if (Math.abs(end) <= 2) { x.knapp++; if (end > 0) x.knappGewonnen++; }
      if (!v) return;
      x.n++;
      const hz = vz * (v.halbzeit.heim - v.halbzeit.gast);
      x.hz1 += hz; x.hz2 += end - hz;
      const vor50 = v.tore.filter(t => t.min < 50).pop();
      const stand50 = vor50 ? vz * (vor50.heim - vor50.gast) : 0;
      x.schluss += end - stand50;
      if (hz < 0) { x.rueckstandPause++; if (end > 0) x.gedreht++; }
      if (hz > 0) { x.fuehrungPause++; if (end < 0) x.verspielt++; }
      v.tore.forEach(t => { x.groessteFuehrung = Math.max(x.groessteFuehrung, vz * (t.heim - t.gast)); });
    });
  });
  return r;
}
