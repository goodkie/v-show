const fs = require('fs');
const path = require('path');
const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';

const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(f => {
  const p = path.join(baseDir, f);
  if (!fs.existsSync(p)) {
    console.log(`[MISSING FILE] ${f}`);
    return;
  }
  const content = fs.readFileSync(p, 'utf8');
  console.log(`\n=== Checking ${f} ===`);
  
  // 파노라마 이미지 또는 텍스처 이미지 경로 검출
  const panoramaMatches = content.match(/https?:\/\/[^\s"'`<>]+|\/assets\/[^\s"'`<>]+/g) || [];
  panoramaMatches.forEach(url => {
    if (url.includes('.jpg') || url.includes('.png') || url.includes('.webp') || url.includes('.mp4')) {
      if (url.startsWith('/assets/')) {
        const localPath = path.join(baseDir, url.replace('/assets/', 'assets/'));
        const exists = fs.existsSync(localPath);
        console.log(`  ${exists ? '✅' : '❌'} Local asset: ${url} (Exists: ${exists})`);
      } else {
        console.log(`  🌐 External URL: ${url}`);
      }
    }
  });
});
