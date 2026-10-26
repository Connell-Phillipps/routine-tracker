// DOM helpers shared by the views.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes any value for use in HTML text or a quoted attribute. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function fmtNum(v, places = 1) {
  if (v == null || Number.isNaN(v)) return '–';
  return Number.isInteger(v) ? String(v) : v.toFixed(places).replace(/\.?0+$/, '');
}

export const pct = (r) => `${Math.round((r || 0) * 100)}%`;

let toastTimer;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 5000 : 2200);
}

/** Wraps an event handler so a thrown or rejected error shows as a toast instead of vanishing. */
export function guard(fn) {
  return async (event) => {
    try {
      await fn(event);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Something went wrong.', 'error');
    }
  };
}

/**
 * Binds a guarded handler to every element matching selector inside root. Taps and
 * submits first blur any focused field, since iOS keeps focus there and the app holds
 * re-renders while a field is being edited.
 */
export function on(root, selector, event, handler) {
  const tap = event === 'click' || event === 'submit';
  for (const el of root.querySelectorAll(selector)) {
    el.addEventListener(event, guard(async (e) => {
      if (event === 'submit') e.preventDefault();
      if (tap && el.dataset.busy) return; // ignore a double tap while the first one saves
      const active = document.activeElement;
      if (tap && active !== el && /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName)) active.blur();
      if (tap) el.dataset.busy = '1';
      try {
        await handler(e, el);
      } finally {
        delete el.dataset.busy;
      }
    }));
  }
}

export function numberOrNull(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Reads a numeric input; null when blank. Throws on bad or negative input. */
export function readNumber(input, label) {
  const n = numberOrNull(input.value);
  if (input.value.trim() !== '' && (n == null || n < 0)) throw new Error(`${label} must be a number, 0 or more.`);
  return n;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // caller shows the text for manual copy
  }
}

/** Modal sheet. `body` is HTML; resolves with the clicked button's value, or null. */
export function sheet({ title, body, buttons = [{ label: 'Close', value: null }] }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        <div class="sheet-body">${body}</div>
        <div class="sheet-actions">
          ${buttons.map((b, i) => `<button class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    const close = (value) => { wrap.remove(); resolve(value); };
    wrap.addEventListener('submit', (e) => e.preventDefault()); // Return key must not reload the page
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(null);
      const btn = e.target.closest('[data-i]');
      if (btn) {
        const b = buttons[Number(btn.dataset.i)];
        close(typeof b.value === 'function' ? b.value(wrap) : b.value);
      }
    });
    document.body.appendChild(wrap);
  });
}

export async function confirmSheet(title, message, okLabel = 'OK', kind = 'danger') {
  const v = await sheet({
    title,
    body: `<p>${esc(message)}</p>`,
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, kind }],
  });
  return v === true;
}

/**
 * Shares a file through the iOS share sheet (Save to Files), or downloads it elsewhere.
 * Returns 'shared' | 'downloaded' | 'cancelled' | 'copied' (shown for manual copy).
 */
export async function shareFile(filename, text, mime = 'application/json') {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      console.warn('Share failed:', err);
      // A download link would navigate an installed iOS app away, so offer the text instead.
      if (navigator.standalone) {
        await sheet({
          title: 'Share did not open',
          body: `<p class="small">Tap the button again, or copy this text into a note named ${esc(filename)}.</p><textarea rows="10" readonly>${esc(text)}</textarea>`,
        });
        return 'copied';
      }
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export function readFile(input) {
  return new Promise((resolve, reject) => {
    const file = input.files?.[0];
    if (!file) { reject(new Error('No file chosen.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}
