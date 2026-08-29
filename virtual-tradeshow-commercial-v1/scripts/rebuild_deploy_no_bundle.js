const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const railwayDeploy = path.join(baseDir, '_railway_deploy');

// 1. demo_asset_bundle.js 를 _railway_deploy/server 에서 제거 (48MB 절약)
//    대신 실제 에셋 파일을 client/assets/demo 에 다시 복원
const bundlePath = path.join(railwayDeploy, 'server', 'demo_asset_bundle.js');
if (fs.existsSync(bundlePath)) {
  fs.unlinkSync(bundlePath);
  console.log('✅ Removed demo_asset_bundle.js (saved 48MB)');
}

// 2. 필수 파노라마 파일만 복원 (4K JPEG 한 장씩, 각 ~4MB)
const panoramas = [
  { src: 'app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg', dst: 'client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg' },
  { src: 'app_build/client/assets/demo/vantelle-showcase/pano360/node0_preview.jpg',          dst: 'client/assets/demo/vantelle-showcase/pano360/node0_preview.jpg' },
  { src: 'app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg',   dst: 'client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg' },
  { src: 'app_build/client/assets/demo/lumiere-showcase/pano360/node0_preview.jpg',           dst: 'client/assets/demo/lumiere-showcase/pano360/node0_preview.jpg' },
  { src: 'app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg', dst: 'client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg' },
  { src: 'app_build/client/assets/demo/furniture-showcase/pano360/node0_preview.jpg',         dst: 'client/assets/demo/furniture-showcase/pano360/node0_preview.jpg' },
  { src: 'app_build/client/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg',       dst: 'client/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg' },
  { src: 'app_build/client/assets/demo/dna-showcase/pano360/node0_preview.jpg',               dst: 'client/assets/demo/dna-showcase/pano360/node0_preview.jpg' },
];

panoramas.forEach(({ src, dst }) => {
  const srcPath = path.join(baseDir, src);
  const dstPath = path.join(railwayDeploy, dst);
  if (!fs.existsSync(srcPath)) { console.log('MISSING:', srcPath); return; }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  const size = (fs.statSync(srcPath).size / 1024 / 1024).toFixed(1);
  console.log(`✅ Copied ${path.basename(srcPath)} (${size}MB)`);
});

// 3. 모든 제품 썸네일 이미지 복원
const productFolders = [
  'demo/vantelle-showcase/products',
  'demo/lumiere-showcase/products',
  'demo/furniture-showcase/products',
  'demo/dna-showcase/products',
];

productFolders.forEach(folder => {
  const srcDir = path.join(baseDir, 'app_build/client/assets', folder);
  const dstDir = path.join(railwayDeploy, 'client/assets', folder);
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  fs.readdirSync(srcDir).forEach(file => {
    if (!file.match(/\.(jpg|jpeg|png|webp)$/i)) return;
    fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
    console.log(`  ✅ ${folder}/${file}`);
  });
});

// 4. 비디오 파일 복원 (각 2~3MB)
const videos = [
  { src: 'app_build/client/assets/demo/virtual-fitting-room/fashion.mp4', dst: 'client/assets/demo/virtual-fitting-room/fashion.mp4' },
  { src: 'app_build/client/assets/demo/virtual-makeup-artist/makeup.mp4', dst: 'client/assets/demo/virtual-makeup-artist/makeup.mp4' },
];

videos.forEach(({ src, dst }) => {
  const srcPath = path.join(baseDir, src);
  const dstPath = path.join(railwayDeploy, dst);
  if (!fs.existsSync(srcPath)) { console.log('MISSING video:', srcPath); return; }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  const size = (fs.statSync(srcPath).size / 1024 / 1024).toFixed(1);
  console.log(`✅ Copied video ${path.basename(srcPath)} (${size}MB)`);
});

const total = Array.from({ length: 1 }, () => {
  let sum = 0;
  function walk(dir) {
    try { fs.readdirSync(dir).forEach(f => {
      const p = path.join(dir, f);
      try { const s = fs.statSync(p); if (s.isDirectory()) walk(p); else sum += s.size; } catch {}
    }); } catch {}
  }
  walk(railwayDeploy);
  return sum;
})[0];

console.log(`\n📦 Total _railway_deploy size: ${(total / 1024 / 1024).toFixed(1)} MB`);
