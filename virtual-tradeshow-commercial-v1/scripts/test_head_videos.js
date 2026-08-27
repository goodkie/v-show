const https = require('https');

const urls = [
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/virtual-fitting-room/fashion.mp4',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/virtual-makeup-artist/makeup.mp4'
];

urls.forEach(u => {
  const req = https.request(u, { method: 'HEAD' }, res => {
    console.log(`[HEAD] ${u}`);
    console.log(' - Status:', res.statusCode);
    console.log(' - Headers:', res.headers);
    console.log('-----------------------------------');
  });
  req.on('error', e => console.error(e));
  req.end();
});
