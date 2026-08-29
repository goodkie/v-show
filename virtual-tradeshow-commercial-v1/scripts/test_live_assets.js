const https = require('https');

const urls = [
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/dna-showcase/products/apex_cobot_x16.jpg',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/vantelle-showcase/products/scarlet_wrap_set.jpg',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/lumiere-showcase/products/radiance_serum.jpg',
  'https://v-show-commercial-v1-production.up.railway.app/assets/demo/furniture-showcase/products/linen_sofa.jpg',
  'https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html'
];

urls.forEach(url => {
  https.get(url, res => {
    console.log(`${res.statusCode} | Length: ${res.headers['content-length'] || 'N/A'} | Type: ${res.headers['content-type']} | URL: ${url}`);
  }).on('error', e => console.log(`ERROR: ${e.message} | URL: ${url}`));
});
