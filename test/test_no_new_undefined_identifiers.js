/**
 * Static guard: fails if extension scripts reference an identifier that is not defined anywhere
 * (e.g. the .93 out-of-scope `hasGenuineMessageField` ReferenceError => CORE_RUNTIME_BROKEN).
 * Known pre-existing globals live in test/fixtures/undef_baseline.json; only NEW names fail.
 * Usage: node test/test_no_new_undefined_identifiers.js [--update-baseline]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(__dirname, 'fixtures', 'undef_baseline.json');
const FILES = ['extension/content-script.js', 'extension/background.js', 'extension/popup.js', 'extension/solver-core.js', 'extension/solver-content.js'];

function scan() {
  let out;
  try {
    out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'eslint@8', '--no-eslintrc', '--env', 'browser,es2022,webextensions',
      '--parser-options=ecmaVersion:2022', '--rule', 'no-undef:error', '-f', 'json', ...FILES], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, shell: process.platform === 'win32' });
  } catch (e) { out = e.stdout; }
  const res = {};
  for (const f of JSON.parse(out)) {
    const rel = path.relative(ROOT, f.filePath).replace(/\\/g, '/');
    for (const m of f.messages) {
      if (m.fatal) throw new Error(`parse error in ${rel}: ${m.message}`);
      const name = (m.message.match(/'([^']+)' is not defined/) || [])[1];
      if (name) (res[rel] = res[rel] || new Set()).add(name);
    }
  }
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, [...v].sort()]));
}

const now = scan();
if (process.argv.includes('--update-baseline')) {
  fs.mkdirSync(path.dirname(BASE), { recursive: true });
  fs.writeFileSync(BASE, JSON.stringify(now, null, 2));
  console.log('baseline written', now);
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const fresh = [];
for (const [f, names] of Object.entries(now)) for (const n of names) if (!(base[f] || []).includes(n)) fresh.push(`${f}: ${n}`);
if (fresh.length) { console.error('FAIL new undefined identifiers:\n' + fresh.join('\n')); process.exit(1); }
console.log('PASS: no new undefined identifiers');

