const https = require('https');

let count = 0;
const max = 25;

function pollLive() {
  count++;
  https.get('https://v-show-commercial-v1-production.up.railway.app/api/health', (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        console.log(`[Live Check ${count}] uiVersion: ${json.uiVersion} | Server Time: ${json.timestamp}`);
        if (json.uiVersion === '3D2-V11.11-P0-3D-BOOTH') {
          console.log('\n🎉 SUCCESS! Railway is now serving the latest 3D2 container live on production!');
          // Verify landing page HTML
          https.get('https://v-show-commercial-v1-production.up.railway.app/', (r) => {
            let h = '';
            r.on('data', d => h += d);
            r.on('end', () => {
              const tm = h.match(/<title>(.*?)<\/title>/);
              console.log('Verified Live Title:', tm ? tm[1] : 'NOT FOUND');
              const hasLogo = h.includes('data:image/png;base64');
              console.log('Verified Live Base64 Logo Present:', hasLogo);
              process.exit(0);
            });
          });
          return;
        }
      } catch (e) {
        console.log(`[Live Check ${count}] JSON parsing error`);
      }
      if (count < max) setTimeout(pollLive, 3000);
      else process.exit(1);
    });
  }).on('error', (err) => {
    console.log(`[Live Check ${count}] Error:`, err.message);
    if (count < max) setTimeout(pollLive, 3000);
  });
}

pollLive();