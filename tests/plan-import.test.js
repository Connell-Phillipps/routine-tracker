// Plan file import: a JSON file from iCloud Drive goes through the same compare/accept
// path as a pasted Ask Claude reply.
import { test, eq, ok } from './harness.js';
import { DEFAULT_SETTINGS, SEED_EXERCISES } from '../js/config/program.js';
import { parseCoachReply } from '../js/engine/coach.js';
import { render } from '../js/ui/views/coach.js';

const TODAY = '2026-10-26';
const makeState = () => ({
  settings: structuredClone(DEFAULT_SETTINGS), days: new Map(), lifts: [], exercises: SEED_EXERCISES, tests: [], food: [],
  chores: [], choreLog: [], overrides: new Map(),
});

// The reply format the coach prompt has always asked for.
const OLD_REPLY = JSON.stringify({
  workout: 'push',
  lifts: [
    { exercise: 'incline-db-press', weight: 55, sets: 4, reps: '6-8', note: 'pause at the bottom', rationale: 'Top of range last time.' },
    { exercise: 'Back Squat', weight: 190, sets: 3, reps: '5', note: '', rationale: 'Held.' },
  ],
  summary: 'Push day. Add a little load.',
});

const PLAN_FILE = JSON.stringify({
  block: 'Strength block 2',
  start: '2026-11-23',
  end: '2026-12-20',
  notes: 'Keep two reps in reserve on squats.',
  ...JSON.parse(OLD_REPLY),
});

// ---------- UI helpers: mount the real Coach view and drive it ----------
const waitFor = async (cond, ms = 3000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting');
};
const settle = () => new Promise((r) => setTimeout(r, 150));

