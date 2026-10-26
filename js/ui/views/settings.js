import { EXERCISE_TYPES, PHASE_LABELS, WORKOUTS } from '../../config/program.js';
import { phaseForDate } from '../../engine/calendar.js';
import { dailyCSV, importDailyRows, importLiftRows, liftsCSV, parseCSV } from '../../data/backup.js';
import { isISODate, todayISO } from '../../util/dates.js';
import { APP_VERSION } from '../../version.js';
import { confirmSheet, esc, on, readFile, readNumber, shareFile, sheet } from '../dom.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];

const numField = (name, label, value, step = 'any') => `<label>${label}<input name="${name}" type="number" inputmode="decimal" min="0" step="${step}" value="${value ?? ''}"></label>`;

export function render(ctx) {
  const { state } = ctx;
  const s = state.settings;
  const t = s.targets;
  const last = s.lastBackup ? new Date(s.lastBackup).toLocaleString() : 'never';
  let preparedExport = null; // built ahead so the iOS share sheet opens straight from the tap

  const html = `
    <header class="page-head"><div><a href="#coach" class="back">‹ Coach</a><h1>Settings</h1></div></header>

    <section class="card">
      <h2>Backup</h2>
      <p class="small">Last backup: <b>${esc(last)}</b>. <span id="persist" class="muted"></span></p>
      <p class="muted small">Your data lives only on this phone. Save a backup to Files every week.</p>
      <button class="btn primary block" id="export-json">Back up now (JSON)</button>
      <div class="btn-row">
        <button class="btn sm" id="export-daily">Daily log CSV</button>
        <button class="btn sm" id="export-lifts">Lifting log CSV</button>
      </div>
      <h3>Restore or import</h3>
      <label class="file-btn btn">Restore from backup (replaces all data)<input type="file" accept=".json,application/json" id="import-json" hidden></label>
      <label class="file-btn btn">Import daily log CSV<input type="file" accept=".csv,text/csv" id="import-daily" hidden></label>
      <label class="file-btn btn">Import lifting log CSV<input type="file" accept=".csv,text/csv" id="import-lifts" hidden></label>
      <p class="muted small">CSV columns: date (YYYY-MM-DD), then any of swim, lift, run, soccer, yoga, pages, journal, water_l, protein_g, sleep_h, supplements, run_mi, body_weight_lb, notes. Lifts: date, exercise_id or exercise, value, feel.</p>
    </section>

    <form class="card stack" id="settings-form">
      <h2>Program</h2>
      <label>Start date<input name="startDate" type="date" value="${s.startDate}" required></label>
      <label>Phase<select name="phaseMode">
        <option value="auto" ${s.phaseMode === 'auto' ? 'selected' : ''}>Auto (10-week cycle)</option>
        <option value="manual" ${s.phaseMode === 'manual' ? 'selected' : ''}>Manual</option></select></label>
      <label>Manual phase<select name="manualPhase">${Object.entries(PHASE_LABELS).map(([k, v]) => `<option value="${k}" ${s.manualPhase === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Training level<select name="level">${LEVELS.map((l) => `<option ${s.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>

      <h2>Daily targets</h2>
      <div class="grid2">
        ${numField('waterL', 'Water (L)', t.waterL)}
        ${numField('proteinG', 'Protein (g)', t.proteinG, 1)}
        ${numField('sleepH', 'Sleep (h)', t.sleepH)}
        ${numField('pages', 'Pages / reading day', t.pages, 1)}
        ${numField('readDays', 'Reading days / week', t.readDays, 1)}
        ${numField('readDaysStretch', 'Stretch reading days', t.readDaysStretch, 1)}
      </div>

      <h2>Body and running</h2>
      <div class="grid2">
        ${numField('startBodyWeight', 'Start body weight (lb)', s.startBodyWeight)}
        ${numField('longRunStart', 'Long run start (mi)', s.longRun.startMi)}
        ${numField('longRunGoal', 'Long run goal (mi)', s.longRun.goalMi)}
      </div>
      <label>Supplements (comma separated, optional)<input name="supplements" type="text" value="${esc((s.supplements || []).join(', '))}" placeholder="Creatine, Vitamin D"></label>
      <button class="btn primary block" type="submit">Save settings</button>
    </form>

    <section class="card">
      <h2>Exercise library</h2>
      <p class="muted small">Add, remove or change exercises, units, start values and steps.</p>
      <a class="btn block" href="#library">Open exercise library</a>
    </section>

    <section class="card">
      <h2>About</h2>
      <p class="small">Routine Tracker ${APP_VERSION}. Free, offline, no account. No data leaves this phone unless you copy it into Claude or export a file.</p>
      <button class="btn danger sm" id="reset">Erase all data</button>
    </section>`;

  function mount(root) {
    const a = ctx.actions;
    a.exportJSON().then((json) => { preparedExport = json; }).catch((err) => console.error(err));
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((p) => {
        const el = root.querySelector('#persist');
        if (el) el.textContent = p ? 'Storage is marked persistent.' : 'Storage may be cleared by iOS if unused.';
      }).catch(() => {});
    }

    on(root, '#export-json', 'click', async () => {
      const json = preparedExport ?? await a.exportJSON();
      const result = await shareFile(`routine-tracker-${todayISO()}.json`, json);
      if (result !== 'shared' && result !== 'downloaded') return;
      await a.markBackedUp();
      ctx.toast('Backup saved');
    });
    on(root, '#export-daily', 'click', () => shareFile(`daily-log-${todayISO()}.csv`, dailyCSV([...state.days.values()]), 'text/csv'));
    on(root, '#export-lifts', 'click', () => shareFile(`lifting-log-${todayISO()}.csv`, liftsCSV(state.lifts, state.exercises), 'text/csv'));

    on(root, '#import-json', 'change', async (e) => {
      const text = await readFile(e.target);
      e.target.value = '';
      if (!await confirmSheet('Restore backup?', 'This replaces everything in the app with the backup file.', 'Restore')) return;
      await a.importJSON(text);
      ctx.toast('Backup restored');
    });
    on(root, '#import-daily', 'change', async (e) => {
      const text = await readFile(e.target);
      e.target.value = '';
      const { days, errors } = importDailyRows(parseCSV(text));
      await a.importDays(days);
      await reportImport(`${days.length} days imported.`, errors);
    });
    on(root, '#import-lifts', 'change', async (e) => {
      const text = await readFile(e.target);
      e.target.value = '';
      const { lifts, errors } = importLiftRows(parseCSV(text), state.exercises, (d) => phaseForDate(d, state.settings));
      const added = await a.importLifts(lifts);
      await reportImport(`${added} lift entries imported (${lifts.length - added} duplicates skipped).`, errors);
    });

    on(root, '#settings-form', 'submit', async (e, form) => {
      e.preventDefault();
      const f = form.elements;
      if (!isISODate(f.startDate.value)) throw new Error('Pick a start date.');
      const need = (input, label) => {
        const v = readNumber(input, label);
        if (v == null || v <= 0) throw new Error(`${label} must be more than 0.`);
        return v;
      };
      const readDays = need(f.readDays, 'Reading days');
      if (readDays > 7) throw new Error('Reading days must be 7 or fewer.');
      await a.saveSettings({
        startDate: f.startDate.value,
        phaseMode: f.phaseMode.value,
        manualPhase: f.manualPhase.value,
        level: f.level.value,
        targets: {
          waterL: need(f.waterL, 'Water'), proteinG: need(f.proteinG, 'Protein'), sleepH: need(f.sleepH, 'Sleep'),
          pages: need(f.pages, 'Pages'), readDays, readDaysStretch: need(f.readDaysStretch, 'Stretch reading days'),
        },
        startBodyWeight: need(f.startBodyWeight, 'Start body weight'),
        longRun: { ...state.settings.longRun, startMi: need(f.longRunStart, 'Long run start'), goalMi: need(f.longRunGoal, 'Long run goal') },
        supplements: f.supplements.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
      });
      ctx.toast('Settings saved');
    });

    on(root, '#reset', 'click', async () => {
      if (!await confirmSheet('Erase all data?', 'Everything on this phone is deleted. Make a backup first. This cannot be undone.', 'Erase')) return;
      await a.resetAll();
      ctx.toast('All data erased');
    });
  }
  return { html, mount };
}

async function reportImport(summary, errors) {
  await sheet({
    title: 'Import finished',
    body: `<p>${esc(summary)}</p>${errors.length ? `<p class="muted small">${errors.length} rows skipped:</p><pre class="small">${esc(errors.slice(0, 30).join('\n'))}</pre>` : ''}`,
  });
}

// ---------- exercise library ----------

export function renderLibrary(ctx) {
  const { state } = ctx;
  const active = state.exercises.filter((e) => !e.archived);
  const archived = state.exercises.filter((e) => e.archived);
  const html = `
    <header class="page-head"><div><a href="#settings" class="back">‹ Settings</a><h1>Exercises</h1></div>
      <a class="btn sm primary" href="#library/new">Add</a></header>
    ${Object.entries(WORKOUTS).map(([k, w]) => `<section class="card"><h2>${w.name} <small class="muted">${w.when}</small></h2>
      ${active.filter((e) => e.workout === k).sort((a, b) => a.order - b.order).map((e) => `<a class="entry" href="#library/${encodeURIComponent(e.id)}">
        <span>${e.pair ? `<span class="pair">${esc(e.pair)}</span>` : ''}${esc(e.name)}</span><span class="muted small">${esc(e.unit)} · +${e.step}</span></a>`).join('') || '<p class="muted">None</p>'}
    </section>`).join('')}
    ${archived.length ? `<section class="card"><h2>Removed</h2>${archived.map((e) => `<div class="entry"><span>${esc(e.name)}</span>
      <button class="btn sm" data-restore="${e.id}">Restore</button></div>`).join('')}</section>` : ''}`;
  return {
    html,
    mount(root) {
      on(root, '[data-restore]', 'click', (_e, el) => {
        const ex = state.exercises.find((x) => x.id === el.dataset.restore);
        return ctx.actions.saveExercise({ ...ex, archived: false });
      });
    },
  };
}

export function renderExerciseEdit(ctx, id) {
  const { state } = ctx;
  const isNew = id === 'new';
  const ex = isNew
    ? { id: '', name: '', workout: 'push', type: 'isolation', unit: 'lb', start: 20, step: 5, notes: '', pair: '', max: null, order: 99 }
    : state.exercises.find((x) => x.id === id);
  if (!ex) return { html: '<p class="muted center">Exercise not found.</p>' };
  const html = `
    <header class="page-head"><div><a href="#library" class="back">‹ Exercises</a><h1>${isNew ? 'New exercise' : esc(ex.name)}</h1></div></header>
    <form class="card stack" id="ex-form">
      <label>Name<input name="name" type="text" maxlength="80" value="${esc(ex.name)}" required></label>
      <div class="grid2">
        <label>Workout<select name="workout">${Object.entries(WORKOUTS).map(([k, w]) => `<option value="${k}" ${ex.workout === k ? 'selected' : ''}>${w.name}</option>`).join('')}</select></label>
        <label>Type<select name="type">${EXERCISE_TYPES.map((tp) => `<option ${ex.type === tp ? 'selected' : ''}>${tp}</option>`).join('')}</select></label>
        <label>Unit<input name="unit" type="text" maxlength="20" value="${esc(ex.unit)}" placeholder="lb, lb/DB, reps…"></label>
        <label>Step<input name="step" type="number" inputmode="decimal" min="0.1" step="any" value="${ex.step}"></label>
        <label>Start value<input name="start" type="number" inputmode="decimal" min="0" step="any" value="${ex.start}"></label>
        <label>Cap (optional)<input name="max" type="number" inputmode="decimal" min="0" step="any" value="${ex.max ?? ''}"></label>
        <label>Order<input name="order" type="number" inputmode="numeric" min="0" step="1" value="${ex.order}"></label>
        <label>Pair (e.g. A1)<input name="pair" type="text" maxlength="4" value="${esc(ex.pair ?? '')}"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2">${esc(ex.notes ?? '')}</textarea></label>
      <button class="btn primary block" type="submit">Save</button>
      ${isNew ? '' : '<button class="btn danger block" type="button" id="archive">Remove from program</button>'}
    </form>`;
  return {
    html,
    mount(root) {
      on(root, '#ex-form', 'submit', async (e, form) => {
        e.preventDefault();
        const f = form.elements;
        const name = f.name.value.trim();
        const step = readNumber(f.step, 'Step');
        const start = readNumber(f.start, 'Start value');
        if (!name) throw new Error('Give the exercise a name.');
        if (!step || step <= 0) throw new Error('Step must be more than 0.');
        if (start == null) throw new Error('Enter a start value.');
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exercise';
        const newId = state.exercises.some((x) => x.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug;
        const saved = await ctx.actions.saveExercise({
          ...ex,
          id: isNew ? newId : ex.id,
          name, workout: f.workout.value, type: f.type.value, unit: f.unit.value.trim() || 'lb', step, start,
          max: readNumber(f.max, 'Cap'), order: readNumber(f.order, 'Order') ?? 99, pair: f.pair.value.trim().toUpperCase() || null,
          notes: f.notes.value.trim(),
        });
        ctx.toast('Exercise saved');
        ctx.go(`#exercise/${encodeURIComponent(saved.id)}`);
      });
      on(root, '#archive', 'click', async () => {
        if (!await confirmSheet('Remove exercise?', 'It leaves the program. Its history is kept and it can be restored.', 'Remove')) return;
        await ctx.actions.saveExercise({ ...ex, archived: true });
        ctx.go('#library');
      });
    },
  };
}
