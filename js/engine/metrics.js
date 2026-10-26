// Daily derivations and dashboard metrics (handover 4.3 and 4.9).
import { ACTIVITIES, ACTIVITY_LABELS, FEELS, WEEKLY_SESSION_TARGET, WEEKLY_TARGETS } from '../config/program.js';
import { addDays, dateRange, weekStart } from '../util/dates.js';
import { plannedFor, plannedSessions } from './calendar.js';
import { liftPace, longRunInfo } from './pace.js';

export const HABITS = ['read', 'journal', 'water', 'supplements', 'protein', 'sleep'];
export const HABIT_LABELS = {
  read: 'Reading', journal: 'Journal', water: 'Water', supplements: 'Supplements', protein: 'Protein', sleep: 'Sleep',
};

export function emptyDay(date) {
  return {
    date,
    swim: false, lift: false, run: false, soccer: false, yoga: false,
    runMi: null, pages: 0, journal: false, waterL: 0, proteinG: 0, sleepH: null,
    supplements: false, supplementsTaken: [], bodyWeight: null, notes: '',
  };
}

/** Lift entries grouped by exercise id, each list oldest first. */
export function liftsByExercise(lifts) {
  const map = new Map();
  const sorted = [...lifts].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  for (const e of sorted) {
    if (!map.has(e.exerciseId)) map.set(e.exerciseId, []);
    map.get(e.exerciseId).push(e);
  }
  return map;
}

export function liftDateSet(lifts) {
  return new Set(lifts.map((e) => e.date));
}

/** Ticks and habit results for one date. Lift auto-ticks from logged lifts, run from miles. */
export function deriveDay(day, liftDates, targets) {
  const d = day || emptyDay(null);
  const activities = {
    swim: !!d.swim,
    lift: !!d.lift || liftDates.has(d.date),
    run: !!d.run || d.runMi > 0,
    soccer: !!d.soccer,
    yoga: !!d.yoga,
  };
  const habits = {
    read: (d.pages || 0) >= targets.pages,
    journal: !!d.journal,
    water: (d.waterL || 0) >= targets.waterL,
    supplements: !!d.supplements,
    protein: (d.proteinG || 0) >= targets.proteinG,
    sleep: d.sleepH != null && d.sleepH >= targets.sleepH,
  };
  const sessionsDone = ACTIVITIES.filter((a) => activities[a]).length;
  const habitsDone = HABITS.filter((h) => habits[h]).length;
  return { activities, habits, sessionsDone, habitsDone };
}

export function dayStatus(iso, derived) {
  const planned = plannedSessions(iso);
  if (derived.sessionsDone >= planned && planned > 0) return 'complete';
  if (derived.sessionsDone > 0) return 'partial';
  return planned > 0 ? 'open' : 'rest';
}

function derivedRange(state, from, to) {
  const liftDates = liftDateSet(state.lifts);
  return dateRange(from, to).map((date) => ({
    date,
    day: state.days.get(date) || emptyDay(date),
    ...deriveDay(state.days.get(date) || emptyDay(date), liftDates, state.settings.targets),
  }));
}

/** Sessions done in the Monday-start week containing iso, capped per activity at its weekly target. */
export function weekSessions(state, iso) {
  const start = weekStart(iso);
  const rows = derivedRange(state, start, addDays(start, 6));
  const perActivity = {};
  let done = 0;
  for (const a of ACTIVITIES) {
    const count = rows.filter((r) => r.activities[a]).length;
    perActivity[a] = { done: count, target: WEEKLY_TARGETS[a] };
    done += Math.min(count, WEEKLY_TARGETS[a]);
  }
  return { done, target: WEEKLY_SESSION_TARGET, perActivity, rows };
}

export function readingWeek(state, iso) {
  const start = weekStart(iso);
  const rows = derivedRange(state, start, addDays(start, 6));
  return {
    days: rows.filter((r) => r.habits.read).length,
    pages: rows.reduce((s, r) => s + (r.day.pages || 0), 0),
    target: state.settings.targets.readDays,
    stretch: state.settings.targets.readDaysStretch,
  };
}

export function habitRate(state, iso, days = 7) {
  const rows = derivedRange(state, addDays(iso, -(days - 1)), iso);
  const done = rows.reduce((s, r) => s + r.habitsDone, 0);
  return { done, possible: rows.length * HABITS.length, rate: done / (rows.length * HABITS.length) };
}

/** Consistency over the last 14 days: done vs planned per activity, plus reading and water. */
export function consistency(state, iso, days = 14) {
  const from = addDays(iso, -(days - 1));
  const rows = derivedRange(state, from, iso);
  const out = [];
  for (const a of ACTIVITIES) {
    const planned = rows.reduce((s, r) => s + plannedFor(r.date, a), 0);
    const done = rows.filter((r) => r.activities[a]).length;
    out.push({ key: a, label: ACTIVITY_LABELS[a], done, planned, rate: planned ? Math.min(1, done / planned) : 1 });
  }
  const readPlanned = (state.settings.targets.readDays * days) / 7;
  const readDone = rows.filter((r) => r.habits.read).length;
  out.push({ key: 'read', label: 'Reading', done: readDone, planned: readPlanned, rate: Math.min(1, readDone / readPlanned) });
  const waterDone = rows.filter((r) => r.habits.water).length;
  out.push({ key: 'water', label: 'Water', done: waterDone, planned: days, rate: waterDone / days });
  return out;
}

export function focusMessage(consistencyRows) {
  const lowest = [...consistencyRows].sort((a, b) => a.rate - b.rate)[0];
  if (!lowest || lowest.rate >= 1) return 'Everything is on target. Keep it going.';
  return `Focus on ${lowest.label.toLowerCase()}: ${Math.round(lowest.rate * 100)}% over the last 14 days.`;
}

export function trainingMix(state, iso, days = 28) {
  const rows = derivedRange(state, addDays(iso, -(days - 1)), iso);
  const mix = {};
  for (const a of ACTIVITIES) mix[a] = rows.filter((r) => r.activities[a]).length;
  return mix;
}

export function feelDistribution(lifts, iso, days = 28) {
  const from = addDays(iso, -(days - 1));
  const dist = Object.fromEntries(FEELS.map((f) => [f, 0]));
  for (const e of lifts) {
    if (e.date >= from && e.date <= iso) dist[e.feel || 'good'] += 1;
  }
  return dist;
}

export function liftsOnPace(state) {
  const byEx = liftsByExercise(state.lifts);
  let onPace = 0;
  let measured = 0;
  const rows = [];
  for (const ex of state.exercises) {
    const entries = byEx.get(ex.id) || [];
    if (!entries.length) continue;
    const pace = liftPace(ex, entries, state.settings.level);
    rows.push({ exercise: ex, pace });
    if (pace.status === 'building' || pace.status === 'tracking') continue;
    measured += 1;
    if (pace.status === 'on' || pace.status === 'ahead') onPace += 1;
  }
  return { onPace, measured, rows };
}

export function computeDashboard(state, iso) {
  const consistencyRows = consistency(state, iso);
  return {
    week: weekSessions(state, iso),
    habits7: habitRate(state, iso, 7),
    reading: readingWeek(state, iso),
    lifts: liftsOnPace(state),
    consistency: consistencyRows,
    focus: focusMessage(consistencyRows),
    longRun: longRunInfo([...state.days.values()], state.settings, iso),
    mix28: trainingMix(state, iso),
    feel28: feelDistribution(state.lifts, iso),
  };
}
