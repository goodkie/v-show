const fs = require('fs'), path = require('path');
for (const b of ['Microsoft/Edge', 'Google/Chrome']) {
  const ud = path.join(process.env.LOCALAPPDATA, b, 'User Data');
  if (!fs.existsSync(ud)) continue;
  for (const d of fs.readdirSync(ud)) {
    for (const f of ['Secure Preferences', 'Preferences']) {
      const p = path.join(ud, d, f);
      if (!fs.existsSync(p)) continue;
      let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
      const s = (j.extensions || {}).settings || {};
      for (const [id, v] of Object.entries(s)) {
        if (v.path && v.location === 4) console.log([b, d, f, id, v.path, v.manifest && v.manifest.version_name, 'state=' + v.state, 'dis=' + JSON.stringify(v.disable_reasons)].join(' | '));
      }
    }
  }
}
for (const d of ['E:/vivpr/ai/extensions/send_message_backup', 'extension']) {
  const t = fs.readFileSync(path.join(d, 'modules/build-provenance.js'), 'utf8');
  console.log(d, (t.match(/buildId:\s*'[^']+'/) || [])[0]);
}
