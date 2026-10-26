// Character and environment art. Drop PNGs into the asset slots and they replace the
// built-in placeholder SVGs with no code change:
//   assets/character/stage-1.png ... stage-5.png
//   assets/environment/level-1.png ... level-5.png
import { ART_SLOTS } from '../config/game.js';
import { esc } from './dom.js';

const available = new Set();
const stageUrl = (n) => `assets/character/stage-${n}.png`;
const levelUrl = (n) => `assets/environment/level-${n}.png`;

const PROBE_TIMEOUT_MS = 3000;

function probe(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(resolve, PROBE_TIMEOUT_MS); // weak signal: give up, keep placeholder
    img.onload = () => { clearTimeout(timer); available.add(url); resolve(); };
    img.onerror = () => { clearTimeout(timer); resolve(); };
    img.src = url;
  });
}

/** Checks which art slots have files. Resolves true if any custom art was found. */
export async function probeArt() {
  const urls = [];
  for (let i = 1; i <= ART_SLOTS.stages; i += 1) urls.push(stageUrl(i));
  for (let i = 1; i <= ART_SLOTS.levels; i += 1) urls.push(levelUrl(i));
  await Promise.all(urls.map(probe));
  return available.size > 0;
}

// ---------- placeholder creature: an original fire/water duality design ----------

const FLAME = 'M0,0 C-13,-9 -12,-30 0,-48 C3,-33 15,-26 13,-9 C11,0 5,3 0,0 Z';
const DROP = 'M0,-22 C8,-9 12,-3 12,3 A12,12 0 0 1 -12,3 C-12,-3 -8,-9 0,-22 Z';

function flame(x, y, scale, rot = 0, inner = true) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="${FLAME}" fill="url(#fireGrad)"/>
    ${inner ? `<path d="${FLAME}" fill="#ffe27a" transform="translate(0 -2) scale(0.5)"/>` : ''}
  </g>`;
}

function drop(x, y, scale, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="${DROP}" fill="url(#waterGrad)"/>
    <ellipse cx="-4" cy="0" rx="3" ry="5" fill="#ffffff" opacity="0.55"/>
  </g>`;
}

