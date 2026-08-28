const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app/', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const checks = {
      'togglePlayVideo 함수 존재': data.includes('function togglePlayVideo'),
      'VFR 플레이 버튼 opacity 전환': data.includes('opacity 0.25s'),
      'sandbox 속성 (데모 카드)': data.includes('allow-scripts allow-same-origin allow-forms'),
      'VFR onclick 핸들러': data.includes("togglePlayVideo('vfr-video-player'"),
      'VMA onclick 핸들러': data.includes("togglePlayVideo('vma-video-player'"),
      'VFR controls 제거됨': !data.includes('fashion.mp4\" playsinline muted loop controls'),
      'VMA controls 제거됨': !data.includes('makeup.mp4\" playsinline muted loop controls'),
      '모바일 CSS 쇼케이스': data.includes('#virtual-fitting-room,'),
      '모바일 CSS 플레이버튼': data.includes('#vfr-play-btn,'),
    };
    let pass = 0;
    Object.entries(checks).forEach(([name, ok]) => {
      console.log(ok ? 'OK' : 'FAIL', name);
      if (ok) pass++;
    });
    console.log(pass + '/' + Object.keys(checks).length + ' checks passed');
  });
});
