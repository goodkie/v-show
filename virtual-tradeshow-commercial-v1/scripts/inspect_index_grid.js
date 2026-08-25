const fs = require('fs');
const content = fs.readFileSync('app_build/client/index.html', 'utf8');
const start = content.indexOf('<div class="demo-grid">');
const end = content.indexOf('</section>', start);
console.log(content.substring(start, end));
