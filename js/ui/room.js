// The creature's room: a portrait scene (viewBox 360 x 400) that fills up with
// furniture as the home levels up, gets messy when chores slip, and goes dark at night.
// Spots are where the creature walks to do things; coordinates are its feet.
import { hasArt, levelUrl } from './art.js';

export const ROOM = { w: 360, h: 400, floorY: 250 };
// Kept away from the walls so the name tag never clips.
export const WALK = { x0: 62, x1: 298, y0: 288, y1: 378 };

/** Places the creature can go, by the level that unlocks them. */
const SPOT_DEFS = [
  { id: 'mat', x: 95, y: 350, level: 1 },
  { id: 'window', x: 180, y: 292, level: 1 },
  { id: 'rug', x: 190, y: 340, level: 1 },
  { id: 'bed', x: 72, y: 300, level: 2 },
  { id: 'shelf', x: 298, y: 304, level: 3 },
  { id: 'beanbag', x: 66, y: 374, level: 4 },
  { id: 'hearth', x: 180, y: 294, level: 5 },
  { id: 'aquarium', x: 244, y: 296, level: 5 },
];

export function spotsFor(level) {
  const spots = Object.fromEntries(SPOT_DEFS.filter((s) => s.level <= level).map((s) => [s.id, s]));
  if (spots.hearth) delete spots.window; // the hearth sits under the window
  return spots;
}

function wallAndFloor(L, night) {
  const wall = night ? ['#1a1d2e', '#1d2236', '#20283e', '#232d46', '#26324e'][L - 1] : ['#2a2f45', '#2f3550', '#35425f', '#3a4c6c', '#3f5679'][L - 1];
  const floor = night ? '#2c231f' : '#4a3b33';
  const boards = [278, 312, 350].map((y) => `<line x1="0" y1="${y}" x2="360" y2="${y}" stroke="#3a2d27" stroke-width="2" opacity="0.6"/>`).join('');
  const sky = night ? '#0d1530' : '#9fd3ff';
  const outside = night
    ? '<circle cx="205" cy="72" r="9" fill="#f5f0d0"/><circle cx="150" cy="90" r="1.5" fill="#fff"/><circle cx="170" cy="62" r="1.2" fill="#fff"/><circle cx="215" cy="120" r="1.2" fill="#fff"/>'
    : '<circle cx="205" cy="76" r="11" fill="#ffe27a"/><ellipse cx="160" cy="120" rx="24" ry="8" fill="#fff" opacity="0.8"/>';
  return `
    <rect x="0" y="0" width="360" height="${ROOM.floorY}" fill="${wall}"/>
    <rect x="0" y="${ROOM.floorY}" width="360" height="${ROOM.h - ROOM.floorY}" fill="${floor}"/>${boards}
    <rect x="0" y="${ROOM.floorY - 6}" width="360" height="8" fill="#3a2d27"/>
    <rect x="128" y="46" width="104" height="104" rx="6" fill="${sky}"/>${outside}
    <path d="M180,46 v104 M128,98 h104" stroke="${wall}" stroke-width="6"/>
    <rect x="122" y="148" width="116" height="8" rx="3" fill="#6b4a37"/>`;
}

