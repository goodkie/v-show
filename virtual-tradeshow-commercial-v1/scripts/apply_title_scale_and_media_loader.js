const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const uploadedLogoPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787886254111.png';
const logoBase64 = fs.readFileSync(uploadedLogoPath).toString('base64');
const dataUri = 'data:image/png;base64,' + logoBase64;

// 1. index.html 업데이트
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// (A) 헤더 [³DNa] 타이틀 글자 크기 1/3 확대 (15px -> 20px)
const brandLogoLanding = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" style="height: 25px; width: auto; object-fit: contain; display: block; border-radius: 3px;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
    </a>`;

indexHtml = indexHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, brandLogoLanding);

// (B) 푸터 로고 타이틀도 20px로 조화롭게 설정
const footerBrandTitle = `<div style="display: flex; align-items: center; gap: 8px;">
        <img src="${dataUri}" alt="³DNa Logo" style="height: 22px; width: auto; object-fit: contain; display: block;">
        <span style="font-size: 19px; font-weight: 800; letter-spacing: -0.4px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      </div>`;
indexHtml = indexHtml.replace(/<div style="display: flex; align-items: center; gap: 8px;">[\s\S]*?<\/div>/, footerBrandTitle);

// (C) 미디어 로딩 스켈레톤 & 펄스 애니메이션 CSS 추가
const mediaLoadingStyles = `
    /* Media Loading Shimmer & Spinner Animation */
    @keyframes mediaShimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes mediaPulseGlow {
      0%, 100% { opacity: 0.6; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.6)); }
    }
    @keyframes mediaSpin {
      to { transform: rotate(360deg); }
    }
    .media-loader-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, #0b1528 0%, #030712 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      overflow: hidden;
    }
    .media-loader-overlay::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.08) 50%, transparent 100%);
      animation: mediaShimmer 2s infinite;
    }
    .media-loader-spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: mediaSpin 0.9s linear infinite;
      margin-bottom: 12px;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
    }
    .media-loader-text {
      font-size: 11.5px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      animation: mediaPulseGlow 1.8s infinite ease-in-out;
    }
`;

if (!indexHtml.includes('media-loader-overlay')) {
  indexHtml = indexHtml.replace('</style>', `${mediaLoadingStyles}\n  </style>`);
}

// (D) 비디오 컨테이너에 미디어 로더 오버레이 추가
const vfrVideoContainerTarget = `<div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;" onclick="togglePlayVideo('vfr-video-player', 'vfr-play-btn')">`;
const vfrVideoContainerReplacement = `<div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;" onclick="togglePlayVideo('vfr-video-player', 'vfr-play-btn')">
            <div id="vfr-loader" class="media-loader-overlay">
              <div class="media-loader-spinner"></div>
              <div class="media-loader-text">³DNa IMMERSIVE ENGINE READY</div>
            </div>`;

if (!indexHtml.includes('id="vfr-loader"')) {
  indexHtml = indexHtml.replace(vfrVideoContainerTarget, vfrVideoContainerReplacement);
}

const vmaVideoContainerTarget = `<div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;" onclick="togglePlayVideo('vma-video-player', 'vma-play-btn')">`;
const vmaVideoContainerReplacement = `<div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;" onclick="togglePlayVideo('vma-video-player', 'vma-play-btn')">
            <div id="vma-loader" class="media-loader-overlay">
              <div class="media-loader-spinner"></div>
              <div class="media-loader-text">³DNa BEAUTY STUDIO READY</div>
            </div>`;

if (!indexHtml.includes('id="vma-loader"')) {
  indexHtml = indexHtml.replace(vmaVideoContainerTarget, vmaVideoContainerReplacement);
}

// (E) JS 로직에 비디오 & iframe 로드 완료 시 로더 페이드아웃 추가
const loaderJs = `
    // Hide media loaders once media is ready
    window.addEventListener('DOMContentLoaded', () => {
      ['vfr-video-player', 'vma-video-player'].forEach(id => {
        const vid = document.getElementById(id);
        const ldrId = id.startsWith('vfr') ? 'vfr-loader' : 'vma-loader';
        const ldr = document.getElementById(ldrId);
        if (vid && ldr) {
          const hideLoader = () => {
            ldr.style.opacity = '0';
            setTimeout(() => { ldr.style.display = 'none'; }, 500);
          };
          if (vid.readyState >= 2) hideLoader();
          else vid.addEventListener('canplay', hideLoader, { once: true });
          vid.addEventListener('play', hideLoader, { once: true });
          setTimeout(hideLoader, 2500);
        }
      });
    });
`;

if (!indexHtml.includes('Hide media loaders once media is ready')) {
  indexHtml = indexHtml.replace('window.openPartnershipModal = function() {', `${loaderJs}\n    window.openPartnershipModal = function() {`);
}

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('✅ Updated index.html with 20px title and high-performance media loading animation');

// 2. builder.html 업데이트 (20px 로고 타이틀)
const builderHtmlPath = path.join(baseDir, 'app_build', 'client', 'builder.html');
let builderHtml = fs.readFileSync(builderHtmlPath, 'utf8');

const brandLogoBuilder = `<a href="/" class="brand-logo-wrap" title="³DNa Home" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" class="brand-logo-img" style="height: 25px; width: auto; object-fit: contain; display: block; border-radius: 3px;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      <span class="badge-wizard" style="margin-left: 6px;">Smart Booth Wizard</span>
    </a>`;

builderHtml = builderHtml.replace(/<a href="\/" class="brand-logo-wrap"[\s\S]*?<\/a>/, brandLogoBuilder);
fs.writeFileSync(builderHtmlPath, builderHtml, 'utf8');
console.log('✅ Updated builder.html: 20px title');
