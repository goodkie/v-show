const fs = require('fs');
const mat = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');
const fas = fs.readFileSync('app_build/client/demo-fashion.html', 'utf8');

function getFunc(code, name) {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return 'NOT FOUND';
  const end = code.indexOf('\nfunction ', start + 10);
  return code.substring(start, end !== -1 ? end : start + 600);
}

console.log('=== switchNode in demo-fashion ===');
console.log(getFunc(fas, 'switchNode'));

console.log('=== switchNode in demo-matterport ===');
console.log(getFunc(mat, 'switchNode'));
