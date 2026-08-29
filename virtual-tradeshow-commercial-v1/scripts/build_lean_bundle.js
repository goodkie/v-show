const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

const assetsMap = {};

// 1. Map 8K panorama paths to optimized 4K files
const panoMappings = [
  {
    requested: 'demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg',
    source: 'demo/vantelle-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    preview: 'demo/vantelle-showcase/pano360/node0_preview.jpg'
  },
  {
    requested: 'demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg',
    source: 'demo/lumiere-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    preview: 'demo/lumiere-showcase/pano360/node0_preview.jpg'
  },
  {
    requested: 'demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg',
    source: 'demo/furniture-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    preview: 'demo/furniture-showcase/pano360/node0_preview.jpg'
  },
  {
    requested: 'demo/dna-showcase/pano360/node0_360_panorama_8k.jpg',
    source: 'demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    preview: 'demo/dna-showcase/pano360/node0_preview.jpg'
  },
];

panoMappings.forEach(({ requested, source, preview }) => {
  const fullSource = path.join(clientAssets, source);
  if (fs.existsSync(fullSource)) {
    const buf = fs.readFileSync(fullSource);
    assetsMap[requested] = {
      contentType: 'image/jpeg',
      base64: buf.toString('base64'),
      size: buf.length
    };
    // Also store under the 4k name
    assetsMap[source] = assetsMap[requested];
    console.log(`Bundled pano: ${requested} (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  const fullPreview = path.join(clientAssets, preview);
  if (fs.existsSync(fullPreview)) {
    const buf = fs.readFileSync(fullPreview);
    assetsMap[preview] = {
      contentType: 'image/jpeg',
      base64: buf.toString('base64'),
      size: buf.length
    };
    console.log(`Bundled preview: ${preview} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
});

// 2. Videos & hero images
const mediaFiles = [
  'demo/dna-showcase/hero/dna_showcase_photoreal_hero.png',
  'demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg',
  'demo/virtual-fitting-room/fashion.mp4',
  'demo/virtual-fitting-room/fashion-poster-last-frame.jpg',
  'demo/virtual-makeup-artist/makeup.mp4',
  'demo/virtual-makeup-artist/makeup-poster-last-frame.jpg',
];

mediaFiles.forEach(rel => {
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

// 3. Product images
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
    if (file.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const full = path.join(fullDir, file);
      const rel = (pdir + '/' + file).replace(/\\/g, '/');
      const buf = fs.readFileSync(full);
      assetsMap[rel] = {
        contentType: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        base64: buf.toString('base64'),
        size: buf.length
      };
      console.log(`Bundled product: ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  });
});

const bundleContent = `// Auto-generated 3DNA Fast In-Memory Demo Asset Bundle
module.exports = ${JSON.stringify(assetsMap)};
`;

fs.writeFileSync(path.join(baseDir, 'app_build', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');

const totalMb = (Buffer.byteLength(bundleContent, 'utf8') / 1024 / 1024).toFixed(1);
console.log(`\n🚀 Super Fast Lean Bundle created! Assets: ${Object.keys(assetsMap).length}, Size: ${totalMb} MB`);
