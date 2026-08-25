const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

// <script> 태그 안의 JS 코드 추출
const scriptMatches = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi);
console.log('Found script tags:', scriptMatches.length);

scriptMatches.forEach((tag, idx) => {
  const content = tag.replace(/<script[\s\S]*?>/i, '').replace(/<\/script>/i, '');
  if (!content.trim()) return;
  try {
    new Function(content);
    console.log(`Script ${idx}: Syntax OK`);
  } catch (err) {
    console.log(`❌ Script ${idx} SYNTAX ERROR:`, err.message);
    // Find approximate line
    const lines = content.split('\n');
    for (let i = 1; i <= lines.length; i++) {
      try {
        new Function(lines.slice(0, i).join('\n'));
      } catch (e) {
        if (!e.message.includes('Unexpected end of input') && !e.message.includes('missing }') && !e.message.includes('missing )')) {
          console.log(`Error near line ${i}: ${lines[i-1]}`);
          console.log(`Context:\n` + lines.slice(Math.max(0, i-4), Math.min(lines.length, i+3)).join('\n'));
          break;
        }
      }
    }
  }
});
