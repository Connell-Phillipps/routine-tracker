import { test, eq, ok, throws } from './harness.js';
import { deleteDB, openDB } from '../js/data/db.js';
import { createActions, loadState } from '../js/data/store.js';
import { importDailyRows, importLiftRows, parseCSV, toCSV, validateImport } from '../js/data/backup.js';
import { SEED_EXERCISES } from '../js/config/program.js';

const TEST_DB = 'routine-tracker-test';

async function freshStore() {
  await deleteDB(TEST_DB);
  const db = await openDB(TEST_DB);
  const state = await loadState(db);
  return { db, state, actions: createActions(db, state) };
}

test('store: first run seeds settings and the exercise library', async () => {
  const { db, state } = await freshStore();
  eq(state.exercises.length, SEED_EXERCISES.length);
  eq(state.settings.targets.proteinG, 160);
  db.close();
});

test('store: data survives closing and reopening the database', async () => {
  const { db, actions } = await freshStore();
  await actions.saveDay('2026-10-27', { pages: 12, waterL: 2 });
  await actions.logLift({ date: '2026-10-27', exerciseId: 'incline-db-press', value: 50, feel: 'easy' });
  db.close();
  const db2 = await openDB(TEST_DB);
  const state2 = await loadState(db2);
  eq(state2.days.get('2026-10-27').pages, 12);
  eq(state2.lifts.length, 1);
  eq(state2.lifts[0].phase, 'build');
  db2.close();
});

test('store: food adds protein to the day, deleting removes it', async () => {
  const { db, state, actions } = await freshStore();
  await actions.bumpDay('2026-10-27', 'proteinG', 25, 0);
  await actions.addFood({ date: '2026-10-27', description: 'Shake', proteinG: 40, calories: 300 });
  eq(state.days.get('2026-10-27').proteinG, 65);
  await actions.deleteFood(state.food[0].id);
  eq(state.days.get('2026-10-27').proteinG, 25);
  db.close();
});

test('backup: export then import round-trips with no loss', async () => {
  const { db, state, actions } = await freshStore();
  await actions.saveSettings({ level: 'advanced', supplements: ['Creatine'] });
  await actions.saveDay('2026-10-27', { swim: true, pages: 12, notes: 'Felt, "great"\nnew line', sleepH: 7.5 });
  await actions.logLift({ date: '2026-10-27', exerciseId: 'incline-db-press', value: 52.5, feel: 'hard', sets: 4, reps: '8,8,7,6' });
  await actions.saveExercise({ ...SEED_EXERCISES[0], id: 'custom-1', name: 'Landmine Press', start: 45 });
  await actions.addFood({ date: '2026-10-27', description: 'Rice', proteinG: 30, calories: 500 });
  await actions.saveChore({ name: 'Hoover', category: 'cleaning', frequency: 'weekly' });
  await actions.toggleChore(state.chores[0], '2026-10-27');
  await actions.logTest({ date: '2026-11-22', testId: 'vjump', value: 24 });
  await actions.acceptOverrides([{ exercise: SEED_EXERCISES[1], value: 45, sets: 3, reps: '8', note: '', rationale: 'x' }]);
  const before = await db.dumpAll();
  const json = await actions.exportJSON();

  await actions.resetAll();
  eq(state.lifts.length, 0, 'reset cleared data');
  await actions.importJSON(json);
  const after = await db.dumpAll();
  eq(after, before);
  eq(state.days.get('2026-10-27').notes, 'Felt, "great"\nnew line');
  eq(state.settings.level, 'advanced');
  db.close();
});

test('backup: invalid files are rejected and leave data untouched', async () => {
  const { db, state, actions } = await freshStore();
  await actions.saveDay('2026-10-27', { pages: 5 });
  await throws(() => actions.importJSON('not json'), /not valid JSON/);
  await throws(() => actions.importJSON('{"app":"other"}'), /not a Routine Tracker backup/);
  await throws(() => actions.importJSON(JSON.stringify({ app: 'routine-tracker', version: 99, data: {} })), /newer/);
  await throws(
    () => actions.importJSON(JSON.stringify({ app: 'routine-tracker', version: 1, data: { lifts: [{ id: 'x', date: 'bad' }] } })),
    /incomplete/,
  );
  eq(state.days.get('2026-10-27').pages, 5);
  db.close();
});

test('backup: rejects unknown feel and ids that could inject markup', async () => {
  const base = (data) => ({ app: 'routine-tracker', version: 1, data });
  await throws(() => validateImport(base({ lifts: [{ id: 'a', date: '2026-10-20', exerciseId: 'back-squat', value: 1, feel: 'meh' }] })), /unknown feel/);
  await throws(() => validateImport(base({ food: [{ id: '"><img src=x onerror=alert(1)>', date: '2026-10-20' }] })), /bad id/);
  await throws(() => validateImport(base({ exercises: [{ id: 'x', name: 'X', start: 10, step: 0 }] })), /incomplete/);
});

test('store: daily CSV import keeps existing values where cells are blank', async () => {
  const { db, state, actions } = await freshStore();
  await actions.saveDay('2026-10-19', { swim: true, pages: 20, notes: 'keep me' });
  const { days } = importDailyRows(parseCSV('date,swim,pages,notes,water_l\n2026-10-19,,,,3\n2026-10-20,yes,5,,'));
  await actions.importDays(days);
  const d = state.days.get('2026-10-19');
  eq([d.swim, d.pages, d.notes, d.waterL], [true, 20, 'keep me', 3]);
  eq(state.days.get('2026-10-20').pages, 5);
  db.close();
});

test('store: a chore cannot be ticked twice for the same day', async () => {
  const { db, state, actions } = await freshStore();
  await actions.saveChore({ name: 'Dishes', category: 'kitchen', frequency: 'daily' });
  await Promise.all([actions.toggleChore(state.chores[0], '2026-10-27'), actions.toggleChore(state.chores[0], '2026-10-27')]);
  eq(state.choreLog.length, 1);
  db.close();
});

test('validateImport fills missing stores with empty lists', () => {
  const data = validateImport({ app: 'routine-tracker', version: 1, data: { days: [] } });
  ok(Array.isArray(data.choreLog) && data.choreLog.length === 0);
});

test('CSV: quotes, commas and newlines round-trip', () => {
  const rows = [{ a: 'plain', b: 'with, comma' }, { a: 'say "hi"', b: 'two\nlines' }];
  const parsed = parseCSV(toCSV(['a', 'b'], rows));
  eq(parsed, rows);
});

test('CSV: daily import parses ticks and numbers, reports bad dates', () => {
  const rows = parseCSV('Date,Swim,Pages,Water (L),Sleep h,Notes\n2026-10-19,TRUE,12,3.5,7.5,ok\n19/10/2026,x,1,,,');
  const { days, errors } = importDailyRows(rows);
  eq(days, [{ date: '2026-10-19', swim: true, pages: 12, waterL: 3.5, sleepH: 7.5, notes: 'ok' }]);
  eq(errors.length, 1);
});

test('CSV: lift import matches exercises by id or name', () => {
  const rows = parseCSV('date,exercise,value,feel\n2026-10-20,Back Squat,185,Easy\n2026-10-20,Nope,1,\n2026-10-20,lat-pulldown,120,meh');
  const { lifts, errors } = importLiftRows(rows, SEED_EXERCISES, () => 'build');
  eq(lifts.map((l) => [l.exerciseId, l.value, l.feel]), [['back-squat', 185, 'easy']]);
  eq(errors.length, 2);
});
