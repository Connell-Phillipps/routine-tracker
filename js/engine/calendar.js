// Phase calendar and weekly schedule.
import { CYCLE, SCHEDULE, WORKOUTS } from '../config/program.js';
import { addDays, dayKey, diffDays, weekStart } from '../util/dates.js';

/** Zero-based training week of a date, counted in Monday-start weeks from the start date. */
export function weekIndex(iso, startDate) {
  return Math.floor(diffDays(weekStart(iso), weekStart(startDate)) / 7);
}

export function phaseForDate(iso, settings) {
  if (settings.phaseMode === 'manual') return settings.manualPhase;
  const w = weekIndex(iso, settings.startDate);
  if (w < 0) return 'build';
  return CYCLE[w % CYCLE.length];
}

/** Where a date sits in the cycle: phase, week of the phase, cycle number. */
export function phaseInfo(iso, settings) {
  const phase = phaseForDate(iso, settings);
  const w = Math.max(0, weekIndex(iso, settings.startDate));
  if (settings.phaseMode === 'manual') {
    return { phase, week: w + 1, cycle: null, cycleWeek: null, phaseWeek: null, phaseLength: null };
  }
  const cycleWeek = w % CYCLE.length;
  let blockStart = cycleWeek;
  while (blockStart > 0 && CYCLE[blockStart - 1] === phase) blockStart -= 1;
  let blockEnd = cycleWeek;
  while (blockEnd < CYCLE.length - 1 && CYCLE[blockEnd + 1] === phase) blockEnd += 1;
  return {
    phase,
    week: w + 1,
    cycle: Math.floor(w / CYCLE.length) + 1,
    cycleWeek: cycleWeek + 1,
    phaseWeek: cycleWeek - blockStart + 1,
    phaseLength: blockEnd - blockStart + 1,
  };
}

export function scheduleFor(iso) {
  return SCHEDULE[dayKey(iso)];
}

/** Planned sessions on a date; paired days count 0.5 per activity. */
export function plannedSessions(iso) {
  return Object.values(scheduleFor(iso).plan).reduce((a, b) => a + b, 0);
}

export function plannedFor(iso, activity) {
  return scheduleFor(iso).plan[activity] || 0;
}

export function workoutForDate(iso) {
  return scheduleFor(iso).lift;
}

/**
 * Date of the next `workout` session after one done on `iso`. The paired partner day
 * (Thu after Wed, Sun after Sat) is the same session, so it is skipped.
 */
export function nextWorkoutDate(iso, workout) {
  if (!WORKOUTS[workout]) return null;
  const partner = scheduleFor(iso).pairedWith;
  for (let i = 1; i <= 8; i += 1) {
    const d = addDays(iso, i);
    if (i === 1 && dayKey(d) === partner) continue;
    if (workoutForDate(d) === workout) return d;
  }
  return null;
}
