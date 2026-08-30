const fs = require('fs');
const path = require('path');

const clientDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client');

const targetFiles = [
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

targetFiles.forEach(file => {
  const filePath = path.join(clientDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const orig = content;
    
    // Replace branding
    content = content.split('³DNa').join('³D₂');
    content = content.split('3DNA').join('³D₂');
    content = content.split("DN'a").join('³D₂');
    content = content.split('3DZ').join('³D₂');
    content = content.split('3dz.site').join('3dx.site');

    if (content !== orig) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated branding in ${file}`);
    }
  }
});
console.log('✅ Demo & ancillary pages brand check completed.');