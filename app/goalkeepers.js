// Goalkeeper evaluation from the tracker records (window.HB_TORWART, shape: daten/torwart/schema.json).
// Produces per-goalkeeper and per-team statistics plus an estimated goal impact per goalkeeper that
// app.js merges into the player list from spielerinnen.js, so the lineup optimiser and the match plan
// can treat goalkeepers like everyone else. Also renders the 3×3 zone picture as an SVG string.
//
// Zones are seen from the shooter: 1 top left … 9 bottom right, 0 off target.

const GOALKEEPER = {
  MIN_SHOTS: 20,       // shots on target before a goalkeeper's own save rate replaces the generic influence
  SHRINK_SHOTS: 20,    // pseudo shots at the reference rate blended into every save rate
  DEFAULT_RATE: 0.30,  // save rate assumed while nothing is tracked yet (typical at this level)
  MAX_INFLUENCE: 5,    // goals per match, clamp for the estimated impact
  REGULATION: 3600,    // seconds of regular playing time
  MIN_ZONE_SHOTS: 8,   // shots on target in one zone before it counts as a weak or strong zone
};

const ZONE_NAMES = ['vorbei', 'oben links', 'oben Mitte', 'oben rechts', 'halbhoch links', 'Mitte', 'halbhoch rechts', 'unten links', 'unten Mitte', 'unten rechts'];

function emptyGoalkeeperStats() {
  const zones = {};
  for (let z = 0; z <= 9; z++) zones[z] = { goal: 0, save: 0, miss: 0 };
  return { matches: 0, seconds: 0, shots: 0, onTarget: 0, saves: 0, goals: 0, misses: 0, sevenMeter: { onTarget: 0, saves: 0 }, zones, matchIds: [] };
}

function addShot(stats, e) {
  stats.shots++;
  const z = stats.zones[e.zone] || (stats.zones[e.zone] = { goal: 0, save: 0, miss: 0 });
  z[e.result]++;
  if (e.result === 'miss') { stats.misses++; return; }
  stats.onTarget++;
  if (e.result === 'save') stats.saves++; else stats.goals++;
  if (e.sevenMeter) { stats.sevenMeter.onTarget++; if (e.result === 'save') stats.sevenMeter.saves++; }
}

// Who was in goal when: the first goalkeeperChange at second 0 names the starter (tracker ≥ this version);
// older files fall back to the first shot's goalkeeper, then to the first listed goalkeeper.
function timeInGoal(record) {
  const changes = record.events.filter(e => e.type === 'goalkeeperChange').sort((a, b) => a.second - b.second);
  const shots = record.events.filter(e => e.type === 'shot');
  let current = changes.length && changes[0].second === 0 ? changes[0].goalkeeperId : shots.length ? shots[0].goalkeeperId : (record.goalkeepers[0] || {}).playerId;
  const end = Math.max(GOALKEEPER.REGULATION, ...record.events.map(e => e.second));
  const seconds = {};
  let from = 0;
  changes.filter(c => c.second > 0).forEach(c => {
    seconds[current] = (seconds[current] || 0) + (c.second - from);
    current = c.goalkeeperId; from = c.second;
  });
  if (current) seconds[current] = (seconds[current] || 0) + (end - from);
  return seconds;
}

