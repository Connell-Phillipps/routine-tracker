// Evidence-based progressive overload.
//
// Loaded lifts use DOUBLE PROGRESSION with feel as a reps-in-reserve (RIR) guide:
//   - add reps inside the phase's rep range first, then add load once every set reaches
//     the top of the range (adding reps works about as well as adding load: Plotkin et al.
//     2022, PeerJ 10:e14142);
//   - load jumps are kept to common guidance of about 2-5% upper body and 5-10% lower
//     body per increase: Easy may add 2 steps only if that stays inside the cap;
//   - feel maps to RIR: Easy = 3+ in reserve, Good = 1-2, Hard = 0 or a grind, Missed =
//     short of target. Training near (not to) failure is enough for growth
//     (Refalo et al. 2023, Sports Med 53:649).
// Rep-count exercises progress reps by feel. Explosive work (plyometric, power, sprint)
// progresses one step at most: quality and speed matter more than load.
// Deloads keep 90% load with fewer sets: cutting volume is the most agreed deload method
// (Bell et al. 2023, Sports Med Open 9:87).
// Changing phase (Build 6-8 -> Strength 3-5) re-bases load from an Epley e1RM estimate.
import { FEELS, SETS_REPS } from '../config/program.js';

const DELOAD_FACTOR = 0.9;
const MISSED_FACTOR = 0.9;
const JUMP_CAP = { upper: 0.05, lower: 0.1 }; // max relative increase for a 2-step jump
const REP_UNITS = new Set(['reps', 'contacts', 'reps/side']);
const EXPLOSIVE = new Set(['plyometric', 'power', 'sprint']);

/** Removes float noise such as 12.499999 after step arithmetic. */
const tidy = (v) => Math.round(v * 1000) / 1000;

export function roundToStep(value, step) {
  return tidy(Math.round(value / step) * step);
}

export function normalizeFeel(feel) {
  if (!feel) return 'good'; // blank counts as Good
  if (!FEELS.includes(feel)) throw new Error(`Unknown feel "${feel}"`);
  return feel;
}

/** How an exercise progresses: 'load' (double progression), 'reps' or 'explosive'. */
export function progressionModel(exercise) {
  if (EXPLOSIVE.has(exercise.type)) return 'explosive';
  if (REP_UNITS.has(exercise.unit)) return 'reps';
  return 'load';
}

/** Rep range for a type and phase, parsed from the sets x reps table. Null if none. */
export function repRange(type, phase) {
  const m = /(\d+)\s*×\s*(\d+)(?:-(\d+))?/.exec(SETS_REPS[type]?.[phase] ?? '');
  if (!m) return null;
  return { sets: Number(m[1]), lo: Number(m[2]), hi: Number(m[3] ?? m[2]) };
}

/**
 * Reps per set from free text: "8,8,7", "8 8 7" or "4x8" (4 sets of 8). Null if none.
 */
export function parseReps(text) {
  if (text == null || String(text).trim() === '') return null;
  const s = String(text).trim();
  const setsBy = /^(\d{1,2})\s*[x×]\s*(\d{1,3})$/i.exec(s);
  if (setsBy) {
    const sets = Number(setsBy[1]);
    return sets >= 1 && sets <= 10 ? Array(sets).fill(Number(setsBy[2])) : null;
  }
  // Whole numbers separated by commas, spaces or slashes only: "8,8,7", "8 8 7", "8/8/7".
  if (!/^\d{1,3}(\s*[,/ ]\s*\d{1,3})*$/.test(s)) return null;
  const nums = s.split(/[\s,/]+/).map(Number);
  return nums.length <= 10 && nums.every((n) => n <= 100) ? nums : null;
}

const capFor = (exercise) => JUMP_CAP[exercise.region === 'lower' ? 'lower' : 'upper'];

/** +2 steps when that stays inside the region's % cap, otherwise +1 (the smallest jump available). */
function loadIncrease(value, step, exercise, feel) {
  if (feel === 'easy' && value > 0 && (2 * step) / value <= capFor(exercise)) return 2 * step;
  return step;
}

function reduce(value, step) {
  let next = roundToStep(value * MISSED_FACTOR, step);
  if (next >= value) next = value - step;
  return next;
}

const clamp = (v, { min = 0, max = null }) => tidy(max != null ? Math.min(max, Math.max(min, v)) : Math.max(min, v));

/**
 * Feel-only rule, used for rep-count and explosive exercises, and for loaded lifts
 * logged without reps. Easy +2 steps (+1 if over the cap or explosive), Good +1,
 * Hard repeat, Missed -10% rounded to the step (always at least one step lighter).
 * Without an exercise it is the plain handover feel table (Easy always +2 steps).
 */
export function progressValue(value, feel, step, opts = {}, exercise = null) {
  const f = normalizeFeel(feel);
  let next;
  if (f === 'missed') next = reduce(value, step);
  else if (f === 'hard') next = value;
  else if (f === 'good') next = value + step;
  else if (!exercise || REP_UNITS.has(exercise.unit) && !EXPLOSIVE.has(exercise.type)) next = value + 2 * step;
  else if (EXPLOSIVE.has(exercise.type)) next = value + step;
  else next = value + loadIncrease(value, step, exercise, f);
  return clamp(next, opts);
}

