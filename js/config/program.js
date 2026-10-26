// Training program seed data, ported from the "Training Tracker" Google Sheet
// (Program and Lifting Log tabs). Settings and the exercise library are copied into
// IndexedDB on first run and are editable in the app after that.

export const DEFAULT_SETTINGS = {
  startDate: '2026-10-19',
  phaseMode: 'auto', // 'auto' follows CYCLE, 'manual' uses manualPhase
  manualPhase: 'build',
  level: 'intermediate', // beginner | intermediate | advanced
  targets: {
    waterL: 3.5,
    proteinG: 160,
    sleepH: 8,
    pages: 10,
    readDays: 5,
    readDaysStretch: 6,
  },
  startBodyWeight: 179,
  longRun: { startMi: 3, goalMi: 13.1, buildIncrease: 0.1 },
  supplements: [], // optional named list, e.g. ['Creatine', 'Vitamin D']
  lastBackup: null, // ISO timestamp of the last export
  seenStage: 1, // last evolution stage shown, so the evolution animation plays once
};

// 10-week cycle: 4 Build, Deload, 4 Strength, Deload.
export const CYCLE = [
  'build', 'build', 'build', 'build', 'deload',
  'strength', 'strength', 'strength', 'strength', 'deload',
];

export const PHASE_LABELS = { build: 'Build', strength: 'Strength', deload: 'Deload' };

export const ACTIVITIES = ['swim', 'lift', 'run', 'soccer', 'yoga'];
export const ACTIVITY_LABELS = { swim: 'Swim', lift: 'Lift', run: 'Run', soccer: 'Soccer', yoga: 'Yoga' };

export const WEEKLY_TARGETS = { swim: 4, lift: 4, run: 1, soccer: 1, yoga: 2 };
export const WEEKLY_SESSION_TARGET = 12;

// Planned sessions per weekday. Paired days (Wed/Thu, Sat/Sun) share one session,
// so each day carries 0.5. Swim on Wed/Thu is treated as paired too: that is the
// only way the sheet's 4 swims/week target adds up with swims on Mon-Fri.
export const SCHEDULE = {
  mon: { plan: { swim: 1, soccer: 1 }, lift: null },
  tue: { plan: { swim: 1, lift: 1 }, lift: 'push' },
  wed: { plan: { swim: 0.5, lift: 0.5, yoga: 0.5 }, lift: 'legs', pairedWith: 'thu' },
  thu: { plan: { swim: 0.5, lift: 0.5, yoga: 0.5 }, lift: 'legs', pairedWith: 'wed' },
  fri: { plan: { swim: 1, lift: 1 }, lift: 'pull' },
  sat: { plan: { lift: 0.5, run: 0.5, yoga: 0.5 }, lift: 'support', pairedWith: 'sun' },
  sun: { plan: { lift: 0.5, run: 0.5, yoga: 0.5 }, lift: 'support', pairedWith: 'sat', optional: ['swim'] },
};

export const WORKOUTS = {
  push: { name: 'Push', when: 'Tue' },
  pull: { name: 'Pull', when: 'Fri' },
  legs: { name: 'Legs', when: 'Wed or Thu' },
  support: { name: 'Support', when: 'Sat or Sun' },
};

export const EXERCISE_TYPES = ['main', 'compound', 'isolation', 'bodyweight', 'plyometric', 'power', 'sprint'];
export const FEELS = ['easy', 'good', 'hard', 'missed'];
export const FEEL_LABELS = { easy: 'Easy', good: 'Good', hard: 'Hard', missed: 'Missed' };

// Sets x reps by exercise type and phase (handover 4.6).
export const SETS_REPS = {
  main: { build: '4 × 6-8', strength: '5 × 3-5', deload: '2 × 6' },
  compound: { build: '3 × 8-10', strength: '4 × 5-7', deload: '2 × 8' },
  isolation: { build: '3 × 10-15', strength: '3 × 8-12', deload: '2 × 12' },
  bodyweight: { build: '3 sets, stop 1-2 reps short', strength: '4 × 4-6, add weight', deload: '2 easy sets' },
  plyometric: { build: '3 sets, full rest', strength: '4 sets, full rest', deload: '2 sets' },
  power: { build: '4 × 3-5, fast', strength: '5 × 3, fast', deload: '2 × 3' },
  sprint: { build: '30 m, 2-3 min rest', strength: 'Flying 20 m, 3 min rest', deload: 'Half reps at 90%' },
};

