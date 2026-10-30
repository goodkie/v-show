const path = require('path');
const { ClassicLevel } = require(path.resolve(__dirname, '..', 'backups', '_tools', 'node_modules', 'classic-level'));
const dir = path.resolve(__dirname, '..', 'backups', '_sandbox_restore_20261030', 'dec', 'chrome', 'Local Extension Settings', 'ldlijlaccfeelfdhgnjbibniocefckjj');
const SECRET = /key|token|pass|secret|cred|auth|pat/i;
(async () => {
  const db = new ClassicLevel(dir, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
  await db.open();
  const out = [];
  for await (const [k, v] of db.iterator()) {
    let desc;
    try {
      const j = JSON.parse(v);
      if (SECRET.test(k) && typeof j === 'string') desc = `string(len=${j.length}) [redacted]`;
      else if (Array.isArray(j)) desc = `array(len=${j.length})`;
      else if (j && typeof j === 'object') desc = `object(keys=${Object.keys(j).length})`;
      else desc = `${typeof j}${typeof j === 'string' ? `(len=${j.length})` : `=${String(j).slice(0, 30)}`}`;
    } catch { desc = `raw(len=${v.length})`; }
    out.push([k, desc]);
  }
  await db.close();
  console.log('total keys:', out.length);
  for (const [k, d] of out) if (/queue|pending|target|url|campaign|history|ledger|dedup|template|csv|remaining|email|collect|checkpoint|schema/i.test(k)) console.log(k.padEnd(48), d);
})().catch((e) => { console.error('READ FAIL', e.message); process.exit(1); });
