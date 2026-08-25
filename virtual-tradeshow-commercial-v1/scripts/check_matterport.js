const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

const checks = [
  { name: 'BUILD A BOOTH LIKE THIS →', test: html.includes('BUILD A BOOTH LIKE THIS →') },
  { name: 'No ?? broken characters', test: !html.includes('??') },
  { name: 'initThree exists', test: html.includes('function initThree(') },
  { name: 'photoSphere exists', test: html.includes('photoSphere = new THREE.Mesh(') },
  { name: 'drw-img exists', test: html.includes('id="drw-img"') },
  { name: 'drw-img-box exists', test: html.includes('id="drw-img-box"') },
  { name: '3D drawer removed', test: !html.includes('initDrawer3D') && !html.includes('drawer3dScene') },
];

console.log('=== demo-matterport.html 검증 결과 ===');
checks.forEach(c => console.log((c.test ? '✅ ' : '❌ ') + c.name));