const ex = (id, workout, order, name, type, unit, start, step, extra = {}) => ({
  id, workout, order, name, type, unit, start, step, notes: '', pair: null, max: null, archived: false,
  region: workout === 'legs' ? 'lower' : 'upper', orderNote: '', ...extra,
});

// Session order follows the usual evidence-based sequence: explosive work while fresh,
// then the heaviest multi-joint lift, other compounds, isolation, core last. Lifts done
// early in a session gain the most strength and get the most quality volume
// (Simão et al. 2012, Sports Med 42:251; Nunes et al. 2021 meta-analysis).
export const SEED_EXERCISES = [
  ex('incline-db-press', 'push', 1, 'Incline Dumbbell Press', 'main', 'lb/DB', 50, 5, { orderNote: 'Heaviest press first, while fresh.' }),
  ex('seated-db-shoulder-press', 'push', 2, 'Seated DB Shoulder Press', 'compound', 'lb/DB', 40, 5, { orderNote: 'Second multi-joint press.' }),
  ex('weighted-dips', 'push', 3, 'Weighted Dips', 'compound', 'lb added', 10, 5, { orderNote: 'Last compound press, before isolation.' }),
  ex('cable-fly', 'push', 4, 'Cable Fly (high to low)', 'isolation', 'lb/side', 25, 5, { orderNote: 'Chest isolation after the presses.' }),
  ex('db-around-the-world', 'push', 5, 'DB Around-the-World Raise', 'isolation', 'lb/DB', 10, 2.5, { orderNote: 'Light shoulder isolation.' }),
  ex('oh-cable-triceps', 'push', 6, 'Overhead Cable Triceps Extension', 'isolation', 'lb', 50, 5, { orderNote: 'Triceps last: tiring them early would limit every press.' }),
  ex('push-ups', 'push', 7, 'Push-ups (decline, deficit, diamond)', 'bodyweight', 'reps', 8, 1, { min: 1, orderNote: 'Finisher. Stop 1-2 reps short of failure.' }),

  ex('pull-ups', 'pull', 1, 'Pull-ups', 'bodyweight', 'reps', 5, 1, {
    min: 1, notes: 'Switch unit to "lb added" once you reach 3 × 10.', orderNote: 'Hardest pull first, while fresh.',
  }),
  ex('seated-cable-row', 'pull', 2, 'Seated Cable Row', 'compound', 'lb', 140, 10, { orderNote: 'Heavy horizontal pull.' }),
  ex('lat-pulldown', 'pull', 3, 'Lat Pulldown', 'compound', 'lb', 120, 10, { orderNote: 'Vertical pull volume after pull-ups.' }),
  ex('single-arm-db-row', 'pull', 4, 'Single-Arm DB Row', 'compound', 'lb/DB', 60, 5, { orderNote: 'One-arm compound, fixes side-to-side gaps.' }),
  ex('face-pull', 'pull', 5, 'Face Pull (rope)', 'isolation', 'lb', 55, 5, { orderNote: 'Rear delts and shoulder health.' }),
  ex('cable-biceps-curl', 'pull', 6, 'Cable Biceps Curl', 'isolation', 'lb', 50, 5, { orderNote: 'Arms last: grip and biceps help every pull above.' }),
  ex('incline-db-curl', 'pull', 7, 'Incline DB Curl', 'isolation', 'lb/DB', 15, 2.5, { orderNote: 'Long-length biceps finisher.' }),

  ex('pogo-jumps', 'legs', 1, 'Pogo Jumps', 'plyometric', 'contacts', 20, 5, { orderNote: 'Low-level plyo: also warms up ankles and tendons.' }),
  ex('trap-bar-jump', 'legs', 2, 'Trap Bar Jump', 'power', 'lb total', 95, 10, { orderNote: 'Power before strength: you are fastest while fresh.' }),
  ex('back-squat', 'legs', 3, 'Back Squat', 'main', 'lb', 185, 10, {
    pair: 'A1', notes: 'Pairs with Broad Jump.', orderNote: 'Heaviest lift of the day. Do 2-3 ramp-up sets first.',
  }),
  ex('broad-jump', 'legs', 4, 'Broad Jump', 'plyometric', 'in', 90, 2, {
    pair: 'A2', orderNote: 'Contrast pair: jump about 3-4 min after each squat set.',
  }),
  ex('bulgarian-split-squat', 'legs', 5, 'Bulgarian Split Squat', 'compound', 'lb total', 80, 10, {
    pair: 'B1', notes: 'Pairs with Split Squat Jumps.', orderNote: 'Single-leg compound after the heavy squat.',
  }),
  ex('split-squat-jumps', 'legs', 6, 'Split Squat Jumps', 'plyometric', 'reps/side', 6, 1, {
    pair: 'B2', min: 1, orderNote: 'Contrast pair with the split squat.',
  }),
  ex('nordic-curl', 'legs', 7, 'Nordic Hamstring Curl', 'bodyweight', 'reps', 4, 1, { min: 1, orderNote: 'Hard eccentric work last: it causes the most soreness.' }),

  ex('sprints-30m', 'support', 1, 'Sprints 30 m', 'sprint', 'reps', 6, 1, {
    min: 1, max: 10, region: 'lower', notes: 'Cap at 10.', orderNote: 'Max speed first, fully fresh and warmed up.',
  }),
  ex('leg-extension', 'support', 2, 'Leg Extension', 'isolation', 'lb', 120, 10, { region: 'lower', orderNote: 'Quad isolation after sprints.' }),
  ex('machine-chest-fly', 'support', 3, 'Machine Chest Fly', 'isolation', 'lb', 115, 5, { orderNote: 'Extra chest volume.' }),
  ex('preacher-curl', 'support', 4, 'Preacher Curl (EZ bar)', 'isolation', 'lb', 50, 5, { orderNote: 'Heavier curl before the lighter one.' }),
  ex('hammer-curl', 'support', 5, 'Hammer Curl', 'isolation', 'lb/DB', 30, 5, { orderNote: 'Forearms and brachialis.' }),
  ex('hanging-leg-raise', 'support', 6, 'Hanging Leg Raise', 'bodyweight', 'reps', 10, 1, { min: 1, orderNote: 'Core last, so it never limits a heavier lift.' }),
  ex('cable-crunch', 'support', 7, 'Cable Crunch', 'isolation', 'lb', 60, 5, { orderNote: 'Core finisher.' }),
];

