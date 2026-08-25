const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

// SPATIAL_NODES 출력
const nodesMatch = html.match(/const SPATIAL_NODES = \[[\s\S]*?\];/);
console.log(nodesMatch ? nodesMatch[0] : 'not found');
