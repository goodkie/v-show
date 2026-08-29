const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // sharp 또는 image-size가 있는지 확인

async function checkImageDimensions() {
  const images = [
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/vantelle-showcase/pano360/node0_preview.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/lumiere-showcase/pano360/node0_preview.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/furniture-showcase/pano360/node0_preview.jpg',
    'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg'
  ];

  for (const img of images) {
    if (fs.existsSync(img)) {
      const meta = await sharp(img).metadata();
      console.log(`[IMAGE] ${path.basename(path.dirname(img))}/${path.basename(img)}: ${meta.width}x${meta.height}, format=${meta.format}, size=${(fs.statSync(img).size / 1024).toFixed(1)} KB`);
    } else {
      console.log(`[MISSING] ${img}`);
    }
  }
}

checkImageDimensions().catch(err => {
  console.log('Sharp error, trying fallback buffer reader:', err.message);
});
