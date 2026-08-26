const fs = require('fs');

const dbPath = 'app_build/server/db.js';
let code = fs.readFileSync(dbPath, 'utf8');

// 하드코딩된 fallback 제거 -> 오직 process.env.DNA_SPECIAL_DEVELOPER_EMAILS 에만 의존
code = code.replace(
  /const specialEnv = process\.env\.DNA_SPECIAL_DEVELOPER_EMAILS \|\| '[^']*';/g,
  `const specialEnv = process.env.DNA_SPECIAL_DEVELOPER_EMAILS || '';`
);

// HMAC SECRET도 환경변수 필수화
code = code.replace(
  /const secret = process\.env\.FREE_PREVIEW_HMAC_SECRET \|\| process\.env\.HMAC_SECRET \|\| 'ephemeral_dev_hmac_secret_key_2026';/g,
  `const secret = process.env.FREE_PREVIEW_HMAC_SECRET || process.env.HMAC_SECRET; if (!secret) throw new Error('PRODUCTION_HMAC_SECRET_REQUIRED: FREE_PREVIEW_HMAC_SECRET env var is missing');`
);

fs.writeFileSync(dbPath, code, 'utf8');
console.log('✅ Hardcoded emails and fallback secrets removed from db.js');
