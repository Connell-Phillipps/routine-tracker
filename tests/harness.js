// Minimal browser test harness (no Node on this machine). Open tests/index.html.
const cases = [];

export function test(name, fn) {
  cases.push({ name, fn });
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function ok(cond, msg = 'expected truthy') {
  if (!cond) throw new Error(msg);
}

export async function throws(fn, pattern, msg = '') {
  try {
    await fn();
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`${msg} wrong error: ${err.message}`);
    return;
  }
  throw new Error(`${msg} expected an error`);
}

export async function run(out) {
  let passed = 0;
  const failures = [];
  for (const c of cases) {
    try {
      await c.fn();
      passed += 1;
    } catch (err) {
      failures.push({ name: c.name, error: err.message });
    }
  }
  const lines = [`${failures.length ? 'FAIL' : 'PASS'}: ${passed}/${cases.length} tests passed`];
  for (const f of failures) lines.push(`  x ${f.name}: ${f.error}`);
  out.textContent = lines.join('\n');
  document.title = `${failures.length ? 'FAIL' : 'PASS'} ${passed}/${cases.length}`;
  return { passed, failures };
}
