const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 1. Fashion Video 태그 직접 src 지정 및 컨트롤러 강화
html = html.replace(
  /<video id="vfr-video-player"[\s\S]*?<\/video>/m,
  `<video id="vfr-video-player" src="/assets/demo/virtual-fitting-room/fashion.mp4" playsinline muted loop controls preload="metadata" poster="/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"></video>`
);

// 2. Makeup Video 태그 직접 src 지정 및 컨트롤러 강화
html = html.replace(
  /<video id="vma-video-player"[\s\S]*?<\/video>/m,
  `<video id="vma-video-player" src="/assets/demo/virtual-makeup-artist/makeup.mp4" playsinline muted loop controls preload="metadata" poster="/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"></video>`
);

// 3. 비디오 클릭 및 재생 토글 로직 완전 보강
const videoPlayerScript = `
<script>
// =====================================================================
// ³DNa Ultra-Reliable Showcase Video Player Engine
// =====================================================================
function togglePlayVideo(videoId, playBtnId) {
  const vid = document.getElementById(videoId);
  const btn = document.getElementById(playBtnId);
  if (!vid) return;

  if (vid.paused) {
    // 음소거 해제 없이 또는 음소거로 재생 시도
    vid.play().then(() => {
      if (btn) btn.style.display = 'none';
    }).catch(err => {
      console.warn('Playback error, retrying muted:', err);
      vid.muted = true;
      vid.play().then(() => {
        if (btn) btn.style.display = 'none';
      }).catch(e => console.error('Final play failure:', e));
    });
  } else {
    vid.pause();
    if (btn) btn.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ['vfr-video-player', 'vma-video-player'].forEach(id => {
    const v = document.getElementById(id);
    const btnId = id === 'vfr-video-player' ? 'vfr-play-btn' : 'vma-play-btn';
    const btn = document.getElementById(btnId);

    if (v) {
      // 비디오 자체 클릭 시 재생/일시정지 토글
      v.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlayVideo(id, btnId);
      });

      // 미디어 이벤트 동기화
      v.addEventListener('play', () => {
        if (btn) btn.style.display = 'none';
      });
      v.addEventListener('pause', () => {
        if (btn) btn.style.display = 'flex';
      });
      v.addEventListener('ended', () => {
        if (btn) btn.style.display = 'flex';
      });
    }
  });
});
</script>
`;

if (html.includes('togglePlayVideo')) {
  html = html.replace(/function togglePlayVideo[\s\S]*?<\/script>/m, `${videoPlayerScript.replace('<script>', '').replace('</script>', '')}</script>`);
} else {
  html = html.replace('</body>', `${videoPlayerScript}\n</body>`);
}

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ index.html updated with direct src and robust video player engine');
