const https = require('https');

let count = 0;
const maxCount = 40;

function poll() {
  count++;
  https.get('https://v-show-commercial-v1-production.up.railway.app/api/health', (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        console.log(`[Health Poll ${count}] uiVersion: ${json.uiVersion} | Server Time: ${json.timestamp}`);
        if (json.uiVersion === '3D2-V11.11-P0-3D-BOOTH') {
          console.log('✅ Railway has successfully deployed 3D2-V11.11-P0-3D-BOOTH!');
          // Now fetch / to verify the landing HTML
          https.get('https://v-show-commercial-v1-production.up.railway.app/', (r) => {
            let h = '';
            r.on('data', d => h += d);
            r.on('end', () => {
              const tm = h.match(/<title>(.*?)<\/title>/);
              console.log('Live Landing Title:', tm ? tm[1] : 'NOT FOUND');
              const hasLogo = h.includes('data:image/png;base64');
              console.log('Live Landing Has Base64 Logo:', hasLogo);
              process.exit(0);
            });
          });
          return;
        }
      } catch (e) {
        console.log(`[Health Poll ${count}] JSON parse error`);
      }
      if (count < maxCount) setTimeout(poll, 4000);
      else process.exit(1);
    });
  }).on('error', (err) => {
    console.log(`[Health Poll ${count}] Error:`, err.message);
    if (count < maxCount) setTimeout(poll, 4000);
  });
}

poll();