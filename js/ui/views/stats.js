import { ACTIVITIES, ACTIVITY_LABELS, FEELS, FEEL_LABELS, PACE_RATES, TESTS } from '../../config/program.js';
import { STATS, XP_RULES } from '../../config/game.js';
import { computeGame, sourceLabel, statHistory } from '../../engine/game.js';
import { computeDashboard } from '../../engine/metrics.js';
import { bodyWeightPace, testPace } from '../../engine/pace.js';
import { addDays, diffDays } from '../../util/dates.js';
import { barList, lineChart, xpBar } from '../charts.js';
import { esc, fmtNum, pct } from '../dom.js';

const FEEL_COLORS = { easy: '#4ade80', good: '#38bdf8', hard: '#fbbf24', missed: '#f87171' };

function statCards(game) {
  return `<div class="stat-grid">${Object.entries(STATS).map(([k, s]) => {
    const st = game.stats[k];
    return `<a class="card stat-card" href="#stat/${k}" style="--c:${s.color}">
      <div class="row-between"><b class="stat-key">${k}</b><span class="muted small">Lv</span></div>
      <div class="stat-level">${st.level}</div>
      ${xpBar(st.progress, s.color)}
      <p class="muted small">${esc(s.name)} · ${st.xp} XP</p>
    </a>`;
  }).join('')}</div>`;
}

function bodyWeightCard(state, today) {
  const weights = [...state.days.values()].filter((d) => d.bodyWeight).map((d) => ({ date: d.date, value: d.bodyWeight }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!weights.length) return '';
  const pace = bodyWeightPace(weights, state.settings);
  const first = weights[0];
  const rate = PACE_RATES.bodyWeight[state.settings.level];
  const expected = [first, { date: today, value: first.value * (1 + rate * (diffDays(today, first.date) / 7)) }];
  return `<section class="card">
    <div class="row-between"><h2>Body weight</h2><span class="pill pace-${pace.status}">${pace.label}</span></div>
    ${lineChart([{ label: 'Logged', color: '#ff7a3d', points: weights }, { label: 'Lean-bulk pace', color: '#94a3b8', points: expected, dashed: true }], { unit: 'lb' })}
  </section>`;
}

function testsCard(state) {
  const rows = TESTS.map((t) => {
    const entries = state.tests.filter((e) => e.testId === t.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!entries.length) return '';
    const p = testPace(t, entries, state.settings.level);
    return `<div class="entry"><span>${esc(t.name)}: <b>${fmtNum(entries[entries.length - 1].value, 2)}</b> ${t.unit}</span><span class="pill pace-${p.status}">${p.label}</span></div>`;
  }).join('');
  return rows ? `<section class="card"><h2>Tests</h2>${rows}</section>` : '';
}

export function render(ctx) {
  const { state, today } = ctx;
  const game = computeGame(state, today);
  const d = computeDashboard(state, today);
  const paceRows = d.lifts.rows.filter((r) => r.pace.status !== 'building');
  const html = `
    <header class="page-head"><div><h1>Stats</h1><p class="muted">Level ${game.overall.level} · ${game.totalXp} XP total</p></div></header>
    ${statCards(game)}

    <section class="card">
      <h2>This week</h2>
      <div class="kpis">
        <div><b>${d.week.done}/${d.week.target}</b><span>sessions</span></div>
        <div><b>${pct(d.habits7.rate)}</b><span>habits, 7 days</span></div>
        <div><b>${d.reading.days}/${d.reading.target}</b><span>reading days · ${d.reading.pages} pages</span></div>
        <div><b>${d.lifts.onPace}/${d.lifts.measured}</b><span>lifts on pace</span></div>
      </div>
      ${barList(ACTIVITIES.map((a) => ({ label: ACTIVITY_LABELS[a], value: d.week.perActivity[a].done, max: d.week.perActivity[a].target, text: `${d.week.perActivity[a].done}/${d.week.perActivity[a].target}` })))}
      <p class="focus">${esc(d.focus)}</p>
    </section>

    <section class="card">
      <h2>Consistency, last 14 days</h2>
      ${barList(d.consistency.map((r) => ({ label: r.label, value: r.rate, max: 1, text: pct(r.rate), color: r.rate >= 0.8 ? '#4ade80' : r.rate >= 0.5 ? '#fbbf24' : '#f87171' })))}
    </section>

    <section class="card">
      <h2>Long run</h2>
      <div class="kpis">
        <div><b>${d.longRun.cap} mi</b><span>next long-run cap</span></div>
        <div><b>${d.longRun.expected} mi</b><span>expected now</span></div>
        <div><b>${d.longRun.longest || 0} mi</b><span>longest, 30 days</span></div>
        <div><b>${d.longRun.goal} mi</b><span>goal</span></div>
      </div>
    </section>

    <section class="card">
      <h2>Training mix, 28 days</h2>
      ${barList(ACTIVITIES.map((a) => ({ label: ACTIVITY_LABELS[a], value: d.mix28[a] })))}
      <h3>Lift feel, 28 days</h3>
      ${barList(FEELS.map((f) => ({ label: FEEL_LABELS[f], value: d.feel28[f], color: FEEL_COLORS[f] })))}
    </section>

    <section class="card">
      <h2>Lifts on pace</h2>
      ${paceRows.length ? paceRows.map((r) => `<a class="entry" href="#exercise/${encodeURIComponent(r.exercise.id)}"><span>${esc(r.exercise.name)}</span>
        <span class="pill pace-${r.pace.status}">${r.pace.label}</span></a>`).join('') : '<p class="muted">Building data: each lift needs 2 sessions.</p>'}
    </section>
    ${bodyWeightCard(state, today)}
    ${testsCard(state)}`;
  return { html };
}

/** #stat/<KEY>: progression chart and what contributed. */
export function renderStat(ctx, key) {
  const s = STATS[key];
  if (!s) return { html: '<p class="muted center">Unknown stat.</p>' };
  const game = computeGame(ctx.state, ctx.today);
  const st = game.stats[key];
  const history = statHistory(game.events, key);
  const sources = Object.entries(game.breakdown[key]).sort((a, b) => b[1] - a[1]);
  const last7 = game.events.filter((e) => e.stat === key && e.date > addDays(ctx.today, -7)).reduce((sum, e) => sum + e.xp, 0);
  const rules = Object.values(XP_RULES).filter((r) => r.stat === key);
  const html = `
    <header class="page-head"><div><a href="#stats" class="back">‹ Stats</a><h1 style="color:${s.color}">${esc(s.name)}</h1>
      <p class="muted">Level ${st.level} · ${st.xp} XP · +${last7} XP this week</p></div></header>
    <section class="card">
      ${xpBar(st.progress, s.color)}
      <p class="muted small">${st.into} / ${st.span} XP to level ${st.level + 1}</p>
      ${lineChart([{ label: `${key} XP`, color: s.color, points: history }], { unit: 'XP' })}
    </section>
    <section class="card">
      <h2>What drives it</h2>
      ${sources.length ? barList(sources.map(([src, xp]) => ({ label: sourceLabel(src), value: xp, text: `${xp} XP`, color: s.color }))) : '<p class="muted">Nothing yet.</p>'}
      <h3>How to earn ${key}</h3>
      <ul class="small">${rules.map((r) => `<li>${esc(r.label)}: ${r.xp} XP${r.dailyCap ? ` (max ${r.dailyCap}/day)` : ''}</li>`).join('')}</ul>
      <p class="muted small">Stats never go down. Weekly bonuses add extra XP for consistent weeks.</p>
    </section>`;
  return { html };
}
