// Every game rule lives here so it can be tuned without touching UI or engine code.
// XP is recomputed from the logs each time, so changing a number here re-scores history.

export const STATS = {
  STR: { name: 'Strength', color: '#ff6b4a', fedBy: 'Lifts logged, progression hits, PRs' },
  INT: { name: 'Intelligence', color: '#a78bfa', fedBy: 'Pages read, reading days, journal' },
  END: { name: 'Endurance', color: '#38bdf8', fedBy: 'Swim, run, soccer, yoga' },
  VIT: { name: 'Vitality', color: '#4ade80', fedBy: 'Water, protein, supplements, sleep, food logging' },
};

// XP per logged action. dailyCap limits how much one source can earn in a day.
export const XP_RULES = {
  liftEntry: { stat: 'STR', xp: 10, dailyCap: 80, label: 'Lifts logged' },
  liftProgress: { stat: 'STR', xp: 5, label: 'Progression hits' },
  liftPR: { stat: 'STR', xp: 15, label: 'Personal records' },
  pages: { stat: 'INT', xp: 1, dailyCap: 40, label: 'Pages read' },
  readDay: { stat: 'INT', xp: 10, label: 'Reading days' },
  journal: { stat: 'INT', xp: 10, label: 'Journal' },
  swim: { stat: 'END', xp: 20, label: 'Swims' },
  run: { stat: 'END', xp: 20, label: 'Runs' },
  runMiles: { stat: 'END', xp: 5, dailyCap: 65, label: 'Run miles' },
  soccer: { stat: 'END', xp: 20, label: 'Soccer' },
  yoga: { stat: 'END', xp: 15, label: 'Yoga' },
  water: { stat: 'VIT', xp: 10, label: 'Water goal' },
  protein: { stat: 'VIT', xp: 10, label: 'Protein goal' },
  supplements: { stat: 'VIT', xp: 5, label: 'Supplements' },
  sleep: { stat: 'VIT', xp: 10, label: 'Sleep goal' },
  food: { stat: 'VIT', xp: 3, dailyCap: 9, label: 'Food logged' },
};

// Weekly consistency bonuses, awarded once per Monday-start week when the test passes.
// `w` has: sessions, readDays, habitRate (0-1), liftSessions.
export const WEEKLY_BONUSES = [
  { id: 'sessions', label: 'Weekly session target hit', test: (w) => w.sessions >= 12, award: { STR: 25, END: 25 } },
  { id: 'reading', label: 'Reading days target hit', test: (w) => w.readDays >= 5, award: { INT: 30 } },
  { id: 'habits', label: 'Habits 80%+ for the week', test: (w) => w.habitRate >= 0.8, award: { VIT: 30 } },
];

// XP needed to reach a level: 0, then grows quadratically.
export const statLevelXp = (level) => 25 * (level - 1) * level; // per stat
export const overallLevelXp = (level) => 100 * (level - 1) * level; // total of all stats

// Evolution stages. A stage unlocks when the overall level AND every requirement are met.
// Requirements: weeklyTargetsHit (weeks with 12/12 sessions), prs, bestReadStreak (days).
export const STAGES = [
  { stage: 1, name: 'Sparkdrop', minLevel: 1, req: {} },
  { stage: 2, name: 'Embertide', minLevel: 4, req: { weeklyTargetsHit: 1 } },
  { stage: 3, name: 'Steamfin', minLevel: 8, req: { weeklyTargetsHit: 3, prs: 5 } },
  { stage: 4, name: 'Tidalflare', minLevel: 14, req: { weeklyTargetsHit: 6, prs: 15, bestReadStreak: 10 } },
  { stage: 5, name: 'Solmaris', minLevel: 22, req: { weeklyTargetsHit: 12, prs: 30, bestReadStreak: 21 } },
];

export const REQ_LABELS = {
  weeklyTargetsHit: 'weeks with 12/12 sessions',
  prs: 'lift PRs',
  bestReadStreak: 'day reading streak',
};

// Environment: chores earn home points; levels unlock furniture.
// Neglect: after graceDays with no chore done, the home drops one level per stepDays,
// down to maxDrop levels. One chore done restores it at once.
export const ENVIRONMENT = {
  points: { daily: 5, weekly: 15, once: 10 },
  levels: [
    { level: 1, name: 'Bare room', minPoints: 0 },
    { level: 2, name: 'Settled in', minPoints: 40 },
    { level: 3, name: 'Homely', minPoints: 120 },
    { level: 4, name: 'Comfortable', minPoints: 260 },
    { level: 5, name: 'Sanctuary', minPoints: 450 },
  ],
  decay: { graceDays: 7, stepDays: 7, maxDrop: 2 },
};

// Number of art slots the UI looks for: assets/character/stage-1..N.png, assets/environment/level-1..N.png
export const ART_SLOTS = { stages: STAGES.length, levels: ENVIRONMENT.levels.length };
