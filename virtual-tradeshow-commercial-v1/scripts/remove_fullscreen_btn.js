const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// DN'a Robotic 카드를 표준 카드 구조로 복원 (전체화면 버튼 및 새창 버튼 제거)
const oldCardRegex = /<div class="demo-card"[^>]*>\s*<div style="position: relative; width: 100%; aspect-ratio: 16\/9; background: #000;">\s*<iframe id="frame-dna-robotic"[\s\S]*?<\/div>\s*<\/div>/m;

const standardCard = `<div class="demo-card">
        <iframe class="demo-frame" src="/demo-matterport.html" title="Photo Immersive Booth Demo"></iframe>
        <div class="demo-info">
          <div class="section-tag" style="font-size: 10px; color: #38bdf8;">INDUSTRIAL TECH</div>
          <div class="demo-title">DN'A ROBOTIC — SMART BOOTH</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 0;">Next-gen industrial robotics with 360° multi-node floor roaming, real-time ROS telemetry, and 3D equipment inspection.</p>
        </div>
      </div>`;

if (oldCardRegex.test(html)) {
  html = html.replace(oldCardRegex, standardCard);
  console.log('✅ DN\'a Robotic card restored to clean standard layout (fullscreen buttons removed)');
} else {
  console.log('⚠️ Could not match oldCardRegex directly, checking content...');
  // 대체 패턴
  html = html.replace(/<div class="demo-card" style="position: relative;">[\s\S]*?INDUSTRIAL TECH[\s\S]*?<\/div>\s*<\/div>/m, standardCard);
  console.log('✅ Alternative replacement executed');
}

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('Saved index.html');
