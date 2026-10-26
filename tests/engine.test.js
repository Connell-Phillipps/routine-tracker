import { test, eq, ok, throws } from './harness.js';
import { DEFAULT_SETTINGS, SEED_EXERCISES } from '../js/config/program.js';
import { addDays, dateRange, diffDays, dow, weekStart } from '../js/util/dates.js';
import { nextWorkoutDate, phaseForDate, phaseInfo, plannedSessions, weekIndex, workoutForDate } from '../js/engine/calendar.js';
import { deloadValue, nextTarget, progressValue, setsReps } from '../js/engine/progression.js';
import { liftPace, longRunInfo } from '../js/engine/pace.js';
import { consistency, deriveDay, emptyDay, weekSessions } from '../js/engine/metrics.js';
import { extractJson, parseCoachReply, parseFoodReply, recoveryFlags, targetFor, upcomingSession } from '../js/engine/coach.js';
import { computeGame, levelFromXp, stageFor } from '../js/engine/game.js';
import { statLevelXp } from '../js/config/game.js';
import { choresForDate, environmentState } from '../js/engine/environment.js';

const settings = structuredClone(DEFAULT_SETTINGS);
const exById = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
let seq = 0;
const lift = (date, exerciseId, value, feel = null) => ({
  id: `l${++seq}`, date, exerciseId, value, feel, phase: phaseForDate(date, settings), ts: seq,
});
const makeState = (over = {}) => ({
  settings, days: new Map(), lifts: [], exercises: SEED_EXERCISES, tests: [], food: [],
  chores: [], choreLog: [], overrides: new Map(), ...over,
});
const daysMap = (list) => new Map(list.map((d) => [d.date, { ...emptyDay(d.date), ...d }]));

// ---------- dates ----------
test('dates: arithmetic across month ends and DST', () => {
  eq(addDays('2026-10-31', 1), '2026-11-01');
  eq(addDays('2026-03-28', 2), '2026-03-30'); // UK DST change
  eq(diffDays('2026-12-21', '2026-10-19'), 63);
  eq(dow('2026-10-19'), 0, 'Monday');
  eq(dow('2026-10-25'), 6, 'Sunday');
  eq(weekStart('2026-10-25'), '2026-10-19');
  eq(dateRange('2026-10-30', '2026-11-02').length, 4);
});

// ---------- phase calendar ----------
test('calendar: 10-week cycle of 4 build, deload, 4 strength, deload', () => {
  eq(phaseForDate('2026-10-19', settings), 'build');
  eq(phaseForDate('2026-10-26', settings), 'build');
  eq(phaseForDate('2026-11-16', settings), 'deload');
  eq(phaseForDate('2026-11-23', settings), 'strength');
  eq(phaseForDate('2026-12-20', settings), 'strength', 'Sunday of week 9');
  eq(phaseForDate('2026-12-21', settings), 'deload');
  eq(phaseForDate('2026-12-28', settings), 'build', 'cycle 2 starts');
  eq(phaseForDate('2026-10-18', settings), 'build', 'before start');
  eq(weekIndex('2026-10-25', settings.startDate), 0);
});

test('calendar: phase info reports week within phase', () => {
  const info = phaseInfo('2026-10-28', settings);
  eq([info.phase, info.phaseWeek, info.phaseLength, info.cycle], ['build', 2, 4, 1]);
  const s = phaseInfo('2026-11-25', settings);
  eq([s.phase, s.phaseWeek, s.phaseLength], ['strength', 1, 4]);
  eq(phaseInfo('2026-12-30', settings).cycle, 2);
});

test('calendar: manual phase overrides auto', () => {
  eq(phaseForDate('2026-10-26', { ...settings, phaseMode: 'manual', manualPhase: 'deload' }), 'deload');
});

test('calendar: paired days count 0.5 and the week plans 12 sessions', () => {
  eq(plannedSessions('2026-10-26'), 2, 'Mon');
  eq(plannedSessions('2026-10-28'), 1.5, 'Wed');
  eq(plannedSessions('2026-11-01'), 1.5, 'Sun');
  const week = dateRange('2026-10-26', '2026-11-01').reduce((s, d) => s + plannedSessions(d), 0);
  eq(week, 12);
  eq(workoutForDate('2026-10-27'), 'push');
  eq(workoutForDate('2026-10-29'), 'legs');
  eq(workoutForDate('2026-10-26'), null);
});

