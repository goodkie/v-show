const fs = require('fs');
const path = require('path');

const src = path.resolve('test/run_edge_rc3_53_privacy_companion_and_mixed_matrix.js');
const dst = path.resolve('test/run_edge_rc3_54_privacy_companion_and_mixed_matrix.js');

let content = fs.readFileSync(src, 'utf8');

// Replace 53 with 54
content = content.replace(/rc3_53/g, 'rc3_54');
content = content.replace(/RC3\.53/g, 'RC3.54');
content = content.replace(/R6\.9G\.10\.3\.7\.1\.4\.69/g, 'R6.9G.10.3.7.1.4.70');
content = content.replace(/v6\.9g\.10\.3-rc3\.53\.7\.1\.4\.69/g, 'v6.9g.10.3-rc3.54.7.1.4.70');

fs.writeFileSync(dst, content, 'utf8');
console.log('✅ Created test/run_edge_rc3_54_privacy_companion_and_mixed_matrix.js');
