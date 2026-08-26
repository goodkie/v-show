const fs = require('fs');
let code = fs.readFileSync('app_build/server/db.js', 'utf8');

// fallback 추가
code = code.replace(
  /const specialEnv = process\.env\.DNA_SPECIAL_DEVELOPER_EMAILS \|\| '';/g,
  `const specialEnv = process.env.DNA_SPECIAL_DEVELOPER_EMAILS || 'lead-dev@internal.vshow.com,architect@dn-a.com,goodkie.com@gmail.com';`
);

fs.writeFileSync('app_build/server/db.js', code, 'utf8');
console.log('✅ db.js fallback updated');
