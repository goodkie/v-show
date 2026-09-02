const fs = require('fs');

['clean_deploy', 'railway_deploy', 'app_build'].forEach(d => {
  const p = d === 'app_build' ? 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/index.js' : 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_' + d + '/server/index.js';
  let c = fs.readFileSync(p, 'utf8');

  const oldCode = 'if (sources.length < minRequired && !isDev) {';
  if (c.includes(oldCode)) {
    const replacement = `const seenHashes = new Set();
    const uniqueSources = (sources || []).filter(s => {
      const k = s.hash || s.url || s.id;
      if (!k || seenHashes.has(k)) return false;
      seenHashes.add(k);
      return true;
    });
    if (uniqueSources.length < minRequired) {
      return res.status(422).json({
        error: 'Insufficient unique source photos.',
        code: 'INSUFFICIENT_SOURCE_PHOTOS',
        required: minRequired,
        received: uniqueSources.length
      });
    }
    if (false) {`;

    c = c.replace(oldCode, replacement);
    fs.writeFileSync(p, c, 'utf8');
    console.log(d, 'gate patched: OK');
  } else {
    console.log(d, 'oldCode not found');
  }
});
