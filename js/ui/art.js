// Character art. Drop PNGs into the asset slots and they replace the built-in
// placeholder SVGs with no code change:
//   assets/character/stage-1.png ... stage-5.png
//   assets/environment/level-1.png ... level-5.png   (see room.js)
import { ART_SLOTS } from '../config/game.js';
import { esc } from './dom.js';

const available = new Set();
export const stageUrl = (n) => `assets/character/stage-${n}.png`;
export const levelUrl = (n) => `assets/environment/level-${n}.png`;
export const hasArt = (url) => available.has(url);
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
    <path d="${FLAME}" fill="url(#fireGrad)" class="flicker"/>
    ${inner ? `<path d="${FLAME}" fill="#ffe27a" transform="translate(0 -2) scale(0.5)"/>` : ''}
  </g>`;
}

function drop(x, y, scale, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="${DROP}" fill="url(#waterGrad)"/>
    <ellipse cx="-4" cy="0" rx="3" ry="5" fill="#ffffff" opacity="0.55"/>
  </g>`;
}

function eyes(cx, eyeY, rx, eyeR, closed) {
  if (closed) {
    return [-1, 1].map((side) => `<path d="M${cx + side * rx * 0.36 - eyeR},${eyeY} q${eyeR},${eyeR * 0.8} ${eyeR * 2},0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('');
  }
  return `<g class="blink" style="transform-origin:${cx}px ${eyeY}px">
    <circle cx="${cx - rx * 0.36}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
    <circle cx="${cx + rx * 0.36}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
    <circle cx="${cx - rx * 0.30}" cy="${eyeY + 1}" r="${eyeR * 0.55}" fill="#1b1b2f"/>
    <circle cx="${cx + rx * 0.42}" cy="${eyeY + 1}" r="${eyeR * 0.55}" fill="#1b1b2f"/>
    <circle cx="${cx - rx * 0.27}" cy="${eyeY - 2}" r="${eyeR * 0.2}" fill="#fff"/>
    <circle cx="${cx + rx * 0.45}" cy="${eyeY - 2}" r="${eyeR * 0.2}" fill="#fff"/>
  </g>`;
}

/** The creature, facing right. `sleeping` closes its eyes. */
export function creatureSVG(stage, { sleeping = false } = {}) {
  const s = Math.max(1, Math.min(5, stage));
  const rx = 38 + s * 6;
  const ry = 34 + s * 5;
  const cx = 100;
  const cy = 128 - s * 2;
  const top = cy - ry;
  const crest = [];
  crest.push(drop(cx, top + 4, 0.9 + s * 0.12));
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
  return `<svg viewBox="0 0 200 200" class="creature-svg" role="img" aria-label="Creature, form ${s}">
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
    <ellipse class="foot foot-l" cx="${cx - rx * 0.45}" cy="${cy + ry - 4}" rx="${10 + s}" ry="7" fill="#d9592a"/>
    <ellipse class="foot foot-r" cx="${cx + rx * 0.45}" cy="${cy + ry - 4}" rx="${10 + s}" ry="7" fill="#2f73d9"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#bodyGrad)"/>
    <ellipse cx="${cx}" cy="${cy + ry * 0.3}" rx="${rx * 0.55}" ry="${ry * 0.5}" fill="#fff4e6" opacity="0.85"/>
    ${crest.join('')}
    ${eyes(cx, eyeY, rx, eyeR, sleeping)}
    <path d="M${cx - 8},${eyeY + 14} q8,${sleeping ? 3 : 7} 16,0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - rx * 0.6}" cy="${eyeY + 12}" r="4" fill="#ff5d73" opacity="0.5"/>
    <circle cx="${cx + rx * 0.6}" cy="${eyeY + 12}" r="4" fill="#ff5d73" opacity="0.5"/>
  </svg>`;
}

export function creatureArt(stage, name, opts = {}) {
  const url = stageUrl(stage);
  if (available.has(url)) return `<img src="${url}" alt="${esc(name)}" class="art-img">`;
  return creatureSVG(stage, opts);
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
