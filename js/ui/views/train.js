import { FEELS, FEEL_LABELS, PHASE_LABELS, TESTS, WORKOUTS } from '../../config/program.js';
import { nextWorkoutDate, workoutForDate } from '../../engine/calendar.js';
import { targetFor, workoutExercises } from '../../engine/coach.js';
import { emptyDay, liftsByExercise } from '../../engine/metrics.js';
import { liftPace, testPace } from '../../engine/pace.js';
import { BASIS_LABELS } from '../../engine/progression.js';
import { fmtDate, fmtShort, isISODate } from '../../util/dates.js';
import { lineChart } from '../charts.js';
import { confirmSheet, esc, fmtNum, on, readNumber, sheet } from '../dom.js';
import { phasePill } from './home.js';

const TABS = [...Object.keys(WORKOUTS), 'cardio', 'tests'];
const TAB_LABELS = { ...Object.fromEntries(Object.entries(WORKOUTS).map(([k, w]) => [k, w.name])), cardio: 'Cardio', tests: 'Tests' };

function feelPicker(name, selected) {
  return `<div class="seg" role="radiogroup" aria-label="Feel">
    ${FEELS.map((f) => `<label class="seg-opt feel-${f}"><input type="radio" name="${name}" value="${f}" ${selected === f ? 'checked' : ''}><span>${FEEL_LABELS[f]}</span></label>`).join('')}
  </div>`;
}

