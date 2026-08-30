const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Sync client folder
const clientSrc = path.join(baseDir, 'app_build/client');
copyDirRecursive(clientSrc, path.join(baseDir, '_railway_deploy/client'));
copyDirRecursive(clientSrc, path.join(baseDir, '_clean_deploy/client'));

// Copy root index.html mirror in _railway_deploy and _clean_deploy
fs.copyFileSync(path.join(clientSrc, 'index.html'), path.join(baseDir, '_railway_deploy/index.html'));
fs.copyFileSync(path.join(clientSrc, 'index.html'), path.join(baseDir, '_clean_deploy/index.html'));

// 2. Sync server files
const serverFiles = ['mailer.js', 'index.js', 'db.js'];
serverFiles.forEach(sf => {
  const src = path.join(baseDir, 'app_build/server', sf);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(baseDir, '_railway_deploy/server', sf));
    fs.copyFileSync(src, path.join(baseDir, '_clean_deploy/server', sf));
  }
});

console.log('✅ Fully synchronized app_build -> _railway_deploy and _clean_deploy!');