// Chores and the home environment. Chores never touch character stats.
import { ENVIRONMENT } from '../config/game.js';
import { addDays, diffDays, weekStart } from '../util/dates.js';

/** The chore-log entry that marks a chore done for `date`, if any. */
export function completionFor(chore, choreLog, date) {
  const logs = choreLog.filter((l) => l.choreId === chore.id);
  if (chore.frequency === 'daily') return logs.find((l) => l.date === date) || null;
  if (chore.frequency === 'weekly') {
    const ws = weekStart(date);
    const we = addDays(ws, 6);
    return logs.find((l) => l.date >= ws && l.date <= we) || null;
  }
  return logs[0] || null; // one-off
}

/** Chores to show for a date, with done state. One-offs done on an earlier day are hidden. */
export function choresForDate(chores, choreLog, date) {
  return chores
    .filter((c) => !c.archived)
    .map((c) => ({ chore: c, done: completionFor(c, choreLog, date) }))
    .filter(({ chore, done }) => !(chore.frequency === 'once' && done && done.date < date));
}

export function environmentState(choreLog, today) {
  const { points: pointRules, levels, decay } = ENVIRONMENT;
  const past = choreLog.filter((l) => l.date <= today);
  const points = past.reduce((s, l) => s + (pointRules[l.frequency] ?? pointRules.once), 0);
  let base = levels[0];
  for (const l of levels) if (points >= l.minPoints) base = l;
  const next = levels.find((l) => l.level === base.level + 1) || null;

  const lastDate = past.map((l) => l.date).sort().pop() || null;
  const daysSince = lastDate ? diffDays(today, lastDate) : null;
  let drop = 0;
  if (daysSince != null && daysSince >= decay.graceDays) {
    drop = Math.min(decay.maxDrop, 1 + Math.floor((daysSince - decay.graceDays) / decay.stepDays));
  }
  const effectiveLevel = Math.max(1, base.level - drop);
  const condition = drop === 0 ? 'Tidy' : drop === 1 ? 'Untidy' : 'Messy';
  return { points, base, next, lastDate, daysSince, drop, mess: drop, effectiveLevel, condition };
}
