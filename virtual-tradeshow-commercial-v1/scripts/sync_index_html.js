const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const idxSrc = path.join(baseDir, 'app_build', 'client', 'index.html');
fs.copyFileSync(idxSrc, path.join(baseDir, '_clean_deploy', 'client', 'index.html'));
fs.copyFileSync(idxSrc, path.join(baseDir, '_railway_deploy', 'client', 'index.html'));
fs.copyFileSync(idxSrc, path.join(baseDir, '_clean_deploy', 'index.html'));
fs.copyFileSync(idxSrc, path.join(baseDir, '_railway_deploy', 'index.html'));

console.log('✅ Synchronized index.html to deploy targets!');
