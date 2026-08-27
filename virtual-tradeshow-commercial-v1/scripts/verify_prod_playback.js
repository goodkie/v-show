const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function testLivePlayback() {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-gpu'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('response', res => {
    if (res.url().includes('.mp4')) {
      console.log(`[PROD VIDEO HTTP] ${res.url()} -> Status: ${res.status()}, MIME: ${res.headers()['content-type']}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Fashion Video 재생 테스트
  console.log('\n--- TESTING FASHION VIDEO ---');
  const fashionPlay = await page.evaluate(async () => {
    const v = document.getElementById('vfr-video-player');
    if (!v) return { error: 'vfr not found' };
    
    v.muted = true;
    const t0 = v.currentTime;
    await v.play();
    await new Promise(r => setTimeout(r, 2500));
    const t1 = v.currentTime;

    return {
      src: v.currentSrc,
      readyState: v.readyState,
      paused: v.paused,
      duration: v.duration,
      t0,
      t1,
      advanced: (t1 > t0 + 1.5)
    };
  });
  console.log('Fashion Playback Result:', JSON.stringify(fashionPlay, null, 2));

  // 스크롤 및 캡처
  await page.evaluate(() => document.getElementById('virtual-fitting-room').scrollIntoView());
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, 'PROD_FASHION_VIDEO_PLAYING.png') });

  // 2. Makeup Video 재생 테스트
  console.log('\n--- TESTING MAKEUP VIDEO ---');
  const makeupPlay = await page.evaluate(async () => {
    const v = document.getElementById('vma-video-player');
    if (!v) return { error: 'vma not found' };
    
    v.muted = true;
    const t0 = v.currentTime;
    await v.play();
    await new Promise(r => setTimeout(r, 2500));
    const t1 = v.currentTime;

    return {
      src: v.currentSrc,
      readyState: v.readyState,
      paused: v.paused,
      duration: v.duration,
      t0,
      t1,
      advanced: (t1 > t0 + 1.5)
    };
  });
  console.log('Makeup Playback Result:', JSON.stringify(makeupPlay, null, 2));

  // 스크롤 및 캡처
  await page.evaluate(() => document.getElementById('virtual-makeup-artist').scrollIntoView());
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, 'PROD_MAKEUP_VIDEO_PLAYING.png') });

  await browser.close();
  console.log('\n✅ ALL LIVE PLAYBACK VERIFICATIONS COMPLETE');
}

testLivePlayback().catch(console.error);
