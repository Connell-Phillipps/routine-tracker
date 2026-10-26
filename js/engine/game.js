// Character XP engine. Everything is derived from the logs, so stats can never be farmed
// past the daily caps and never go down: a missed week simply earns nothing.
import {
  STAGES, STATS, WEEKLY_BONUSES, XP_RULES, overallLevelXp, statLevelXp,
} from '../config/game.js';
import { addDays, dateRange, weekStart } from '../util/dates.js';
import { deriveDay, emptyDay, habitRate, liftDateSet, readingWeek, weekSessions } from './metrics.js';

const STAT_KEYS = Object.keys(STATS);

export function levelFromXp(xp, xpForLevel) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, into: xp - floor, span: next - floor, progress: (xp - floor) / (next - floor) };
}

function award(events, date, source, amount) {
  if (amount <= 0) return;
  const rule = XP_RULES[source];
  events.push({ date, stat: rule.stat, source, xp: amount });
}

const capped = (source, raw) => {
  const cap = XP_RULES[source].dailyCap;
  return cap == null ? raw : Math.min(cap, raw);
};

/**
 * Lift XP plus PR and progression counts. Walks entries in time order per exercise and
 * compares against previous days only, so warm-up ramps within a day cannot farm PRs:
 * at most one PR and one progression hit per exercise per day.
 */
function scoreLifts(lifts, events) {
  const sorted = [...lifts].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  const best = new Map(); // best value before the current day
  const lastWorking = new Map(); // last non-deload day's top value
  const perDay = new Map();
  const dayTop = new Map(); // `${exerciseId}|${date}` -> { value, deload }
  for (const e of sorted) {
    perDay.set(e.date, (perDay.get(e.date) || 0) + 1);
    const k = `${e.exerciseId}|${e.date}`;
    const top = dayTop.get(k);
    if (!top || e.value > top.value) dayTop.set(k, { exerciseId: e.exerciseId, date: e.date, value: e.value, deload: e.phase === 'deload' });
  }
  let prs = 0;
  for (const t of dayTop.values()) { // insertion order = date order per exercise
    const prevBest = best.get(t.exerciseId);
    if (prevBest != null && t.value > prevBest) {
      prs += 1;
      award(events, t.date, 'liftPR', XP_RULES.liftPR.xp);
    }
    best.set(t.exerciseId, Math.max(prevBest ?? -Infinity, t.value));
    if (!t.deload) {
      const prev = lastWorking.get(t.exerciseId);
      if (prev != null && t.value > prev) award(events, t.date, 'liftProgress', XP_RULES.liftProgress.xp);
      lastWorking.set(t.exerciseId, t.value);
    }
  }
  for (const [date, count] of perDay) award(events, date, 'liftEntry', capped('liftEntry', count * XP_RULES.liftEntry.xp));
  return prs;
}

function scoreDay(date, day, derived, foodCount, events) {
  const a = derived.activities;
  const h = derived.habits;
  award(events, date, 'pages', capped('pages', Math.floor((day.pages || 0) * XP_RULES.pages.xp)));
  if (h.read) award(events, date, 'readDay', XP_RULES.readDay.xp);
  if (h.journal) award(events, date, 'journal', XP_RULES.journal.xp);
  for (const act of ['swim', 'run', 'soccer', 'yoga']) if (a[act]) award(events, date, act, XP_RULES[act].xp);
  if (day.runMi > 0) award(events, date, 'runMiles', capped('runMiles', Math.round(day.runMi * XP_RULES.runMiles.xp)));
  for (const hab of ['water', 'protein', 'supplements', 'sleep']) if (h[hab]) award(events, date, hab, XP_RULES[hab].xp);
  if (foodCount) award(events, date, 'food', capped('food', foodCount * XP_RULES.food.xp));
}

function readStreaks(rows) {
  let best = 0;
  let run = 0;
  for (const r of rows) {
    run = r.read ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // Today not read yet does not break the current streak.
  let current = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].read) current += 1;
    else if (i !== rows.length - 1) break;
  }
  return { best, current };
}