// Where a new exercise slots into a session by default (lower runs earlier).
export const ORDER_TIERS = { sprint: 0, power: 0, plyometric: 0, main: 1, compound: 2, bodyweight: 3, isolation: 4 };
export const ORDER_TIER_LABELS = {
  0: 'explosive work (sprints, jumps, power) comes first, while fresh',
  1: 'the heaviest multi-joint lift comes next',
  2: 'other compound lifts come before isolation',
  3: 'bodyweight work fits between compounds and isolation',
  4: 'isolation and core come last',
};

export const WARMUP = '5-10 min easy cardio and mobility, then 2-3 lighter ramp-up sets before your first heavy lift. Ramp-up sets are not logged.';

// Performance tests, every 4-5 weeks at the end of a deload.
export const TESTS = [
  { id: 'vjump', name: 'Vertical jump', unit: 'in', lowerIsBetter: false, rate: 'vjump' },
  { id: 'sprint40', name: '40 yd sprint', unit: 's', lowerIsBetter: true, rate: 'sprint40' },
  { id: 'swim100', name: '100 m swim', unit: 's', lowerIsBetter: true, rate: 'swim100' },
  { id: 'run5k', name: '5K run', unit: 'min', lowerIsBetter: true, rate: 'run5k' },
];

// Expected progress rates (handover 4.8). Percentages are fractions.
export const PACE_RATES = {
  strength: { beginner: 0.06, intermediate: 0.03, advanced: 0.01 }, // main + compound, per month
  isolation: { beginner: 0.04, intermediate: 0.02, advanced: 0.005 }, // per month
  bwReps: { beginner: 2, intermediate: 1, advanced: 0.5 }, // reps per month
  bodyWeight: { beginner: 0.005, intermediate: 0.0035, advanced: 0.0025 }, // of body weight per week
  leanMuscle: { beginner: 0.0125, intermediate: 0.0075, advanced: 0.0038 }, // of body weight per month
  vjump: { beginner: 0.04, intermediate: 0.03, advanced: 0.015 }, // per month
  sprint40: { beginner: 0.015, intermediate: 0.01, advanced: 0.005 }, // faster per month
  swim100: { beginner: 0.02, intermediate: 0.01, advanced: 0.005 },
  run5k: { beginner: 0.02, intermediate: 0.015, advanced: 0.005 },
};

export const CHORE_CATEGORIES = ['cleaning', 'laundry', 'kitchen', 'errands', 'admin', 'other'];
export const CHORE_FREQUENCIES = ['daily', 'weekly', 'once'];
