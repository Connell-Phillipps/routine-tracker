// Dependency-free SVG charts, so the app works offline with nothing to load.
import { diffDays, fmtShort } from '../util/dates.js';
import { esc, fmtNum } from './dom.js';

const W = 340;
const H = 170;
const PAD = { l: 38, r: 10, t: 12, b: 24 };

/**
 * Line chart over dates. series: [{ label, color, points: [{ date, value }], dashed? }]
 */
export function lineChart(series, { unit = '' } = {}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return '<p class="muted small">Log at least two entries to see a chart.</p>';
  const dates = all.map((p) => p.date).sort();
  const d0 = dates[0];
  const span = Math.max(1, diffDays(dates[dates.length - 1], d0));
  let lo = Math.min(...all.map((p) => p.value));
  let hi = Math.max(...all.map((p) => p.value));
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.1;
  lo -= padY; hi += padY;
  const x = (d) => PAD.l + (diffDays(d, d0) / span) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const grid = [0, 0.5, 1].map((f) => {
    const v = lo + f * (hi - lo);
    return `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
      <text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${fmtNum(v, 1)}</text>`;
  }).join('');
  const lines = series.map((s) => {
    if (!s.points.length) return '';
    const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const dots = s.dashed ? '' : pts.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="3" fill="${s.color}"><title>${esc(p.date)}: ${fmtNum(p.value, 2)} ${esc(unit)}</title></circle>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dashed ? 'stroke-dasharray="5 4" opacity="0.7"' : ''} stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const legend = series.length > 1
    ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))} chart">
    ${grid}
    <text x="${PAD.l}" y="${H - 6}" class="axis">${fmtShort(d0)}</text>
    <text x="${W - PAD.r}" y="${H - 6}" text-anchor="end" class="axis">${fmtShort(dates[dates.length - 1])}</text>
    ${lines}
  </svg>${legend}`;
}

/** Horizontal bars. rows: [{ label, value, max?, text?, color? }] */
export function barList(rows, { max = null, color = 'var(--accent)' } = {}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows.map((r) => {
    const w = Math.max(0, Math.min(100, (r.value / (r.max ?? top)) * 100));
    return `<div class="bar-row"><span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${w}%;background:${r.color || color}"></span></span>
      <span class="bar-val">${esc(r.text ?? fmtNum(r.value))}</span></div>`;
  }).join('')}</div>`;
}

/** Circular progress ring with a centre label. */
export function ring(fraction, label, sub = '', size = 96, color = 'var(--accent)') {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring" role="img" aria-label="${esc(label)} ${esc(sub)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
    ${f > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
    <text x="50%" y="${sub ? '47%' : '54%'}" text-anchor="middle" class="ring-label">${esc(label)}</text>
    ${sub ? `<text x="50%" y="66%" text-anchor="middle" class="ring-sub">${esc(sub)}</text>` : ''}
  </svg>`;
}

export function xpBar(progress, color = 'var(--accent)') {
  return `<div class="xpbar"><span style="width:${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%;background:${color}"></span></div>`;
}