test('calendar: next session skips the paired partner day', () => {
  eq(nextWorkoutDate('2026-10-27', 'push'), '2026-11-03');
  eq(nextWorkoutDate('2026-10-28', 'legs'), '2026-11-04', 'Wed -> next Wed, not Thu');
  eq(nextWorkoutDate('2026-10-29', 'legs'), '2026-11-04');
  eq(nextWorkoutDate('2026-10-31', 'support'), '2026-11-07', 'Sat -> next Sat, not Sun');
  eq(nextWorkoutDate('2026-10-26', 'legs'), '2026-10-28');
});

// ---------- progression by feel ----------
test('progression: feel rules from the handover table', () => {
  eq(progressValue(50, 'easy', 5), 60, 'Easy +2 steps');
  eq(progressValue(50, 'good', 5), 55, 'Good +1 step');
  eq(progressValue(50, null, 5), 55, 'blank = Good');
  eq(progressValue(50, '', 5), 55, 'empty = Good');
  eq(progressValue(50, 'hard', 5), 50, 'Hard repeat');
  eq(progressValue(50, 'missed', 5), 45, 'Missed -10%');
  eq(progressValue(185, 'missed', 10), 170, '166.5 rounds to 170');
  eq(progressValue(10, 'good', 2.5), 12.5);
  eq(progressValue(8, 'missed', 1, { min: 1 }), 7, 'reps 7.2 -> 7');
});

test('progression: missed always drops at least one step', () => {
  eq(progressValue(5, 'missed', 1, { min: 1 }), 4, '4.5 would round back to 5');
  eq(progressValue(10, 'missed', 5), 5, '9 would round back to 10');
  eq(progressValue(1, 'missed', 1, { min: 1 }), 1, 'never below min');
});

test('progression: max cap (sprints cap 10)', () => {
  eq(progressValue(10, 'easy', 1, { max: 10 }), 10);
  eq(progressValue(9, 'easy', 1, { max: 10 }), 10);
});

test('progression: unknown feel throws', async () => {
  await throws(() => progressValue(50, 'meh', 5), /Unknown feel/);
});

test('deload: 90% rounded to the step, always lighter', () => {
  eq(deloadValue(50, 5), 45);
  eq(deloadValue(185, 10), 170);
  eq(deloadValue(25, 5), 20, '22.5 rounds to 25, so one step down');
  eq(deloadValue(5, 1, { min: 1 }), 4);
});

test('nextTarget: start value, then progression from history', () => {
  const ex = exById['incline-db-press'];
  eq(nextTarget(ex, [], 'build').value, 50);
  eq(nextTarget(ex, [], 'deload').value, 45);
  eq(nextTarget(ex, [lift('2026-10-20', ex.id, 50, 'easy')], 'build').value, 60);
});

test('nextTarget: deload weeks use 90% and never move the working weight', () => {
  const ex = exById['incline-db-press'];
  const history = [lift('2026-11-10', ex.id, 50, 'good'), lift('2026-11-17', ex.id, 45, 'easy')];
  eq(history[1].phase, 'deload');
  eq(nextTarget(ex, history.slice(0, 1), 'deload').value, 45, 'in deload: 90% of 50');
  eq(nextTarget(ex, history, 'strength').value, 55, 'after deload: progress from the 50 Good, not the 45');
});

test('definition of done: Tuesday push session gives correct next targets', () => {
  const tue = '2026-10-20';
  const logged = [
    lift(tue, 'incline-db-press', 50, 'easy'),
    lift(tue, 'seated-db-shoulder-press', 40, 'good'),
    lift(tue, 'weighted-dips', 10, 'hard'),
    lift(tue, 'cable-fly', 25, 'missed'),
    lift(tue, 'oh-cable-triceps', 50, null),
    lift(tue, 'db-around-the-world', 10, 'easy'),
    lift(tue, 'push-ups', 8, 'good'),
  ];
  const state = makeState({ lifts: logged });
  const next = nextWorkoutDate(tue, 'push');
  eq(next, '2026-10-27');
  const targets = logged.map((l) => targetFor(state, exById[l.exerciseId], next).value);
  eq(targets, [60, 45, 10, 20, 55, 15, 9]);
  const sr = targetFor(state, exById['incline-db-press'], next).setsReps;
  eq(sr, '4 × 6-8', 'main lift in build');
});

