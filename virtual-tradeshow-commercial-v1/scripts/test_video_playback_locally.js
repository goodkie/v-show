const http = require('http');
const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');

// 로컬 테스트 서버 구동
const app = require('../app_build/server/index.js'); // Express app

const PORT = 5599;
const server = app.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);

  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-gpu'] 
  });
  const page = await browser.newPage();

  let videoMimePassed = false;
  let videoStatus206 = false;

  page.on('response', res => {
    if (res.url().includes('.mp4')) {
      const ct = res.headers()['content-type'];
      const st = res.status();
      console.log(`[VIDEO HTTP] ${res.url()} -> Status: ${st}, Content-Type: ${ct}`);
      if (ct === 'video/mp4') videoMimePassed = true;
      if (st === 200 || st === 206) videoStatus206 = true;
    }
  });

  await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // 비디오 재생 테스트
  const results = await page.evaluate(async () => {
    const vfr = document.getElementById('vfr-video-player');
    const vma = document.getElementById('vma-video-player');

    let vfrPlayed = false;
    let vmaPlayed = false;

    try {
      await vfr.play();
      vfrPlayed = true;
    } catch(e) {
      console.error('VFR play err:', e.message);
    }

    try {
      await vma.play();
      vmaPlayed = true;
    } catch(e) {
      console.error('VMA play err:', e.message);
    }

    return {
      vfrReadyState: vfr ? vfr.readyState : -1,
      vfrSrc: vfr ? vfr.src : '',
      vfrPaused: vfr ? vfr.paused : true,
      vfrDuration: vfr ? vfr.duration : 0,
      vfrPlayed,
      vmaReadyState: vma ? vma.readyState : -1,
      vmaSrc: vma ? vma.src : '',
      vmaPaused: vma ? vma.paused : true,
      vmaDuration: vma ? vma.duration : 0,
      vmaPlayed
    };
  });

  console.log('Playback test results:', JSON.stringify(results, null, 2));

  await browser.close();
  server.close();
  console.log('✅ Local test complete!');
  process.exit(0);
});
