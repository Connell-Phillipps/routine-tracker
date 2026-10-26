// The living home: the creature wanders its room and does things that mirror your day.
// Pure DOM + CSS transitions; one loop per mounted scene, stopped when it leaves the page.
import { creatureArt, hasArt, stageUrl } from './art.js';
import { esc } from './dom.js';
import { ROOM, WALK, roomArt, spotsFor } from './room.js';

const SPEED = 55; // room units per second
const BUBBLE_MS = 3500;
const NEAR = 14; // already this close to a spot: don't walk again
// Survives re-renders: a data change resumes the current walk or activity instead of
// restarting it. walk = { x0, y0, x1, y1, t0, t1 }, act = { kind, until }.
const memory = { x: 190, y: 340, facing: 1, walk: null, act: null };

/** Where the creature is right now, mid-walk included. */
function currentPos(now = Date.now()) {
  const w = memory.walk;
  if (!w) return { x: memory.x, y: memory.y };
  if (now >= w.t1) return { x: w.x1, y: w.y1 };
  const f = (now - w.t0) / (w.t1 - w.t0);
  return { x: w.x0 + (w.x1 - w.x0) * f, y: w.y0 + (w.y1 - w.y0) * f };
}

const DUMBBELL = '<svg viewBox="0 0 40 16" width="34"><rect x="2" y="2" width="6" height="12" rx="2" fill="#555"/><rect x="32" y="2" width="6" height="12" rx="2" fill="#555"/><rect x="8" y="6" width="24" height="4" fill="#999"/></svg>';

// Each activity: where it happens, what it shows, how long it lasts (ms).
const ACTIVITIES = {
  lift: { spots: ['mat'], prop: DUMBBELL, cls: 'act-lift', ms: 6000 },
  yoga: { spots: ['mat'], prop: '🧘', cls: 'act-yoga', ms: 6000 },
  run: { spots: ['rug'], prop: '👟', cls: 'act-run', ms: 5000 },
  swim: { spots: ['aquarium', 'rug'], prop: '💦', cls: 'act-wiggle', ms: 4500 },
  read: { spots: ['shelf', 'beanbag', 'rug'], prop: '📖', cls: 'act-read', ms: 7000 },
  journal: { spots: ['beanbag', 'rug'], prop: '✏️', cls: 'act-read', ms: 6000 },
  drink: { spots: [], prop: '💧', cls: 'act-sip', ms: 3500 },
  eat: { spots: [], prop: '🍗', cls: 'act-sip', ms: 3500 },
  gaze: { spots: ['window', 'hearth', 'aquarium'], prop: '✨', cls: '', ms: 4500 },
  sigh: { spots: [], prop: '💭', cls: 'act-sigh', ms: 4000 },
  yawn: { spots: ['bed'], prop: '🥱', cls: 'act-sigh', ms: 4000 },
  sleep: { spots: ['bed', 'beanbag', 'mat'], prop: '💤', cls: 'act-sleep', ms: 20000 },
  wander: { spots: [], prop: '', cls: '', ms: 1500 },
};

export const isNight = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 6;

const pct = (x, y) => ({ left: `${(x / ROOM.w) * 100}%`, top: `${(y / ROOM.h) * 100}%` });
const depth = (y) => 0.82 + ((y - WALK.y0) / (WALK.y1 - WALK.y0)) * 0.28; // nearer = bigger

// Height of the placeholder art's head, as % of its box, so the name tag sits just above it.
const HEAD_TOP = { 1: 68, 2: 72, 3: 76, 4: 84, 5: 88 };

export function sceneHTML({ stage, name, level, xpProgress, envLevel, mess, night }) {
  const here = currentPos();
  const p = pct(here.x, here.y);
  const head = hasArt(stageUrl(stage)) ? 100 : HEAD_TOP[stage] ?? 80;
  return `<div class="scene ${night ? 'is-night' : ''}" id="scene">
    ${roomArt(envLevel, mess, night)}
    <button class="critter" id="critter" style="left:${p.left};top:${p.top};--s:${depth(here.y).toFixed(3)};--head:${head}%" aria-label="${esc(name)}, level ${level}. Tap for a tip.">
      <span class="nametag"><b>${esc(name)}</b> · Lv ${level}<i><em style="width:${Math.round(xpProgress * 100)}%"></em></i></span>
      <span class="bubble" hidden></span>
      <span class="body ${memory.facing < 0 ? 'face-left' : ''}">
        <span class="prop" hidden></span>
        <span class="bob">${creatureArt(stage, name, { sleeping: false })}</span>
      </span>
      <span class="shadow"></span>
    </button>
  </div>`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

function pickWeighted(options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of options) { r -= o.weight; if (r <= 0) return o; }
  return options[options.length - 1];
}

/**
 * Starts the creature's life loop inside `root`.
 * today: { lift, yoga, run, swim, read, journal, drink, eat, mess, lowSleep } booleans from the day's log.
 * lines: tips shown when tapped. sleepingArt: creature SVG with eyes closed.
 */
