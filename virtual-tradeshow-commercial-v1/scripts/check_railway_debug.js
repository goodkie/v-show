const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app/api/debug/client-version', (res) => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => console.log('Railway /api/debug/client-version:\n', b));
}).on('error', console.error);