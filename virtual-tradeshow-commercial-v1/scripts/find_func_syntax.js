const fs = require('fs');
const html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

const lastScript = html.substring(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const lines = lastScript.split('\n');

// Try compiling block by block or function by function
let currentFunc = '';
let inFunc = false;
let funcStart = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim().startsWith('function ') || line.trim().startsWith('window.')) {
    if (inFunc) {
      try {
        new Function(currentFunc);
      } catch (e) {
        console.log(`❌ Syntax error in function starting at line ${funcStart}:`, e.message);
        console.log(currentFunc);
      }
    }
    inFunc = true;
    funcStart = i + 1;
    currentFunc = line + '\n';
  } else if (inFunc) {
    currentFunc += line + '\n';
  }
}
if (inFunc) {
  try {
    new Function(currentFunc);
  } catch (e) {
    console.log(`❌ Syntax error in function starting at line ${funcStart}:`, e.message);
    console.log(currentFunc);
  }
}
