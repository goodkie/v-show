const fs = require('fs');
const path = require('path');

const clientDir = 'app_build/client';
const files = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));

const logoBuffer = fs.readFileSync('app_build/client/assets/brand/dna_logo_white.png');
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

files.forEach(f => {
  const filePath = path.join(clientDir, f);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. 헤더 로고 + ³DNa 텍스트 추가 (index.html 및 demo 파일들)
  if (f === 'index.html') {
    content = content.replace(
      /<a href="\/" class="brand-logo"[\s\S]*?<\/a>/m,
      `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; text-decoration: none;">
      <img src="${logoBase64}" alt="³DNa" style="height: 38px; width: auto; object-fit: contain; display: block;">
      <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px; color: #fff; margin-left: 10px; font-family: system-ui, -apple-system, sans-serif;">³DNa</span>
    </a>`
    );
  } else if (f.startsWith('demo-') || f === 'pricing.html' || f === 'start.html' || f === 'photo-viewer.html') {
    content = content.replace(
      /<a href="\/" class="brand-logo"[\s\S]*?<\/a>/m,
      `<a href="/" class="brand-logo" title="³DNa Home" style="display: flex; align-items: center; text-decoration: none;">
      <img src="${logoBase64}" alt="³DNa" style="height: 32px; width: auto; object-fit: contain; display: inline-block; vertical-align: middle;">
      <span style="font-weight: 900; font-size: 18px; letter-spacing: -0.5px; color: #fff; margin-left: 8px; vertical-align: middle; font-family: system-ui, -apple-system, sans-serif;">³DNa</span>
    </a>`
    );
  }

  // 2. 텍스트 내의 dn'a / DN'a / dn’a / DN’a 치환
  // Hero 설명문, 타이틀, 풋터 등
  content = content.replace(/dn[’']a generates/g, '³DNa generates');
  content = content.replace(/dn[’']a platform/gi, '³DNa platform');
  content = content.replace(/dn[’']a 6-digit/gi, '³DNa 6-digit');
  content = content.replace(/dn[’']a/g, '³DNa');
  content = content.replace(/DN[’']A/g, '³DNa');
  content = content.replace(/DN[’']a/g, '³DNa');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ ${f} updated with ³DNa brand`);
});
