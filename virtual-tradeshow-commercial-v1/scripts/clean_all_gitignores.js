const fs = require('fs');

// 1. Git 루트의 .gitignore 완전 정리 (jpg, png, mp4 등 웹 미디어는 절대 무시하지 않음)
const cleanGitignore = `
node_modules/
.DS_Store
__pycache__/
*.log
npm-debug.log
*.ply
*.spz
*.splat
*.ksplat
*.zip
*.psd
V_SHOW_RESTORE_POINT*
phase6_bundle_for_antigravity/
v-show-reconstruction-work/
`;

fs.writeFileSync('E:/vivpr/ai/v-show/.gitignore', cleanGitignore.trim(), 'utf8');
fs.writeFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/.gitignore', cleanGitignore.trim(), 'utf8');
fs.writeFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/.gitignore', cleanGitignore.trim(), 'utf8');
fs.writeFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/.gitignore', cleanGitignore.trim(), 'utf8');

console.log('✅ Cleaned all .gitignore files across the entire workspace!');
