const { execSync } = require('child_process');
let orig = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });

console.log('Original lines:', orig.split('\n').length);
console.log('Original has drw-img:', orig.includes('id="drw-img"'));
console.log('Original has drw-img-box:', orig.includes('id="drw-img-box"'));

// Find lines containing drw-img
const lines = orig.split('\n');
lines.forEach((l, i) => {
  if (l.includes('drw-img') || l.includes('initDrawer3D')) {
    console.log(`${i+1}: ${l.trim()}`);
  }
});
