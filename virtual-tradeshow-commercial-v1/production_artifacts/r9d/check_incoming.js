const fs = require('fs');
const path = require('path');

const incoming = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/data/capture-ingest/wilo/incoming';
console.log('INCOMING_EXISTS=' + fs.existsSync(incoming));

if (fs.existsSync(incoming)) {
  const files = fs.readdirSync(incoming).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log('INCOMING_IMAGE_COUNT=' + files.length);
  files.slice(0, 20).forEach((f, i) => {
    const stat = fs.statSync(path.join(incoming, f));
    console.log(`[${i+1}] ${f} (${(stat.size/1024).toFixed(1)} KB)`);
  });
  if (files.length > 20) {
    console.log(`... and ${files.length - 20} more files.`);
  }
} else {
  // Let's check capture-ingest directory
  const parent = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/data';
  if (fs.existsSync(parent)) {
    console.log('Contents of data:', fs.readdirSync(parent));
  }
}
