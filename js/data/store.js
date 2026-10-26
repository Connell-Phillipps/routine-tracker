// In-memory app state backed by IndexedDB. Every action writes to the database first,
// then swaps in a new collection so views always read a consistent snapshot.
import { DEFAULT_SETTINGS, SEED_EXERCISES } from '../config/program.js';
import { phaseForDate } from '../engine/calendar.js';
import { emptyDay } from '../engine/metrics.js';
import { buildExport, validateImport } from './backup.js';
import { newId } from './db.js';

function withDefaults(saved) {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...saved,
    targets: { ...DEFAULT_SETTINGS.targets, ...(saved?.targets || {}) },
    longRun: { ...DEFAULT_SETTINGS.longRun, ...(saved?.longRun || {}) },
  };
}

function toState(dump) {
  const kv = new Map(dump.kv.map((r) => [r.key, r.value]));
  return {
    settings: withDefaults(kv.get('settings')),
    days: new Map(dump.days.map((d) => [d.date, d])),
    lifts: dump.lifts,
    exercises: dump.exercises,
    tests: dump.tests,
    food: dump.food,
    chores: dump.chores,
    choreLog: dump.choreLog,
    overrides: new Map(dump.overrides.map((o) => [o.exerciseId, o])),
  };
}

/** Loads state, seeding settings and the exercise library on first run. */
export async function loadState(db) {
  const seeded = await db.get('kv', 'seeded');
  if (!seeded) {
    await db.put('kv', { key: 'settings', value: structuredClone(DEFAULT_SETTINGS) });
    await db.bulkPut('exercises', structuredClone(SEED_EXERCISES));
    await db.put('kv', { key: 'seeded', value: true });
  }
  await backfillExercises(db);
  return toState(await db.dumpAll());
}

/** Adds fields introduced in later versions (region, orderNote) to seeded exercises, never overwriting edits. */
async function backfillExercises(db) {
  const seeds = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
  const current = await db.getAll('exercises');
  const updated = current
    .filter((e) => seeds.has(e.id) && Object.keys(seeds.get(e.id)).some((k) => !(k in e)))
    .map((e) => ({ ...structuredClone(seeds.get(e.id)), ...e }));
  const custom = current.filter((e) => !seeds.has(e.id) && !('region' in e)).map((e) => ({ ...e, region: e.workout === 'legs' ? 'lower' : 'upper', orderNote: '' }));
  if (updated.length || custom.length) await db.bulkPut('exercises', [...updated, ...custom]);
}

const replaceById = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  return i === -1 ? [...list, item] : list.map((x) => (x.id === item.id ? item : x));
};

const roundTo = (v, places) => Math.round(v * 10 ** places) / 10 ** places;