test('definition of done: push session before a deload week drops to 90%', () => {
  const tue = '2026-11-10'; // build week 4
  const logged = [lift(tue, 'incline-db-press', 50, 'easy'), lift(tue, 'seated-db-shoulder-press', 40, 'good')];
  const state = makeState({ lifts: logged });
  const next = nextWorkoutDate(tue, 'push');
  eq(phaseForDate(next, settings), 'deload');
  eq(logged.map((l) => targetFor(state, exById[l.exerciseId], next).value), [45, 35]);
  eq(targetFor(state, exById['incline-db-press'], next).setsReps, '2 × 6');
});

test('targetFor ignores entries on or after the session date', () => {
  const ex = exById['incline-db-press'];
  const state = makeState({ lifts: [lift('2026-10-27', ex.id, 50, 'easy')] });
  eq(targetFor(state, ex, '2026-10-27').value, 50, 'same-day entry is the session itself');
});

test('coach override replaces the target until the exercise is logged again', () => {
  const ex = exById['incline-db-press'];
  const state = makeState({ lifts: [lift('2026-10-20', ex.id, 50, 'good')] });
  state.overrides = new Map([[ex.id, { exerciseId: ex.id, value: 52.5, ts: seq + 0.5 }]]);
  eq(targetFor(state, ex, '2026-10-27').value, 52.5);
  state.lifts = [...state.lifts, lift('2026-10-27', ex.id, 52.5, 'good')];
  eq(targetFor(state, ex, '2026-11-03').value, 57.5, 'override used up');
});

test('sets x reps by type and phase', () => {
  eq(setsReps('compound', 'strength'), '4 × 5-7');
  eq(setsReps('sprint', 'deload'), 'Half reps at 90%');
});

// ---------- pace ----------
test('pace: building data until 2 sessions, then on/ahead/behind', () => {
  const ex = exById['incline-db-press'];
  eq(liftPace(ex, [lift('2026-10-20', ex.id, 50)], 'intermediate').status, 'building');
  // 2026-11-24 is a strength week, 35 days on: expected gain 50 x 3% x 1.15 months = 1.7 lb
  eq(liftPace(ex, [lift('2026-10-20', ex.id, 50), lift('2026-11-24', ex.id, 55)], 'intermediate').status, 'ahead');
  eq(liftPace(ex, [lift('2026-10-20', ex.id, 50), lift('2026-11-24', ex.id, 52)], 'intermediate').status, 'on');
  eq(liftPace(ex, [lift('2026-10-20', ex.id, 50), lift('2026-11-24', ex.id, 50)], 'intermediate').status, 'behind');
  eq(liftPace(ex, [lift('2026-10-20', ex.id, 50), lift('2026-11-17', ex.id, 45)], 'intermediate').status, 'building', 'deload entries ignored');
  const pogo = exById['pogo-jumps'];
  eq(liftPace(pogo, [lift('2026-10-21', pogo.id, 20), lift('2026-10-28', pogo.id, 25)], 'intermediate').status, 'tracking');
});

test('long run: +10% cap in build weeks, hold otherwise', () => {
  eq(longRunInfo([], settings, '2026-10-26').cap, 3, 'no runs: start distance');
  const info = longRunInfo([{ date: '2026-10-24', runMi: 3 }], settings, '2026-10-26');
  eq([info.cap, info.expected, info.longest], [3.3, 3.3, 3]);
  const deload = longRunInfo([{ date: '2026-11-14', runMi: 4 }], settings, '2026-11-16');
  eq([deload.cap, deload.expected], [4, 4.4]);
  eq(longRunInfo([{ date: '2026-10-24', runMi: 13 }], settings, '2026-10-26').cap, 13.1, 'capped at goal');
  eq(longRunInfo([{ date: '2026-09-01', runMi: 6 }], settings, '2026-10-26').longest, 0, 'older than 30 days');
});

