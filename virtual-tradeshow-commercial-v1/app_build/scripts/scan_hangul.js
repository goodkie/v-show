const fs = require('fs');
const path = require('path');

const clientDir = path.resolve(__dirname, '../client');
const hangulRegex = /[\uac00-\ud7af]/;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const matches = [];
      lines.forEach((line, idx) => {
        if (hangulRegex.test(line)) {
          matches.push({ lineNum: idx + 1, content: line.trim() });
        }
      });
      const rel = path.relative(clientDir, fullPath);
      console.log(`${rel}: ${matches.length} lines with Hangul`);
      if (matches.length > 0) {
        matches.slice(0, 5).forEach(m => {
          console.log(`   L${m.lineNum}: ${m.content.substring(0, 80)}`);
        });
      }
    }
  }
}

console.log('=== Hangul Scan in client/ ===');
scanDir(clientDir);
