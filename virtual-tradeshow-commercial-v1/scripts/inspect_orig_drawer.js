const { execSync } = require('child_process');
const orig = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });
const idx = orig.indexOf('product-drawer');
console.log(orig.substring(idx, idx + 1200));