// ---------- metrics ----------
test('deriveDay: lift auto-ticks from logged lifts, run from miles, goals from amounts', () => {
  const d = deriveDay({ ...emptyDay('2026-10-27'), runMi: 2, waterL: 3.5, proteinG: 150, sleepH: 8, pages: 12 },
    new Set(['2026-10-27']), settings.targets);
  eq(d.activities, { swim: false, lift: true, run: true, soccer: false, yoga: false });
  eq(d.habits, { read: true, journal: false, water: true, supplements: false, protein: false, sleep: true });
});

test('weekSessions: done counts capped per activity at weekly target', () => {
  const state = makeState({
    days: daysMap([
      { date: '2026-10-26', swim: true, soccer: true },
      { date: '2026-10-27', swim: true },
      { date: '2026-10-28', swim: true, yoga: true },
      { date: '2026-10-29', swim: true },
      { date: '2026-10-30', swim: true },
      { date: '2026-10-31', runMi: 5 },
    ]),
    lifts: [lift('2026-10-27', 'incline-db-press', 50)],
  });
  const w = weekSessions(state, '2026-10-29');
  eq(w.perActivity.swim, { done: 5, target: 4 });
  eq(w.done, 8, '4 swims (capped) + lift + soccer + yoga + run');
});

test('consistency: rate is done over planned for the last 14 days', () => {
  const state = makeState({ days: daysMap([{ date: '2026-10-26', soccer: true }]) });
  const soccer = consistency(state, '2026-11-01').find((r) => r.key === 'soccer');
  eq([soccer.done, soccer.planned, soccer.rate], [1, 2, 0.5]);
});

// ---------- coach ----------
test('recovery flags: 3 short nights, and Hard/Missed twice in a row', () => {
  const state = makeState({
    days: daysMap([{ date: '2026-10-24', sleepH: 6 }, { date: '2026-10-25', sleepH: 7 }, { date: '2026-10-26', sleepH: 6.5 }]),
    lifts: [lift('2026-10-13', 'back-squat', 185, 'hard'), lift('2026-10-20', 'back-squat', 185, 'missed')],
  });
  const kinds = recoveryFlags(state, '2026-10-26').map((f) => f.kind);
  eq(kinds, ['sleep', 'lift']);
  const rested = makeState({ days: daysMap([{ date: '2026-10-26', sleepH: 6 }]) });
  eq(recoveryFlags(rested, '2026-10-26').length, 0, 'missing nights do not count as short');
});

test('upcomingSession: skips today once logged, and skips paired partner', () => {
  const tue = makeState({ lifts: [lift('2026-10-27', 'incline-db-press', 50)] });
  eq(upcomingSession(tue, '2026-10-27').workout, 'legs');
  const wedDone = makeState({ lifts: [lift('2026-10-28', 'back-squat', 185)] });
  const s = upcomingSession(wedDone, '2026-10-29');
  eq([s.date, s.workout], ['2026-10-30', 'pull']);
});

test('extractJson tolerates fences, smart quotes, prose and trailing commas', async () => {
  eq(extractJson('Sure!\n```json\n{“a”: 1, "b": [1,2,],}\n```\nGood luck'), { a: 1, b: [1, 2] });
  await throws(() => extractJson('no json here'), /No JSON object/);
  await throws(() => extractJson('{"a": }'), /could not be read/);
  await throws(() => extractJson('  '), /Paste the reply/);
});

test('parseCoachReply matches exercises by id or name and reports bad items', () => {
  const state = makeState();
  const reply = JSON.stringify({
    lifts: [
      { exercise: 'incline-db-press', weight: 55, sets: 4, reps: '6-8', note: 'pause', rationale: 'easy last time' },
      { exercise: 'Back Squat', weight: '190' },
      { exercise: 'unicorn curl', weight: 10 },
      { exercise: 'lat-pulldown', weight: 'heavy' },
    ],
    summary: 'ok',
  });
  const r = parseCoachReply(reply, state);
  eq(r.items.map((i) => [i.exercise.id, i.value]), [['incline-db-press', 55], ['back-squat', 190]]);
  eq(r.errors.length, 2);
});

test('parseFoodReply reads estimates', async () => {
  const f = parseFoodReply('{"description":"Chicken rice","calories":650.4,"protein_g":48,"carbs_g":70,"fat_g":15,"confidence":"medium"}');
  eq([f.calories, f.proteinG, f.confidence], [650, 48, 'medium']);
  await throws(() => parseFoodReply('{"description":"x"}'), /no calories/);
});

