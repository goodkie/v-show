const fs = require('fs');
const path = require('path');

const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(fileName => {
  const filePath = path.join(clientDir, fileName);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Preview 단계 복원: 저화질 preview로 즉시 표시 -> 8K Master로 교체
  const noPreviewPattern = `  // Immediate Direct 128K Ultra Master Texture Binding (No blurry preview downscaling)
  loadNodeTexture(hdTargetUrl, (hdTex) => {
    if (currentNodeIdx === idx) {
      photoMaterial.map = hdTex;
      photoMaterial.needsUpdate = true;
    }
  });`;

  const withPreview = `  // 1. Instant preview (low-res fast)
  if (node.preview) {
    loadNodeTexture(node.preview, (prevTex) => {
      if (currentNodeIdx === idx && !photoMaterial.map) {
        photoMaterial.map = prevTex;
        photoMaterial.needsUpdate = true;
      }
    });
  }

  // 2. Upgrade to Crystal-Sharp 8K Master (generateMipmaps=false, LinearFilter, 16x Aniso)
  loadNodeTexture(hdTargetUrl, (hdTex) => {
    if (currentNodeIdx === idx) {
      photoMaterial.map = hdTex;
      photoMaterial.needsUpdate = true;
    }
  });`;

  content = content.replace(noPreviewPattern, withPreview);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Restored preview+8K progressive loading in ${fileName}`);
});
