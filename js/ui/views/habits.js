import { CHORE_CATEGORIES, CHORE_FREQUENCIES } from '../../config/program.js';
import { FOOD_PROMPT, parseFoodReply } from '../../engine/coach.js';
import { choresForDate } from '../../engine/environment.js';
import { HABITS, HABIT_LABELS, deriveDay, emptyDay, liftDateSet } from '../../engine/metrics.js';
import { fmtDate, isISODate } from '../../util/dates.js';
import { confirmSheet, copyText, esc, fmtNum, on, readNumber, sheet } from '../dom.js';

const FIELD_LABELS = { pages: 'Pages', sleepH: 'Sleep', waterL: 'Water', proteinG: 'Protein', bodyWeight: 'Body weight' };
const ZERO_WHEN_BLANK = new Set(['pages', 'waterL', 'proteinG']); // amounts; sleep and weight stay "not logged"

function meter(label, value, target, unit) {
  const f = target ? Math.min(1, (value || 0) / target) : 0;
  return `<div class="meter"><div class="row-between"><span>${label}</span><span><b>${fmtNum(value || 0, 2)}</b> / ${target} ${unit}</span></div>
    <div class="xpbar"><span style="width:${Math.round(f * 100)}%;background:${f >= 1 ? '#4ade80' : 'var(--accent)'}"></span></div></div>`;
}

function dailySection(state, date) {
  const day = state.days.get(date) || emptyDay(date);
  const t = state.settings.targets;
  const derived = deriveDay(day, liftDateSet(state.lifts), t);
  const supps = state.settings.supplements || [];
  return `<section class="card">
    <div class="row-between"><h2>Daily log</h2><span class="pill">${derived.habitsDone}/${HABITS.length} habits</span></div>
    <div class="habit-dots">${HABITS.map((h) => `<span class="${derived.habits[h] ? 'on' : ''}">${HABIT_LABELS[h]}</span>`).join('')}</div>

    ${meter('Water', day.waterL, t.waterL, 'L')}
    <div class="btn-row">
      <button class="btn sm" data-bump="waterL" data-amt="-0.25">−250 ml</button>
      <button class="btn sm" data-bump="waterL" data-amt="0.25">+250 ml</button>
      <button class="btn sm" data-bump="waterL" data-amt="0.5">+500 ml</button>
      <button class="btn sm" data-bump="waterL" data-amt="1">+1 L</button>
    </div>
    ${meter('Protein', day.proteinG, t.proteinG, 'g')}
    <div class="btn-row">
      <button class="btn sm" data-bump="proteinG" data-amt="-10" data-places="0">−10 g</button>
      <button class="btn sm" data-bump="proteinG" data-amt="10" data-places="0">+10 g</button>
      <button class="btn sm" data-bump="proteinG" data-amt="25" data-places="0">+25 g</button>
      <button class="btn sm" data-bump="proteinG" data-amt="40" data-places="0">+40 g</button>
    </div>
    ${meter('Reading', day.pages, t.pages, 'pages')}

    <form class="grid2" id="day-form">
      <label>Pages read<input name="pages" type="number" inputmode="numeric" min="0" step="1" value="${day.pages || ''}"></label>
      <label>Sleep (h, last night)<input name="sleepH" type="number" inputmode="decimal" min="0" max="24" step="0.25" value="${day.sleepH ?? ''}"></label>
      <label>Water (L)<input name="waterL" type="number" inputmode="decimal" min="0" step="0.05" value="${day.waterL || ''}"></label>
      <label>Protein (g)<input name="proteinG" type="number" inputmode="numeric" min="0" step="1" value="${day.proteinG || ''}"></label>
      <label>Body weight (lb)<input name="bodyWeight" type="number" inputmode="decimal" min="0" step="0.1" value="${day.bodyWeight ?? ''}"></label>
    </form>
    <div class="ticks">
      <button class="tick ${day.journal ? 'on' : ''}" data-flag="journal" aria-pressed="${!!day.journal}">Journal</button>
      <button class="tick ${day.supplements ? 'on' : ''}" data-flag="supplements" aria-pressed="${!!day.supplements}">Supplements taken</button>
    </div>
    ${supps.length ? `<div class="ticks small-ticks">${supps.map((s) => {
      const on_ = (day.supplementsTaken || []).includes(s);
      return `<button class="tick ${on_ ? 'on' : ''}" data-supp="${esc(s)}" aria-pressed="${on_}">${esc(s)}</button>`;
    }).join('')}</div>` : ''}
    <label class="block">Notes<textarea id="day-notes" rows="2" placeholder="How did today go?">${esc(day.notes || '')}</textarea></label>
  </section>`;
}