export function creatureSVG(stage) {
  const s = Math.max(1, Math.min(5, stage));
  const rx = 38 + s * 6;
  const ry = 34 + s * 5;
  const cx = 100;
  const cy = 128 - s * 2;
  const top = cy - ry;
  const crest = [];
  if (s >= 1) crest.push(drop(cx, top + 4, 0.9 + s * 0.12));
  if (s >= 2) crest.push(drop(cx - 16, top + 10, 0.6 + s * 0.06, -25));
  if (s >= 3) crest.push(drop(cx + 16, top + 10, 0.6 + s * 0.06, 25));
  if (s >= 5) crest.push(flame(cx - 30, top + 22, 0.45, -40, false), flame(cx + 30, top + 22, 0.45, 40, false));
  const tail = flame(cx - rx + 6, cy + 10, 0.7 + s * 0.18, -55);
  const tail2 = s >= 3 ? flame(cx - rx + 2, cy + 22, 0.45 + s * 0.08, -80) : '';
  const fin = s >= 2 ? `<path d="M${cx + rx - 6},${cy - 4} q${18 + s * 4},${-8 - s * 2} ${22 + s * 5},${10} q-${10 + s * 2},2 -${22 + s * 5},${14} z" fill="url(#waterGrad)" opacity="0.95"/>` : '';
  const wings = s >= 4 ? `
    <path d="M${cx - rx + 14},${cy - 18} q-40,-40 -30,-62 q16,22 42,36 z" fill="url(#fireGrad)" opacity="0.9"/>
    <path d="M${cx + rx - 14},${cy - 18} q40,-40 30,-62 q-16,22 -42,36 z" fill="url(#waterGrad)" opacity="0.9"/>` : '';
  const aura = s >= 4 ? `<circle cx="${cx}" cy="${cy}" r="${rx + 26}" fill="url(#auraGrad)"/>` : '';
  const eyeY = cy - ry * 0.25;
  const eyeR = 7 + s * 0.6;
  return `<svg viewBox="0 0 200 200" class="creature-svg" role="img" aria-label="Creature, stage ${s}">
    <defs>
      <linearGradient id="fireGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d2e"/><stop offset="1" stop-color="#ffb347"/></linearGradient>
      <linearGradient id="waterGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1e6fff"/><stop offset="1" stop-color="#7fd4ff"/></linearGradient>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff7a3d"/><stop offset="0.49" stop-color="#ff9a5c"/>
        <stop offset="0.51" stop-color="#5cb8ff"/><stop offset="1" stop-color="#3d8bff"/>
      </linearGradient>
      <radialGradient id="auraGrad"><stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.85" stop-color="#b9a4ff" stop-opacity="${s === 5 ? 0.45 : 0.25}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    </defs>
    ${aura}
    ${wings}
    ${tail2}${tail}
    ${fin}
    <ellipse cx="${cx - rx * 0.45}" cy="${cy + ry - 4}" rx="${10 + s}" ry="7" fill="#d9592a"/>
    <ellipse cx="${cx + rx * 0.45}" cy="${cy + ry - 4}" rx="${10 + s}" ry="7" fill="#2f73d9"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#bodyGrad)"/>
    <ellipse cx="${cx}" cy="${cy + ry * 0.3}" rx="${rx * 0.55}" ry="${ry * 0.5}" fill="#fff4e6" opacity="0.85"/>
    ${crest.join('')}
    <circle cx="${cx - rx * 0.36}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
    <circle cx="${cx + rx * 0.36}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
    <circle cx="${cx - rx * 0.33}" cy="${eyeY + 1}" r="${eyeR * 0.55}" fill="#1b1b2f"/>
    <circle cx="${cx + rx * 0.39}" cy="${eyeY + 1}" r="${eyeR * 0.55}" fill="#1b1b2f"/>
    <circle cx="${cx - rx * 0.30}" cy="${eyeY - 2}" r="${eyeR * 0.2}" fill="#fff"/>
    <circle cx="${cx + rx * 0.42}" cy="${eyeY - 2}" r="${eyeR * 0.2}" fill="#fff"/>
    <path d="M${cx - 8},${eyeY + 14} q8,7 16,0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - rx * 0.6}" cy="${eyeY + 12}" r="4" fill="#ff5d73" opacity="0.5"/>
    <circle cx="${cx + rx * 0.6}" cy="${eyeY + 12}" r="4" fill="#ff5d73" opacity="0.5"/>
  </svg>`;
}

// ---------- placeholder environment: a room that fills up with level ----------

function messLayer(mess) {
  if (!mess) return '';
  const a = `
    <path d="M60,160 q8,-6 16,0 q-4,6 -16,0z" fill="#8a6fb3"/>
    <rect x="236" y="146" width="22" height="16" rx="2" fill="#a0784a" transform="rotate(-8 247 154)"/>
    <path d="M150,166 q10,-8 22,-2 l-3,6 q-9,-3 -19,0z" fill="#d36b6b"/>`;
  const b = mess >= 2 ? `
    <path d="M100,150 q12,-4 20,4 q-10,4 -20,-4z" fill="#6b8fd3"/>
    <rect x="200" y="158" width="16" height="10" rx="2" fill="#7b5b3a"/>
    <circle cx="40" cy="120" r="2" fill="#9a8f80" opacity="0.6"/><circle cx="280" cy="90" r="2" fill="#9a8f80" opacity="0.6"/>
    <circle cx="180" cy="70" r="1.5" fill="#9a8f80" opacity="0.6"/><circle cx="90" cy="60" r="1.5" fill="#9a8f80" opacity="0.6"/>` : '';
  return a + b;
}

