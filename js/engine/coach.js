// On-device rules coach (handover 8.1) and the "Ask Claude" copy/paste bridge (8.2).
import { PHASE_LABELS, WORKOUTS } from '../config/program.js';
import { addDays, dateRange, dayKey } from '../util/dates.js';
import { phaseForDate, phaseInfo, scheduleFor, workoutForDate } from './calendar.js';
import { computeDashboard, liftsByExercise } from './metrics.js';
import { nextTarget, setsReps } from './progression.js';

const SLEEP_FLAG_NIGHTS = 3;

export function workoutExercises(state, workout) {
  return state.exercises.filter((e) => e.workout === workout && !e.archived).sort((a, b) => a.order - b.order);
}

/** An accepted coach override counts until the exercise is next logged after it. */
export function activeOverride(state, exerciseId) {
  const o = state.overrides.get(exerciseId);
  if (!o) return null;
  const usedUp = state.lifts.some((e) => e.exerciseId === exerciseId && e.ts > o.ts);
  return usedUp ? null : o;
}

/** Target for an exercise on a date: rules from the entries before it, then any override. */
export function targetFor(state, exercise, date, byExercise = liftsByExercise(state.lifts)) {
  const history = (byExercise.get(exercise.id) || []).filter((e) => e.date < date);
  const phase = phaseForDate(date, state.settings);
  const rules = nextTarget(exercise, history, phase);
  const override = activeOverride(state, exercise.id);
  const repsAim = override ? null : rules.reps;
  return {
    value: override ? override.value : rules.value,
    rules,
    override,
    phase,
    setsReps: override?.sets ? `${override.sets} × ${override.reps ?? ''}`.trim() : setsReps(exercise.type, phase),
    /** Per-set rep goal for loaded lifts, e.g. "aim 7 reps a set". Empty for other kinds. */
    aim: repsAim ? `aim ${repsAim} reps a set` : '',
    last: history[history.length - 1] || null,
  };
}

/** Today's workout if it is not logged yet, otherwise the next planned one. */
export function upcomingSession(state, today) {
  const byEx = liftsByExercise(state.lifts);
  for (let i = 0; i <= 7; i += 1) {
    const date = addDays(today, i);
    const workout = workoutForDate(date);
    if (!workout) continue;
    const exercises = workoutExercises(state, workout);
    const loggedOn = (d) => exercises.some((ex) => (byEx.get(ex.id) || []).some((e) => e.date === d));
    if (loggedOn(date)) continue;
    // Thu/Sun share the Wed/Sat session: skip it when the partner day was logged.
    const prev = addDays(date, -1);
    if (scheduleFor(date).pairedWith === dayKey(prev) && loggedOn(prev)) continue;
    return {
      date,
      workout,
      phase: phaseForDate(date, state.settings),
      items: exercises.map((ex) => ({ exercise: ex, ...targetFor(state, ex, date, byEx) })),
    };
  }
  return null;
}

export function recoveryFlags(state, today) {
  const flags = [];
  const target = state.settings.targets.sleepH;
  const nights = dateRange(addDays(today, -(SLEEP_FLAG_NIGHTS - 1)), today).map((d) => state.days.get(d)?.sleepH);
  if (nights.every((h) => h != null && h < target)) {
    flags.push({
      kind: 'sleep',
      text: `Sleep under ${target} h for ${SLEEP_FLAG_NIGHTS}+ nights. Consider repeating weights this session instead of adding.`,
    });
  }
  const byEx = liftsByExercise(state.lifts);
  for (const ex of state.exercises) {
    const entries = byEx.get(ex.id) || [];
    const lastTwo = entries.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((e) => e.feel === 'hard' || e.feel === 'missed')) {
      flags.push({
        kind: 'lift',
        exerciseId: ex.id,
        text: `${ex.name}: Hard or Missed twice in a row. Repeat the weight, or take a deload if other lifts feel the same.`,
      });
    }
  }
  return flags;
}

