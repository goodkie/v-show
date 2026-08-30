const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// Remove the first occurrence of dropZone listener block
const firstDropZoneIdx = html.indexOf('const dropZone = document.getElementById(\'booth-drop-zone\');');
if (firstDropZoneIdx !== -1) {
  const nextDropZoneIdx = html.indexOf('const dropZone = document.getElementById(\'booth-drop-zone\');', firstDropZoneIdx + 10);
  if (nextDropZoneIdx !== -1) {
    const endOfFirst = html.indexOf('// ══════════════════════════════════════════════════════════════', firstDropZoneIdx);
    if (endOfFirst !== -1) {
      html = html.substring(0, firstDropZoneIdx) + html.substring(endOfFirst);
      console.log('Removed duplicate dropZone declaration successfully');
    }
  }
}

fs.writeFileSync(filePath, html, 'utf8');