export function createActions(db, state, onChange) {
  const changed = (what) => onChange?.(what);

  /** Memory first (like saveDay) so overlapping saves each build on the other's patch. */
  async function saveSettings(patch) {
    const prev = state.settings;
    const next = withDefaults({ ...prev, ...patch });
    state.settings = next;
    try {
      await db.put('kv', { key: 'settings', value: next });
    } catch (err) {
      if (state.settings === next) state.settings = prev;
      throw err;
    }
    changed('settings');
  }

  /**
   * Merges a patch into a day. Memory is updated before the write so two quick taps
   * (e.g. a field blur and a +250 ml button) both land; a failed write is rolled back.
   */
  async function saveDay(date, patch) {
    const prev = state.days.get(date);
    const next = { ...emptyDay(date), ...(prev || {}), ...patch, date };
    state.days = new Map(state.days).set(date, next);
    try {
      await db.put('days', next);
    } catch (err) {
      const rollback = new Map(state.days);
      if (prev) rollback.set(date, prev); else rollback.delete(date);
      state.days = rollback;
      throw err;
    }
    changed('days');
    return next;
  }

  /** Adds to a numeric day field (quick-add buttons). Never goes below zero. */
  async function bumpDay(date, field, amount, places = 2) {
    const current = state.days.get(date)?.[field] || 0;
    return saveDay(date, { [field]: Math.max(0, roundTo(current + amount, places)) });
  }

  async function logLift({ date, exerciseId, value, feel, sets = null, reps = null, note = '' }) {
    const entry = {
      id: newId(), date, exerciseId, value, feel: feel || null, sets, reps, note,
      phase: phaseForDate(date, state.settings), ts: Date.now(),
    };
    await db.put('lifts', entry);
    state.lifts = [...state.lifts, entry];
    changed('lifts');
    return entry;
  }

  async function updateLift(id, patch) {
    const current = state.lifts.find((l) => l.id === id);
    if (!current) throw new Error('That lift entry no longer exists.');
    const next = { ...current, ...patch };
    await db.put('lifts', next);
    state.lifts = replaceById(state.lifts, next);
    changed('lifts');
  }

  async function deleteLift(id) {
    await db.delete('lifts', id);
    state.lifts = state.lifts.filter((l) => l.id !== id);
    changed('lifts');
  }

  async function saveExercise(ex) {
    const next = { notes: '', pair: null, max: null, archived: false, ...ex, id: ex.id || newId() };
    await db.put('exercises', next);
    state.exercises = replaceById(state.exercises, next);
    changed('exercises');
    return next;
  }

  /** Saves several exercises in one transaction (used for reordering). */
  async function saveExercises(list) {
    await db.bulkPut('exercises', list);
    const byId = new Map(list.map((e) => [e.id, e]));
    state.exercises = state.exercises.map((e) => byId.get(e.id) || e);
    changed('exercises');
  }

  async function logTest({ date, testId, value }) {
    const entry = { id: newId(), date, testId, value, ts: Date.now() };
    await db.put('tests', entry);
    state.tests = [...state.tests, entry];
    changed('tests');
  }

  async function deleteTest(id) {
    await db.delete('tests', id);
    state.tests = state.tests.filter((t) => t.id !== id);
    changed('tests');
  }

  /** Saves a food estimate and adds its protein to the day's total. */
  async function addFood(entry) {
    const food = { id: newId(), ts: Date.now(), source: 'manual', ...entry };
    await db.put('food', food);
    state.food = [...state.food, food];
    if (food.proteinG) await bumpDay(food.date, 'proteinG', food.proteinG, 0);
    changed('food');
  }

  async function deleteFood(id) {
    const food = state.food.find((f) => f.id === id);
    if (!food) return;
    await db.delete('food', id);
    state.food = state.food.filter((f) => f.id !== id);
    if (food.proteinG) await bumpDay(food.date, 'proteinG', -food.proteinG, 0);
    changed('food');
  }

  async function saveChore(chore) {
    const next = { archived: false, createdAt: new Date().toISOString(), ...chore, id: chore.id || newId() };
    await db.put('chores', next);
    state.chores = replaceById(state.chores, next);
    changed('chores');
  }

  /** Marks a chore done for a date, or undoes it when `existing` (the log entry) is given. */
  async function toggleChore(chore, date, existing) {
    if (existing) {
      await db.delete('choreLog', existing.id);
      state.choreLog = state.choreLog.filter((l) => l.id !== existing.id);
    } else {
      if (state.choreLog.some((l) => l.choreId === chore.id && l.date === date)) return; // already ticked
      const log = { id: newId(), choreId: chore.id, frequency: chore.frequency, date, ts: Date.now() };
      state.choreLog = [...state.choreLog, log]; // memory first, so a second tap sees it
      try {
        await db.put('choreLog', log);
      } catch (err) {
        state.choreLog = state.choreLog.filter((l) => l.id !== log.id);
        throw err;
      }
    }
    changed('chores');
  }

  async function acceptOverrides(items) {
    const ts = Date.now();
    const rows = items.map((i) => ({
      exerciseId: i.exercise.id, value: i.value, sets: i.sets, reps: i.reps, note: i.note, rationale: i.rationale, ts,
    }));
    await db.bulkPut('overrides', rows);
    const next = new Map(state.overrides);
    for (const r of rows) next.set(r.exerciseId, r);
    state.overrides = next;
    changed('overrides');
  }

  async function clearOverride(exerciseId) {
    await db.delete('overrides', exerciseId);
    const next = new Map(state.overrides);
    next.delete(exerciseId);
    state.overrides = next;
    changed('overrides');
  }

  async function exportJSON() {
    const json = JSON.stringify(buildExport(await db.dumpAll()), null, 1);
    return json;
  }

  async function markBackedUp() {
    await saveSettings({ lastBackup: new Date().toISOString() });
  }

  /** Full restore from a backup file. Validates first; replaces everything in one transaction. */
  async function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    const data = validateImport(parsed);
    if (!data.kv.some((r) => r.key === 'seeded')) data.kv = [...data.kv, { key: 'seeded', value: true }];
    await db.replaceAll(data);
    Object.assign(state, toState(await db.dumpAll()));
    changed('all');
  }

  /** Merges CSV day patches into existing days in one transaction. */
  async function importDays(patches) {
    const next = new Map(state.days);
    for (const p of patches) next.set(p.date, { ...emptyDay(p.date), ...(next.get(p.date) || {}), ...p });
    const rows = patches.map((p) => next.get(p.date));
    await db.bulkPut('days', rows);
    state.days = next;
    changed('days');
  }

  async function importLifts(entries) {
    const key = (l) => [l.date, l.exerciseId, l.value, l.feel || '', l.sets ?? '', l.reps ?? ''].join('|');
    const seen = new Set(state.lifts.map(key));
    const fresh = entries.filter((e) => {
      const k = key(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await db.bulkPut('lifts', fresh);
    state.lifts = [...state.lifts, ...fresh];
    changed('lifts');
    return fresh.length;
  }

  async function resetAll() {
    await db.replaceAll({ kv: [] });
    Object.assign(state, await loadState(db));
    changed('all');
  }

  return {
    saveSettings, saveDay, bumpDay, logLift, updateLift, deleteLift, saveExercise, saveExercises, logTest, deleteTest,
    addFood, deleteFood, saveChore, toggleChore, acceptOverrides, clearOverride,
    exportJSON, markBackedUp, importJSON, importDays, importLifts, resetAll,
  };
}