export function weeklyReview(state, today) {
  const dash = computeDashboard(state, today);
  const info = phaseInfo(today, state.settings);
  const weekFrom = addDays(today, -6);
  const recent = state.lifts.filter((e) => e.date >= weekFrom && e.date <= today);
  const feel = { easy: 0, good: 0, hard: 0, missed: 0 };
  for (const e of recent) feel[e.feel || 'good'] += 1;
  const lines = [
    `${PHASE_LABELS[info.phase]} phase${info.phaseWeek ? `, week ${info.phaseWeek} of ${info.phaseLength}` : ''}.`,
    `Sessions this week: ${dash.week.done} of ${dash.week.target}.`,
    `Habits last 7 days: ${Math.round(dash.habits7.rate * 100)}%.`,
    `Reading days this week: ${dash.reading.days} of ${dash.reading.target} (${dash.reading.pages} pages).`,
    `Lift sets logged in the last 7 days: ${recent.length} (Easy ${feel.easy}, Good ${feel.good}, Hard ${feel.hard}, Missed ${feel.missed}).`,
    `Lifts on pace: ${dash.lifts.onPace} of ${dash.lifts.measured} measured.`,
    `Next long run: up to ${dash.longRun.cap} mi (longest in 30 days: ${dash.longRun.longest || 0} mi).`,
    dash.focus,
  ];
  return { lines, dash, flags: recoveryFlags(state, today) };
}

function recentLiftLines(state, exercises, perExercise = 4) {
  const byEx = liftsByExercise(state.lifts);
  return exercises.map((ex) => {
    const entries = (byEx.get(ex.id) || []).slice(-perExercise);
    const hist = entries.length
      ? entries.map((e) => `${e.date} ${e.value} ${e.feel || 'good'}${e.reps ? ` ${e.reps}` : ''}${e.phase === 'deload' ? ' (deload)' : ''}`).join('; ')
      : 'no entries yet';
    return `- ${ex.id} | ${ex.name} | ${ex.type} | unit ${ex.unit} | step ${ex.step} | ${hist}`;
  });
}

function bodyWeightLine(state, today) {
  const weights = dateRange(addDays(today, -27), today)
    .map((d) => state.days.get(d))
    .filter((d) => d?.bodyWeight);
  if (!weights.length) return `Body weight: not logged in 28 days (start ${state.settings.startBodyWeight} lb).`;
  return `Body weight (28 days): ${weights.map((d) => `${d.date} ${d.bodyWeight}`).join(', ')}.`;
}

function sleepLine(state, today) {
  const nights = dateRange(addDays(today, -6), today).map((d) => state.days.get(d)?.sleepH).filter((h) => h != null);
  if (!nights.length) return 'Sleep: not logged this week.';
  const avg = nights.reduce((a, b) => a + b, 0) / nights.length;
  return `Sleep last 7 days: average ${avg.toFixed(1)} h over ${nights.length} nights (target ${state.settings.targets.sleepH} h).`;
}

/** Compact prompt for the Claude app. Asks for a fixed JSON reply the app can import. */
export function buildCoachPrompt(state, today) {
  const session = upcomingSession(state, today);
  const review = weeklyReview(state, today);
  const info = phaseInfo(today, state.settings);
  const exercises = session ? session.items.map((i) => i.exercise) : [];
  const planLines = session
    ? session.items.map((i, n) => `- ${n + 1}. ${i.exercise.id}: ${i.rules.value} ${i.exercise.unit}, ${i.setsReps}${i.aim ? ` (${i.aim})` : ''}`)
    : ['- no lift session in the next 7 days'];
  return [
    'You are my strength and conditioning coach. Review my training data and suggest my next lift session.',
    '',
    `Today: ${today}. Training level: ${state.settings.level}. Phase: ${PHASE_LABELS[info.phase]}${info.phaseWeek ? ` week ${info.phaseWeek}/${info.phaseLength}` : ''}.`,
    session ? `Next session: ${WORKOUTS[session.workout].name} on ${session.date} (${PHASE_LABELS[session.phase]} week).` : '',
    '',
    'My progression rules (follow them unless there is a clear reason not to, and say why):',
    '- Loaded lifts use double progression: add reps within the phase rep range, add load only when every set hits the top of the range.',
    '- Feel = reps in reserve: Easy 3+, Good 1-2, Hard 0 or a grind, Missed short. Easy may add 2 steps only if that is under 5% (upper) or 10% (lower body). Missed: -10%.',
    '- Explosive work (plyo, power, sprint) adds 1 step at most. Rep-count exercises add reps by feel.',
    '- Deload weeks: 90% load and about half the sets. New phase: load re-based from estimated 1RM (Epley).',
    '- 10-week cycle: 4 Build, Deload, 4 Strength, Deload. Keep the exercise order: explosive, heavy compound, compound, isolation, core.',
    '',
    'Recent lifts (id | name | type | unit | step | date value feel reps):',
    ...recentLiftLines(state, exercises),
    '',
    'Rules-based plan from my app:',
    ...planLines,
    '',
    ...review.lines,
    ...review.flags.map((f) => `Flag: ${f.text}`),
    sleepLine(state, today),
    bodyWeightLine(state, today),
    '',
    'Reply with ONLY this JSON, no other text:',
    '{"workout":"<push|pull|legs|support>","lifts":[{"exercise":"<id from the list>","weight":<number in that unit>,"sets":<number>,"reps":"<e.g. 6-8>","note":"<short cue>","rationale":"<one sentence>"}],"summary":"<two sentences>"}',
  ].filter((l) => l !== null).join('\n');
}

