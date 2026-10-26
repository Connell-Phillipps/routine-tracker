// JSON backup and CSV export/import. JSON is the full-fidelity backup; CSV is for
// spreadsheets and for migrating from the Google Sheet.
import { FEELS } from '../config/program.js';
import { isISODate } from '../util/dates.js';
import { STORES, newId } from './db.js';

export const APP_ID = 'routine-tracker';
export const EXPORT_VERSION = 1;

export function buildExport(dump, now = new Date()) {
  return { app: APP_ID, version: EXPORT_VERSION, exportedAt: now.toISOString(), data: dump };
}

/** Checks a parsed backup file. Returns the data object or throws with a readable message. */
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('This file is not a backup (not a JSON object).');
  if (obj.app !== APP_ID) throw new Error('This file is not a Routine Tracker backup.');
  if (typeof obj.version !== 'number' || obj.version > EXPORT_VERSION) {
    throw new Error(`Backup version ${obj.version} is newer than this app supports. Update the app first.`);
  }
  const data = obj.data;
  if (!data || typeof data !== 'object') throw new Error('The backup has no data section.');
  for (const [name, def] of Object.entries(STORES)) {
    const rows = data[name] ?? [];
    if (!Array.isArray(rows)) throw new Error(`"${name}" in the backup is not a list.`);
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object' || r[def.keyPath] == null) {
        throw new Error(`"${name}" row ${i + 1} is missing its "${def.keyPath}".`);
      }
    });
  }
  checkRecords(data);
  return Object.fromEntries(Object.keys(STORES).map((n) => [n, data[n] ?? []]));
}

// Ids end up in HTML attributes, so a restored file may only use plain id characters.
const SAFE_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => v == null || isNum(v);

/** Field-level checks, so a corrupt or hand-edited backup cannot break rendering. */
function checkRecords(data) {
  const fail = (msg) => { throw new Error(`Backup rejected: ${msg}`); };
  for (const store of ['lifts', 'exercises', 'tests', 'food', 'chores', 'choreLog']) {
    for (const r of data[store] ?? []) if (!SAFE_ID.test(String(r.id))) fail(`bad id "${r.id}" in ${store}.`);
  }
  for (const d of data.days ?? []) {
    if (!isISODate(d.date)) fail(`bad date "${d.date}" in days.`);
    for (const k of ['pages', 'waterL', 'proteinG', 'sleepH', 'runMi', 'bodyWeight']) if (!numOrNull(d[k])) fail(`${k} on ${d.date} is not a number.`);
  }
  for (const l of data.lifts ?? []) {
    if (!isISODate(l.date) || !isNum(l.value) || !SAFE_ID.test(String(l.exerciseId))) fail(`lift entry ${l.id} is incomplete.`);
    if (l.feel && !FEELS.includes(l.feel)) fail(`lift entry ${l.id} has unknown feel "${l.feel}".`);
    if (!numOrNull(l.sets)) fail(`lift entry ${l.id} has bad sets.`);
  }
  for (const e of data.exercises ?? []) {
    if (!isNum(e.start) || !isNum(e.step) || e.step <= 0 || typeof e.name !== 'string') fail(`exercise ${e.id} is incomplete.`);
    if (!numOrNull(e.max) || !numOrNull(e.order)) fail(`exercise ${e.id} has bad numbers.`);
  }
  for (const t of data.tests ?? []) if (!isISODate(t.date) || !isNum(t.value)) fail(`test result ${t.id} is incomplete.`);
  for (const f of data.food ?? []) {
    if (!isISODate(f.date) || !['calories', 'proteinG', 'carbsG', 'fatG'].every((k) => numOrNull(f[k]))) fail(`meal ${f.id} is incomplete.`);
  }
  for (const c of data.choreLog ?? []) if (!isISODate(c.date) || !SAFE_ID.test(String(c.choreId))) fail(`chore log ${c.id} is incomplete.`);
  for (const o of data.overrides ?? []) if (!SAFE_ID.test(String(o.exerciseId)) || !isNum(o.value)) fail('a coach override is incomplete.');
}

