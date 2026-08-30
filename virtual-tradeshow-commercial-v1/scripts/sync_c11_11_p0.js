const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');

const htmlFiles = [
  'index.html',
  'demo-cosmetic.html',
  'demo-fashion.html',
  'demo-furniture.html',
  'demo-matterport.html',
  'demo-splat.html',
  'demo.html',
  'organizer.html',
  'admin.html',
  'builder.html',
  'client-portal.html',
  'capture-guide.html',
  'card.html'
];

htmlFiles.forEach(file => {
  const src = path.join(baseDir, 'app_build/client', file);
  if (fs.existsSync(src)) {
    const dests = [
      path.join(baseDir, '_railway_deploy/client', file),
      path.join(baseDir, '_clean_deploy/client', file)
    ];
    if (file === 'index.html') {
      dests.push(path.join(baseDir, '_railway_deploy/index.html'));
      dests.push(path.join(baseDir, '_clean_deploy/index.html'));
    }
    dests.forEach(d => {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(src, d);
    });
  }
});

// Logo asset files
const logoSrc = path.join(baseDir, 'app_build/client/assets/brand/3dz_logo.png');
if (fs.existsSync(logoSrc)) {
  const logoDests = [
    path.join(baseDir, '_railway_deploy/client/assets/brand/3dz_logo.png'),
    path.join(baseDir, '_clean_deploy/client/assets/brand/3dz_logo.png'),
    path.join(baseDir, '_clean_deploy/assets/brand/3dz_logo.png'),
    path.join(baseDir, '_railway_deploy/client/assets/brand/dna_logo_white.png'),
    path.join(baseDir, '_clean_deploy/client/assets/brand/dna_logo_white.png'),
    path.join(baseDir, '_clean_deploy/assets/brand/dna_logo_white.png')
  ];
  logoDests.forEach(ld => {
    fs.mkdirSync(path.dirname(ld), { recursive: true });
    fs.copyFileSync(logoSrc, ld);
  });
}

// Server files
const serverFiles = ['mailer.js', 'index.js', 'db.js'];
serverFiles.forEach(sf => {
  const src = path.join(baseDir, 'app_build/server', sf);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(baseDir, '_railway_deploy/server', sf));
    fs.copyFileSync(src, path.join(baseDir, '_clean_deploy/server', sf));
  }
});

console.log('✅ Synchronized all updated client HTML, logos, and server files!');