function toastEl() {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function mountCoach(state = makeState()) {
  document.querySelectorAll('.sheet-backdrop, .coach-test-root').forEach((n) => n.remove());
  toastEl().textContent = '';
  const accepted = [];
  const toasts = [];
  const ctx = {
    state, today: TODAY, toast: (m) => toasts.push(m),
    actions: { acceptOverrides: async (items) => { accepted.push(...items); }, clearOverride: async () => {} },
  };
  const root = document.createElement('div');
  root.className = 'coach-test-root';
  root.hidden = true;
  document.body.appendChild(root);
  const view = render(ctx);
  root.innerHTML = view.html;
  view.mount(root);
  return { root, accepted, toasts, cleanup: () => { root.remove(); document.querySelectorAll('.sheet-backdrop').forEach((n) => n.remove()); } };
}

function pickFile(root, text, name = 'plan.json') {
  const input = root.querySelector('input[type="file"]#import-plan');
  ok(input, 'Coach view has an Import plan file input');
  eq(input.getAttribute('accept'), '.json,application/json', 'file input accept');
  const dt = new DataTransfer();
  dt.items.add(new File([text], name, { type: 'application/json' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
}

function paste(root, text) {
  root.querySelector('#coach-reply').value = text;
  root.querySelector('#read-reply').click();
}

const openSheet = () => waitFor(() => document.querySelector('.sheet-backdrop'));
const clickSheet = (sheetEl, label) => [...sheetEl.querySelectorAll('button')].find((b) => b.textContent === label).click();
const summarise = (items) => items.map((i) => [i.exercise.id, i.value, i.sets, i.reps, i.note, i.rationale]);

/** Expects an error toast matching pattern, with no sheet opened and nothing accepted. */
async function expectRejected(text, pattern, name) {
  const m = mountCoach();
  try {
    pickFile(m.root, text, name);
    const msg = await waitFor(() => toastEl().textContent);
    ok(pattern.test(msg), `message ${JSON.stringify(msg)} should match ${pattern}`);
    await settle();
    ok(!document.querySelector('.sheet-backdrop'), 'no compare sheet opened');
    eq(m.accepted.length, 0, 'nothing accepted');
  } finally {
    m.cleanup();
  }
}

// ---------- tests ----------
test('plan file: importing a valid file shows the same diff as pasting and accepts the same changes', async () => {
  const pasted = mountCoach();
  let pastedBody;
  try {
    paste(pasted.root, OLD_REPLY);
    const s = await openSheet();
    pastedBody = s.querySelector('.sheet-body').innerHTML;
    clickSheet(s, 'Accept ticked');
    await waitFor(() => pasted.accepted.length);
  } finally {
    pasted.cleanup();
  }

  const filed = mountCoach();
  try {
    pickFile(filed.root, OLD_REPLY);
    const s = await openSheet();
    eq(s.querySelector('.sheet-body').innerHTML, pastedBody, 'diff body');
    clickSheet(s, 'Accept ticked');
    await waitFor(() => filed.accepted.length);
    eq(summarise(filed.accepted), summarise(pasted.accepted), 'accepted items');
    eq(filed.toasts, pasted.toasts, 'confirmation message');
  } finally {
    filed.cleanup();
  }
});

test('plan file: invalid JSON shows a message and changes nothing', async () => {
  await expectRejected('this is not json at all', /No JSON object/);
  await expectRejected('{"lifts": [ }', /could not be read/);
  await expectRejected('   ', /empty/i);
});

test('plan file: wrong shape shows a message and changes nothing', async () => {
  await expectRejected('{"workout": "push"}', /"lifts" list/);
  await expectRejected('{"lifts": "back-squat"}', /"lifts" list/);
  // A restore backup picked by mistake.
  await expectRejected(JSON.stringify({ app: 'routine-tracker', version: 1, data: { days: [] } }), /"lifts" list/);
  await expectRejected(`{"lifts":[], "pad": "${'x'.repeat(1024 * 1024)}"}`, /too big/i, 'huge.json');
  // Lift entries that are not objects are reported, not a crash.
  const r = parseCoachReply('{"lifts": [null, 7, "squat"]}', makeState());
  eq(r.items.length, 0);
  eq(r.errors.length, 3);
});

test('plan file: unknown lift names are reported and never applied', async () => {
  const m = mountCoach();
  try {
    pickFile(m.root, JSON.stringify({ lifts: [{ exercise: 'Zercher Squat', weight: 100 }, { exercise: 'back-squat', weight: 190 }] }));
    const s = await openSheet();
    ok(/unknown exercise &quot;Zercher Squat&quot;|unknown exercise "Zercher Squat"/.test(s.querySelector('.banner.warn')?.innerHTML || ''), 'warning names the unknown lift');
    eq(s.querySelectorAll('input[data-idx]').length, 1, 'only the known lift is offered');
    clickSheet(s, 'Accept ticked');
    await waitFor(() => m.accepted.length);
    eq(summarise(m.accepted).map((x) => x[0]), ['back-squat']);
  } finally {
    m.cleanup();
  }
  const all = mountCoach();
  try {
    pickFile(all.root, JSON.stringify({ lifts: [{ exercise: 'Zercher Squat', weight: 100 }] }));
    const s = await openSheet();
    clickSheet(s, 'Accept ticked');
    await waitFor(() => all.toasts.length);
    eq(all.accepted.length, 0, 'nothing accepted');
    eq(all.toasts, ['No changes made.']);
  } finally {
    all.cleanup();
  }
});

test('plan file: optional block name, dates and notes show above the diff', async () => {
  const r = parseCoachReply(PLAN_FILE, makeState());
  eq(r.plan, { block: 'Strength block 2', start: '2026-11-23', end: '2026-12-20', notes: 'Keep two reps in reserve on squats.' });
  eq(summarise(r.items), summarise(parseCoachReply(OLD_REPLY, makeState()).items), 'same lift items as without plan fields');
  eq(r.errors, []);
  // Notes may be a list of lines; bad dates are dropped with a warning.
  const r2 = parseCoachReply(JSON.stringify({ notes: ['Line one', 'Line two'], start: '23/11/2026', lifts: [{ exercise: 'back-squat', weight: 190 }] }), makeState());
  eq(r2.plan, { block: '', start: null, end: null, notes: 'Line one\nLine two' });
  eq(r2.errors.length, 1, 'bad start date warned');

  const m = mountCoach();
  try {
    pickFile(m.root, PLAN_FILE);
    const s = await openSheet();
    const body = s.querySelector('.sheet-body');
    const head = body.querySelector('.plan-head');
    ok(head, 'plan header shown');
    ok(head.textContent.includes('Strength block 2'), 'block name shown');
    ok(head.textContent.includes('23 Nov') && head.textContent.includes('20 Dec'), 'dates shown');
    ok(head.textContent.includes('Keep two reps in reserve'), 'notes shown');
    ok(head.compareDocumentPosition(body.querySelector('.diff-row')) & Node.DOCUMENT_POSITION_FOLLOWING, 'header is above the diff');
  } finally {
    m.cleanup();
  }
});

test('plan file: an old pasted reply parses exactly as before', async () => {
  const r = parseCoachReply(OLD_REPLY, makeState());
  eq(summarise(r.items), [
    ['incline-db-press', 55, 4, '6-8', 'pause at the bottom', 'Top of range last time.'],
    ['back-squat', 190, 3, '5', '', 'Held.'],
  ]);
  eq(r.errors, []);
  eq(r.summary, 'Push day. Add a little load.');
  eq(r.plan, null, 'no plan fields in an old reply');

  const m = mountCoach();
  try {
    paste(m.root, OLD_REPLY);
    const s = await openSheet();
    ok(!s.querySelector('.plan-head'), 'no plan header for an old reply');
    eq(s.querySelectorAll('input[data-idx]:checked').length, 2);
  } finally {
    m.cleanup();
  }
});
