const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app/api/health', (res) => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => console.log('Railway /api/health:\n', b));
}).on('error', console.error);