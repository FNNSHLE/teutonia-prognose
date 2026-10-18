// Matchplan: datenbelegte Empfehlungen zur Aufstellung und Befunde für das nächste Spiel.
// Regelwerk nach Agency/2026-10-14_Matchplan-und-Redesign/02_matchplan.md, Teil B.
// TW1/TW2 kommen aus der eigenen Torhüterinnen-Erfassung (ctx.tw aus app/goalkeepers.js).

const MATCHPLAN = { K: 14, MAX_EMPF: 8, MAX_BEFUNDE: 4 };

// Siegchance des Fokus-Teams bei gegebener Besetzung beider Teams
function chanceFokus(m, g, fokus, B, dabei, eigene, extra) {
  const eh = besetzungsEffekt(B.teams[g.heim], dabei, eigene) + ((extra && extra.heim) || 0);
  const eg = besetzungsEffekt(B.teams[g.gast], dabei, eigene) + ((extra && extra.gast) || 0);
  const p = prognoseMitBesetzung(m, g.heim, g.gast, eh, eg);
  const istHeim = g.heim === fokus;
  return { s: istHeim ? p.pHeim : p.pGast, u: p.pRemis, n: istHeim ? p.pGast : p.pHeim, eF: istHeim ? p.eHeim : p.eGast, eG: istHeim ? p.eGast : p.eHeim, p };
}

function ueblicheBesetzung(B, tids) {
  const d = {};
  tids.forEach(t => { if (B.teams[t]) B.teams[t].liste.forEach(s => d[s.id] = ueblichDabei(s)); });
  return d;
}

// Wirkung einer Spielerin in Prozentpunkten Siegchance des Fokus-Teams, wenn sie von ihrer üblichen Rolle abweicht
function wirkung(m, g, fokus, B, basisDabei, eigene, s) {
  const basis = chanceFokus(m, g, fokus, B, basisDabei, eigene).s;
  const d = Object.assign({}, basisDabei, { [s.id]: !basisDabei[s.id] });
  return (chanceFokus(m, g, fokus, B, d, eigene).s - basis) * 100;
}

// Aufstellungs-Optimierer: aus den verfügbaren Spielerinnen bis zu K auswählen.
// verf: {pid: true|false}, pins: {pid: true}. Rückgabe: Auswahl, Reserve, Chancen.
function optimiereAufstellung(m, g, fokus, B, verf, pins, eigene, K = MATCHPLAN.K) {
  const t = B.teams[fokus]; if (!t) return null;
  const gegner = g.heim === fokus ? g.gast : g.heim;
  const basisGegner = ueblicheBesetzung(B, [gegner]);
  const verfuegbar = t.liste.filter(s => verf[s.id] !== false);
  const beitrag = s => {
    const w = eigene && eigene[s.id] != null ? eigene[s.id] : s.einfluss;
    if (ueblichDabei(s)) return w * s.verfuegbar;
    return belegt(s, eigene) ? w * (1 - s.verfuegbar) : 0;
  };
  const fest = s => pins[s.id] || s.torwart; // Torhüterinnen bleiben wie angepinnte im Kader
  const sortiert = verfuegbar.slice().sort((a, b) => (fest(b) ? 1 : 0) - (fest(a) ? 1 : 0) || (ueblichDabei(b) ? 1 : 0) - (ueblichDabei(a) ? 1 : 0) || beitrag(b) - beitrag(a));
  const auswahl = sortiert.slice(0, K);
  const dabei = Object.assign({}, basisGegner);
  t.liste.forEach(s => dabei[s.id] = false);
  auswahl.forEach(s => dabei[s.id] = true);
  const ueblich = Object.assign({}, basisGegner, ueblicheBesetzung(B, [fokus]));
  const chance = chanceFokus(m, g, fokus, B, dabei, eigene);
  const chanceUeblich = chanceFokus(m, g, fokus, B, ueblich, eigene);
  // Wert je Spielerin gegen die übliche Besetzung, damit er unabhängig von der Auswahl lesbar bleibt
  const wert = s => wirkung(m, g, fokus, B, ueblich, eigene, s);
  return {
    auswahl: auswahl.map(s => ({ s, wert: Math.abs(wert(s)), pin: !!pins[s.id], beleg: belegt(s, eigene), stamm: ueblichDabei(s) })),
    gestrichen: sortiert.slice(K).map(s => ({ s, wert: Math.abs(wert(s)) })),
    fehlen: t.liste.filter(s => verf[s.id] === false).map(s => ({ s })),
    chance, chanceUeblich, dabei,
    ohnePins: !Object.keys(pins).some(k => pins[k]) && !t.liste.some(s => s.torwart),
  };
}

