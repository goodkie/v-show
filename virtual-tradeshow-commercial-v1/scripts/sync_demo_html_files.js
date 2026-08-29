const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html'];

demoFiles.forEach(f => {
  const src = path.join(baseDir, 'app_build', 'client', f);
  fs.copyFileSync(src, path.join(baseDir, '_clean_deploy', 'client', f));
  fs.copyFileSync(src, path.join(baseDir, '_railway_deploy', 'client', f));
  fs.copyFileSync(src, path.join(baseDir, '_clean_deploy', f));
  fs.copyFileSync(src, path.join(baseDir, '_railway_deploy', f));
});

console.log('✅ Synchronized updated demo HTML files!');