// ---------- CSV ----------

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(columns, rows) {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes. Returns objects keyed by header. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const DAILY_COLUMNS = [
  'date', 'swim', 'lift', 'run', 'soccer', 'yoga', 'pages', 'journal', 'water_l', 'protein_g', 'sleep_h',
  'supplements', 'run_mi', 'body_weight_lb', 'notes',
];
const LIFT_COLUMNS = ['date', 'exercise_id', 'exercise', 'value', 'unit', 'feel', 'sets', 'reps', 'phase', 'note'];

const yesNo = (b) => (b ? 'yes' : '');

export function dailyCSV(days) {
  const rows = [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({
    date: d.date, swim: yesNo(d.swim), lift: yesNo(d.lift), run: yesNo(d.run), soccer: yesNo(d.soccer),
    yoga: yesNo(d.yoga), pages: d.pages || '', journal: yesNo(d.journal), water_l: d.waterL || '',
    protein_g: d.proteinG || '', sleep_h: d.sleepH ?? '', supplements: yesNo(d.supplements),
    run_mi: d.runMi ?? '', body_weight_lb: d.bodyWeight ?? '', notes: d.notes || '',
  }));
  return toCSV(DAILY_COLUMNS, rows);
}

export function liftsCSV(lifts, exercises) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const rows = [...lifts].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1)).map((l) => ({
    date: l.date, exercise_id: l.exerciseId, exercise: byId.get(l.exerciseId)?.name ?? '', value: l.value,
    unit: byId.get(l.exerciseId)?.unit ?? '', feel: l.feel || '', sets: l.sets ?? '', reps: l.reps ?? '',
    phase: l.phase || '', note: l.note || '',
  }));
  return toCSV(LIFT_COLUMNS, rows);
}

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔', 'done']);
const bool = (v) => TRUE_WORDS.has(String(v ?? '').trim().toLowerCase());
const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Parses a daily-log CSV into day patches. Unknown columns are ignored, and blank cells
 * are skipped so a partial CSV never wipes values already in the app.
 */
export function importDailyRows(rows) {
  const out = [];
  const errors = [];
  const filled = (r, col) => col in r && String(r[col]).trim() !== '';
  rows.forEach((r, i) => {
    if (!isISODate(r.date)) { errors.push(`Row ${i + 2}: date "${r.date}" is not YYYY-MM-DD.`); return; }
    const patch = { date: r.date };
    for (const k of ['swim', 'lift', 'run', 'soccer', 'yoga', 'journal', 'supplements']) if (filled(r, k)) patch[k] = bool(r[k]);
    const numeric = { pages: 'pages', water_l: 'waterL', protein_g: 'proteinG', sleep_h: 'sleepH', run_mi: 'runMi', body_weight_lb: 'bodyWeight' };
    for (const [col, key] of Object.entries(numeric)) {
      if (!filled(r, col)) continue;
      const v = num(r[col]);
      if (v == null || v < 0) { errors.push(`Row ${i + 2}: ${col} "${r[col]}" is not a number (skipped that cell).`); continue; }
      patch[key] = v;
    }
    if (filled(r, 'notes')) patch.notes = r.notes.slice(0, 2000);
    out.push(patch);
  });
  return { days: out, errors };
}

/** Parses a lifting-log CSV into lift entries, matching exercises by id or name. */
export function importLiftRows(rows, exercises, phaseFor) {
  const byKey = new Map();
  for (const e of exercises) { byKey.set(e.id.toLowerCase(), e); byKey.set(e.name.toLowerCase(), e); }
  const lifts = [];
  const errors = [];
  rows.forEach((r, i) => {
    const ex = byKey.get((r.exercise_id || '').toLowerCase()) || byKey.get((r.exercise || '').toLowerCase());
    const value = num(r.value);
    const feel = (r.feel || '').toLowerCase();
    if (!isISODate(r.date)) { errors.push(`Row ${i + 2}: bad date "${r.date}".`); return; }
    if (!ex) { errors.push(`Row ${i + 2}: unknown exercise "${r.exercise_id || r.exercise}".`); return; }
    if (value == null) { errors.push(`Row ${i + 2}: value is not a number.`); return; }
    if (feel && !FEELS.includes(feel)) { errors.push(`Row ${i + 2}: feel "${r.feel}" is not Easy/Good/Hard/Missed.`); return; }
    lifts.push({
      id: newId(), date: r.date, exerciseId: ex.id, value, feel: feel || null,
      sets: num(r.sets), reps: r.reps || null, note: r.note || '',
      phase: r.phase || phaseFor(r.date), ts: Date.parse(`${r.date}T12:00:00`) + i,
    });
  });
  return { lifts, errors };
}