function foodSection(state, date) {
  const items = state.food.filter((f) => f.date === date);
  const totals = items.reduce((s, f) => ({ kcal: s.kcal + (f.calories || 0), p: s.p + (f.proteinG || 0) }), { kcal: 0, p: 0 });
  return `<section class="card">
    <div class="row-between"><h2>Food</h2>${items.length ? `<span class="pill">~${totals.kcal} kcal · ~${totals.p} g protein</span>` : ''}</div>
    <ol class="steps small">
      <li><button class="btn sm" id="copy-food">Copy photo prompt</button> then open the Claude app.</li>
      <li>Paste the prompt, attach your meal photo, send.</li>
      <li>Copy Claude's reply and paste it below, or type the numbers yourself.</li>
    </ol>
    <textarea id="food-paste" rows="3" placeholder='Paste Claude reply, e.g. {"description":"...","calories":650,...}'></textarea>
    <button class="btn sm" id="parse-food">Read reply</button>
    <form class="grid2" id="food-form">
      <label class="span2">Meal<input name="description" type="text" maxlength="120" placeholder="e.g. Chicken and rice"></label>
      <label>Calories<input name="calories" type="number" inputmode="numeric" min="0" step="1"></label>
      <label>Protein (g)<input name="proteinG" type="number" inputmode="numeric" min="0" step="1"></label>
      <label>Carbs (g)<input name="carbsG" type="number" inputmode="numeric" min="0" step="1"></label>
      <label>Fat (g)<input name="fatG" type="number" inputmode="numeric" min="0" step="1"></label>
      <button class="btn primary span2" type="submit">Save meal (adds protein to today)</button>
    </form>
    <p class="muted small">All values are estimates.</p>
    ${items.map((f) => `<div class="entry"><span>${esc(f.description || 'Meal')} · ~${f.calories ?? '–'} kcal · ~${f.proteinG ?? '–'} g P
      ${f.carbsG != null ? ` · ${f.carbsG} C` : ''}${f.fatG != null ? ` · ${f.fatG} F` : ''}</span>
      <button class="btn sm ghost" data-del-food="${f.id}">Delete</button></div>`).join('')}
  </section>`;
}

function choresSection(state, date) {
  const list = choresForDate(state.chores, state.choreLog, date);
  const byCat = {};
  for (const item of list) (byCat[item.chore.category] ||= []).push(item);
  const freqLabel = { daily: 'daily', weekly: 'this week', once: 'one-off' };
  return `<section class="card">
    <div class="row-between"><h2>Chores and life tasks</h2><button class="btn sm" id="add-chore">Add</button></div>
    <p class="muted small">Chores improve your home, not your stats.</p>
    ${list.length ? Object.entries(byCat).map(([cat, items]) => `<h3 class="cat">${esc(cat)}</h3>
      ${items.map(({ chore, done }) => `<div class="chore ${done ? 'done' : ''}">
        <button class="check ${done ? 'on' : ''}" data-chore="${chore.id}" aria-pressed="${!!done}" aria-label="Mark ${esc(chore.name)} done"></button>
        <span>${esc(chore.name)} <small class="muted">${freqLabel[chore.frequency]}</small></span>
        <button class="btn sm ghost" data-del-chore="${chore.id}" aria-label="Remove ${esc(chore.name)}">✕</button>
      </div>`).join('')}`).join('') : '<p class="muted">No chores yet. Add laundry, cleaning, errands…</p>'}
  </section>`;
}

