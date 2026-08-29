const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

const assetsMap = {};

// 1. 모든 제품 썸네일 & 데모 비디오 포스터 & 360 프리뷰/8k 맵핑
// 만약 8k 요청이 오더라도 preview/경량 이미지를 즉시 전달하여 Three.js 파노라마 구에 텍스처를 100% 매핑
function bundleAssets() {
  const fileMappings = [
    // 1. DNA Showcase (Robotics)
    ['demo/dna-showcase/products/apex_cobot_x16.jpg', 'demo/dna-showcase/products/apex_cobot_x16.jpg'],
    ['demo/dna-showcase/products/vector_amr_600.jpg', 'demo/dna-showcase/products/vector_amr_600.jpg'],
    ['demo/dna-showcase/products/delta_d12.jpg', 'demo/dna-showcase/products/delta_d12.jpg'],
    ['demo/dna-showcase/products/scara_s8.jpg', 'demo/dna-showcase/products/scara_s8.jpg'],
    ['demo/dna-showcase/pano360/node0_preview.jpg', 'demo/dna-showcase/pano360/node0_preview.jpg'],
    ['demo/dna-showcase/pano360/node1_preview.jpg', 'demo/dna-showcase/pano360/node1_preview.jpg'],
    ['demo/dna-showcase/pano360/node2_preview.jpg', 'demo/dna-showcase/pano360/node2_preview.jpg'],
    ['demo/dna-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node0_preview.jpg'],
    ['demo/dna-showcase/pano360/node1_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node1_preview.jpg'],
    ['demo/dna-showcase/pano360/node2_360_panorama_8k.jpg', 'demo/dna-showcase/pano360/node2_preview.jpg'],
    ['demo/dna-showcase/pano360/node1_360_cobots_8k.jpg', 'demo/dna-showcase/pano360/node1_preview.jpg'],
    ['demo/dna-showcase/pano360/node2_360_amr_8k.jpg', 'demo/dna-showcase/pano360/node2_preview.jpg'],
    
    // 2. Vantelle Showcase (Fashion)
    ['demo/vantelle-showcase/products/scarlet_wrap_set.jpg', 'demo/vantelle-showcase/products/scarlet_wrap_set.jpg'],
    ['demo/vantelle-showcase/products/ivory_suit.jpg', 'demo/vantelle-showcase/products/ivory_suit.jpg'],
    ['demo/vantelle-showcase/products/midnight_leather.jpg', 'demo/vantelle-showcase/products/midnight_leather.jpg'],
    ['demo/vantelle-showcase/products/paris_bag.jpg', 'demo/vantelle-showcase/products/paris_bag.jpg'],
    ['demo/vantelle-showcase/pano360/node0_preview.jpg', 'demo/vantelle-showcase/pano360/node0_preview.jpg'],
    ['demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/vantelle-showcase/pano360/node0_preview.jpg'],

    // 3. Lumiere Showcase (Cosmetics)
    ['demo/lumiere-showcase/products/radiance_serum.jpg', 'demo/lumiere-showcase/products/radiance_serum.jpg'],
    ['demo/lumiere-showcase/products/botanical_cleanser.jpg', 'demo/lumiere-showcase/products/peptide_cream.jpg'],
    ['demo/lumiere-showcase/products/peptide_cream.jpg', 'demo/lumiere-showcase/products/peptide_cream.jpg'],
    ['demo/lumiere-showcase/products/essence_tower.jpg', 'demo/lumiere-showcase/products/essence_tower.jpg'],
    ['demo/lumiere-showcase/pano360/node0_preview.jpg', 'demo/lumiere-showcase/pano360/node0_preview.jpg'],
    ['demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/lumiere-showcase/pano360/node0_preview.jpg'],

    // 4. Nova Living Showcase (Furniture)
    ['demo/furniture-showcase/products/linen_sofa.jpg', 'demo/furniture-showcase/products/linen_sofa.jpg'],
    ['demo/furniture-showcase/products/lounge_chair.jpg', 'demo/furniture-showcase/products/lounge_chair.jpg'],
    ['demo/furniture-showcase/products/dining_table.jpg', 'demo/furniture-showcase/products/dining_table.jpg'],
    ['demo/furniture-showcase/products/leather_sofa.jpg', 'demo/furniture-showcase/products/leather_sofa.jpg'],
    ['demo/furniture-showcase/pano360/node0_preview.jpg', 'demo/furniture-showcase/pano360/node0_preview.jpg'],
    ['demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg', 'demo/furniture-showcase/pano360/node0_preview.jpg'],

    // 5. AI Virtual Fitting / Makeup Posters
    ['demo/virtual-fitting-room/fashion-poster-last-frame.jpg', 'demo/virtual-fitting-room/fashion-poster-last-frame.jpg'],
    ['demo/virtual-makeup-artist/makeup-poster-last-frame.jpg', 'demo/virtual-makeup-artist/makeup-poster-last-frame.jpg']
  ];

  for (const [reqPath, sourceRel] of fileMappings) {
    const full = path.join(clientAssets, sourceRel);
    if (fs.existsSync(full)) {
      const buf = fs.readFileSync(full);
      assetsMap[reqPath] = {
        contentType: 'image/jpeg',
        base64: buf.toString('base64'),
        size: buf.length
      };
      console.log(`Bundled lightweight: ${reqPath} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  }
}

bundleAssets();

const bundleContent = `// Auto-generated 3DNA Lightweight In-Memory Demo Asset Bundle (Ultra Fast 3MB)
module.exports = ${JSON.stringify(assetsMap, null, 2)};
`;

fs.writeFileSync(path.join(baseDir, 'app_build', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'server', 'demo_asset_bundle.js'), bundleContent, 'utf8');

const bundleSizeMB = (Buffer.byteLength(bundleContent) / 1024 / 1024).toFixed(2);
console.log(`✅ Lightweight bundle generated! Total file size: ${bundleSizeMB} MB`);