function firstDate(state, today) {
  const candidates = [state.settings.startDate, ...state.days.keys(), ...state.lifts.map((e) => e.date)];
  const first = candidates.filter(Boolean).sort()[0] || today;
  return first > today ? today : first;
}

export function stageFor(level, progress) {
  let current = STAGES[0];
  for (const s of STAGES) {
    const reqOk = Object.entries(s.req).every(([k, v]) => (progress[k] || 0) >= v);
    if (level >= s.minLevel && reqOk) current = s;
    else break; // stages unlock in order
  }
  const next = STAGES.find((s) => s.stage === current.stage + 1) || null;
  return { current, next };
}

export function computeGame(state, today) {
  const events = [];
  const liftDates = liftDateSet(state.lifts);
  const foodPerDay = new Map();
  for (const f of state.food) foodPerDay.set(f.date, (foodPerDay.get(f.date) || 0) + 1);

  const prs = scoreLifts(state.lifts.filter((e) => e.date <= today), events);
  const start = firstDate(state, today);
  const dates = dateRange(start, today);
  const readRows = [];
  for (const date of dates) {
    const day = state.days.get(date) || emptyDay(date);
    const derived = deriveDay(day, liftDates, state.settings.targets);
    readRows.push({ date, read: derived.habits.read });
    scoreDay(date, day, derived, foodPerDay.get(date) || 0, events);
  }

  let weeklyTargetsHit = 0;
  const bonusesHit = [];
  for (let ws = weekStart(start); ws <= today; ws = addDays(ws, 7)) {
    const sessions = weekSessions(state, ws).done;
    const w = {
      sessions,
      readDays: readingWeek(state, ws).days,
      habitRate: habitRate(state, addDays(ws, 6), 7).rate,
    };
    if (sessions >= 12) weeklyTargetsHit += 1;
    const awardDate = addDays(ws, 6) < today ? addDays(ws, 6) : today;
    for (const b of WEEKLY_BONUSES) {
      if (!b.test(w)) continue;
      bonusesHit.push({ week: ws, id: b.id, label: b.label });
      for (const [stat, xp] of Object.entries(b.award)) events.push({ date: awardDate, stat, source: `bonus:${b.id}`, xp });
    }
  }

  const totals = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const breakdown = Object.fromEntries(STAT_KEYS.map((k) => [k, {}]));
  for (const ev of events) {
    totals[ev.stat] += ev.xp;
    breakdown[ev.stat][ev.source] = (breakdown[ev.stat][ev.source] || 0) + ev.xp;
  }
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, levelFromXp(totals[k], statLevelXp)]));
  const totalXp = STAT_KEYS.reduce((s, k) => s + totals[k], 0);
  const overall = levelFromXp(totalXp, overallLevelXp);
  const streaks = readStreaks(readRows);
  const progress = { weeklyTargetsHit, prs, bestReadStreak: streaks.best };
  const { current, next } = stageFor(overall.level, progress);

  return { stats, totals, totalXp, overall, stage: current, nextStage: next, progress, streaks, breakdown, events, bonusesHit };
}

/** Cumulative XP per date for one stat, for the progression chart. */
export function statHistory(events, stat) {
  const perDate = new Map();
  for (const ev of events) if (ev.stat === stat) perDate.set(ev.date, (perDate.get(ev.date) || 0) + ev.xp);
  const dates = [...perDate.keys()].sort();
  let sum = 0;
  return dates.map((date) => {
    sum += perDate.get(date);
    return { date, value: sum };
  });
}

export function sourceLabel(source) {
  if (source.startsWith('bonus:')) {
    const b = WEEKLY_BONUSES.find((x) => `bonus:${x.id}` === source);
    return b ? `Bonus: ${b.label}` : 'Weekly bonus';
  }
  return XP_RULES[source]?.label || source;
}