// bundle: window.HB_TORWART = { goalkeepers: {teamId: [{playerId, name, number}]}, records: [record] } (an older bundle
// was a bare array of records). Returns { players: {playerId: stats}, teams: {teamId: stats}, league, records, roster }
function evaluateGoalkeepers(bundle) {
  const records = Array.isArray(bundle) ? bundle : (bundle && bundle.records) || [];
  const roster = Array.isArray(bundle) ? {} : (bundle && bundle.goalkeepers) || {};
  const players = {}, teams = {};
  const names = {};
  Object.values(roster).flat().forEach(g => { names[g.playerId] = g; });
  (records || []).forEach(r => {
    if (!r || r.format !== 'anwurf-goalkeeper' || !Array.isArray(r.events)) return;
    const team = teams[r.teamId] || (teams[r.teamId] = Object.assign(emptyGoalkeeperStats(), { teamId: r.teamId, keepers: {} }));
    team.matches++; team.matchIds.push(r.matchId);
    const seconds = timeInGoal(r);
    const seen = new Set();
    r.goalkeepers.forEach(g => { names[g.playerId] = g; });
    r.events.filter(e => e.type === 'shot').forEach(e => {
      const p = players[e.goalkeeperId] || (players[e.goalkeeperId] = Object.assign(emptyGoalkeeperStats(), { playerId: e.goalkeeperId, teamId: r.teamId }));
      addShot(p, e); addShot(team, e);
      seen.add(e.goalkeeperId);
    });
    Object.keys(seconds).forEach(pid => { seen.add(pid); });
    seen.forEach(pid => {
      const p = players[pid] || (players[pid] = Object.assign(emptyGoalkeeperStats(), { playerId: pid, teamId: r.teamId }));
      p.matches++; p.matchIds.push(r.matchId); p.seconds += seconds[pid] || 0;
      team.keepers[pid] = true;
    });
  });

  const all = Object.values(teams);
  const league = {
    records: all.reduce((s, t) => s + t.matches, 0),
    onTarget: all.reduce((s, t) => s + t.onTarget, 0),
    saves: all.reduce((s, t) => s + t.saves, 0),
  };
  league.rate = league.onTarget ? league.saves / league.onTarget : GOALKEEPER.DEFAULT_RATE;
  league.onTargetPerMatch = league.records ? league.onTarget / league.records : 0;

  const finish = s => {
    s.rate = s.onTarget ? s.saves / s.onTarget : null;
    s.shrunkRate = (s.saves + GOALKEEPER.SHRINK_SHOTS * league.rate) / (s.onTarget + GOALKEEPER.SHRINK_SHOTS);
    s.sevenMeter.rate = s.sevenMeter.onTarget ? s.sevenMeter.saves / s.sevenMeter.onTarget : null;
    s.onTargetPerMatch = s.matches ? s.onTarget / s.matches : 0;
    s.minutes = Math.round(s.seconds / 60);
  };
  Object.values(teams).forEach(t => { finish(t); t.keepers = Object.keys(t.keepers); });
  Object.values(players).forEach(p => {
    finish(p);
    const team = teams[p.teamId];
    const name = names[p.playerId];
    p.name = name ? name.name : p.playerId;
    p.number = name ? name.number : null;
    // Goal impact per match: how many more shots she stops than a reference goalkeeper would, given the
    // team's usual number of shots on target. Reference: league rate across all tracked records.
    const shotsPerMatch = team && team.matches ? team.onTarget / team.matches : league.onTargetPerMatch;
    p.influence = Math.max(-GOALKEEPER.MAX_INFLUENCE, Math.min(GOALKEEPER.MAX_INFLUENCE, (p.shrunkRate - league.rate) * shotsPerMatch));
    p.reliable = p.onTarget >= GOALKEEPER.MIN_SHOTS;
    p.weakZones = weakZones(p, league.rate);
  });
  return { players, teams, league, records: records.length, roster };
}

// Everyone who counts as a goalkeeper: the permanent list plus anyone named as goalkeeper in a record.
function goalkeeperIds(bundle) {
  const records = Array.isArray(bundle) ? bundle : (bundle && bundle.records) || [];
  const roster = Array.isArray(bundle) ? {} : (bundle && bundle.goalkeepers) || {};
  const ids = {};
  Object.values(roster).flat().forEach(g => { ids[g.playerId] = true; });
  records.forEach(r => (r.goalkeepers || []).forEach(g => { ids[g.playerId] = true; }));
  return ids;
}

// Zones with enough shots whose save rate is clearly below the reference, worst first.
function weakZones(stats, referenceRate) {
  const out = [];
  for (let z = 1; z <= 9; z++) {
    const c = stats.zones[z], n = c.goal + c.save;
    if (n < GOALKEEPER.MIN_ZONE_SHOTS) continue;
    const rate = c.save / n;
    if (rate <= referenceRate - 0.12) out.push({ zone: z, name: ZONE_NAMES[z], onTarget: n, saves: c.save, rate });
  }
  return out.sort((a, b) => a.rate - b.rate);
}

// SVG of the goal with save/total per zone, shaded by how many goals went in there. Returns an HTML string.
function goalZoneSvg(zones, width) {
  const W = width || 320, X0 = 24, Y0 = 18, B = W - 2 * X0, H = Math.round(B * 0.6), cw = B / 3, ch = H / 3;
  let cells = '';
  const max = Math.max(1, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => zones[z] ? zones[z].goal : 0));
  for (let i = 0; i < 9; i++) {
    const z = i + 1, r = Math.floor(i / 3), c = i % 3, x = X0 + c * cw, y = Y0 + r * ch;
    const s = zones[z] || { goal: 0, save: 0 }, n = s.goal + s.save;
    const level = n ? Math.min(6, 1 + Math.round(s.goal / max * 5)) : 0;
    const fill = level ? `var(--seq-${level})` : 'var(--bg-1)';
    const color = level >= 5 ? `var(--seq-${level}-text)` : 'var(--text-1)';
    cells += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${fill}" stroke="var(--line-2)"/>`;
    cells += n ? `<text x="${x + cw / 2}" y="${y + ch / 2 + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${s.save}/${n}</text>` : '';
  }
  const miss = zones[0] ? zones[0].miss : 0;
  return `<svg viewBox="0 0 ${W} ${Y0 + H + 10}" width="100%" style="max-width:${W}px;display:block;margin:0 auto" role="img" aria-label="Gehalten je Zone">
    <text x="${W / 2}" y="12" text-anchor="middle" font-size="11" font-weight="600" letter-spacing=".06em" fill="var(--text-3)">VORBEI${miss ? ` · ${miss}` : ''}</text>
    ${cells}
    <path d="M${X0} ${Y0 + H} V${Y0} H${X0 + B} V${Y0 + H}" fill="none" stroke="var(--text-1)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
