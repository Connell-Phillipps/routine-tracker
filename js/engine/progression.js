// Progression by feel (handover 4.5) and sets x reps by phase (4.6).
import { FEELS, SETS_REPS } from '../config/program.js';

const DELOAD_FACTOR = 0.9;
const MISSED_FACTOR = 0.9;

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

/**
 * Next working value after a session at `value` with the given feel.
 * Easy +2 steps, Good/blank +1 step, Hard repeat, Missed -10% rounded to the step.
 * A Missed result always drops at least one step, otherwise rounding could repeat it.
 */
export function progressValue(value, feel, step, { min = 0, max = null } = {}) {
  let next;
  switch (normalizeFeel(feel)) {
    case 'easy': next = value + 2 * step; break;
    case 'good': next = value + step; break;
    case 'hard': next = value; break;
    case 'missed':
      next = roundToStep(value * MISSED_FACTOR, step);
      if (next >= value) next = value - step;
      break;
    default: throw new Error('unreachable');
  }
  next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return tidy(next);
}

/** 90% rounded to the step, and always at least one step lighter (25 lb -> 20, not 25). */
export function deloadValue(value, step, { min = 0 } = {}) {
  let next = roundToStep(value * DELOAD_FACTOR, step);
  if (next >= value) next = value - step;
  return tidy(Math.max(min, next));
}

const limits = (exercise) => ({ min: exercise.min ?? 0, max: exercise.max ?? null });

/**
 * Target for the next session of an exercise.
 * `history` is that exercise's entries before the session, oldest first, each
 * { date, value, feel, phase }. Deload sessions never move the working weight, so the
 * base is the most recent non-deload entry. In a deload week the target is 90% of it.
 */
export function nextTarget(exercise, history, targetPhase) {
  const opts = limits(exercise);
  if (!history.length) {
    const value = targetPhase === 'deload' ? deloadValue(exercise.start, exercise.step, opts) : exercise.start;
    return { value, basis: 'start', from: null };
  }
  const working = [...history].reverse().find((e) => e.phase !== 'deload') || history[history.length - 1];
  if (targetPhase === 'deload') {
    return { value: deloadValue(working.value, exercise.step, opts), basis: 'deload', from: working };
  }
  return {
    value: progressValue(working.value, working.feel, exercise.step, opts),
    basis: normalizeFeel(working.feel),
    from: working,
  };
}

export function setsReps(type, phase) {
  return SETS_REPS[type]?.[phase] ?? '';
}

export const BASIS_LABELS = {
  start: 'starting value',
  easy: 'last felt Easy: +2 steps',
  good: 'last felt Good: +1 step',
  hard: 'last felt Hard: repeat',
  missed: 'last Missed: -10%',
  deload: 'deload week: 90%',
};
