const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

const assetsMap = {};

// 1. Panoramas (8K mapped to 4K bicubic opt)
const panos = [
  { requested: 'demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg', source: 'demo/vantelle-showcase/pano360/node0_360_panorama_4k_opt.jpg' },
  { requested: 'demo/vantelle-showcase/pano360/node0_preview.jpg', source: 'demo/vantelle-showcase/pano360/node0_preview.jpg' },
  { requested: 'demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg', source: 'demo/lumiere-showcase/pano360/node0_360_panorama_4k_opt.jpg' },
  { requested: 'demo/lumiere-showcase/pano360/node0_preview.jpg', source: 'demo/lumiere-showcase/pano360/node0_preview.jpg' },
  { requested: 'demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg', source: 'demo/furniture-showcase/pano360/node0_360_panorama_4k_opt.jpg' },
  { requested: 'demo/furniture-showcase/pano360/node0_preview.jpg', source: 'demo/furniture-showcase/pano360/node0_preview.jpg' },
  { requested: 'demo/dna-showcase/pano360/node0_360_panorama_8k.jpg', source: 'demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg' },
  { requested: 'demo/dna-showcase/pano360/node0_preview.jpg', source: 'demo/dna-showcase/pano360/node0_preview.jpg' },
];

panos.forEach(({ requested, source }) => {
  const full = path.join(clientAssets, source);
  if (fs.existsSync(full)) {
    const buf = fs.readFileSync(full);
    assetsMap[requested] = {
      contentType: 'image/jpeg',
      base64: buf.toString('base64'),
      size: buf.length
    };
    assetsMap[source] = assetsMap[requested];
    console.log(`Bundled pano: ${requested} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
});

// 2. Videos & Posters
const media = [
  'demo/dna-showcase/hero/dna_showcase_photoreal_hero.png',
  'demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg',
  'demo/virtual-fitting-room/fashion.mp4',
  'demo/virtual-fitting-room/fashion-poster-last-frame.jpg',
  'demo/virtual-makeup-artist/makeup.mp4',
  'demo/virtual-makeup-artist/makeup-poster-last-frame.jpg',
];

media.forEach(rel => {
  const full = path.join(clientAssets, rel);
  if (fs.existsSync(full)) {
    const ext = path.extname(rel).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.mp4') contentType = 'video/mp4';
    const buf = fs.readFileSync(full);
    assetsMap[rel.replace(/\\/g, '/')] = {
      contentType,
      base64: buf.toString('base64'),
      size: buf.length
    };
    console.log(`Bundled media: ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
});

// 3. Products (map original name to _opt.jpg if exists)
const productDirs = [
  'demo/vantelle-showcase/products',
  'demo/lumiere-showcase/products',
  'demo/furniture-showcase/products',
  'demo/dna-showcase/products'
];

productDirs.forEach(pdir => {
  const fullDir = path.join(clientAssets, pdir);
  if (!fs.existsSync(fullDir)) return;
  fs.readdirSync(fullDir).forEach(file => {
    if (file.match(/\.(jpg|jpeg|png|webp)$/i) && !file.includes('_opt.')) {
      const baseName = file.substring(0, file.lastIndexOf('.'));
      const optFile = baseName + '_opt.jpg';
      const optPath = path.join(fullDir, optFile);
      const chosenPath = fs.existsSync(optPath) ? optPath : path.join(fullDir, file);

      const rel = (pdir + '/' + file).replace(/\\/g, '/');
      const buf = fs.readFileSync(chosenPath);
      assetsMap[rel] = {
        contentType: 'image/jpeg',
        base64: buf.toString('base64'),
        size: buf.length
      };
      console.log(`Bundled product: ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  });
});

const bundleContent = `// Auto-generated 3DNA Optimized In-Memory Demo Asset Bundle
module.exports = ${JSON.stringify(assetsMap)};
`;

fs.writeFileSync(path.join(baseDir, 'app_build', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');

const totalMb = (Buffer.byteLength(bundleContent, 'utf8') / 1024 / 1024).toFixed(2);
console.log(`\n🎉 Final Lean Bundle ready: ${Object.keys(assetsMap).length} assets, Size: ${totalMb} MB`);
