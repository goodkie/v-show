const https = require('https');

let attempts = 0;
const maxAttempts = 30;

function check() {
  attempts++;
  https.get('https://v-show-commercial-v1-production.up.railway.app/', (res) => {
    let html = '';
    res.on('data', c => html += c);
    res.on('end', () => {
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      const title = titleMatch ? titleMatch[1] : '';
      const hasLogoBase64 = html.includes('data:image/png;base64');
      const has3D2 = title.includes('³D₂');

      console.log(`[Attempt ${attempts}] Title: "${title}" | Has ³D₂: ${has3D2} | Has Logo Base64: ${hasLogoBase64}`);

      if (has3D2 && hasLogoBase64) {
        console.log('🎉 Live Production successfully verified with ³D₂ and new logo!');
        process.exit(0);
      } else if (attempts < maxAttempts) {
        setTimeout(check, 4000);
      } else {
        console.log('Polling reached max attempts. Railway may still be completing build.');
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error(`[Attempt ${attempts}] Request error:`, err.message);
    if (attempts < maxAttempts) setTimeout(check, 4000);
  });
}

check();