function erzeugeMatchplan(ctx) {
  const { modell: m, B, K: kz, liga, g, fokus, eigene } = ctx;
  const gegner = g.heim === fokus ? g.gast : g.heim;
  const tF = B.teams[fokus], tG = B.teams[gegner];
  const kF = kz[fokus], kG = kz[gegner];
  const dabei = ctx.dabei || ueblicheBesetzung(B, [fokus, gegner]);
  const basis = chanceFokus(m, g, fokus, B, dabei, eigene);
  const pF = basis.s;
  const plus = chanceFokus(m, g, fokus, B, dabei, eigene, g.heim === fokus ? { heim: 1 } : { gast: 1 }).s;
  const minus = chanceFokus(m, g, fokus, B, dabei, eigene, g.heim === fokus ? { heim: -1 } : { gast: -1 }).s;
  const H = (plus - minus) / 2 * 100;
  const n = tF ? tF.spiele.length : 0, nG = tG ? tG.spiele.length : 0;
  const S = s => wirkung(m, g, fokus, B, dabei, eigene, s);
  const pr = x => Math.round(x * 100);
  const empf = [], bef = [];
  const name = s => s.name;
  const hz = (k, s) => (k && k.torHz[s.name]) || [0, 0];

  if (tF && n >= 2) {
    const stamm = tF.liste.filter(ueblichDabei);
    // AU1 Unverzichtbare Spielerin
    stamm.forEach(s => {
      const w = S(s);
      if (w <= -10 && s.anz >= 2) empf.push({ id: 'AU1', kat: 'Aufstellung', p: -w, eff: -w, titel: `${name(s)} sicher einplanen`,
        text: `Ist sie nicht dabei, sinkt eure Siegchance von ${pr(pF)} auf ${pr(pF + w / 100)} %. Sie wirft ${dez1(s.toreProSpiel)} Tore pro Spiel.`, n, person: s });
    });
    // AU2 Seltene Spielerin mit Mehrwert
    tF.liste.filter(s => !ueblichDabei(s) && s.tore >= 1).forEach(s => {
      const w = S(s);
      if (w >= 3) empf.push({ id: 'AU2', kat: 'Aufstellung', p: w * s.anz / (s.anz + 1), eff: w, titel: `${name(s)} anfragen`,
        text: `Sie warf ${s.tore} Tore in ${s.anz} Spiel${s.anz > 1 ? 'en' : ''}. Mit ihr steigt die Siegchance von ${pr(pF)} auf ${pr(pF + w / 100)} %.${s.anz === 1 ? ' Der Wert beruht auf einem Spiel.' : ''}`, n: s.anz, person: s });
    });
    // AU5 Abhängigkeit von zwei Schützinnen
    const nachToren = tF.liste.slice().sort((a, b) => b.tore - a.tore);
    const top2 = nachToren.slice(0, 2), anteil2 = top2.reduce((a, s) => a + s.anteil, 0);
    if ((anteil2 >= 0.4 || tF.effektiv < 7) && empf.some(e => e.id === 'AU1')) {
      const weitere = tF.liste.filter(s => !top2.includes(s) && s.anz >= 2 && ueblichDabei(s)).sort((a, b) => b.toreProSpiel - a.toreProSpiel).slice(0, 2);
      if (weitere.length === 2) empf.push({ id: 'AU5', kat: 'Aufstellung', p: Math.min(...empf.filter(e => e.id === 'AU1').map(e => e.p)) - 0.1, eff: null, titel: `Entlastung durch ${name(weitere[0])} und ${name(weitere[1])}`,
        text: `${name(top2[0])} und ${name(top2[1])} werfen ${pr(anteil2)} % eurer Tore. Danach kommen ${name(weitere[0])} mit ${dez1(weitere[0].toreProSpiel)} und ${name(weitere[1])} mit ${dez1(weitere[1].toreProSpiel)} Toren pro Spiel.`, n });
    }
    // AU6 Siebenmeter-Reihenfolge
    const smTeam = tF.liste.reduce((a, s) => a + s.sm, 0), smVTeam = tF.liste.reduce((a, s) => a + s.smVers, 0);
    const schuetzinnen = tF.liste.filter(s => s.smVers >= 2).map(s => ({ s, q: (s.sm + 2 * liga.smQuote) / (s.smVers + 2) })).sort((a, b) => b.q - a.q);
    if (schuetzinnen.length >= 2 && smVTeam >= 4) {
      const b0 = schuetzinnen[0];
      const p = Math.max(0.5, (b0.q - smTeam / smVTeam) * (smVTeam / n) * H);
      empf.push({ id: 'AU6', kat: 'Aufstellung', p, eff: null, titel: `7m-Reihenfolge: ${schuetzinnen.slice(0, 3).map(x => x.s.name.split(' ')[0] + ' ' + x.s.name.split(' ').slice(-1)[0].slice(0, 1) + '.').join(', ')}`,
        text: `${name(b0.s)} trifft ${b0.s.sm} von ${b0.s.smVers}, das Team ${smTeam} von ${smVTeam}, die Liga ${pr(liga.smQuote)} %.${b0.s.smVers < 5 ? ' Kleine Stichprobe.' : ''}`, n, siebenmeter: schuetzinnen });
    }
    // AU7 Halbzeitprofil
    tF.liste.filter(s => s.tore >= 4 && s.anz >= 2).forEach(s => {
      const [h1, h2] = hz(kF, s);
      if (h1 + h2 < 4) return;
      const zweite = h2 >= 2 * h1, erste = h1 >= 2 * h2;
      if (!zweite && !erste) return;
      const stark = zweite ? h2 : h1;
      empf.push({ id: 'AU7', kat: 'Aufstellung', p: Math.abs(S(s)) * stark / (h1 + h2), eff: null, titel: `${name(s)} trifft vor allem in der ${zweite ? 'zweiten' : 'ersten'} Halbzeit`,
        text: `${stark} ihrer ${h1 + h2} Tore fielen in der ${zweite ? 'zweiten' : 'ersten'} Halbzeit.`, n: s.anz });
    });
    // DI1 Zeitstrafen-Risiko einer wichtigen Spielerin
    stamm.filter(s => s.anz >= 2 && s.zwei / s.anz >= 0.5).forEach(s => {
      const w = S(s);
      if (w <= -5) empf.push({ id: 'DI1', kat: 'Disziplin', p: s.zwei / s.anz * -w, eff: null, titel: `Zeitstrafen bei ${name(s)}: ${s.zwei} in ${s.anz} Spielen`,
        text: `Sie hat ${s.zwei} Zeitstrafe${s.zwei > 1 ? 'n' : ''} in ${s.anz} Spielen. Ohne sie sinkt eure Siegchance um ${Math.round(-w)} Prozentpunkte.`, n: s.anz });
    });
  }
  // TW1 Torhüterin mit der besseren Paradenquote, TW2 Zone mit vielen Gegentoren (eigene Erfassung, app/goalkeepers.js)
  const tw = ctx.tw;
  if (tw && tF && tw.teams[fokus]) {
    const tTeam = tw.teams[fokus];
    const keepers = tF.liste.filter(s => s.tw && s.tw.reliable).sort((a, b) => b.tw.shrunkRate - a.tw.shrunkRate);
    if (keepers.length >= 2 && keepers[0].tw.shrunkRate - keepers[1].tw.shrunkRate >= 0.05) {
      const [a, b] = keepers, d = (a.tw.shrunkRate - b.tw.shrunkRate) * tTeam.onTargetPerMatch;
      empf.push({ id: 'TW1', kat: 'Aufstellung', p: d * H, eff: null, titel: `${name(a)} ins Tor`,
        text: `Sie hält ${pr(a.tw.rate)} % der Würfe aufs Tor (${a.tw.saves} von ${a.tw.onTarget}), ${name(b)} ${pr(b.tw.rate)} % (${b.tw.saves} von ${b.tw.onTarget}). Bei ${Math.round(tTeam.onTargetPerMatch)} Würfen aufs Tor pro Spiel sind das etwa ${dez1(d)} Tore.`, n: a.tw.matches, person: a });
    }
    if (tTeam.onTarget >= GOALKEEPER.MIN_SHOTS) {
      const weak = weakZones(tTeam, tw.league.rate)[0];
      if (weak) bef.push({ id: 'TW2', kat: 'Im Tor', p: (tw.league.rate - weak.rate) * weak.onTarget / tTeam.matches * 10, titel: `Gegentore vor allem ${weak.name}`,
        text: `Von ${weak.onTarget} Würfen ${weak.name} (aus Sicht der Werferin) hielt ${kurzname(fokus)} ${weak.saves}, insgesamt ${pr(tTeam.rate)} % aller Würfe aufs Tor.`, n: tTeam.matches });
    }
  }
  // DI2 Zeitstrafen des Teams
  if (kF && kF.spiele >= 2 && kF.zweiProSpiel >= liga.zweiProSpiel + 0.5)
    empf.push({ id: 'DI2', kat: 'Disziplin', p: kF.zweiProSpiel - liga.zweiProSpiel, eff: null, titel: 'Zeitstrafen im Blick behalten',
      text: `${kurzname(fokus)} kassiert ${dez1(kF.zweiProSpiel)} Zeitstrafen pro Spiel, der Ligaschnitt liegt bei ${dez1(liga.zweiProSpiel)}.`, n: kF.spiele });

  // Phasen: Fenster aus zwei benachbarten Abschnitten
  const fenster = (k) => [0, 1, 2, 3, 4].map(i => ({ i, d: (k.tore[i] + k.tore[i + 1] - k.gegen[i] - k.gegen[i + 1]) / k.spiele, a: k.tore[i] + k.tore[i + 1], g: k.gegen[i] + k.gegen[i + 1] }));
  let ph1 = null;
  if (kF && kF.spiele >= 2) {
    const w = fenster(kF).filter(x => x.a + x.g >= 10).sort((a, b) => a.d - b.d)[0];
    if (w && w.d <= -2) { ph1 = w; bef.push({ id: 'PH1', kat: 'Spielphase', p: -w.d, titel: `Minute ${w.i * 10} bis ${w.i * 10 + 20} ist eure schwächste Phase`, text: `Hier liegt ${kurzname(fokus)} im Schnitt ${dez1(-w.d)} Tore pro Spiel hinten (${w.a}:${w.g} in ${kF.spiele} Spielen).`, n: kF.spiele }); }
  }
  if (kG && kG.spiele >= 2) {
    const w = fenster(kG).filter(x => x.a + x.g >= 10).sort((a, b) => b.d - a.d)[0];
    if (w && w.d >= 2) {
      const ueber = ph1 && Math.abs(ph1.i - w.i) <= 1;
      bef.push({ id: 'PH2', kat: 'Gegnerin', p: w.d + (ueber ? 1 : 0), titel: `Minute ${w.i * 10} bis ${w.i * 10 + 20} ist die stärkste Phase von ${kurzname(gegner)}`, text: `${kurzname(gegner)} gewinnt diesen Abschnitt im Schnitt mit ${dez1(w.d)} Toren pro Spiel.${ueber ? ' Sie fällt in eure schwächste Phase.' : ''}`, n: kG.spiele });
    }
  }
  // GE1 Wichtigste Spielerinnen der Gegnerin
  const gegnerinnen = [];
  if (tG && nG >= 2) {
    tG.liste.filter(s => ueblichDabei(s) && s.anz >= 2).map(s => ({ s, w: S(s) })).filter(x => x.w >= 5).sort((a, b) => b.w - a.w).slice(0, 4).forEach(({ s, w }) => {
      const [h1, h2] = hz(kG, s);
      const tags = [`${s.tore} Tore in ${s.anz} Sp.`];
      if (s.smVers) tags.push(`7m ${s.sm}/${s.smVers}`);
      if (h1 + h2 >= 4 && (h2 >= 2 * h1 || h1 >= 2 * h2)) tags.push(`${h2 > h1 ? h2 : h1} von ${h1 + h2} Toren in der ${h2 > h1 ? '2.' : '1.'} HZ`);
      if (s.zwei) tags.push(`${s.zwei}× 2'`);
      gegnerinnen.push({ s, w, tags, text: `Mit ihr hat ${kurzname(gegner)} ${Math.round(w)} Prozentpunkte mehr Siegchance gegen euch.` });
    });
    // GE2 Siebenmeterschützin
    const sm = tG.liste.filter(s => s.smVers >= 3 && s.sm / s.smVers >= 0.75).sort((a, b) => b.sm - a.sm)[0];
    if (sm) {
      const rest = tG.liste.filter(s => s !== sm);
      bef.push({ id: 'GE2', kat: 'Gegnerin', p: 2 + sm.smVers / sm.anz, titel: `${sm.name} ist die 7m-Schützin von ${kurzname(gegner)}`,
        text: `Sie trifft ${sm.sm} von ${sm.smVers}, die übrigen Schützinnen ${rest.reduce((a, s) => a + s.sm, 0)} von ${rest.reduce((a, s) => a + s.smVers, 0)}.`, n: sm.anz });
    }
    // GE3 breite Torverteilung
    if (tG.effektiv >= 8 && tG.top1 < 0.2) bef.push({ id: 'GE3', kat: 'Gegnerin', p: tG.effektiv / 8, titel: `${kurzname(gegner)} trifft aus der Breite`,
      text: `Rechnerisch treffen ${dez1(tG.effektiv)} Spielerinnen gleich oft, die beste hat nur ${pr(tG.top1)} % der Tore.${tF ? ` Bei ${kurzname(fokus)} sind es ${dez1(tF.effektiv)}.` : ''}`, n: nG });
  }

  const ordnung = { Aufstellung: 0, Disziplin: 1 };
  empf.sort((a, b) => ordnung[a.kat] - ordnung[b.kat] || b.p - a.p);
  bef.sort((a, b) => b.p - a.p);
  return {
    gegner, pF, basis, H, n, nG,
    empfehlungen: empf.slice(0, MATCHPLAN.MAX_EMPF),
    befunde: bef.slice(0, MATCHPLAN.MAX_BEFUNDE),
    gegnerinnen,
    phasen: { fokus: kF && kF.spiele ? kF.tore.map((t, i) => t - kF.gegen[i]) : null, gegner: kG && kG.spiele ? kG.tore.map((t, i) => t - kG.gegen[i]) : null, nF: kF ? kF.spiele : 0, nG: kG ? kG.spiele : 0 },
  };
}

function dez1(x) { return x.toFixed(1).replace('.', ',').replace('-', '−'); }
