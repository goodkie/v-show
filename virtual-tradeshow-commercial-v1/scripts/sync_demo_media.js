const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const srcDemoDir = path.join(baseDir, 'app_build', 'client', 'assets', 'demo');
const destCleanDemoDir = path.join(baseDir, '_clean_deploy', 'client', 'assets', 'demo');
const destRailwayDemoDir = path.join(baseDir, '_railway_deploy', 'client', 'assets', 'demo');

function copyDirClean(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // 100MB+ 거대 3D 모델 및 미사용 16K 파일만 제외하여 초경량 유지
    if (entry.name.endsWith('.ply') || entry.name.endsWith('.spz') || entry.name.endsWith('.splat') || entry.name.includes('_16k.jpg')) {
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === 'wilo') continue; // wilo 모델 폴더 제외
      copyDirClean(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 복사 실행
[destCleanDemoDir, destRailwayDemoDir].forEach(d => {
  if (fs.existsSync(d)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  copyDirClean(srcDemoDir, d);
});

// index.html, builder.html 복사
['_clean_deploy', '_railway_deploy'].forEach(dir => {
  fs.copyFileSync(path.join(baseDir, 'app_build', 'client', 'index.html'), path.join(baseDir, dir, 'client', 'index.html'));
  fs.copyFileSync(path.join(baseDir, 'app_build', 'client', 'builder.html'), path.join(baseDir, dir, 'client', 'builder.html'));
});

console.log('✅ Synchronized all essential web demo media (videos, posters, panoramas, products) without bloated files!');