function entryLine(e, ex) {
  return `<div class="entry">
    <span><b>${fmtNum(e.value, 2)}</b> ${esc(ex.unit)} · <span class="feel-tag feel-${e.feel || 'good'}">${FEEL_LABELS[e.feel || 'good']}</span>
    ${e.sets ? ` · ${e.sets} sets` : ''}${e.reps ? ` · ${esc(e.reps)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</span>
    <button class="btn sm ghost" data-edit="${e.id}">Edit</button>
  </div>`;
}

function exerciseCard(state, ex, date, byEx) {
  const entries = byEx.get(ex.id) || [];
  const todays = entries.filter((e) => e.date === date);
  const t = targetFor(state, ex, date, byEx);
  const basis = t.override ? `coach plan${t.override.note ? `: ${esc(t.override.note)}` : ''}` : BASIS_LABELS[t.rules.basis];
  const last = t.last ? `Last: ${fmtNum(t.last.value, 2)} (${FEEL_LABELS[t.last.feel || 'good']}) on ${fmtShort(t.last.date)}` : 'First session';
  let body;
  if (todays.length) {
    const nextDate = nextWorkoutDate(date, ex.workout);
    const next = nextDate ? targetFor(state, ex, nextDate, byEx) : null;
    body = `${todays.map((e) => entryLine(e, ex)).join('')}
      ${next ? `<p class="next">Next session ${fmtShort(nextDate)} (${PHASE_LABELS[next.phase]}): <b>${fmtNum(next.value, 2)} ${esc(ex.unit)}</b> · ${esc(next.setsReps)}</p>` : ''}
      <button class="btn sm ghost" data-another="${ex.id}">Log another entry</button>`;
  } else {
    body = logForm(ex, t.value);
  }
  return `<article class="card ex-card ${ex.pair ? 'paired' : ''}" id="ex-${esc(ex.id)}">
    <div class="row-between">
      <a class="ex-name" href="#exercise/${encodeURIComponent(ex.id)}">${ex.pair ? `<span class="pair">${esc(ex.pair)}</span>` : ''}${esc(ex.name)}</a>
      <span class="muted small">${esc(ex.type)}</span>
    </div>
    <p class="target">Target <b>${fmtNum(t.value, 2)} ${esc(ex.unit)}</b> · ${esc(t.setsReps)}</p>
    <p class="muted small">${basis} · ${last}</p>
    ${ex.notes ? `<p class="note small">${esc(ex.notes)}</p>` : ''}
    ${body}
  </article>`;
}

function logForm(ex, value) {
  return `<form class="log-form" data-ex="${esc(ex.id)}">
    <div class="inline">
      <label>Value (${esc(ex.unit)})<input name="value" type="number" inputmode="decimal" step="any" min="0" value="${value}" required></label>
      <label>Sets<input name="sets" type="number" inputmode="numeric" min="0" step="1" placeholder="opt."></label>
      <label>Reps<input name="reps" type="text" placeholder="e.g. 8,8,7"></label>
    </div>
    ${feelPicker(`feel-${ex.id}`, null)}
    <p class="muted small">No feel picked counts as Good.</p>
    <button class="btn primary block" type="submit">Save</button>
  </form>`;
}

function cardioSection(state, date) {
  const day = state.days.get(date) || emptyDay(date);
  const tick = (k, label) => `<button class="tick ${day[k] ? 'on' : ''}" data-tick="${k}" aria-pressed="${!!day[k]}">${label}</button>`;
  return `<section class="card">
    <h2>Cardio and sessions</h2>
    <div class="ticks">${tick('swim', 'Swim')}${tick('soccer', 'Soccer')}${tick('yoga', 'Yoga')}${tick('run', 'Run')}${tick('lift', 'Lift (no details)')}</div>
    <form class="inline" id="run-form">
      <label>Run miles<input name="runMi" type="number" inputmode="decimal" step="0.1" min="0" value="${day.runMi ?? ''}"></label>
      <button class="btn" type="submit">Save run</button>
    </form>
    <p class="muted small">Entering miles ticks Run automatically.</p>
  </section>`;
}

function testsSection(state, date) {
  return TESTS.map((t) => {
    const entries = state.tests.filter((e) => e.testId === t.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    const pace = testPace(t, entries, state.settings.level);
    return `<article class="card">
      <div class="row-between"><h3>${esc(t.name)}</h3><span class="pill pace-${pace.status}">${pace.label}</span></div>
      <form class="inline test-form" data-test="${t.id}">
        <label>Result (${t.unit})<input name="value" type="number" inputmode="decimal" step="any" min="0" required></label>
        <button class="btn" type="submit">Save</button>
      </form>
      ${entries.length ? `<div class="entries">${entries.slice(-5).reverse().map((e) => `<div class="entry"><span>${fmtShort(e.date)}: <b>${fmtNum(e.value, 2)}</b> ${t.unit}</span>
        <button class="btn sm ghost" data-del-test="${e.id}">Delete</button></div>`).join('')}</div>` : ''}
    </article>`;
  }).join('') + '<p class="muted small center">Test every 4-5 weeks, at the end of a deload week.</p>';
}

export function render(ctx) {
  const { state, ui } = ctx;
  const date = ui.trainDate || ctx.today;
  const tab = ui.trainTab && ui.trainDateFor === date ? ui.trainTab : workoutForDate(date) || 'push';
  const byEx = liftsByExercise(state.lifts);

  let content;
  if (tab === 'cardio') content = cardioSection(state, date);
  else if (tab === 'tests') content = testsSection(state, date);
  else {
    const list = workoutExercises(state, tab);
    content = list.length
      ? list.map((ex) => exerciseCard(state, ex, date, byEx)).join('')
      : '<p class="muted center">No exercises. Add some in Settings → Exercise library.</p>';
    content += cardioSection(state, date);
  }

  const html = `
    <header class="page-head">
      <div><h1>Train</h1><p class="muted">${fmtDate(date)}${workoutForDate(date) ? ` · planned: ${WORKOUTS[workoutForDate(date)].name}` : ' · no lift planned'}</p></div>
      ${phasePill(state, date)}
    </header>
    <div class="inline date-row">
      <label>Date<input type="date" id="train-date" value="${date}" max="${ctx.today}"></label>
      ${date !== ctx.today ? '<button class="btn sm" id="train-today">Today</button>' : ''}
    </div>
    <nav class="subtabs" aria-label="Workout">${TABS.map((k) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${TAB_LABELS[k]}</button>`).join('')}</nav>
    ${content}`;

  function mount(root) {
    on(root, '#train-date', 'change', (e) => {
      if (!isISODate(e.target.value)) return;
      ui.trainDate = e.target.value;
      ui.trainTab = null;
      ctx.refresh();
    });
    on(root, '#train-today', 'click', () => { ui.trainDate = null; ui.trainTab = null; ctx.refresh(); });
    on(root, '[data-tab]', 'click', (_e, el) => { ui.trainTab = el.dataset.tab; ui.trainDateFor = date; ctx.refresh(); });
    const submitLog = async (e, form) => {
      e.preventDefault();
      const value = readNumber(form.elements.value, 'Value');
      if (value == null) throw new Error('Enter a value first.');
      const feel = form.querySelector('input[type=radio]:checked')?.value || null;
      const sets = readNumber(form.elements.sets, 'Sets');
      await ctx.actions.logLift({
        date, exerciseId: form.dataset.ex, value, feel, sets, reps: form.elements.reps.value.trim() || null,
      });
      ctx.toast('Saved');
    };
    on(root, '.log-form', 'submit', submitLog);
    on(root, '[data-another]', 'click', (_e, el) => {
      const ex = state.exercises.find((x) => x.id === el.dataset.another);
      const card = el.closest('.ex-card');
      el.outerHTML = logForm(ex, targetFor(state, ex, date, byEx).value);
      on(card, '.log-form', 'submit', submitLog);
    });
    on(root, '[data-edit]', 'click', (_e, el) => editEntry(ctx, el.dataset.edit));
    on(root, '[data-tick]', 'click', (_e, el) => {
      const day = state.days.get(date) || emptyDay(date);
      return ctx.actions.saveDay(date, { [el.dataset.tick]: !day[el.dataset.tick] });
    });
    on(root, '#run-form', 'submit', async (e, form) => {
      e.preventDefault();
      await ctx.actions.saveDay(date, { runMi: readNumber(form.elements.runMi, 'Run miles') });
      ctx.toast('Run saved');
    });
    on(root, '.test-form', 'submit', async (e, form) => {
      e.preventDefault();
      const value = readNumber(form.elements.value, 'Result');
      if (value == null) throw new Error('Enter a result first.');
      await ctx.actions.logTest({ date, testId: form.dataset.test, value });
    });
    on(root, '[data-del-test]', 'click', async (_e, el) => {
      if (await confirmSheet('Delete test result?', 'This removes the result.', 'Delete')) await ctx.actions.deleteTest(el.dataset.delTest);
    });
  }
  return { html, mount };
}

async function editEntry(ctx, id) {
  const entry = ctx.state.lifts.find((l) => l.id === id);
  if (!entry) return;
  const ex = ctx.state.exercises.find((x) => x.id === entry.exerciseId);
  const result = await sheet({
    title: `Edit ${ex?.name ?? 'entry'}`,
    body: `<form class="stack" id="edit-form">
      <label>Value (${esc(ex?.unit ?? '')})<input name="value" type="number" inputmode="decimal" step="any" min="0" value="${entry.value}"></label>
      ${feelPicker('edit-feel', entry.feel)}
      <label>Sets<input name="sets" type="number" min="0" step="1" value="${entry.sets ?? ''}"></label>
      <label>Reps<input name="reps" type="text" value="${esc(entry.reps ?? '')}"></label>
      <label>Note<input name="note" type="text" value="${esc(entry.note ?? '')}"></label>
    </form>`,
    buttons: [
      { label: 'Delete', kind: 'danger', value: 'delete' },
      { label: 'Cancel', value: null },
      {
        label: 'Save', kind: 'primary',
        value: (wrap) => {
          const f = wrap.querySelector('#edit-form');
          return {
            value: f.elements.value.value, sets: f.elements.sets.value, reps: f.elements.reps.value, note: f.elements.note.value,
            feel: f.querySelector('input[type=radio]:checked')?.value || null,
          };
        },
      },
    ],
  });
  try {
    if (result === 'delete') {
      if (await confirmSheet('Delete entry?', 'This removes the logged set.', 'Delete')) await ctx.actions.deleteLift(id);
      return;
    }
    if (!result) return;
    const value = Number(result.value);
    if (!Number.isFinite(value) || value < 0 || result.value === '') throw new Error('Value must be a number.');
    const sets = result.sets === '' ? null : Number(result.sets);
    await ctx.actions.updateLift(id, {
      value, feel: result.feel, sets: Number.isFinite(sets) ? sets : null, reps: result.reps.trim() || null, note: result.note.trim(),
    });
  } catch (err) {
    ctx.toast(err.message, 'error');
  }
}

/** #exercise/<id>: history chart, pace and all entries for one exercise. */
export function renderExercise(ctx, id) {
  const { state } = ctx;
  const ex = state.exercises.find((x) => x.id === id);
  if (!ex) return { html: '<p class="muted center">Exercise not found.</p>' };
  const entries = liftsByExercise(state.lifts).get(ex.id) || [];
  const pace = liftPace(ex, entries, state.settings.level);
  const working = entries.filter((e) => e.phase !== 'deload').map((e) => ({ date: e.date, value: e.value }));
  const deload = entries.filter((e) => e.phase === 'deload').map((e) => ({ date: e.date, value: e.value }));
  const paceDetail = pace.expected != null
    ? `Change since first: ${fmtNum(pace.actual, 2)} ${esc(ex.unit)} (expected ${fmtNum(pace.expected, 2)} for the time elapsed)` : '';
  const html = `
    <header class="page-head"><div><a href="#train" class="back">‹ Train</a><h1>${esc(ex.name)}</h1>
      <p class="muted">${esc(WORKOUTS[ex.workout]?.name ?? ex.workout)} · ${esc(ex.type)} · ${esc(ex.unit)} · step ${ex.step}</p></div>
      <span class="pill pace-${pace.status}">${pace.label}</span></header>
    <section class="card">
      ${lineChart([{ label: 'Working', color: '#ff7a3d', points: working }, ...(deload.length ? [{ label: 'Deload', color: '#3d8bff', points: deload }] : [])], { unit: ex.unit })}
      ${paceDetail ? `<p class="muted small">${paceDetail}</p>` : ''}
      ${ex.notes ? `<p class="note small">${esc(ex.notes)}</p>` : ''}
      <a class="btn sm" href="#library/${encodeURIComponent(ex.id)}">Edit exercise</a>
    </section>
    <section class="card">
      <h2>History</h2>
      ${entries.length ? [...entries].reverse().map((e) => `<div class="entry"><span>${fmtShort(e.date)} · <b>${fmtNum(e.value, 2)}</b>
        · <span class="feel-tag feel-${e.feel || 'good'}">${FEEL_LABELS[e.feel || 'good']}</span>${e.phase === 'deload' ? ' · deload' : ''}</span>
        <button class="btn sm ghost" data-edit="${e.id}">Edit</button></div>`).join('') : '<p class="muted">Nothing logged yet.</p>'}
    </section>`;
  return { html, mount: (root) => on(root, '[data-edit]', 'click', (_e, el) => editEntry(ctx, el.dataset.edit)) };
}
