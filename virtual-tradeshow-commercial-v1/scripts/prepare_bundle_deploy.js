const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const deployDir = path.join(baseDir, '_railway_deploy');

// Remove client/assets/demo from _railway_deploy so upload doesn't duplicate
const demoDir = path.join(deployDir, 'client', 'assets', 'demo');
if (fs.existsSync(demoDir)) {
  fs.rmSync(demoDir, { recursive: true, force: true });
  console.log('✅ Removed duplicate client/assets/demo from deploy folder');
}

// Copy latest demo-*.html and index.html to _railway_deploy/client
['demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html', 'demo-matterport.html', 'index.html'].forEach(file => {
  const src = path.join(baseDir, 'app_build', 'client', file);
  const dst = path.join(deployDir, 'client', file);
  fs.copyFileSync(src, dst);
});

// Copy server/index.js
fs.copyFileSync(path.join(baseDir, 'app_build', 'server', 'index.js'), path.join(deployDir, 'server', 'index.js'));

console.log('✅ Synchronized all updated files to _railway_deploy');
