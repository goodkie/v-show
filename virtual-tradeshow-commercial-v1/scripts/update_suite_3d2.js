const fs = require('fs');
const path = require('path');

const suitePath = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_3dz_p0_suite.js');
let suiteCode = fs.readFileSync(suitePath, 'utf8');

suiteCode = suiteCode.split('!title.includes(\'3DZ\')').join('!title.includes(\'³D₂\')');
suiteCode = suiteCode.split('3dz.site').join('3dx.site');

fs.writeFileSync(suitePath, suiteCode, 'utf8');
console.log('✅ Updated test suite expectations for ³D₂ and 3dx.site');