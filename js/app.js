// App entry: opens the database, loads state, routes between views, registers the
// service worker.
import { openDB } from './data/db.js';
import { createActions, loadState } from './data/store.js';
import { todayISO } from './util/dates.js';
import { probeArt } from './ui/art.js';
import { esc, toast } from './ui/dom.js';
import * as home from './ui/views/home.js';
import * as train from './ui/views/train.js';
import * as habits from './ui/views/habits.js';
import * as stats from './ui/views/stats.js';
import * as coach from './ui/views/coach.js';
import * as settings from './ui/views/settings.js';

const TABS = [
  { route: 'home', label: 'Home', icon: '◉' },
  { route: 'train', label: 'Train', icon: '▲' },
  { route: 'habits', label: 'Habits', icon: '✓' },
  { route: 'stats', label: 'Stats', icon: '▮' },
  { route: 'coach', label: 'Coach', icon: '✦' },
];

// Detail routes and which tab they belong to.
const ROUTES = {
  home: { tab: 'home', view: (ctx) => home.render(ctx) },
  train: { tab: 'train', view: (ctx) => train.render(ctx) },
  exercise: { tab: 'train', view: (ctx, p) => train.renderExercise(ctx, p) },
  habits: { tab: 'habits', view: (ctx) => habits.render(ctx) },
  stats: { tab: 'stats', view: (ctx) => stats.render(ctx) },
  stat: { tab: 'stats', view: (ctx, p) => stats.renderStat(ctx, p) },
  coach: { tab: 'coach', view: (ctx) => coach.render(ctx) },
  settings: { tab: 'coach', view: (ctx) => settings.render(ctx) },
  library: { tab: 'coach', view: (ctx, p) => (p ? settings.renderExerciseEdit(ctx, p) : settings.renderLibrary(ctx)) },
};

const main = document.getElementById('main');
const nav = document.getElementById('tabbar');
const ui = {}; // per-session view state, e.g. selected dates
let ctx;
let pendingRender = false;
let lastRoute = '';

function parseHash() {
  const [name, ...rest] = location.hash.replace(/^#/, '').split('/');
  const route = ROUTES[name] ? name : 'home';
  return { route, param: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

function renderNav(activeTab) {
  nav.innerHTML = TABS.map((t) => `<a href="#${t.route}" class="${t.route === activeTab ? 'on' : ''}" ${t.route === activeTab ? 'aria-current="page"' : ''}>
    <span class="ic" aria-hidden="true">${t.icon}</span><span>${t.label}</span></a>`).join('');
}

function render() {
  pendingRender = false;
  const { route, param } = parseHash();
  const def = ROUTES[route];
  ctx.today = todayISO();
  try {
    const view = def.view(ctx, param);
    main.innerHTML = view.html;
    view.mount?.(main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<section class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p>
      <a class="btn" href="#settings">Open settings to back up</a></section>`;
  }
  renderNav(def.tab);
  const key = `${route}/${param ?? ''}`;
  if (key !== lastRoute) window.scrollTo(0, 0);
  lastRoute = key;
}

const isEditing = () => main.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

/** Re-render after a data change, but not while the user is typing in a field. */
function scheduleRender() {
  if (isEditing()) { pendingRender = true; return; }
  render();
}

main.addEventListener('focusout', () => {
  setTimeout(() => { if (pendingRender && !isEditing()) render(); }, 0);
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // While developing on localhost, cache-first would serve stale files. Add ?sw to test offline.
  if (location.hostname === 'localhost' && !new URLSearchParams(location.search).has('sw')) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
      });
    });
  }).catch((err) => console.warn('Service worker not registered:', err));
  // Reload only when an update replaces a running version, not on the first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateBanner(worker) {
  const bar = document.getElementById('update');
  bar.hidden = false;
  bar.querySelector('button').onclick = () => worker.postMessage('SKIP_WAITING');
}

async function boot() {
  try {
    const db = await openDB();
    const state = await loadState(db);
    ctx = {
      state, ui, today: todayISO(), toast,
      actions: createActions(db, state, scheduleRender),
      refresh: render,
      go: (hash) => { location.hash = hash; },
    };
    navigator.storage?.persist?.().catch(() => {});
    window.addEventListener('hashchange', render);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      if (ctx.today !== todayISO()) render(); // new day while open
    });
    render();
    // Art probing never blocks start-up; custom art appears once found.
    probeArt().then((found) => { if (found) scheduleRender(); }).catch((err) => console.warn(err));
  } catch (err) {
    console.error(err);
    main.innerHTML = `<section class="card"><h2>Could not open your data</h2><p>${esc(err.message)}</p>
      <p class="muted small">Private Browsing blocks storage. Open the app from the Home Screen icon.</p></section>`;
  }
  registerServiceWorker();
}

boot();