/** 90% rounded to the step, and always at least one step lighter (25 lb -> 20, not 25). */
export function deloadValue(value, step, { min = 0 } = {}) {
  let next = roundToStep(value * DELOAD_FACTOR, step);
  if (next >= value) next = value - step;
  return tidy(Math.max(min, next));
}

/** Epley: estimated one-rep max from a set of `reps` at `weight`. */
export const e1rm = (weight, reps) => weight * (1 + reps / 30);

/**
 * Double progression for a loaded lift. Returns { value, reps, action }.
 * reps is the per-set rep target for next time; action explains the decision.
 */
export function doubleProgression(exercise, entry, range, opts) {
  const feel = normalizeFeel(entry.feel);
  const done = parseReps(entry.reps);
  const step = exercise.step;
  if (feel === 'missed') return { value: clamp(reduce(entry.value, step), opts), reps: range?.lo ?? null, action: 'reduce' };
  if (!range || !done) {
    // No reps logged: fall back to feel alone.
    const value = progressValue(entry.value, feel, step, opts, exercise);
    return { value, reps: range?.lo ?? null, action: value > entry.value ? 'load' : 'hold' };
  }
  const worst = Math.min(...done);
  if (worst >= range.hi && done.length < range.sets) {
    // Top reps but fewer sets than planned: finish the sets before adding load.
    return { value: entry.value, reps: range.hi, action: 'sets' };
  }
  if (worst >= range.hi) {
    if (feel === 'hard') return { value: entry.value, reps: range.hi, action: 'consolidate' };
    const value = clamp(entry.value + loadIncrease(entry.value, step, exercise, feel), opts);
    return { value, reps: range.lo, action: value > entry.value ? 'load' : 'hold' };
  }
  if (worst >= range.lo) {
    const add = feel === 'easy' ? 2 : feel === 'good' ? 1 : 0;
    const reps = Math.min(range.hi, worst + add);
    return { value: entry.value, reps, action: add ? 'reps' : 'hold' };
  }
  return { value: entry.value, reps: range.lo, action: 'hold' }; // below the range: own it first
}

/**
 * Load for a new phase's rep range, from the last working set's estimated 1RM, rounded
 * down. Never heavier than before without evidence: with no reps logged, or a Hard
 * session, it is capped at the previous load. A Missed session takes the usual -10%.
 */
function rebase(exercise, entry, fromRange, toRange, opts) {
  const feel = normalizeFeel(entry.feel);
  if (feel === 'missed') return clamp(reduce(entry.value, exercise.step), opts);
  const done = parseReps(entry.reps);
  const repsDone = done ? Math.min(...done) : Math.round((fromRange.lo + fromRange.hi) / 2);
  const target = e1rm(entry.value, repsDone) / (1 + toRange.hi / 30);
  let next = Math.floor(target / exercise.step + 1e-9) * exercise.step;
  if (!done || feel === 'hard') next = Math.min(next, entry.value);
  if (next <= 0) next = entry.value; // too light to re-base: keep the weight
  return clamp(next, opts);
}

const limits = (exercise) => ({ min: exercise.min ?? 0, max: exercise.max ?? null });

/**
 * Target for the next session of an exercise.
 * `history` is that exercise's entries before the session, oldest first, each
 * { date, value, feel, reps, phase }. Deload sessions never move the working weight, so
 * the base is the most recent non-deload entry.
 * Returns { value, reps, range, basis, from }.
 */
export function nextTarget(exercise, history, targetPhase) {
  const opts = limits(exercise);
  const model = progressionModel(exercise);
  const range = model === 'load' ? repRange(exercise.type, targetPhase) : null;
  if (!history.length) {
    const value = targetPhase === 'deload' ? deloadValue(exercise.start, exercise.step, opts) : exercise.start;
    return { value, reps: range?.lo ?? null, range, basis: 'start', from: null };
  }
  const working = [...history].reverse().find((e) => e.phase !== 'deload') || history[history.length - 1];
  if (targetPhase === 'deload') {
    return { value: deloadValue(working.value, exercise.step, opts), reps: range?.lo ?? null, range, basis: 'deload', from: working };
  }
  if (model !== 'load') {
    return {
      value: progressValue(working.value, working.feel, exercise.step, opts, exercise),
      reps: null, range: null, basis: normalizeFeel(working.feel), from: working,
    };
  }
  const fromRange = repRange(exercise.type, working.phase);
  if (fromRange && range && working.phase !== 'deload' && (fromRange.lo !== range.lo || fromRange.hi !== range.hi)) {
    return { value: rebase(exercise, working, fromRange, range, opts), reps: range.lo, range, basis: 'phase', from: working };
  }
  const r = doubleProgression(exercise, working, range, opts);
  return { value: r.value, reps: r.reps, range, basis: r.action, from: working };
}

export function setsReps(type, phase) {
  return SETS_REPS[type]?.[phase] ?? '';
}

export const BASIS_LABELS = {
  start: 'starting value',
  easy: 'felt Easy: +2 reps or steps',
  good: 'felt Good: +1',
  hard: 'felt Hard: repeat',
  missed: 'missed: -10%',
  deload: 'deload week: 90% load, fewer sets',
  load: 'top of rep range hit: add load',
  reps: 'add reps before load',
  hold: 'repeat and own it',
  consolidate: 'top of range but Hard: repeat',
  sets: 'top reps, but finish every set before adding load',
  reduce: 'missed: -10% and rebuild',
  phase: 'new phase: load re-based from your e1RM',
};
