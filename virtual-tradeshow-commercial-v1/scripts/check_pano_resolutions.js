const path = require('path');
const sharp = require(path.resolve('app_build/node_modules/sharp'));
const fs = require('fs');

async function check() {
  const list = [
    'app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg',
    'app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg',
    'app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg',
    'app_build/client/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg',
    'app_build/client/assets/demo/dna-showcase/pano360/node0_360_panorama_16k.jpg'
  ];

  for (const f of list) {
    if (fs.existsSync(f)) {
      const meta = await sharp(f).metadata();
      const stats = fs.statSync(f);
      console.log(`${f}:\n  Dimension: ${meta.width} x ${meta.height}, Size: ${(stats.size/1024).toFixed(1)} KB, Format: ${meta.format}`);
    } else {
      console.log(`${f}: NOT FOUND`);
    }
  }
}
check();
