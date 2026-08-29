const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

const assetsMap = {};

function bundleAllHighResAssets() {
  const highResMappings = [
    // 1. DNA Showcase (Robotics) - High-Res 8K & 4K Panoramas & Products
    ['demo/dna-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node0_360_panorama_8k.jpg'],
    ['demo/dna-showcase/pano360/node1_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node1_360_panorama_8k.jpg'],
    ['demo/dna-showcase/pano360/node2_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node2_360_panorama_8k.jpg'],
    ['demo/dna-showcase/pano360/node0_preview.jpg', 'demo/dna-showcase/pano360/node0_preview.jpg'],
    ['demo/dna-showcase/pano360/node1_preview.jpg', 'demo/dna-showcase/pano360/node1_preview.jpg'],
    ['demo/dna-showcase/pano360/node2_preview.jpg', 'demo/dna-showcase/pano360/node2_preview.jpg'],
    ['demo/dna-showcase/products/apex_cobot_x16.jpg', 'demo/dna-showcase/products/apex_cobot_x16.jpg'],
    ['demo/dna-showcase/products/vector_amr_600.jpg', 'demo/dna-showcase/products/vector_amr_600.jpg'],
    ['demo/dna-showcase/products/delta_d12.jpg', 'demo/dna-showcase/products/delta_d12.jpg'],
    ['demo/dna-showcase/products/scara_s8.jpg', 'demo/dna-showcase/products/scara_s8.jpg'],

    // 2. Vantelle Showcase (Fashion) - Crystal-Clear High-Res Panorama & Products
    ['demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg'],
    ['demo/vantelle-showcase/pano360/node0_preview.jpg', 'demo/vantelle-showcase/pano360/node0_preview.jpg'],
    ['demo/vantelle-showcase/products/scarlet_wrap_set.jpg', 'demo/vantelle-showcase/products/scarlet_wrap_set.jpg'],
    ['demo/vantelle-showcase/products/ivory_suit.jpg', 'demo/vantelle-showcase/products/ivory_suit.jpg'],
    ['demo/vantelle-showcase/products/midnight_leather.jpg', 'demo/vantelle-showcase/products/midnight_leather.jpg'],
    ['demo/vantelle-showcase/products/paris_bag.jpg', 'demo/vantelle-showcase/products/paris_bag.jpg'],

    // 3. Lumiere Showcase (Cosmetics) - Crystal-Clear High-Res Panorama & Products
    ['demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg'],
    ['demo/lumiere-showcase/pano360/node0_preview.jpg', 'demo/lumiere-showcase/pano360/node0_preview.jpg'],
    ['demo/lumiere-showcase/products/radiance_serum.jpg', 'demo/lumiere-showcase/products/radiance_serum.jpg'],
    ['demo/lumiere-showcase/products/botanical_cleanser.jpg', 'demo/lumiere-showcase/products/peptide_cream.jpg'],
    ['demo/lumiere-showcase/products/peptide_cream.jpg', 'demo/lumiere-showcase/products/peptide_cream.jpg'],
    ['demo/lumiere-showcase/products/essence_tower.jpg', 'demo/lumiere-showcase/products/essence_tower.jpg'],

    // 4. Nova Living Showcase (Furniture) - Crystal-Clear High-Res Panorama & Products
    ['demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg'],
    ['demo/furniture-showcase/pano360/node0_preview.jpg', 'demo/furniture-showcase/pano360/node0_preview.jpg'],
    ['demo/furniture-showcase/products/linen_sofa.jpg', 'demo/furniture-showcase/products/linen_sofa.jpg'],
    ['demo/furniture-showcase/products/lounge_chair.jpg', 'demo/furniture-showcase/products/lounge_chair.jpg'],
    ['demo/furniture-showcase/products/dining_table.jpg', 'demo/furniture-showcase/products/dining_table.jpg'],
    ['demo/furniture-showcase/products/leather_sofa.jpg', 'demo/furniture-showcase/products/leather_sofa.jpg'],

    // 5. Videos (AI Virtual Fitting & Virtual Makeup Artist)
    ['demo/virtual-fitting-room/fashion.mp4', 'demo/virtual-fitting-room/fashion.mp4'],
    ['demo/virtual-makeup-artist/makeup.mp4', 'demo/virtual-makeup-artist/makeup.mp4'],
    ['demo/virtual-fitting-room/fashion-poster-last-frame.jpg', 'demo/virtual-fitting-room/fashion-poster-last-frame.jpg'],
    ['demo/virtual-makeup-artist/makeup-poster-last-frame.jpg', 'demo/virtual-makeup-artist/makeup-poster-last-frame.jpg']
  ];

  for (const [reqPath, sourceRel] of highResMappings) {
    const full = path.join(clientAssets, sourceRel);
    if (fs.existsSync(full)) {
      const buf = fs.readFileSync(full);
      const isMp4 = reqPath.endsWith('.mp4');
      const isPng = reqPath.endsWith('.png');
      const contentType = isMp4 ? 'video/mp4' : (isPng ? 'image/png' : 'image/jpeg');

      assetsMap[reqPath] = {
        contentType,
        base64: buf.toString('base64'),
        size: buf.length
      };
      console.log(`Bundled High-Res: ${reqPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      console.warn(`WARNING: File missing at ${full}`);
    }
  }
}

bundleAllHighResAssets();

const bundleContent = `// Auto-generated 3DNA High-Res Crystal Clear Asset Bundle (Including 8K/4K Panoramas & Videos)
module.exports = ${JSON.stringify(assetsMap, null, 2)};
`;

fs.writeFileSync(path.join(baseDir, 'app_build', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');

const totalMB = (Buffer.byteLength(bundleContent) / 1024 / 1024).toFixed(2);
console.log(`✅ High-Res Bundle successfully built! Total size: ${totalMB} MB`);
