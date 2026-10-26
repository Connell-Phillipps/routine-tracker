import { ACTIVITIES, ACTIVITY_LABELS, PHASE_LABELS, WORKOUTS } from '../../config/program.js';
import { REQ_LABELS, STATS } from '../../config/game.js';
import { phaseInfo, plannedSessions, scheduleFor, workoutForDate } from '../../engine/calendar.js';
import { upcomingSession } from '../../engine/coach.js';
import { choresForDate, environmentState } from '../../engine/environment.js';
import { computeGame } from '../../engine/game.js';
import { HABITS, HABIT_LABELS, deriveDay, emptyDay, liftDateSet } from '../../engine/metrics.js';
import { diffDays, fmtDate, todayISO } from '../../util/dates.js';
import { creatureArt, playEvolution } from '../art.js';
import { ring } from '../charts.js';
import { esc, fmtNum, on } from '../dom.js';
import { isNight, sceneHTML, startScene } from '../scene.js';

const BACKUP_REMINDER_DAYS = 7;

export function phasePill(state, date) {
  const info = phaseInfo(date, state.settings);
  const week = info.phaseWeek ? ` · wk ${info.phaseWeek}/${info.phaseLength}` : '';
  return `<span class="pill phase-${info.phase}">${PHASE_LABELS[info.phase]}${week}</span>`;
}

function backupBanner(state) {
  const hasData = state.days.size > 0 || state.lifts.length > 0;
  if (!hasData) return '';
  const last = state.settings.lastBackup;
  const days = last ? diffDays(todayISO(), last.slice(0, 10)) : null;
  if (days != null && days < BACKUP_REMINDER_DAYS) return '';
  const msg = days == null ? 'No backup yet.' : `Last backup ${days} days ago.`;
  return `<a class="banner warn" href="#settings">${msg} iOS can clear app data after a few weeks unused. Tap to back up.</a>`;
}

function nextStageText(game) {
  if (!game.nextStage) return 'Final form reached.';
  const parts = [`level ${game.nextStage.minLevel}`];
  for (const [k, v] of Object.entries(game.nextStage.req)) {
    parts.push(`${Math.min(game.progress[k] || 0, v)}/${v} ${REQ_LABELS[k]}`);
  }
  return `Next form: ${parts.join(' · ')}`;
}

function activityButtons(day, derived, date) {
  const plan = scheduleFor(date).plan;
  const planned = ACTIVITIES.filter((a) => plan[a] || scheduleFor(date).optional?.includes(a));
  const others = ACTIVITIES.filter((a) => !planned.includes(a));
  const btn = (a) => {
    const done = derived.activities[a];
    const auto = (a === 'lift' && done && !day.lift) || (a === 'run' && day.runMi > 0);
    return `<button class="tick ${done ? 'on' : ''}" data-act="${a}" ${auto ? 'data-auto="1"' : ''} aria-pressed="${done}">
      ${ACTIVITY_LABELS[a]}${plan[a] === 0.5 ? ' <small>½</small>' : ''}</button>`;
  };
  return `<div class="ticks">${planned.map(btn).join('')}</div>
    <details class="more"><summary>Other activities</summary><div class="ticks">${others.map(btn).join('')}</div></details>`;
}

/** What the creature says when tapped: the most useful nudges first. */
function tipLines(state, today, day, derived, env, game, night) {
  const t = state.settings.targets;
  const lines = [];
  if (night) lines.push(`Zzz… aiming for ${t.sleepH} h tonight.`);
  const session = upcomingSession(state, today);
  if (session && session.date === today && session.items.length) {
    const first = session.items[0];
    lines.push(`${WORKOUTS[session.workout].name} day! First up: ${first.exercise.name}, ${fmtNum(first.value, 2)} ${first.exercise.unit}.`);
  }
  if ((day.waterL || 0) < t.waterL) lines.push(`Water: ${fmtNum(t.waterL - (day.waterL || 0), 2)} L to go.`);
  if ((day.proteinG || 0) < t.proteinG) lines.push(`Protein: ${Math.round(t.proteinG - (day.proteinG || 0))} g to go.`);
  if ((day.pages || 0) < t.pages) lines.push(`${t.pages - (day.pages || 0)} more pages? I'll read with you.`);
  if (env.mess) lines.push('The place is getting messy… one quick chore fixes it.');
  lines.push(`${game.overall.span - game.overall.into} XP to level ${game.overall.level + 1}!`);
  if (derived.habitsDone === HABITS.length) lines.unshift('Every habit ticked today. Great day!');
  return lines;
}

