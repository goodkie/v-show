const fs = require('fs');
const fashion = fs.readFileSync('app_build/client/demo-fashion.html', 'utf8');
console.log('Fashion lines:', fashion.split('\n').length);
console.log('Has drw-img:', fashion.includes('id="drw-img"'));
console.log('Has drw-img-box:', fashion.includes('id="drw-img-box"'));
