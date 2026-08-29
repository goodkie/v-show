const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const files = [
  'demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html',
  'index.html'
];

files.forEach(f => {
  const src = path.join(baseDir, 'app_build', 'client', f);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, path.join(baseDir, '_railway_deploy', 'client', f));
});

console.log('✅ Synchronized all fixed files to _railway_deploy!');
