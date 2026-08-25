const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');
const start = html.indexOf('product-drawer');
console.log(html.substring(start - 30, start + 800));