export function render(ctx) {
  const { state, ui } = ctx;
  const date = ui.habitsDate || ctx.today;
  const html = `
    <header class="page-head"><div><h1>Habits</h1><p class="muted">${fmtDate(date)}</p></div></header>
    <div class="inline date-row">
      <label>Date<input type="date" id="habits-date" value="${date}" max="${ctx.today}"></label>
      ${date !== ctx.today ? '<button class="btn sm" id="habits-today">Today</button>' : ''}
    </div>
    ${dailySection(state, date)}
    ${foodSection(state, date)}
    ${choresSection(state, date)}`;

  function mount(root) {
    const a = ctx.actions;
    on(root, '#habits-date', 'change', (e) => { if (isISODate(e.target.value)) { ui.habitsDate = e.target.value; ctx.refresh(); } });
    on(root, '#habits-today', 'click', () => { ui.habitsDate = null; ctx.refresh(); });
    on(root, '[data-bump]', 'click', (_e, el) => a.bumpDay(date, el.dataset.bump, Number(el.dataset.amt), Number(el.dataset.places ?? 2)));
    on(root, '#day-form input', 'change', (_e, input) => {
      const value = readNumber(input, FIELD_LABELS[input.name]);
      return a.saveDay(date, { [input.name]: value ?? (ZERO_WHEN_BLANK.has(input.name) ? 0 : null) });
    });
    on(root, '[data-flag]', 'click', (_e, el) => {
      const day = state.days.get(date) || emptyDay(date);
      return a.saveDay(date, { [el.dataset.flag]: !day[el.dataset.flag] });
    });
    on(root, '[data-supp]', 'click', (_e, el) => {
      const day = state.days.get(date) || emptyDay(date);
      const taken = new Set(day.supplementsTaken || []);
      if (taken.has(el.dataset.supp)) taken.delete(el.dataset.supp); else taken.add(el.dataset.supp);
      const all = (state.settings.supplements || []).every((s) => taken.has(s));
      return a.saveDay(date, { supplementsTaken: [...taken], supplements: all });
    });
    on(root, '#day-notes', 'change', (e) => a.saveDay(date, { notes: e.target.value.slice(0, 2000) }));

    on(root, '#copy-food', 'click', async () => {
      if (await copyText(FOOD_PROMPT)) ctx.toast('Prompt copied. Paste it into Claude with your photo.');
      else await sheet({ title: 'Copy this prompt', body: `<textarea rows="8" readonly>${esc(FOOD_PROMPT)}</textarea>` });
    });
    on(root, '#parse-food', 'click', () => {
      const r = parseFoodReply(root.querySelector('#food-paste').value);
      const f = root.querySelector('#food-form').elements;
      f.description.value = r.description;
      f.calories.value = r.calories ?? '';
      f.proteinG.value = r.proteinG ?? '';
      f.carbsG.value = r.carbsG ?? '';
      f.fatG.value = r.fatG ?? '';
      ctx.toast(`Read: ${r.description}${r.confidence ? ` (${r.confidence} confidence)` : ''}. Check, then Save.`);
    });
    on(root, '#food-form', 'submit', async (e, form) => {
      e.preventDefault();
      const f = form.elements;
      const entry = {
        date,
        description: f.description.value.trim() || 'Meal',
        calories: readNumber(f.calories, 'Calories'),
        proteinG: readNumber(f.proteinG, 'Protein'),
        carbsG: readNumber(f.carbsG, 'Carbs'),
        fatG: readNumber(f.fatG, 'Fat'),
        source: root.querySelector('#food-paste').value.trim() ? 'claude' : 'manual',
      };
      if (entry.calories == null && entry.proteinG == null) throw new Error('Enter at least calories or protein.');
      await a.addFood(entry);
      ctx.toast('Meal saved');
    });
    on(root, '[data-del-food]', 'click', async (_e, el) => {
      if (await confirmSheet('Delete meal?', 'Its protein is taken off the day total.', 'Delete')) await a.deleteFood(el.dataset.delFood);
    });

    on(root, '[data-chore]', 'click', (_e, el) => {
      const item = choresForDate(state.chores, state.choreLog, date).find((c) => c.chore.id === el.dataset.chore);
      return a.toggleChore(item.chore, date, item.done);
    });
    on(root, '[data-del-chore]', 'click', async (_e, el) => {
      const chore = state.chores.find((c) => c.id === el.dataset.delChore);
      if (await confirmSheet('Remove chore?', `"${chore.name}" will stop showing. Past completions still count.`, 'Remove')) {
        await a.saveChore({ ...chore, archived: true });
      }
    });
    on(root, '#add-chore', 'click', async () => {
      const result = await sheet({
        title: 'Add chore or task',
        body: `<form class="stack" id="chore-form">
          <label>Name<input name="name" type="text" maxlength="60" placeholder="e.g. Laundry"></label>
          <label>Category<select name="category">${CHORE_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
          <label>Repeats<select name="frequency">${CHORE_FREQUENCIES.map((f) => `<option value="${f}">${f === 'once' ? 'one-off' : f}</option>`).join('')}</select></label>
        </form>`,
        buttons: [
          { label: 'Cancel', value: null },
          {
            label: 'Add', kind: 'primary',
            value: (w) => {
              const f = w.querySelector('#chore-form').elements;
              return { name: f.name.value.trim(), category: f.category.value, frequency: f.frequency.value };
            },
          },
        ],
      });
      if (!result) return;
      if (!result.name) throw new Error('Give the chore a name.');
      await a.saveChore(result);
    });
  }
  return { html, mount };
}
