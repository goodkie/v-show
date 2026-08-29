const fs = require('fs');
const path = require('path');

const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(fileName => {
  const filePath = path.join(clientDir, fileName);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // photoMaterial side: THREE.DoubleSide, transparent: false 로 교체
  content = content.replace(
    /photoMaterial\s*=\s*(?:window\.photoMaterial\s*=\s*)?new THREE\.MeshBasicMaterial\(\{[\s\S]*?depthWrite:\s*false\s*\}\);/,
    `photoMaterial = window.photoMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
    depthWrite: false
  });`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Applied DoubleSide and solid rendering to ${fileName}`);
});
