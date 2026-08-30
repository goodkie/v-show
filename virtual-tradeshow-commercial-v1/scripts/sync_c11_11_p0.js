const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied ${path.relative(baseDir, src)} -> ${path.relative(baseDir, dest)}`);
  }
}

// 1. Sync client index.html
const clientSrc = path.join(baseDir, 'app_build', 'client', 'index.html');
copyFile(clientSrc, path.join(baseDir, '_railway_deploy', 'client', 'index.html'));
copyFile(clientSrc, path.join(baseDir, '_railway_deploy', 'index.html'));
copyFile(clientSrc, path.join(baseDir, '_clean_deploy', 'client', 'index.html'));
copyFile(clientSrc, path.join(baseDir, '_clean_deploy', 'index.html'));

// 2. Sync server mailer.js
const mailerSrc = path.join(baseDir, 'app_build', 'server', 'mailer.js');
copyFile(mailerSrc, path.join(baseDir, '_railway_deploy', 'server', 'mailer.js'));
copyFile(mailerSrc, path.join(baseDir, '_clean_deploy', 'server', 'mailer.js'));

console.log('✅ Synchronized all updated client and server files across deploy directories!');