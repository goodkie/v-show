const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const appBuildClient = path.join(baseDir, 'app_build', 'client');
const cleanDeployClient = path.join(baseDir, '_clean_deploy', 'client');
const railwayDeployClient = path.join(baseDir, '_railway_deploy', 'client');

// 1. demo-*.html 파일들에 <base target="_top"> 및 전역 외부 링크 탈출 핸들러 주입
const demoFiles = [
  'demo-matterport.html',
  'demo-fashion.html',
  'demo-cosmetic.html',
  'demo-furniture.html'
];

const externalNavScript = `
<script>
// 카드 내부 링크/버튼이 iframe 안에서 열리지 않고 카드 밖(상위 창)에서 작동하도록 보장
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a').forEach(a => {
    if (!a.getAttribute('target')) {
      a.setAttribute('target', '_top');
    }
  });
});
</script>
`;

demoFiles.forEach(df => {
  const p = path.join(appBuildClient, df);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    // base target을 _top으로 설정 (부모 창에서 열림)
    if (content.includes('<base target=')) {
      content = content.replace(/<base target="[^"]*">/, '<base target="_top">');
    } else {
      content = content.replace('<head>', '<head><base target="_top">');
    }
    if (!content.includes('카드 내부 링크/버튼이 iframe 안에서 열리지 않고')) {
      content = content.replace('</body>', `${externalNavScript}\n</body>`);
    }
    fs.writeFileSync(p, content, 'utf8');
  }
});
console.log('✅ Updated all demo-*.html files with base target="_top" and global link handler');

// 2. index.html의 iframe sandbox 속성 및 비디오 플레이어 강화 & 모바일 CSS 완벽 최적화
let indexHtml = fs.readFileSync(path.join(appBuildClient, 'index.html'), 'utf8');

// (A) iframe sandbox 속성: 외부 링크 열기 및 상위 탐색 완전 허용
indexHtml = indexHtml.replace(
  /<iframe class="demo-frame" scrolling="no" src="([^"]+)" title="([^"]+)"[^>]*>/g,
  '<iframe class="demo-frame" scrolling="no" src="$1" title="$2" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-top-navigation-by-user-activation" loading="lazy"></iframe>'
);

// (B) 비디오 이벤트 리스너 및 togglePlayVideo 함수 강화: 비디오 재생 시작 즉시 플레이 아이콘 사라짐 보장
const enhancedVideoScript = `
// ── Video Play Toggle & Robust State Binding ─────────────────────────
function togglePlayVideo(videoId, btnId) {
  const video = document.getElementById(videoId);
  const btn = document.getElementById(btnId);
  if (!video) return;
  if (video.paused) {
    video.play().catch(err => console.log('Playback error:', err));
  } else {
    video.pause();
  }
}

// 모든 비디오 상태 변경 이벤트(play, playing, pause, ended)에 대한 UI 자동 동기화
function initVideoPlayerSync() {
  const players = [
    { videoId: 'vfr-video-player', btnId: 'vfr-play-btn' },
    { videoId: 'vma-video-player', btnId: 'vma-play-btn' }
  ];

  players.forEach(({ videoId, btnId }) => {
    const video = document.getElementById(videoId);
    const btn = document.getElementById(btnId);
    if (!video || !btn) return;

    const hideBtn = () => {
      btn.style.opacity = '0';
      btn.style.transform = 'scale(0.85)';
      btn.style.pointerEvents = 'none';
    };

    const showBtn = () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
      btn.style.pointerEvents = 'none';
    };

    video.addEventListener('play', hideBtn);
    video.addEventListener('playing', hideBtn);
    video.addEventListener('pause', showBtn);
    video.addEventListener('ended', showBtn);

    // 초기 상태 체크
    if (!video.paused) {
      hideBtn();
    } else {
      showBtn();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVideoPlayerSync);
} else {
  initVideoPlayerSync();
}
`;

// 기존 togglePlayVideo 스크립트 블록 교체
if (indexHtml.includes('// ── Video Play Toggle (쇼케이스 섹션) ─────────────────────────────────')) {
  indexHtml = indexHtml.replace(/\/\/ ── Video Play Toggle \(쇼케이스 섹션\)[\s\S]*?<\/script>/, `${enhancedVideoScript}\n</script>`);
} else {
  indexHtml = indexHtml.replace('</script>', `${enhancedVideoScript}\n</script>`);
}

fs.writeFileSync(path.join(appBuildClient, 'index.html'), indexHtml, 'utf8');
console.log('✅ Updated index.html video synchronization and iframe sandboxes');

// 3. _clean_deploy 및 _railway_deploy 에 변경 파일 복사
[cleanDeployClient, railwayDeployClient].forEach(targetDir => {
  if (fs.existsSync(targetDir)) {
    fs.copyFileSync(path.join(appBuildClient, 'index.html'), path.join(targetDir, 'index.html'));
    demoFiles.forEach(df => {
      fs.copyFileSync(path.join(appBuildClient, df), path.join(targetDir, df));
    });
  }
});
console.log('✅ All files synced across all deployment folders!');
