const fs = require('fs');
const path = require('path');

const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(fileName => {
  const filePath = path.join(clientDir, fileName);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // 네이티브 이미지 기반 고신뢰성 텍스처 로더
  const oldLoaderRegex = /function loadNodeTexture\(url,\s*callback\)\s*\{[\s\S]*?textureCache\[url\]\s*=\s*tex;\s*if \(callback\) callback\(tex\);\s*\}\);?\s*\}/;
  
  const robustLoader = `function loadNodeTexture(url, callback) {
  if (textureCache[url]) {
    if (callback) callback(textureCache[url]);
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    tex.format = THREE.RGBAFormat;
    tex.needsUpdate = true;
    textureCache[url] = tex;
    if (callback) callback(tex);
  };
  img.onerror = (e) => {
    console.error('Texture loading failed for URL:', url, e);
  };
  img.src = url;
}`;

  content = content.replace(oldLoaderRegex, robustLoader);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Applied robust native image texture loader to ${fileName}`);
});
