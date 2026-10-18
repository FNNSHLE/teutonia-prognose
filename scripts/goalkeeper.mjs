#!/usr/bin/env node
// Goalkeeper records: validate the JSON files in daten/torwart/ against daten/torwart/schema.json and the
// match data, or create an empty record for a match. Plain Node, no dependencies.
//
//   node scripts/goalkeeper.mjs validate [file ...]        default: every daten/torwart/torwart-*.json
//   node scripts/goalkeeper.mjs new [matchId | next] [--team <id>]   empty record; "next" = next open match
//   node scripts/goalkeeper.mjs bundle                     write daten/torwart.js (window.HB_TORWART) from the records
//
// The schema is the source of truth for the shape; this file adds the checks a schema cannot express
// (ids that must exist in the match data, ordering) and a validator for the JSON Schema subset the schema uses.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'daten', 'torwart');
const SCHEMA = JSON.parse(readFileSync(join(DIR, 'schema.json'), 'utf8'));

// ---------- match data (window.HB_DATA from daten/daten.js, evaluated in a sandbox) ----------
function loadMatches() {
  const file = join(ROOT, 'daten', 'daten.js');
  if (!existsSync(file)) return null;
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const d = sandbox.window.HB_DATA;
  if (!d || !d.pages) return null;
  return { teamId: d.teamId, matches: d.pages.flatMap(p => p.data || []) };
}
function readTeamId() {
  try { return Number((readFileSync(join(ROOT, 'daten', 'team_id.txt'), 'utf8').match(/\d+/) || [86088])[0]); } catch { return 86088; }
}

