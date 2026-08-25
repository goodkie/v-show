const { execSync } = require('child_process');
const fs = require('fs');

const orig = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });

// SPATIAL_NODES 추출
const nodesMatch = orig.match(/const SPATIAL_NODES = \[[\s\S]*?\];/);
console.log('Found SPATIAL_NODES:', !!nodesMatch);

// PRODUCTS_DATA 추출
const prodMatch = orig.match(/const PRODUCTS_DATA = \[[\s\S]*?\];/);
console.log('Found PRODUCTS_DATA:', !!prodMatch);

// Bottom quick cards 추출
const bottomMatch = orig.match(/<!-- PRODUCT QUICK ACCESS BOTTOM TRAY -->[\s\S]*?<!-- \/PRODUCT QUICK ACCESS BOTTOM TRAY -->/);
console.log('Found bottom tray:', !!bottomMatch);
