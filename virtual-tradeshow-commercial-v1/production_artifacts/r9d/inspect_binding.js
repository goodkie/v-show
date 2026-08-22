const fs = require('fs');
const path = require('path');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientDir = path.join(root, 'app_build', 'client');
const staticBoothDir = path.join(clientDir, 'assets', 'demo', 'wilo', 'booth');

console.log('Static booth dir exists:', fs.existsSync(staticBoothDir));
if (fs.existsSync(staticBoothDir)) {
  console.log('Files in static booth dir:', fs.readdirSync(staticBoothDir));
}

// Check server/index.js static serving configuration
const serverIndex = fs.readFileSync(path.join(root, 'app_build', 'server', 'index.js'), 'utf8');
const staticMatches = serverIndex.match(/express\.static\([^\)]+\)/g);
console.log('Express static calls:', staticMatches);

// Check wilo-demo.html boothViews
const wiloHtml = fs.readFileSync(path.join(clientDir, 'wilo-demo.html'), 'utf8');
const boothViewsMatch = wiloHtml.match(/const boothViews = \[([\s\S]*?)\];/);
console.log('wilo-demo.html boothViews array:');
if (boothViewsMatch) {
  console.log(boothViewsMatch[0]);
}

// Check if URLs in boothViews exist on disk
const expectedUrls = [
  '/assets/demo/wilo/booth/01_front_hero.jpg',
  '/assets/demo/wilo/booth/02_front_center.jpg',
  '/assets/demo/wilo/booth/03_left_angle.jpg',
  '/assets/demo/wilo/booth/04_right_angle.jpg',
  '/assets/demo/wilo/booth/05_left_side.jpg',
  '/assets/demo/wilo/booth/06_right_side.jpg',
  '/assets/demo/wilo/booth/07_interior_view.jpg',
  '/assets/demo/wilo/booth/08_product_island.jpg',
  '/assets/demo/wilo/booth/09_meeting_area.jpg',
  '/assets/demo/wilo/booth/10_display_screen.jpg',
  '/assets/demo/wilo/booth/11_overhead_sign.jpg',
  '/assets/demo/wilo/booth/12_wide_overview.jpg'
];

console.log('\nChecking disk presence of requested URLs:');
expectedUrls.forEach(u => {
  const filePath = path.join(clientDir, u.replace(/^\//, ''));
  console.log(`  ${u} -> ${fs.existsSync(filePath) ? 'EXISTS (' + fs.statSync(filePath).size + ' bytes)' : 'MISSING'}`);
});
