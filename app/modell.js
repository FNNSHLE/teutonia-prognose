// Prognosemodell: Angriffs- und Abwehrstärke je Team plus Heimvorteil,
// geschätzt per Ridge-Regression auf die bisherigen Ergebnisse der Liga.
// Ergebnis eines Spiels: Tordifferenz ~ Normalverteilung um die erwartete Differenz.

const MODELL = {
  LAMBDA: 3,        // Schrumpfung der Teamstärken (entspricht ca. 3 Spielen "Durchschnitt")
  HEIM0: 1.5,       // Vorannahme Heimvorteil in Toren
  LAMBDA_HEIM: 8,   // Gewicht der Vorannahme Heimvorteil
  SIGMA0: 6.5,      // Vorannahme Streuung der Tordifferenz
  GEWICHT_SIGMA: 10,
  TORE0: 25,        // Vorannahme Tore je Team und Spiel
};

function normCdf(x) {
  // Abramowitz/Stegun 7.1.26
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

// spiele: [{heim, gast, toreHeim, toreGast}] nur gewertete Spiele mit Ergebnis
function schaetzeModell(spiele, teamIds) {
  const att = {}, def = {};
  teamIds.forEach(id => { att[id] = 0; def[id] = 0; });
  const n = spiele.length;
  let mu = n ? spiele.reduce((s, g) => s + g.toreHeim + g.toreGast, 0) / (2 * n) : MODELL.TORE0;
  let heim = MODELL.HEIM0;

  // Beobachtungen: jedes Spiel liefert zwei (Tore Heim, Tore Gast)
  const obs = [];
  spiele.forEach(g => {
    obs.push({ off: g.heim, def: g.gast, heim: 1, tore: g.toreHeim });
    obs.push({ off: g.gast, def: g.heim, heim: 0, tore: g.toreGast });
  });

  for (let it = 0; it < 300 && n; it++) {
    let s = 0;
    obs.forEach(o => { s += o.tore - heim * o.heim - att[o.off] + def[o.def]; });
    mu = s / obs.length;

    let sh = MODELL.LAMBDA_HEIM * MODELL.HEIM0, nh = MODELL.LAMBDA_HEIM;
    obs.forEach(o => { if (o.heim) { sh += o.tore - mu - att[o.off] + def[o.def]; nh++; } });
    heim = sh / nh;

    const sa = {}, na = {}, sd = {}, nd = {};
    teamIds.forEach(id => { sa[id] = 0; na[id] = 0; sd[id] = 0; nd[id] = 0; });
    obs.forEach(o => {
      sa[o.off] += o.tore - mu - heim * o.heim + def[o.def]; na[o.off]++;
    });
    teamIds.forEach(id => { att[id] = sa[id] / (na[id] + MODELL.LAMBDA); });
    obs.forEach(o => {
      sd[o.def] += mu + heim * o.heim + att[o.off] - o.tore; nd[o.def]++;
    });
    teamIds.forEach(id => { def[id] = sd[id] / (nd[id] + MODELL.LAMBDA); });
  }

  let rss = 0;
  spiele.forEach(g => {
    const e = (heim + att[g.heim] - def[g.gast]) - (att[g.gast] - def[g.heim]);
    rss += Math.pow(g.toreHeim - g.toreGast - e, 2);
  });
  const sigma = Math.sqrt((MODELL.GEWICHT_SIGMA * MODELL.SIGMA0 ** 2 + rss) / (MODELL.GEWICHT_SIGMA + n));

  return { mu, heim, att, def, sigma, n };
}

function prognose(m, heimId, gastId) {
  const a = id => m.att[id] || 0, d = id => m.def[id] || 0;
  const eHeim = m.mu + m.heim + a(heimId) - d(gastId);
  const eGast = m.mu + a(gastId) - d(heimId);
  const diff = eHeim - eGast;
  const pGast = normCdf((-0.5 - diff) / m.sigma);
  const pHeim = 1 - normCdf((0.5 - diff) / m.sigma);
  return { pHeim, pRemis: 1 - pHeim - pGast, pGast, eHeim, eGast, diff };
}

function staerke(m, id) { return (m.att[id] || 0) + (m.def[id] || 0); }

// Zufallszahl mit Seed, damit die Simulation bei gleichem Datenstand gleich bleibt
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function tabelleAus(spiele, teamIds) {
  const t = {};
  teamIds.forEach(id => t[id] = { id, sp: 0, s: 0, u: 0, n: 0, tp: 0, tm: 0, pkt: 0, mpkt: 0 });
  spiele.forEach(g => {
    const h = t[g.heim], a = t[g.gast];
    h.sp++; a.sp++; h.tp += g.toreHeim; h.tm += g.toreGast; a.tp += g.toreGast; a.tm += g.toreHeim;
    if (g.toreHeim > g.toreGast) { h.s++; a.n++; h.pkt += 2; a.mpkt += 2; }
    else if (g.toreHeim < g.toreGast) { a.s++; h.n++; a.pkt += 2; h.mpkt += 2; }
    else { h.u++; a.u++; h.pkt++; a.pkt++; h.mpkt++; a.mpkt++; }
  });
  return Object.values(t).sort((x, y) => y.pkt - x.pkt || x.mpkt - y.mpkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
}

// fest: {matchId: 'H'|'U'|'G'} vom Nutzer gesetzte Ausgänge, bonus: {teamId: Punkte} z. B. aus Urteilen
function simuliereSaison(m, gespielt, offen, teamIds, laeufe = 5000, fest = {}, bonus = {}) {
  const r = rng(gespielt.length * 7919 + offen.length * 104729 + 17);
  const plaetze = {}, punkte = {};
  teamIds.forEach(id => { plaetze[id] = new Array(teamIds.length).fill(0); punkte[id] = 0; });
  const progs = offen.map(g => ({ g, p: prognose(m, g.heim, g.gast), f: fest[g.id] }));
  const sd = m.sigma / Math.SQRT2;
  for (let l = 0; l < laeufe; l++) {
    const sim = gespielt.slice();
    progs.forEach(({ g, p, f }) => {
      let h = Math.max(0, Math.round(p.eHeim + gauss(r) * sd));
      let a = Math.max(0, Math.round(p.eGast + gauss(r) * sd));
      const extra = Math.floor(r() * 3); // immer ziehen, damit Festlegungen die übrigen Spiele nicht verschieben
      if (f === 'H' && h <= a) h = a + 1 + extra;
      if (f === 'G' && a <= h) a = h + 1 + extra;
      if (f === 'U') a = h;
      sim.push({ heim: g.heim, gast: g.gast, toreHeim: h, toreGast: a });
    });
    const tab = tabelleAus(sim, teamIds);
    tab.forEach(z => z.pkt += bonus[z.id] || 0);
    tab.sort((x, y) => y.pkt - x.pkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
    tab.forEach((z, i) => { plaetze[z.id][i]++; punkte[z.id] += z.pkt; });
  }
  teamIds.forEach(id => { plaetze[id] = plaetze[id].map(x => x / laeufe); punkte[id] /= laeufe; });
  return { plaetze, punkte };
}
