const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');
const p = html.indexOf('<aside class="drawer"');
console.log(html.substring(p, p + 600));
