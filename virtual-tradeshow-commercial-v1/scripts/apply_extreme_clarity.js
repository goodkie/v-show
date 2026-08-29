const fs = require('fs');
const path = require('path');

const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(fileName => {
  const filePath = path.join(clientDir, fileName);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // 1. initThree 에서 setPixelRatio 를 setSize '이전'에 호출 + 최소 2.0x ~ 3.0x 슈퍼샘플링 강제
  const oldInitRenderer = `  // High-DPR WebGL Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));`;

  const newInitRenderer = `  // High-DPR Super-Sampled WebGL Renderer (2x ~ 3x Pixel Density Guarantee)
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp',
    alpha: false
  });
  const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);`;

  content = content.replace(oldInitRenderer, newInitRenderer);

  // 2. onResize 에서도 동일하게 setPixelRatio 우선 적용
  const oldOnResize = `function onResize() {
  const rect = container.getBoundingClientRect();
  const width = rect.width || window.innerWidth;
  const height = rect.height || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));
}`;

  const newOnResize = `function onResize() {
  const rect = container.getBoundingClientRect();
  const width = rect.width || window.innerWidth;
  const height = rect.height || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  const canvas = document.getElementById('three-canvas');
  if (canvas) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
}`;

  content = content.replace(oldOnResize, newOnResize);

  // 3. switchNode 에서 저해상도 preview 단계를 완전히 건너뛰고 8K Master 를 즉시 직결 매핑
  const oldSwitchNodeTexture = `  // 1. Immediate fast preview
  if (node.preview) {
    loadNodeTexture(node.preview, (prevTex) => {
      if (currentNodeIdx === idx) {
        photoMaterial.map = prevTex;
        photoMaterial.needsUpdate = true;
      }
    });
  }

  // 2. HD Ultra-Res Master update
  loadNodeTexture(hdTargetUrl, (hdTex) => {
    if (currentNodeIdx === idx) {
      photoMaterial.map = hdTex;
      photoMaterial.needsUpdate = true;
    }
  });`;

  const newSwitchNodeTexture = `  // Immediate Direct 128K Ultra Master Texture Binding (No blurry preview downscaling)
  loadNodeTexture(hdTargetUrl, (hdTex) => {
    if (currentNodeIdx === idx) {
      photoMaterial.map = hdTex;
      photoMaterial.needsUpdate = true;
    }
  });`;

  content = content.replace(oldSwitchNodeTexture, newSwitchNodeTexture);

  // 4. 전역 객체 노출 for forensics
  content = content.replace(
    'photoMaterial = new THREE.MeshBasicMaterial({',
    'photoMaterial = window.photoMaterial = new THREE.MeshBasicMaterial({'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Applied extreme pixel clarity & supersampling to ${fileName}`);
});
