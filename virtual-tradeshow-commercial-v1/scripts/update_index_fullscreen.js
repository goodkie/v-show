const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 1. toggleIframeFullscreen 스크립트 함수 추가 (닫는 </script> 직전에)
const funcScript = `
function toggleIframeFullscreen(iframeId, fallbackUrl) {
  const frame = document.getElementById(iframeId);
  if (frame) {
    if (frame.requestFullscreen) {
      frame.requestFullscreen();
    } else if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    } else if (frame.msRequestFullscreen) {
      frame.msRequestFullscreen();
    } else {
      window.open(fallbackUrl, '_blank');
    }
  } else {
    window.open(fallbackUrl, '_blank');
  }
}
`;

if (!html.includes('function toggleIframeFullscreen')) {
  html = html.replace('</script>\n</body>', funcScript + '\n</script>\n</body>');
  if (!html.includes('function toggleIframeFullscreen')) {
    const lastScriptClose = html.lastIndexOf('</script>');
    html = html.substring(0, lastScriptClose) + funcScript + '\n' + html.substring(lastScriptClose);
  }
}

// 2. DN'a Robotic 카드 수정
const targetCard = `<div class="demo-card">
        <iframe class="demo-frame" src="/demo-matterport.html" title="Photo Immersive Booth Demo"></iframe>
        <div class="demo-info">
          <div class="section-tag" style="font-size: 10px; color: #38bdf8;">INDUSTRIAL TECH</div>
          <div class="demo-title">DN'A ROBOTIC — SMART BOOTH</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 0;">Next-gen industrial robotics with 360° multi-node floor roaming, real-time ROS telemetry, and 3D equipment inspection.</p>
        </div>
      </div>`;

const newCard = `<div class="demo-card" style="position: relative;">
        <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000;">
          <iframe id="frame-dna-robotic" class="demo-frame" src="/demo-matterport.html" title="Photo Immersive Booth Demo" style="width: 100%; height: 100%; border: none;" allow="fullscreen"></iframe>
          <button onclick="toggleIframeFullscreen('frame-dna-robotic', '/demo-matterport.html')" title="전체 화면으로 전환" style="position: absolute; top: 14px; right: 14px; background: rgba(5, 11, 22, 0.88); border: 1px solid #38bdf8; color: #38bdf8; padding: 7px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(8px); z-index: 10; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <i class="fa-solid fa-expand"></i> 전체 화면으로 전환
          </button>
        </div>
        <div class="demo-info" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="flex: 1; min-width: 260px;">
            <div class="section-tag" style="font-size: 10px; color: #38bdf8;">INDUSTRIAL TECH</div>
            <div class="demo-title">DN'A ROBOTIC — SMART BOOTH</div>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 0;">Next-gen industrial robotics with 360° multi-node floor roaming, real-time ROS telemetry, and 3D equipment inspection.</p>
          </div>
          <a href="/demo-matterport.html" target="_blank" style="padding: 8px 16px; font-size: 12px; font-weight: 700; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: rgba(56, 189, 248, 0.08); transition: all 0.2s;">
            <i class="fa-solid fa-up-right-from-square"></i> 전체 화면 새 창 열기 →
          </a>
        </div>
      </div>`;

if (html.includes(targetCard)) {
  html = html.replace(targetCard, newCard);
  console.log('✅ DN\'a Robotic card updated with fullscreen transition button in index.html');
} else {
  console.log('⚠️ Exact targetCard not matched, searching with regex...');
  html = html.replace(/<div class="demo-card">\s*<iframe class="demo-frame" src="\/demo-matterport\.html"[\s\S]*?<\/div>\s*<\/div>/m, newCard);
  console.log('✅ Regex replacement executed');
}

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('Saved index.html');
