const fs = require('fs');
const mailerPath = 'app_build/server/mailer.js';
let code = fs.readFileSync(mailerPath, 'utf8');

// 이메일 카피 최적화
code = code.replace(
  /const subject = .*/g,
  `const subject = \`Confirm your email to create your ³DNa Photo Immersive Booth\`;`
);

// 본문 텍스트 내 ³DNa Photo Immersive Booth 통일
code = code.replace(/Virtual Showroom/g, 'Photo Immersive Booth');
code = code.replace(/3D Digital Twin/g, 'Photo Immersive Booth');

fs.writeFileSync(mailerPath, code, 'utf8');
console.log('✅ mailer.js copy updated');
