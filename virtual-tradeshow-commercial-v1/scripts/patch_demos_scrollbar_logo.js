const fs = require('fs');

const demoFiles = [
  'app_build/client/demo-fashion.html',
  'app_build/client/demo-cosmetic.html',
  'app_build/client/demo-furniture.html',
  'app_build/client/demo-matterport.html'
];

demoFiles.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');

  // 1. 스크롤바 완전 제거 CSS 주입
  if (!html.includes('scrollbar-width: none;')) {
    html = html.replace('</style>', `
    /* Global Scrollbar Elimination */
    html, body {
      scrollbar-width: none;
      -ms-overflow-style: none;
      overflow: hidden;
    }
    ::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    </style>`);
  }

  // 2. 헤더 로고 높이 및 여백 최적화
  html = html.replace(/<img src="\/assets\/brand\/dna_logo_white\.png" alt="dn'a"[^>]*>/g, '<img src="/assets/brand/dna_logo_white.png" alt="dn\'a" style="height: 32px; width: auto; object-fit: contain; display: inline-block; vertical-align: middle;">');

  fs.writeFileSync(f, html, 'utf8');
  console.log(`✅ ${f} scrollbar hidden & logo style optimized`);
});
