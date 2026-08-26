const fs = require('fs');

const fashionSrc = 'app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg';
const makeupSrc = 'app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg';

const fashionDest = 'app_build/client/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg';
const makeupDest = 'app_build/client/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg';

if (fs.existsSync(fashionSrc)) {
  fs.copyFileSync(fashionSrc, fashionDest);
  console.log('✅ Fashion poster generated from Ultra-HD asset:', (fs.statSync(fashionDest).size / 1024).toFixed(1), 'KB');
}

if (fs.existsSync(makeupSrc)) {
  fs.copyFileSync(makeupSrc, makeupDest);
  console.log('✅ Makeup poster generated from Ultra-HD asset:', (fs.statSync(makeupDest).size / 1024).toFixed(1), 'KB');
}