export const FOOD_PROMPT = [
  'Estimate the nutrition of the meal in this photo. Be realistic about portion sizes.',
  'Reply with ONLY this JSON, no other text:',
  '{"description":"<short name of the meal>","calories":<number>,"protein_g":<number>,"carbs_g":<number>,"fat_g":<number>,"confidence":"<low|medium|high>"}',
].join('\n');

/**
 * Pulls a JSON object out of a pasted reply. Tolerates code fences, text around the
 * JSON, smart quotes and trailing commas. Throws an Error with a readable message.
 */
export function extractJson(text) {
  if (!text || !text.trim()) throw new Error('Paste the reply from Claude first.');
  const cleaned = text
    .replace(/```(?:json)?/gi, '')
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’]/g, "'");
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found. The reply should contain { ... }.');
  const body = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(`The JSON could not be read (${err.message}). Ask Claude to reply with only the JSON.`);
  }
}

const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Validates a coach reply against the exercise library. Returns { items, errors, summary }. */
export function parseCoachReply(text, state) {
  const data = extractJson(text);
  if (!Array.isArray(data.lifts)) throw new Error('The reply has no "lifts" list.');
  const byKey = new Map();
  for (const ex of state.exercises) {
    byKey.set(ex.id.toLowerCase(), ex);
    byKey.set(ex.name.toLowerCase(), ex);
  }
  const items = [];
  const errors = [];
  data.lifts.forEach((l, i) => {
    const key = String(l.exercise ?? l.id ?? l.name ?? '').trim().toLowerCase();
    const ex = byKey.get(key);
    const value = toNumber(l.weight ?? l.value);
    if (!ex) { errors.push(`Item ${i + 1}: unknown exercise "${l.exercise ?? ''}".`); return; }
    if (!Number.isFinite(value) || value < 0) { errors.push(`${ex.name}: weight is not a valid number.`); return; }
    const sets = toNumber(l.sets);
    items.push({
      exercise: ex,
      value,
      sets: Number.isFinite(sets) && sets > 0 ? Math.round(sets) : null,
      reps: l.reps != null ? String(l.reps) : null,
      note: l.note ? String(l.note) : '',
      rationale: l.rationale ? String(l.rationale) : '',
    });
  });
  if (!items.length && !errors.length) errors.push('The "lifts" list is empty.');
  return { items, errors, summary: data.summary ? String(data.summary) : '' };
}

export function parseFoodReply(text) {
  const data = extractJson(text);
  const num = (k) => {
    const v = toNumber(data[k]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  };
  const result = {
    description: data.description ? String(data.description).slice(0, 120) : 'Meal',
    calories: num('calories'),
    proteinG: num('protein_g') ?? num('protein'),
    carbsG: num('carbs_g') ?? num('carbs'),
    fatG: num('fat_g') ?? num('fat'),
    confidence: ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : null,
  };
  if (result.calories == null && result.proteinG == null) throw new Error('The reply has no calories or protein values.');
  return result;
}
