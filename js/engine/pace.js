// "On pace" status against expected progress rates (handover 4.8), and the long-run cap.
import { PACE_RATES } from '../config/program.js';
import { addDays, diffDays } from '../util/dates.js';
import { phaseForDate, weekIndex } from './calendar.js';

const DAYS_PER_MONTH = 30.44;
const AHEAD_RATIO = 1.5;
const ON_PACE_RATIO = 0.9;

export const PACE_LABELS = {
  building: 'Building data',
  ahead: 'Ahead',
  on: 'On pace',
  behind: 'Behind',
  tracking: 'Tracking',
};

function rateCategory(exercise) {
  if (exercise.type === 'main' || exercise.type === 'compound' || exercise.type === 'power') return 'strength';
  if (exercise.type === 'isolation') return 'isolation';
  if (exercise.type === 'bodyweight' && exercise.unit === 'reps') return 'bwReps';
  if (exercise.type === 'bodyweight') return 'strength'; // weighted bodyweight, e.g. pull-ups in lb added
  return null; // plyometric and sprint have no rate in the sheet
}

function statusFromRatio(actual, expected) {
  if (expected <= 0) return actual >= 0 ? 'on' : 'behind';
  const ratio = actual / expected;
  if (ratio >= AHEAD_RATIO) return 'ahead';
  if (ratio >= ON_PACE_RATIO) return 'on';
  return 'behind';
}

/**
 * Change since first logged vs expected for the elapsed time.
 * `entries` are one exercise's lift entries, oldest first. Deload entries are ignored.
 */
export function liftPace(exercise, entries, level) {
  const working = entries.filter((e) => e.phase !== 'deload');
  if (working.length < 2) return { status: 'building', label: PACE_LABELS.building };
  const first = working[0];
  const last = working[working.length - 1];
  const category = rateCategory(exercise);
  const actual = last.value - first.value;
  if (!category) return { status: 'tracking', label: PACE_LABELS.tracking, actual, expected: null };
  const months = diffDays(last.date, first.date) / DAYS_PER_MONTH;
  const rate = PACE_RATES[category][level];
  const expected = category === 'bwReps' ? rate * months : first.value * rate * months;
  const status = statusFromRatio(actual, expected);
  return { status, label: PACE_LABELS[status], actual, expected, first, last };
}

/** Pace for a measured test (vertical jump, sprint, swim, 5K). Faster = lower for timed tests. */
export function testPace(test, entries, level) {
  if (entries.length < 2) return { status: 'building', label: PACE_LABELS.building };
  const first = entries[0];
  const last = entries[entries.length - 1];
  const months = diffDays(last.date, first.date) / DAYS_PER_MONTH;
  const rate = PACE_RATES[test.rate][level];
  const expected = first.value * rate * months;
  const actual = test.lowerIsBetter ? first.value - last.value : last.value - first.value;
  const status = statusFromRatio(actual, expected);
  return { status, label: PACE_LABELS[status], actual, expected };
}

/** Body weight vs the lean-bulk rate, from logged daily weights (oldest first). */
export function bodyWeightPace(weights, settings) {
  if (weights.length < 2) return { status: 'building', label: PACE_LABELS.building };
  const first = weights[0];
  const last = weights[weights.length - 1];
  const weeks = diffDays(last.date, first.date) / 7;
  const expected = first.value * PACE_RATES.bodyWeight[settings.level] * weeks;
  const actual = last.value - first.value;
  const status = statusFromRatio(actual, expected);
  return { status, label: PACE_LABELS[status], actual, expected, first, last };
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Long-run guidance: the cap for the next long run (+10% over the longest run in the last
 * 30 days, build weeks only) and the expected long run for where the plan is now.
 */
export function longRunInfo(days, settings, iso) {
  const { startMi, goalMi, buildIncrease } = settings.longRun;
  const from = addDays(iso, -29);
  let longest = 0;
  for (const d of days) {
    if (d.date >= from && d.date <= iso && d.runMi > longest) longest = d.runMi;
  }
  const phase = phaseForDate(iso, settings);
  let cap;
  if (!longest) cap = startMi;
  else if (phase === 'build') cap = longest * (1 + buildIncrease);
  else cap = longest; // strength and deload weeks hold distance
  cap = Math.min(goalMi, round1(cap));

  let buildWeeks = 0;
  const weeksElapsed = weekIndex(iso, settings.startDate);
  for (let w = 0; w < weeksElapsed; w += 1) {
    if (phaseForDate(addDays(settings.startDate, w * 7), settings) === 'build') buildWeeks += 1;
  }
  const expected = Math.min(goalMi, round1(startMi * (1 + buildIncrease) ** buildWeeks));
  return { longest: round1(longest), cap, expected, goal: goalMi, phase };
}
