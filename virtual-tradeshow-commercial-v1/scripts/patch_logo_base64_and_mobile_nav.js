const fs = require('fs');

// 1. 로고 이미지를 Base64 Data URI로 읽기 (HTTP 캐시나 경로 문제 없이 100% 즉각 렌더링)
const logoBuffer = fs.readFileSync('app_build/client/assets/brand/dna_logo_white.png');
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

// 2. index.html 수정
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 네비게이션 바: 모바일 최적화 (모바일에서 nav-links 숨김 및 로고 + Sign In 배치)
html = html.replace(
  /<nav class="nav-bar">[\s\S]*?<\/nav>/m,
  `<nav class="nav-bar">
    <a href="/" class="brand-logo" title="3D na">
      <img src="${logoBase64}" alt="3D na" style="height: 38px; width: auto; object-fit: contain; display: block;">
    </a>
    <div class="nav-links">
      <a href="#how-it-works" class="nav-link">How It Works</a>
      <a href="#examples" class="nav-link">Showrooms</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <button class="btn-nav-signin" onclick="openSignInModal()">Sign In</button>
    </div>
  </nav>`
);

// 모바일 CSS 보강 (nav-links 모바일 처리 및 패딩 조정)
const navMobileCSS = `
    @media (max-width: 768px) {
      .nav-bar {
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .nav-links a.nav-link {
        display: none;
      }
      .btn-nav-signin {
        padding: 7px 14px;
        font-size: 13px;
      }
      .brand-logo img {
        height: 34px !important;
      }
    }
`;

html = html.replace('</style>', `${navMobileCSS}\n  </style>`);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ index.html nav-bar and logo base64 embedded successfully');

// 3. 쇼룸 데모 파일들에도 Base64 로고 적용
const demoFiles = [
  'app_build/client/demo-fashion.html',
  'app_build/client/demo-cosmetic.html',
  'app_build/client/demo-furniture.html',
  'app_build/client/demo-matterport.html'
];

demoFiles.forEach(f => {
  let demoHtml = fs.readFileSync(f, 'utf8');
  demoHtml = demoHtml.replace(/<img src="\/assets\/brand\/dna_logo_white\.png"[^>]*>/g, `<img src="${logoBase64}" alt="3D na" style="height: 34px; width: auto; object-fit: contain; display: inline-block; vertical-align: middle;">`);
  fs.writeFileSync(f, demoHtml, 'utf8');
});
console.log('✅ Demo showcases updated with crisp base64 logo');
