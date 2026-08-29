const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

const assetsMap = {};

const allowedFolders = [
  'demo/vantelle-showcase',
  'demo/lumiere-showcase',
  'demo/furniture-showcase',
  'demo/dna-showcase',
  'demo/virtual-fitting-room',
  'demo/virtual-makeup-artist'
];

function scanAndEncode(dir, relPrefix = '') {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = (relPrefix ? relPrefix + '/' : '') + entry.name;
    if (entry.isDirectory()) {
      scanAndEncode(fullPath, rel);
    } else {
      // Check if inside allowed folder
      const isAllowed = allowedFolders.some(f => rel.startsWith(f));
      if (!isAllowed) return;

      // Skip angles subfolder in dna-showcase to save ~5MB
      if (rel.includes('dna-showcase/angles/')) return;
      if (entry.name.includes('_16k.jpg')) return;

      const ext = path.extname(entry.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) {
        const buf = fs.readFileSync(fullPath);
        let contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.webp') contentType = 'image/webp';
        if (ext === '.mp4') contentType = 'video/mp4';

        assetsMap[rel.replace(/\\/g, '/')] = {
          contentType,
          base64: buf.toString('base64'),
          size: buf.length
        };
        console.log(`Bundled: ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
      }
    }
  }
}

scanAndEncode(path.join(clientAssets, 'demo'), 'demo');

const bundleContent = `// Auto-generated 3DNA In-Memory Demo Asset Bundle
module.exports = ${JSON.stringify(assetsMap)};
`;

fs.writeFileSync(path.join(baseDir, 'app_build', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');

const sizeMb = (Buffer.byteLength(bundleContent, 'utf8') / 1024 / 1024).toFixed(1);
console.log(`\n🎉 Target optimized bundle generated! Assets: ${Object.keys(assetsMap).length}, Bundle size: ${sizeMb} MB`);