export function render(ctx) {
  const { state, today } = ctx;
  const game = computeGame(state, today);
  const env = environmentState(state.choreLog, today);
  const day = state.days.get(today) || emptyDay(today);
  const derived = deriveDay(day, liftDateSet(state.lifts), state.settings.targets);
  const planned = plannedSessions(today);
  const workout = workoutForDate(today);
  const due = choresForDate(state.chores, state.choreLog, today);
  const dueOpen = due.filter((c) => !c.done).length;
  const t = state.settings.targets;
  const night = isNight();

  const html = `
    <header class="page-head compact">
      <div><h1>${night ? 'Tonight' : 'Today'}</h1><p class="muted small">${fmtDate(today)}</p></div>
      ${phasePill(state, today)}
    </header>
    ${backupBanner(state)}

    ${sceneHTML({
    stage: game.stage.stage, name: game.stage.name, level: game.overall.level, xpProgress: game.overall.progress,
    envLevel: env.effectiveLevel, mess: env.mess, night,
  })}
    <div class="scene-foot">
      <div class="stat-chips">
        ${Object.entries(STATS).map(([k, s]) => `<a class="chip" href="#stat/${k}" style="--c:${s.color}"><b>${k}</b><span>Lv ${game.stats[k].level}</span></a>`).join('')}
      </div>
      <p class="muted small center">${esc(nextStageText(game))}</p>
    </div>

    <section class="card">
      <div class="row-between">
        <h2>Training</h2>
        ${ring(planned ? derived.sessionsDone / planned : derived.sessionsDone ? 1 : 0, `${derived.sessionsDone}/${fmtNum(planned)}`, 'sessions', 76)}
      </div>
      ${activityButtons(day, derived, today)}
      ${workout ? `<a class="btn primary block" href="#train">Log ${WORKOUTS[workout].name} lift</a>` : '<a class="btn block" href="#train">Log a lift</a>'}
    </section>

    <section class="card">
      <div class="row-between">
        <h2>Habits</h2>
        ${ring(derived.habitsDone / HABITS.length, `${derived.habitsDone}/${HABITS.length}`, 'habits', 76, '#4ade80')}
      </div>
      <div class="quick">
        <div><span>Water ${fmtNum(day.waterL, 2)} / ${t.waterL} L</span>
          <button class="btn sm" data-bump="waterL" data-amt="0.25">+250 ml</button>
          <button class="btn sm" data-bump="waterL" data-amt="0.5">+500 ml</button></div>
        <div><span>Protein ${fmtNum(day.proteinG, 0)} / ${t.proteinG} g</span>
          <button class="btn sm" data-bump="proteinG" data-amt="25">+25 g</button>
          <button class="btn sm" data-bump="proteinG" data-amt="10">+10 g</button></div>
        <div><span>Pages ${day.pages || 0} / ${t.pages}</span>
          <button class="btn sm" data-bump="pages" data-amt="5">+5</button>
          <button class="btn sm" data-bump="pages" data-amt="10">+10</button></div>
      </div>
      <div class="ticks">
        ${['journal', 'supplements'].map((h) => `<button class="tick ${day[h] ? 'on' : ''}" data-flag="${h}" aria-pressed="${!!day[h]}">${HABIT_LABELS[h]}</button>`).join('')}
        <a class="tick link" href="#habits">Sleep, weight, food…</a>
      </div>
    </section>

    <a class="card row-between" href="#habits">
      <div><h2>Home · ${esc(env.base.name)}</h2>
        <p class="muted small">${env.condition}${env.daysSince != null ? ` · last chore ${env.daysSince === 0 ? 'today' : `${env.daysSince}d ago`}` : ''}
        ${env.next ? ` · ${env.points}/${env.next.minPoints} pts to next` : ''}</p></div>
      <span class="pill">${state.chores.length ? `${dueOpen} due` : 'Add chores'}</span>
    </a>`;

  function mount(root) {
    on(root, '[data-act]', 'click', async (_e, el) => {
      const a = el.dataset.act;
      if (el.dataset.auto) {
        ctx.toast(a === 'lift' ? 'Ticked by your logged lifts. Edit them in Train.' : 'Ticked by run miles. Edit in Train.');
        return;
      }
      await ctx.actions.saveDay(today, { [a]: !day[a] });
    });
    on(root, '[data-bump]', 'click', (_e, el) => ctx.actions.bumpDay(today, el.dataset.bump, Number(el.dataset.amt)));
    on(root, '[data-flag]', 'click', (_e, el) => ctx.actions.saveDay(today, { [el.dataset.flag]: !day[el.dataset.flag] }));

    const a = derived.activities;
    startScene(root, {
      envLevel: env.effectiveLevel,
      night,
      onNightChange: ctx.refresh,
      lines: tipLines(state, today, day, derived, env, game, night),
      today: {
        lift: a.lift || !!workout, yoga: a.yoga, run: a.run, swim: a.swim,
        read: (day.pages || 0) > 0, journal: !!day.journal, drink: (day.waterL || 0) > 0,
        eat: state.food.some((f) => f.date === today) || (day.proteinG || 0) > 0,
        mess: env.mess, lowSleep: day.sleepH != null && day.sleepH < t.sleepH,
      },
      awakeArt: creatureArt(game.stage.stage, game.stage.name),
      sleepingArt: creatureArt(game.stage.stage, game.stage.name, { sleeping: true }),
    });

    if (game.stage.stage > (state.settings.seenStage || 1)) {
      playEvolution(game.stage.name);
      ctx.actions.saveSettings({ seenStage: game.stage.stage }).catch((err) => console.error(err));
    }
  }
  return { html, mount };
}
