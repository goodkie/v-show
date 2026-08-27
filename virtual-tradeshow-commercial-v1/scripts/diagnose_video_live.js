const puppeteer = require('puppeteer');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';

async function diagnoseVideo() {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-gpu'] 
  });
  const page = await browser.newPage();

  // 콘솔 에러 및 네트워크 로그 캡처
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.error('REQUEST FAILED:', req.url(), req.failure() ? req.failure().errorText : ''));
  page.on('response', res => {
    if (res.url().includes('.mp4')) {
      console.log('VIDEO RESPONSE:', res.url(), 'Status:', res.status(), 'Content-Type:', res.headers()['content-type'], 'Content-Length:', res.headers()['content-length']);
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Fashion Video 진단
  const fashionDiag = await page.evaluate(async () => {
    const v = document.getElementById('vfr-video-player');
    if (!v) return { error: 'vfr-video-player not found in DOM' };
    
    let playResult = 'not_attempted';
    try {
      await v.play();
      playResult = 'play_success';
    } catch (e) {
      playResult = 'play_error: ' + e.message;
    }

    return {
      src: v.currentSrc || v.src,
      readyState: v.readyState,
      paused: v.paused,
      currentTime: v.currentTime,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      playResult
    };
  });

  console.log('\n--- FASHION VIDEO DIAGNOSTICS ---');
  console.log(JSON.stringify(fashionDiag, null, 2));

  // 2. Makeup Video 진단
  const makeupDiag = await page.evaluate(async () => {
    const v = document.getElementById('vma-video-player');
    if (!v) return { error: 'vma-video-player not found in DOM' };
    
    let playResult = 'not_attempted';
    try {
      await v.play();
      playResult = 'play_success';
    } catch (e) {
      playResult = 'play_error: ' + e.message;
    }

    return {
      src: v.currentSrc || v.src,
      readyState: v.readyState,
      paused: v.paused,
      currentTime: v.currentTime,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      playResult
    };
  });

  console.log('\n--- MAKEUP VIDEO DIAGNOSTICS ---');
  console.log(JSON.stringify(makeupDiag, null, 2));

  await browser.close();
}

diagnoseVideo().catch(console.error);
