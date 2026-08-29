const fs = require('fs');
const path = require('path');

const targetDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy';

// server/demo_asset_bundle.js에 이미 모든 에셋(8K 파노라마, 비디오, 썸네일)이 완벽히 인메모리로 포함되어 있으므로
// client/assets/demo 폴더를 삭제하여 railway 업로드 페이로드를 48MB로 만듭니다.
const clientDemo = path.join(targetDir, 'client', 'assets', 'demo');
if (fs.existsSync(clientDemo)) {
  fs.rmSync(clientDemo, { recursive: true, force: true });
  console.log('✅ Removed heavy duplicate raw demo folder from _railway_deploy');
}

const assetsDemo = path.join(targetDir, 'assets');
if (fs.existsSync(assetsDemo)) {
  fs.rmSync(assetsDemo, { recursive: true, force: true });
  console.log('✅ Removed duplicate root assets from _railway_deploy');
}
