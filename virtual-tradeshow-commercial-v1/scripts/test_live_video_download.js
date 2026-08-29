const https = require('https');
const urls = [
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/virtual-fitting-room/fashion.mp4',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/virtual-makeup-artist/makeup.mp4'
];

urls.forEach(url => {
  https.get(url, res => {
    let body = '';
    res.on('data', d => body += d.slice(0, 100).toString('hex'));
    res.on('end', () => {
      console.log(`Status: ${res.statusCode} | Content-Type: ${res.headers['content-type']} | Length: ${res.headers['content-length']} | URL: ${url}`);
      console.log('Hex sample:', body.slice(0, 64));
    });
  });
});
