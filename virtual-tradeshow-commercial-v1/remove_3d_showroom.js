const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'app_build', 'client', 'demo-fashion.html'),
  path.join(__dirname, 'app_build', 'client', 'demo-cosmetic.html'),
  path.join(__dirname, 'app_build', 'client', 'demo-furniture.html'),
  path.join(__dirname, 'app_build', 'client', 'demo-matterport.html')
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Remove "3D SHOWROOM" top navigation button
  content = content.replace(/<a href="\/demo\.html" class="btn-ui">3D SHOWROOM<\/a>\s*/g, '');

  // 2. Remove Drawer Media Tabs
  content = content.replace(/<div class="drawer-media-tabs">[\s\S]*?<\/div>\s*/g, '');

  // 3. Remove Embedded Mini 3D Turntable View inside drawer-img-box
  content = content.replace(/<!-- Embedded Mini 3D Turntable View -->[\s\S]*?<\/div>\s*<\/div>/g, '</div>');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated file:', path.basename(file));
}