// ---------- game ----------
test('game: level curve and daily caps', () => {
  eq(levelFromXp(49, statLevelXp).level, 1);
  eq(levelFromXp(50, statLevelXp).level, 2);
  const state = makeState({
    settings: { ...settings, startDate: '2026-10-26' },
    days: daysMap([{ date: '2026-10-26', pages: 100 }]),
  });
  const g = computeGame(state, '2026-10-26');
  eq(g.breakdown.INT, { pages: 40, readDay: 10 }, '100 pages capped at 40 XP');
});

test('game: PRs and progression hits from lift history', () => {
  const state = makeState({
    settings: { ...settings, startDate: '2026-10-20' },
    lifts: [lift('2026-10-20', 'incline-db-press', 50), lift('2026-10-27', 'incline-db-press', 55)],
  });
  const g = computeGame(state, '2026-10-28');
  eq(g.progress.prs, 1);
  eq(g.breakdown.STR, { liftPR: 15, liftProgress: 5, liftEntry: 20 });
});

test('game: warm-up ramps in one day earn at most one PR and one progression', () => {
  const state = makeState({
    settings: { ...settings, startDate: '2026-10-20' },
    lifts: [
      lift('2026-10-20', 'back-squat', 185),
      lift('2026-10-27', 'back-squat', 135), lift('2026-10-27', 'back-squat', 165),
      lift('2026-10-27', 'back-squat', 190), lift('2026-10-27', 'back-squat', 195),
    ],
  });
  const g = computeGame(state, '2026-10-28');
  eq(g.progress.prs, 1);
  eq([g.breakdown.STR.liftPR, g.breakdown.STR.liftProgress], [15, 5]);
});

test('game: evolution needs both level and goals, in order', () => {
  eq(stageFor(4, { weeklyTargetsHit: 0 }).current.stage, 1);
  eq(stageFor(4, { weeklyTargetsHit: 1 }).current.stage, 2);
  eq(stageFor(30, { weeklyTargetsHit: 1 }).current.stage, 2, 'stage 3 needs PRs');
  eq(stageFor(30, { weeklyTargetsHit: 20, prs: 40, bestReadStreak: 30 }).current.stage, 5);
});

test('game: a missed week never lowers stats', () => {
  const state = makeState({ settings: { ...settings, startDate: '2026-10-19' }, days: daysMap([{ date: '2026-10-19', swim: true }]) });
  const early = computeGame(state, '2026-10-19').totals.END;
  const later = computeGame(state, '2026-11-09').totals.END;
  eq(early, later);
});

// ---------- environment ----------
test('environment: slow decay after a week, instant recovery', () => {
  const log = [{ id: 'c1', choreId: 'x', frequency: 'daily', date: '2026-10-01' }];
  eq(environmentState(log, '2026-10-07').drop, 0);
  eq(environmentState(log, '2026-10-08').drop, 1);
  const messy = environmentState(log, '2026-10-15');
  eq([messy.drop, messy.condition], [2, 'Messy']);
  eq(environmentState(log, '2026-12-31').drop, 2, 'max drop');
  const back = environmentState([...log, { id: 'c2', choreId: 'x', frequency: 'weekly', date: '2026-10-15' }], '2026-10-15');
  eq([back.drop, back.points], [0, 20]);
});

test('chores: weekly done once per week, one-offs hidden after the day done', () => {
  const chores = [
    { id: 'w', name: 'Laundry', frequency: 'weekly' },
    { id: 'o', name: 'Renew passport', frequency: 'once' },
  ];
  const log = [
    { id: 'a', choreId: 'w', date: '2026-10-26' },
    { id: 'b', choreId: 'o', date: '2026-10-26' },
  ];
  const sun = choresForDate(chores, log, '2026-11-01');
  eq(sun.map((c) => [c.chore.id, !!c.done]), [['w', true]]);
  const nextMon = choresForDate(chores, log, '2026-11-02');
  eq(nextMon.map((c) => [c.chore.id, !!c.done]), [['w', false]]);
  eq(choresForDate(chores, log, '2026-10-26').length, 2, 'one-off still shown on the day');
});

ok(true);
