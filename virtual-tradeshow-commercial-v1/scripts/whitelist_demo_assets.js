const fs = require('fs');
const path = require('path');

const rootGitignorePath = 'E:/vivpr/ai/v-show/.gitignore';
let gitignore = fs.readFileSync(rootGitignorePath, 'utf8');

// *.png, *.JPG 등을 데모 에셋에 대해 확실하게 예외 처리
const whitelist = `
# Explicit Whitelist for Demo Web Assets
!*.jpg
!*.png
!*.jpeg
!*.webp
!*.mp4
!**/client/assets/**
!**/assets/**
`;

fs.writeFileSync(rootGitignorePath, gitignore + '\n' + whitelist.trim(), 'utf8');

// _railway_deploy/.railwayignore 도 확실하게 설정
const railwayIgnore = `
node_modules/
.git/
*.log
*.ply
*.spz
`;
fs.writeFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/.railwayignore', railwayIgnore.trim(), 'utf8');

console.log('✅ Updated .gitignore and .railwayignore with full demo assets whitelist!');
