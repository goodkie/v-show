const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Has work-email-input?', data.includes('work-email-input'));
    console.log('Has confirm-email-input?', data.includes('confirm-email-input'));
    console.log('Has 3D Three.js?', data.includes('Three.js & OrbitControls'));
    const match = data.match(/<form id="free-booth-form"[\s\S]*?<\/form>/);
    if (match) {
      console.log('\n--- FORM HTML ON RAILWAY ---');
      console.log(match[0]);
    }
  });
}).on('error', console.error);