export function startScene(root, { envLevel, night, today, lines, sleepingArt, awakeArt, onNightChange }) {
  const critter = root.querySelector('#critter');
  if (!critter) return;
  const body = critter.querySelector('.body');
  const bob = critter.querySelector('.bob');
  const prop = critter.querySelector('.prop');
  const bubble = critter.querySelector('.bubble');
  const spots = spotsFor(envLevel);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alive = () => critter.isConnected;
  let lineIndex = 0;
  let bubbleTimer;

  function place(x, y, seconds) {
    critter.style.transition = seconds ? `left ${seconds}s linear, top ${seconds}s linear, transform ${seconds}s linear` : 'none';
    const p = pct(x, y);
    critter.style.left = p.left;
    critter.style.top = p.top;
    critter.style.setProperty('--s', depth(y).toFixed(3));
    critter.style.zIndex = String(Math.round(y));
  }

  async function walkTo(x, y) {
    const from = currentPos();
    const dx = x - from.x;
    const dist = Math.hypot(dx, y - from.y);
    if (dist < 4) return;
    if (Math.abs(dx) > 2) {
      memory.facing = dx < 0 ? -1 : 1;
      body.classList.toggle('face-left', memory.facing < 0);
    }
    const seconds = dist / SPEED;
    const now = Date.now();
    memory.walk = { x0: from.x, y0: from.y, x1: x, y1: y, t0: now, t1: now + seconds * 1000 };
    critter.classList.add('walking');
    place(x, y, seconds);
    await wait(seconds * 1000);
    if (!alive()) return; // a re-render took over; it resumes from memory.walk
    memory.walk = null;
    memory.x = x;
    memory.y = y;
    critter.classList.remove('walking');
  }

  async function perform(kind, ms = ACTIVITIES[kind].ms * rand(0.8, 1.2)) {
    const a = ACTIVITIES[kind];
    memory.act = { kind, until: Date.now() + ms };
    if (a.prop) { prop.innerHTML = a.prop; prop.hidden = false; }
    if (a.cls) critter.classList.add(a.cls);
    if (kind === 'sleep') bob.innerHTML = sleepingArt;
    await wait(ms);
    if (!alive()) return; // a re-render took over; it resumes from memory.act
    memory.act = null;
    if (a.cls) critter.classList.remove(a.cls);
    if (kind === 'sleep' && !night) bob.innerHTML = awakeArt;
    prop.hidden = true;
  }

  /** After a re-render: finish the walk or activity that was under way. */
  async function resume() {
    const w = memory.walk;
    if (w && Date.now() < w.t1) {
      const seconds = (w.t1 - Date.now()) / 1000;
      critter.classList.add('walking');
      place(w.x1, w.y1, seconds);
      await wait(seconds * 1000);
      if (!alive()) return;
      critter.classList.remove('walking');
    }
    if (memory.walk) { memory.x = memory.walk.x1; memory.y = memory.walk.y1; memory.walk = null; }
    const act = memory.act;
    if (act && Date.now() < act.until && !(act.kind === 'sleep' && !night)) await perform(act.kind, act.until - Date.now());
    else memory.act = null;
  }

  function destination(kind) {
    const ids = ACTIVITIES[kind].spots.filter((id) => spots[id]);
    if (ids.length) {
      const s = spots[ids[0]];
      return { x: s.x + rand(-8, 8), y: s.y + rand(-4, 4) };
    }
    return { x: rand(WALK.x0, WALK.x1), y: rand(WALK.y0, WALK.y1) };
  }

  function nextActivity() {
    if (night) return 'sleep';
    const o = [{ kind: 'wander', weight: 3 }, { kind: 'gaze', weight: 1.5 }];
    for (const k of ['lift', 'yoga', 'run', 'swim', 'read', 'journal', 'drink', 'eat']) if (today[k]) o.push({ kind: k, weight: 3 });
    if (today.mess) o.push({ kind: 'sigh', weight: 2 * today.mess });
    if (today.lowSleep && spots.bed) o.push({ kind: 'yawn', weight: 1.5 });
    return pickWeighted(o).kind;
  }

  const nightChanged = () => isNight() !== night;

  async function life() {
    await resume();
    while (alive()) {
      if (nightChanged()) { onNightChange?.(); return; } // 10 pm / 6 am: redraw the room
      if (document.hidden) { await wait(2000); continue; }
      const kind = nextActivity();
      const to = destination(kind);
      const here = currentPos();
      if (Math.hypot(to.x - here.x, to.y - here.y) > NEAR || !ACTIVITIES[kind].spots.length) await walkTo(to.x, to.y);
      if (!alive()) return;
      await perform(kind);
      if (!alive()) return;
      await wait(rand(800, 2500));
    }
  }

  /** Keeps the speech bubble inside the room near the walls. */
  function fitBubble() {
    bubble.style.setProperty('--bx', '0px');
    const scene = root.querySelector('#scene').getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const pad = 6;
    let shift = 0;
    if (b.left < scene.left + pad) shift = scene.left + pad - b.left;
    else if (b.right > scene.right - pad) shift = scene.right - pad - b.right;
    bubble.style.setProperty('--bx', `${shift}px`);
  }

  critter.addEventListener('click', () => {
    critter.classList.remove('hop');
    void critter.offsetWidth; // restart the hop animation
    critter.classList.add('hop');
    if (!lines.length) return;
    bubble.textContent = lines[lineIndex % lines.length];
    lineIndex += 1;
    bubble.hidden = false;
    fitBubble();
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, BUBBLE_MS);
  });

  const here = currentPos();
  place(here.x, here.y, 0);
  if (reduced) {
    memory.walk = null;
    if (night) { bob.innerHTML = sleepingArt; prop.innerHTML = ACTIVITIES.sleep.prop; prop.hidden = false; }
    return;
  }
  life().catch((err) => console.warn('Scene stopped:', err));
}
