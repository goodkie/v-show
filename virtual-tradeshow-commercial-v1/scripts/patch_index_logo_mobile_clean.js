const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 1. 헤더 로고 교체 (이미지 단독으로 깔끔하게 36px 높이 적용)
html = html.replace(
  /<a href="\/" class="brand-logo">[\s\S]*?<\/a>/m,
  `<a href="/" class="brand-logo" title="3D na Home">
      <img src="/assets/brand/dna_logo_white.png" alt="3D na Logo" style="height: 38px; width: auto; object-fit: contain; display: block;">
    </a>`
);

// 2. Hero Section 텍스트 정돈 (불필요한 'Free' 반복 제거, 오직 'Create Your Free Photo Immersive Booth' 타이틀만 보존)
html = html.replace(
  /<div class="hero-pill">[\s\S]*?<\/div>/m,
  `<div class="hero-pill">
      <i class="fa-solid fa-bolt"></i> ONE PHOTO • PHOTO IMMERSIVE BOOTH
    </div>`
);

html = html.replace(
  /<h1 class="hero-title">[\s\S]*?<\/h1>/m,
  `<h1 class="hero-title">
      Turn One Booth Photo Into a<br>
      <span>Commercial Virtual Showroom</span>
    </h1>`
);

// Frame Subtitle & Button Text 정돈
html = html.replace(
  /<div class="frame-subtitle">[\s\S]*?<\/div>/m,
  `<div class="frame-subtitle">Instant interactive 3D preview • 3 product slots included</div>`
);

html = html.replace(
  /<button type="submit" class="btn-create-free" id="btn-submit-free">[\s\S]*?<\/button>/m,
  `<button type="submit" class="btn-create-free" id="btn-submit-free">
            <i class="fa-solid fa-wand-magic-sparkles"></i> CREATE PHOTO IMMERSIVE BOOTH
          </button>`
);

html = html.replace(
  /<div class="frame-footer">[\s\S]*?<\/div>/m,
  `<div class="frame-footer">
        <i class="fa-solid fa-shield-halved" style="color: #38bdf8;"></i> Instant generation for verified business email • 3 interactive product pins included.
      </div>`
);

// JS 내부에서 버튼 텍스트 복원 시에도 깔끔한 텍스트 유지
html = html.replace(
  /btnSubmit\.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"><\/i> CREATE MY FREE PHOTO IMMERSIVE BOOTH';/g,
  `btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> CREATE PHOTO IMMERSIVE BOOTH';`
);

// 3. Demo Frame scrolling="no" 속성 추가 및 스크롤바 방지
html = html.replace(/<iframe class="demo-frame"/g, '<iframe class="demo-frame" scrolling="no"');

// 4. 모바일 반응형 최적화 CSS 강화
const mobileEnhancementCSS = `
    /* Global Scrollbar Elimination */
    html, body {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    ::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    .demo-frame {
      border: none;
      overflow: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    /* Mobile Responsive Precision Tuning */
    @media (max-width: 768px) {
      .nav-bar {
        padding: 12px 16px;
      }
      .brand-logo img {
        height: 32px !important;
      }
      .hero-section {
        padding: 36px 14px 50px 14px;
      }
      .hero-pill {
        font-size: 10px;
        padding: 5px 12px;
        margin-bottom: 16px;
      }
      .hero-title {
        font-size: 27px;
        line-height: 1.25;
        letter-spacing: -0.8px;
        margin-bottom: 12px;
      }
      .hero-desc {
        font-size: 13.5px;
        line-height: 1.55;
        margin-bottom: 22px;
        padding: 0 4px;
      }
      .upload-cta-frame {
        padding: 20px 16px;
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      }
      .frame-title {
        font-size: 18px;
        letter-spacing: -0.4px;
      }
      .frame-subtitle {
        font-size: 12px;
        margin-bottom: 16px;
      }
      .form-group {
        margin-bottom: 12px;
      }
      .form-label {
        font-size: 12px;
        margin-bottom: 5px;
      }
      .form-input {
        height: 44px;
        font-size: 15px;
        padding: 0 12px;
        border-radius: 9px;
      }
      .drop-zone {
        padding: 18px 12px;
        border-radius: 10px;
      }
      .drop-icon {
        font-size: 26px;
        margin-bottom: 6px;
      }
      .drop-title {
        font-size: 13.5px;
      }
      .drop-hint {
        font-size: 11px;
      }
      .btn-create-free {
        height: 48px;
        font-size: 13.5px;
        border-radius: 10px;
        margin-top: 4px;
      }
      .frame-footer {
        font-size: 11px;
        margin-top: 14px;
        line-height: 1.4;
      }

      /* Clean Inline OTP Inputs on Mobile */
      .otp-digit {
        width: 40px !important;
        height: 46px !important;
        font-size: 20px !important;
        border-radius: 8px !important;
      }

      .demo-section {
        padding: 40px 12px 60px 12px;
      }
      .section-title {
        font-size: 24px;
        margin-bottom: 8px;
      }
      .section-subtitle {
        font-size: 13px;
        margin-bottom: 24px;
      }
      .demo-card {
        border-radius: 14px;
      }
      .demo-info {
        padding: 14px 12px;
      }
      .demo-title {
        font-size: 16px;
      }
    }

    @media (max-width: 480px) {
      .hero-title {
        font-size: 23px;
      }
      .upload-cta-frame {
        padding: 16px 12px;
      }
      .frame-title {
        font-size: 16.5px;
      }
      .otp-digit {
        width: 36px !important;
        height: 42px !important;
        font-size: 18px !important;
      }
    }
`;

html = html.replace('</style>', `${mobileEnhancementCSS}\n  </style>`);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ index.html logo, clean hero text, no-scrollbar, and mobile responsive tuning applied');
