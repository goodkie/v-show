const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');

const filesToSync = [
  {
    src: path.join(baseDir, 'app_build/client/index.html'),
    dests: [
      path.join(baseDir, '_railway_deploy/client/index.html'),
      path.join(baseDir, '_railway_deploy/index.html'),
      path.join(baseDir, '_clean_deploy/client/index.html'),
      path.join(baseDir, '_clean_deploy/index.html')
    ]
  },
  {
    src: path.join(baseDir, 'app_build/server/mailer.js'),
    dests: [
      path.join(baseDir, '_railway_deploy/server/mailer.js'),
      path.join(baseDir, '_clean_deploy/server/mailer.js')
    ]
  },
  {
    src: path.join(baseDir, 'app_build/server/index.js'),
    dests: [
      path.join(baseDir, '_railway_deploy/server/index.js'),
      path.join(baseDir, '_clean_deploy/server/index.js')
    ]
  }
];

filesToSync.forEach(({ src, dests }) => {
  dests.forEach(dest => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied ${path.relative(baseDir, src)} -> ${path.relative(baseDir, dest)}`);
  });
});

console.log('✅ Synchronized all updated client and server files across deploy directories!');