function furniture(L, night) {
  const f = [];
  // L1: exercise mat and a bare bulb
  f.push('<rect x="48" y="336" width="96" height="26" rx="6" fill="#3f7f6a"/><rect x="52" y="340" width="88" height="18" rx="4" fill="#4f9a80"/>');
  if (L === 1) f.push(`<line x1="300" y1="0" x2="300" y2="46" stroke="#888" stroke-width="1.5"/><circle cx="300" cy="52" r="8" fill="#ffe9a8" ${night ? 'class="glow"' : ''}/>`);
  // rug grows with level
  f.push(`<ellipse cx="190" cy="336" rx="${40 + L * 10}" ry="${12 + L * 2}" fill="${L >= 2 ? '#7a4a8c' : '#5e5048'}" opacity="0.9"/>`);
  if (L >= 2) { // bed
    f.push('<rect x="8" y="214" width="118" height="54" rx="8" fill="#6b4a37"/><rect x="12" y="206" width="110" height="40" rx="8" fill="#5a6ea8"/><rect x="16" y="196" width="34" height="24" rx="7" fill="#e8eefc"/><rect x="4" y="180" width="10" height="90" rx="3" fill="#6b4a37"/>');
  }
  if (L >= 3) { // bookshelf and a plant
    f.push('<rect x="262" y="84" width="82" height="170" rx="4" fill="#7b5b3a"/>');
    for (const [i, y] of [124, 168, 212].entries()) {
      f.push(`<rect x="266" y="${y}" width="74" height="5" fill="#5e4329"/>`);
      const books = ['#e86f5a', '#6fb3e8', '#f2c94c', '#8fd18f', '#c79bff'];
      for (let b = 0; b < 5; b += 1) f.push(`<rect x="${270 + b * 13}" y="${y - 30 + ((b + i) % 3) * 3}" width="10" height="${30 - ((b + i) % 3) * 3}" fill="${books[(b + i) % 5]}"/>`);
    }
    f.push('<path d="M312,388 l6,-26 h28 l6,26z" fill="#c0703f"/><path d="M332,362 q-18,-30 -6,-48 q6,24 6,48 q2,-28 18,-38 q-2,22 -18,38z" fill="#4caf72"/>');
  }
  if (L >= 4) { // floor lamp, poster, beanbag
    f.push(`<rect x="146" y="178" width="4" height="78" fill="#c9c9c9"/><path d="M134,180 h28 l-7,-20 h-14z" fill="#ffd27a" ${night ? 'class="glow"' : ''}/><ellipse cx="148" cy="256" rx="13" ry="3" fill="#999"/>`);
    f.push('<rect x="30" y="70" width="64" height="48" rx="3" fill="#f5f0e6"/><path d="M38,110 l14,-20 12,12 8,-8 14,16z" fill="#6fb3e8"/><circle cx="80" cy="84" r="6" fill="#ff7a3d"/>');
    f.push('<ellipse cx="56" cy="382" rx="34" ry="16" fill="#d36b6b"/><ellipse cx="50" cy="374" rx="24" ry="10" fill="#e48585"/>');
  }
  if (L >= 5) { // fire and water: a hearth and an aquarium
    f.push('<rect x="146" y="186" width="68" height="68" rx="4" fill="#6d4c41"/><rect x="156" y="198" width="48" height="50" rx="3" fill="#2b1b14"/><path d="M180,246 q-14,-14 0,-34 q14,18 0,34z" fill="#ff8a3d" class="flicker"/><path d="M180,246 q-6,-8 0,-18 q6,9 0,18z" fill="#ffe27a" class="flicker"/>');
    f.push('<rect x="222" y="218" width="44" height="36" rx="2" fill="#5e4329"/><rect x="220" y="186" width="48" height="34" rx="3" fill="#2f73d9" opacity="0.8"/><path d="M232,204 q6,-5 12,0 q-6,5 -12,0z" fill="#ffb347" class="swim"/><circle cx="256" cy="196" r="2" fill="#fff" opacity="0.7"/>');
  }
  return f.join('');
}

function messLayer(mess) {
  if (!mess) return '';
  const a = `
    <path d="M110,372 q10,-7 20,0 q-5,7 -20,0z" fill="#8a6fb3"/>
    <rect x="236" y="356" width="26" height="18" rx="2" fill="#a0784a" transform="rotate(-8 249 365)"/>
    <path d="M196,388 q12,-9 26,-2 l-3,7 q-11,-3 -23,0z" fill="#d36b6b"/>`;
  const b = mess >= 2 ? `
    <path d="M150,300 q14,-5 24,5 q-12,5 -24,-5z" fill="#6b8fd3"/>
    <rect x="280" y="380" width="20" height="12" rx="2" fill="#7b5b3a"/>
    <circle cx="40" cy="300" r="2.5" fill="#9a8f80" opacity="0.6"/><circle cx="300" cy="320" r="2.5" fill="#9a8f80" opacity="0.6"/>
    <circle cx="210" cy="292" r="2" fill="#9a8f80" opacity="0.6"/><circle cx="90" cy="320" r="2" fill="#9a8f80" opacity="0.6"/>` : '';
  return a + b;
}

/** The room as an SVG, or the user's own level-N.png if present. */
export function roomArt(level, mess = 0, night = false) {
  const L = Math.max(1, Math.min(5, level));
  if (hasArt(levelUrl(L))) {
    return `<div class="room-img ${mess ? `mess-${mess}` : ''} ${night ? 'night' : ''}"><img src="${levelUrl(L)}" alt="Home, level ${L}"></div>`;
  }
  const dim = night ? '<rect width="360" height="400" fill="#050816" opacity="0.25"/>' : '';
  return `<svg viewBox="0 0 ${ROOM.w} ${ROOM.h}" class="room-svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Home, level ${L}${night ? ', night' : ''}">
    ${wallAndFloor(L, night)}${furniture(L, night)}${messLayer(mess)}${dim}
  </svg>`;
}
