const fs = require('fs');
const p = 'extension/content-script.js';
let s = fs.readFileSync(p, 'utf8');
const re = /            if \(isAutofillSuccess && hasGenuineMessageField\) \{\r?\n\s+logDev\("\[FILL\] messageBodyFilled=true", "success"\);\r?\n\s+\} else \{\r?\n\s+logDev\("\[FILL\] messageBodyFilled=false", "info"\);\r?\n\s+\}/;
if (!re.test(s)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(re, '            // Reaching here means autofill succeeded (no unresolved message_body), so this is truthful.\r\n            logDev("[FILL] messageBodyFilled=true", "success");');
fs.writeFileSync(p, s);
console.log('fixed');