export function environmentSVG(level, mess = 0) {
  const L = Math.max(1, Math.min(5, level));
  const wall = ['#2a2f45', '#2f3550', '#33405e', '#384a6b', '#3d5478'][L - 1];
  const items = [];
  items.push(`<rect x="0" y="0" width="320" height="130" fill="${wall}"/>`);
  items.push(`<rect x="0" y="130" width="320" height="50" fill="#4a3b33"/>`);
  items.push(`<rect x="0" y="128" width="320" height="4" fill="#3a2d27"/>`);
  items.push(`<rect x="124" y="22" width="72" height="56" rx="4" fill="#9fd3ff" opacity="0.85"/><path d="M160,22 v56 M124,50 h72" stroke="${wall}" stroke-width="4"/>`);
  if (L === 1) items.push('<line x1="60" y1="0" x2="60" y2="30" stroke="#888" stroke-width="1.5"/><circle cx="60" cy="34" r="6" fill="#ffe9a8"/>');
  items.push(`<ellipse cx="160" cy="156" rx="${30 + L * 12}" ry="${8 + L * 2}" fill="${L >= 2 ? '#7a4a8c' : '#5e5048'}" opacity="0.9"/>`);
  if (L >= 2) items.push('<rect x="14" y="104" width="82" height="34" rx="6" fill="#5a6ea8"/><rect x="14" y="96" width="24" height="20" rx="5" fill="#e8eefc"/><rect x="10" y="132" width="90" height="10" rx="3" fill="#6b4a37"/>');
  if (L >= 3) {
    items.push('<rect x="232" y="56" width="70" height="6" rx="2" fill="#7b5b3a"/><rect x="238" y="38" width="8" height="18" fill="#e86f5a"/><rect x="248" y="42" width="8" height="14" fill="#6fb3e8"/><rect x="258" y="36" width="7" height="20" fill="#f2c94c"/>');
    items.push('<path d="M268,128 l6,-22 h18 l6,22z" fill="#c0703f"/><path d="M283,106 q-14,-24 -4,-38 q4,20 4,38 q2,-22 14,-30 q-2,18 -14,30z" fill="#4caf72"/>');
  }
  if (L >= 4) {
    items.push('<rect x="214" y="80" width="4" height="50" fill="#c9c9c9"/><path d="M204,80 h24 l-6,-16 h-12z" fill="#ffd27a"/><ellipse cx="216" cy="130" rx="12" ry="3" fill="#999"/>');
    items.push('<rect x="40" y="30" width="44" height="34" rx="3" fill="#f5f0e6"/><path d="M48,56 l10,-14 8,9 6,-6 8,11z" fill="#6fb3e8"/>');
  }
  if (L >= 5) {
    // fire and water: a small hearth and an aquarium
    items.push('<rect x="112" y="96" width="44" height="34" rx="3" fill="#6d4c41"/><rect x="120" y="104" width="28" height="22" rx="2" fill="#2b1b14"/><path d="M134,126 q-8,-8 0,-18 q8,10 0,18z" fill="#ff8a3d"/>');
    items.push('<rect x="168" y="100" width="44" height="30" rx="3" fill="#2f73d9" opacity="0.75"/><path d="M178,116 q6,-5 12,0 q-6,5 -12,0z" fill="#ffb347"/><circle cx="200" cy="108" r="2" fill="#fff" opacity="0.7"/>');
  }
  return `<svg viewBox="0 0 320 180" class="env-svg" role="img" aria-label="Home, level ${L}">${items.join('')}${messLayer(mess)}</svg>`;
}

export function creatureArt(stage, name) {
  const url = stageUrl(stage);
  if (available.has(url)) return `<img src="${url}" alt="${esc(name)}" class="art-img">`;
  return creatureSVG(stage);
}

export function environmentArt(level, mess) {
  const url = levelUrl(level);
  const messClass = mess ? ` mess-${mess}` : '';
  if (available.has(url)) return `<div class="env-img${messClass}"><img src="${url}" alt="Home, level ${level}" class="art-img"></div>`;
  return environmentSVG(level, mess);
}

/** Flash, scale and confetti when the creature evolves. */
export function playEvolution(stageName) {
  const wrap = document.createElement('div');
  wrap.className = 'evolve';
  const colors = ['#ff7a3d', '#ffb347', '#3d8bff', '#7fd4ff', '#b9a4ff'];
  const bits = Array.from({ length: 40 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    return `<i style="left:${left}%;background:${colors[i % colors.length]};animation-delay:${delay}s"></i>`;
  }).join('');
  wrap.innerHTML = `<div class="evolve-flash"></div><div class="evolve-text">Evolved into<br><b>${esc(stageName)}</b>!</div>${bits}`;
  wrap.addEventListener('click', () => wrap.remove());
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4000);
}
