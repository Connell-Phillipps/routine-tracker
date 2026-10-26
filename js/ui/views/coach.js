import { PHASE_LABELS, WORKOUTS } from '../../config/program.js';
import { buildCoachPrompt, parseCoachReply, upcomingSession, weeklyReview } from '../../engine/coach.js';
import { BASIS_LABELS } from '../../engine/progression.js';
import { fmtDate } from '../../util/dates.js';
import { copyText, esc, fmtNum, on, sheet } from '../dom.js';

function planCard(session) {
  if (!session) return '<section class="card"><h2>Next session</h2><p class="muted">No lift planned in the next 7 days.</p></section>';
  return `<section class="card">
    <div class="row-between"><h2>Next: ${WORKOUTS[session.workout].name}</h2><span class="pill phase-${session.phase}">${PHASE_LABELS[session.phase]}</span></div>
    <p class="muted small">${fmtDate(session.date)} · rules-based plan</p>
    <table class="plan">
      <thead><tr><th>Exercise</th><th>Target</th><th>Sets × reps</th></tr></thead>
      <tbody>${session.items.map((i) => `<tr>
        <td>${i.exercise.pair ? `<span class="pair">${esc(i.exercise.pair)}</span>` : ''}${esc(i.exercise.name)}
          <div class="muted small">${i.override ? `Coach: ${esc(i.override.rationale || i.override.note || 'accepted plan')} <button class="link-btn" data-clear="${i.exercise.id}">use rules</button>` : esc(BASIS_LABELS[i.rules.basis])}</div></td>
        <td><b>${fmtNum(i.value, 2)}</b> <span class="muted small">${esc(i.exercise.unit)}</span>${i.override && i.override.value !== i.rules.value ? `<div class="muted small">rules ${fmtNum(i.rules.value, 2)}</div>` : ''}</td>
        <td class="small">${esc(i.setsReps)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;
}

function diffBody(parsed, session) {
  const rulesById = new Map((session?.items || []).map((i) => [i.exercise.id, i]));
  const rows = parsed.items.map((item, idx) => {
    const rules = rulesById.get(item.exercise.id);
    const rv = rules ? rules.rules.value : null;
    const changed = rv == null || rv !== item.value;
    return `<label class="diff-row">
      <input type="checkbox" data-idx="${idx}" ${changed ? 'checked' : ''}>
      <span><b>${esc(item.exercise.name)}</b><br>
        ${rv != null ? `rules ${fmtNum(rv, 2)} → ` : ''}<b>${fmtNum(item.value, 2)} ${esc(item.exercise.unit)}</b>${item.sets ? ` · ${item.sets} × ${esc(item.reps ?? '')}` : ''}
        ${item.rationale ? `<br><span class="muted small">${esc(item.rationale)}</span>` : ''}</span>
    </label>`;
  }).join('');
  return `${parsed.summary ? `<p>${esc(parsed.summary)}</p>` : ''}
    ${parsed.errors.length ? `<div class="banner warn">${parsed.errors.map(esc).join('<br>')}</div>` : ''}
    <p class="muted small">Ticked changes become your targets for the next session of each lift. Unticked lifts keep the rules plan.</p>
    ${rows || '<p class="muted">Nothing usable in the reply.</p>'}`;
}

export function render(ctx) {
  const { state, today } = ctx;
  const session = upcomingSession(state, today);
  const review = weeklyReview(state, today);
  const html = `
    <header class="page-head"><div><h1>Coach</h1><p class="muted">Rules-based, on your phone. Not medical advice.</p></div>
      <a class="btn sm" href="#settings" aria-label="Settings">⚙ Settings</a></header>
    ${review.flags.length ? `<section class="card flags"><h2>Recovery</h2>${review.flags.map((f) => `<p class="banner warn">${esc(f.text)}</p>`).join('')}</section>` : ''}
    ${planCard(session)}
    <section class="card">
      <h2>Weekly review</h2>
      <ul>${review.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>
    <section class="card">
      <h2>Ask Claude</h2>
      <ol class="steps small">
        <li><button class="btn sm primary" id="copy-prompt">Copy coach prompt</button></li>
        <li>Paste it into the Claude app and send.</li>
        <li>Copy Claude's JSON reply and paste it here.</li>
      </ol>
      <textarea id="coach-reply" rows="5" placeholder='{"workout":"push","lifts":[...]}'></textarea>
      <button class="btn block" id="read-reply">Compare with rules plan</button>
      <p class="muted small">Nothing changes until you accept. Uses your Claude subscription; nothing is sent from this app.</p>
    </section>`;

  function mount(root) {
    on(root, '#copy-prompt', 'click', async () => {
      const prompt = buildCoachPrompt(state, today);
      if (await copyText(prompt)) ctx.toast('Prompt copied. Paste it into Claude.');
      else await sheet({ title: 'Copy this prompt', body: `<textarea rows="12" readonly>${esc(prompt)}</textarea>` });
    });
    on(root, '#read-reply', 'click', async () => {
      const parsed = parseCoachReply(root.querySelector('#coach-reply').value, state);
      const picked = await sheet({
        title: 'Claude vs rules',
        body: diffBody(parsed, session),
        buttons: [
          { label: 'Reject all', value: null },
          {
            label: 'Accept ticked', kind: 'primary',
            value: (w) => [...w.querySelectorAll('input[data-idx]:checked')].map((c) => parsed.items[Number(c.dataset.idx)]),
          },
        ],
      });
      if (!picked?.length) { ctx.toast('No changes made.'); return; }
      await ctx.actions.acceptOverrides(picked);
      ctx.toast(`${picked.length} target${picked.length > 1 ? 's' : ''} updated from Claude.`);
    });
    on(root, '[data-clear]', 'click', (_e, el) => ctx.actions.clearOverride(el.dataset.clear));
  }
  return { html, mount };
}
