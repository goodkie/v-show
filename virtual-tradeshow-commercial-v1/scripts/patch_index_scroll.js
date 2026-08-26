const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// index.html에서 body/html의 overflow: hidden 제거 -> overflow-x: hidden; overflow-y: auto; 로 정상 스크롤 허용
html = html.replace(
  /html, body \{\s*scrollbar-width: none;\s*-ms-overflow-style: none;\s*overflow: hidden;\s*\}/g,
  `html, body {
      scrollbar-width: none;
      -ms-overflow-style: none;
      overflow-x: hidden;
      overflow-y: auto;
      min-height: 100vh;
    }`
);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ index.html vertical scrollability restored while keeping scrollbar UI hidden');