// ---------- minimal JSON Schema validator (the subset used by schema.json) ----------
function validateSchema(value, schema, path = '$', errors = [], root = SCHEMA) {
  const fail = msg => errors.push(`${path}: ${msg}`);
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o && o[k], root);
    if (!target) return fail(`unresolvable $ref ${schema.$ref}`), errors;
    return validateSchema(value, { ...target, ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== '$ref')) }, path, errors, root);
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) fail(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) fail(`must be one of ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`);
  if (schema.type) {
    const types = [].concat(schema.type);
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    const ok = types.some(t => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) { fail(`expected ${types.join(' or ')}, got ${actual}`); return errors; }
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) fail(`must have at least ${schema.minLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) fail('is not a date-time');
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => validateSchema(v, schema.items, `${path}[${i}]`, errors, root));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    (schema.required || []).forEach(k => { if (!(k in value)) fail(`missing required property "${k}"`); });
    if (schema.properties) Object.entries(value).forEach(([k, v]) => {
      if (schema.properties[k]) validateSchema(v, schema.properties[k], `${path}.${k}`, errors, root);
      else if (schema.additionalProperties === false) fail(`unknown property "${k}"`);
    });
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.map(s => validateSchema(value, s, path, [], root).length === 0).filter(Boolean).length;
    if (matches !== 1) {
      // Report the branch that fits best (fewest errors) so the message is useful.
      const best = schema.oneOf.map(s => validateSchema(value, s, path, [], root)).sort((a, b) => a.length - b.length)[0];
      fail(matches === 0 ? `matches none of the allowed shapes; closest: ${best.join('; ')}` : 'matches more than one allowed shape');
    }
  }
  return errors;
}

// ---------- checks beyond the schema ----------
function validateRecord(record, file, data) {
  const errors = validateSchema(record, SCHEMA), warnings = [];
  if (errors.length) return { errors, warnings };
  const ids = new Set(record.goalkeepers.map(g => g.playerId));
  if (ids.size !== record.goalkeepers.length) errors.push('goalkeepers: duplicate playerId');
  let lastSeq = 0, lastTime = -1;
  record.events.forEach((e, i) => {
    const p = `events[${i}]`;
    if (!ids.has(e.goalkeeperId)) errors.push(`${p}: goalkeeperId ${e.goalkeeperId} is not in goalkeepers`);
    if (e.seq <= lastSeq) errors.push(`${p}: seq ${e.seq} not greater than previous ${lastSeq}`);
    lastSeq = e.seq;
    if (e.type === 'shot') {
      if (e.result === 'miss' && e.zone !== 0) errors.push(`${p}: a miss must have zone 0`);
      if (e.result !== 'miss' && e.zone === 0) errors.push(`${p}: zone 0 means off target, result must be miss`);
    }
    const t = e.second;
    if (t < lastTime) warnings.push(`${p}: second ${t} is earlier than the previous event (${lastTime})`);
    lastTime = t;
    const lower = (e.half - 1) * 1800;
    if (t < lower) warnings.push(`${p}: second ${t} lies before half ${e.half} begins at ${lower}`);
  });
  const expected = `torwart-${record.matchId}-${record.teamId}.json`;
  if (basename(file) !== expected) warnings.push(`file name should be ${expected}`);
  if (data) {
    const m = data.matches.find(x => x.id === record.matchId);
    if (!m) warnings.push(`matchId ${record.matchId} is not in daten/daten.js (other season or league?)`);
    else {
      const home = m.local.id, away = m.visitor.id;
      if (record.teamId !== home && record.teamId !== away) errors.push(`teamId ${record.teamId} did not play match ${record.matchId} (${home} vs ${away})`);
      else {
        const isHome = record.teamId === home, opponent = isHome ? away : home;
        if (record.isHome !== isHome) errors.push(`isHome should be ${isHome}`);
        if (record.opponentId !== opponent) errors.push(`opponentId should be ${opponent}`);
      }
      const day = m.date.slice(0, 10);
      if (record.date !== day) warnings.push(`date ${record.date} differs from the fixture (${day})`);
    }
  } else warnings.push('daten/daten.js not found, match ids not cross-checked');
  return { errors, warnings };
}

// ---------- commands ----------
function cmdValidate(files) {
  if (!files.length) files = existsSync(DIR) ? readdirSync(DIR).filter(f => /^torwart-.*\.json$/.test(f)).map(f => join(DIR, f)) : [];
  if (!files.length) { console.log('No records found in daten/torwart/.'); return 0; }
  const data = loadMatches();
  let failed = 0;
  for (const f of files) {
    let record;
    try { record = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log(`✗ ${f}: not valid JSON (${e.message})`); failed++; continue; }
    const { errors, warnings } = validateRecord(record, f, data);
    const shots = Array.isArray(record.events) ? record.events.filter(e => e.type === 'shot').length : 0;
    if (errors.length) { failed++; console.log(`✗ ${f}`); errors.forEach(e => console.log(`    error: ${e}`)); }
    else console.log(`✓ ${f} (${shots} shots, ${(record.goalkeepers || []).length} goalkeepers)`);
    warnings.forEach(w => console.log(`    warning: ${w}`));
  }
  return failed ? 1 : 0;
}

function cmdNew(args) {
  const teamFlag = args.indexOf('--team');
  const teamId = teamFlag >= 0 ? Number(args[teamFlag + 1]) : readTeamId();
  const which = args.filter((a, i) => a !== '--team' && i !== teamFlag + 1)[0] || 'next';
  const data = loadMatches();
  if (!data) { console.error('daten/daten.js not found; run abruf.sh first.'); return 1; }
  const mine = data.matches.filter(m => m.local.id === teamId || m.visitor.id === teamId);
  let m;
  if (which === 'next') m = mine.filter(x => !x.status.is_finished).sort((a, b) => a.date.localeCompare(b.date))[0];
  else m = mine.find(x => x.id === Number(which));
  if (!m) { console.error(`No match ${which} for team ${teamId}.`); return 1; }
  const isHome = m.local.id === teamId;
  const record = {
    format: 'anwurf-goalkeeper', version: 1,
    matchId: m.id, teamId, opponentId: isHome ? m.visitor.id : m.local.id, isHome, date: m.date.slice(0, 10),
    startedAt: null, exportedAt: null,
    goalkeepers: [], events: [],
  };
  const file = join(DIR, `torwart-${m.id}-${teamId}.json`);
  if (existsSync(file)) { console.error(`${file} exists already, not overwriting.`); return 1; }
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  console.log(`Created ${file}\n${m.date.slice(0, 10)} · ${m.local.name} vs ${m.visitor.name}`);
  return 0;
}

// Same output as the fetch scripts (abruf.sh, Start (Mac).command, app/abruf.ps1), for use without fetching.
function cmdBundle() {
  const files = existsSync(DIR) ? readdirSync(DIR).filter(f => /^torwart-.*\.json$/.test(f)).sort().map(f => join(DIR, f)) : [];
  const parts = files.map(f => readFileSync(f, 'utf8').trim());
  writeFileSync(join(ROOT, 'daten', 'torwart.js'), `window.HB_TORWART = [${parts.join(',')}];\n`);
  console.log(`Wrote daten/torwart.js with ${files.length} record${files.length === 1 ? '' : 's'}.`);
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'validate') process.exit(cmdValidate(rest));
else if (cmd === 'new') process.exit(cmdNew(rest));
else if (cmd === 'bundle') process.exit(cmdBundle());
else { console.log('Usage:\n  node scripts/goalkeeper.mjs validate [file ...]\n  node scripts/goalkeeper.mjs new [matchId | next] [--team <id>]\n  node scripts/goalkeeper.mjs bundle'); process.exit(cmd ? 1 : 0); }
