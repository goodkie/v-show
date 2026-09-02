const fs = require('fs');
const files = [
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/server/db.js',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/server/db.js',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/db.js'
];

const targetPattern = /write\(data\) \{[\s\S]*?console\.error\('Error writing database:', err\);[\s\S]*?return false;[\s\S]*?\}[\s\S]*?\}/;

const replacement = `write(data) {
    try {
      if (!data) {
        data = this.memoryData || this.read();
      }
      if (!data || typeof data !== 'object') {
        console.error('[DB] Refusing to write invalid/undefined data to database');
        return false;
      }
      this.memoryData = data;
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(TEMP_DB_FILE, DB_FILE);
      return true;
    } catch (err) {
      console.error('Error writing database:', err);
      return false;
    }
  }`;

files.forEach(f => {
  let src = fs.readFileSync(f, 'utf8');
  if (targetPattern.test(src)) {
    src = src.replace(targetPattern, replacement);
    fs.writeFileSync(f, src, 'utf8');
    console.log('[OK] Successfully updated write() in', f);
  } else {
    console.error('[FAIL] targetPattern not matched in', f);
  }
});
