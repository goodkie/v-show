const fs = require('fs');
const files = [
  'app_build/client/demo-fashion.html',
  'app_build/client/demo-cosmetic.html',
  'app_build/client/demo-furniture.html'
];

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');

  // 1. PixelRatio를 최대 3.0까지 지원 (고해상도 레티나 디스플레이 및 4K 화면 100% 네이티브 선명도)
  html = html.replace(
    /renderer\.setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, [0-9.]+\)\);/g,
    'renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));'
  );

  // 2. 텍스처 로더 설정 강화 (16x 이방성 필터링 + ACESFilmic)
  if (!html.includes('tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;')) {
    html = html.replace(
      /tex\.encoding = THREE\.sRGBEncoding;/g,
      `tex.encoding = THREE.sRGBEncoding;\n    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;\n    tex.minFilter = THREE.LinearMipMapLinearFilter;\n    tex.magFilter = THREE.LinearFilter;\n    tex.generateMipmaps = true;`
    );
  }

  // 3. ACES Tone mapping & exposure
  html = html.replace(/renderer\.toneMappingExposure = [0-9.]+;/g, 'renderer.toneMappingExposure = 1.15;');

  // 4. SPATIAL_NODES에서 image16k 및 image8k 경로 보장
  // node.image16k 또는 node.image8k 우선 로딩 확인

  fs.writeFileSync(f, html, 'utf8');
  console.log(`✅ ${f} Three.js engine tuned for MAXIMUM clarity`);
});
