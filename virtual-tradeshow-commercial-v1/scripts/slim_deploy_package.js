const fs = require('fs');
const path = require('path');

const deployDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy';

// 1. 대용량 불필요 파일 및 중복 디렉토리 정리
function removeLargeFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'models' || entry.name === 'diagnostics' || entry.name === 'experimental' || entry.name === 'virtual-tradeshow-commercial-v1') {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log('Removed heavy dir:', fullPath);
      } else {
        removeLargeFiles(fullPath);
      }
    } else {
      if (entry.name.endsWith('.ply') || entry.name.endsWith('.spz') || entry.name.includes('_16k.jpg')) {
        fs.unlinkSync(fullPath);
        console.log('Removed heavy file:', fullPath);
      }
    }
  }
}

removeLargeFiles(deployDir);

// 2. .railwayignore 설정
const ignoreContent = `
node_modules/
.git/
*.log
*.ply
*.spz
*_16k.jpg
data/uploads/models/
`;
fs.writeFileSync(path.join(deployDir, '.railwayignore'), ignoreContent.trim(), 'utf8');

console.log('✅ Slimmed down _railway_deploy perfectly!');
