const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html';
let html = fs.readFileSync(filePath, 'utf8');

html = html.replace('Creating Photo Immersive Booth...', 'Creating Your 3D Booth...');
html = html.replace('A free photo immersive booth preview has already been created', 'A free 3D virtual booth preview has already been created');
html = html.replace('<div class="step-title">Get Photo Immersive Booth</div>', '<div class="step-title">Get 3D Booth</div>');
html = html.replace('Your photo immersive booth is fully populated.', 'Your 3D booth is fully populated.');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Updated remaining customer-facing strings in index.html successfully');