const fs = require('fs');
const path = require('path');

const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(fileName => {
  const filePath = path.join(clientDir, fileName);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // 1. 잘못된 native Image 텍스처 로더를 THREE.TextureLoader 기반으로 완전 복원
  //    단, mipmap 비활성화 & LinearFilter 유지로 블러 없는 선명도 보장
  const badLoaderRegex = /function loadNodeTexture\(url,\s*callback\)\s*\{[\s\S]*?img\.src\s*=\s*url;\s*\}/;
  
  const fixedLoader = `function loadNodeTexture(url, callback) {
  if (textureCache[url]) {
    if (callback) callback(textureCache[url]);
    return;
  }
  textureLoader.load(
    url,
    (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
      tex.needsUpdate = true;
      textureCache[url] = tex;
      if (callback) callback(tex);
    },
    undefined,
    (err) => {
      console.error('[TextureLoader ERROR]', url, err);
    }
  );
}`;

  content = content.replace(badLoaderRegex, fixedLoader);

  // 2. MeshBasicMaterial을 FrontSide + transparent: false 로 복원 (DoubleSide 제거)
  content = content.replace(
    /photoMaterial\s*=\s*(?:window\.photoMaterial\s*=\s*)?new THREE\.MeshBasicMaterial\(\{[\s\S]*?depthWrite:\s*false\s*\}\);/,
    `photoMaterial = window.photoMaterial = new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
    depthWrite: false
  });`
  );

  // 3. renderer 초기화 시 배경색을 검정으로 명시적 설정
  const oldRendererSetup = `renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);`;

  const newRendererSetup = `renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);`;

  content = content.replace(oldRendererSetup, newRendererSetup);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Fixed texture loader + clear color in ${fileName}`);
});
