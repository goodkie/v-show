const fs = require('fs');
const mat = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

function getFunc(code, name) {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return 'NOT FOUND';
  const end = code.indexOf('\n// ', start + 10);
  return code.substring(start, end !== -1 ? end : start + 1000);
}

console.log('=== initThree in demo-matterport ===');
console.log(getFunc(mat, 'initThree'));
