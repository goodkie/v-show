const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Ensure global overflow-x is hidden and max-width 100%
html = html.replace(
  '* { box-sizing: border-box; margin: 0; padding: 0; }',
  '* { box-sizing: border-box; margin: 0; padding: 0; max-width: 100%; }\n    html, body { max-width: 100vw; overflow-x: hidden !important; }'
);

// 2. Add responsive studio rules
const mobileStudioRules = `
    @media (max-width: 768px) {
      .free-studio-section {
        padding: 14px 8px !important;
        overflow-x: hidden !important;
      }
      #viewer-container {
        height: 380px !important;
        min-height: 300px !important;
        width: 100% !important;
      }
      .studio-banner {
        padding: 12px 14px !important;
      }
      .viewer-controls-bar {
        bottom: 8px !important;
        right: 8px !important;
        padding: 3px 6px !important;
      }
      .viewer-ctrl-btn {
        width: 28px !important;
        height: 28px !important;
        font-size: 11px !important;
      }
    }
`;

html = html.replace('/* ── 3D Photo Immersive Studio Layout', mobileStudioRules + '\n    /* ── 3D Photo Immersive Studio Layout');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully injected mobile responsive CSS into index.html');