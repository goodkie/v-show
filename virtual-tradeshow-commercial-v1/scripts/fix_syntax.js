const fs = require('fs');
let html = fs.readFileSync('app_build/client/demo-matterport.html', 'utf8');

// 1. openProductDrawer 내 고아 '  }\n' 제거
html = html.replace(/  if \(p\.image\) \{\r?\n    imgEl\.src = p\.image;\r?\n  \}\r?\n\r?\n  \}/m, "  if (p.image) {\n    imgEl.src = p.image;\n  }");

fs.writeFileSync('app_build/client/demo-matterport.html', html, 'utf8');

// 검증
const scriptMatches = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi);
let allOk = true;
scriptMatches.forEach((tag, idx) => {
  const content = tag.replace(/<script[\s\S]*?>/i, '').replace(/<\/script>/i, '');
  if (!content.trim()) return;
  try {
    new Function(content);
    console.log(`✅ Script ${idx}: Syntax PERFECT`);
  } catch (err) {
    allOk = false;
    console.log(`❌ Script ${idx} Syntax Error:`, err.message);
  }
});
if (allOk) {
  console.log('🎉 demo-matterport.html JavaScript SYNTAX 100% VALID!');
}
