const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // 1. Desktop Hero & Clean Text Check
  const pageDesktop = await browser.newPage();
  await pageDesktop.setViewport({ width: 1440, height: 900 });
  await pageDesktop.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await pageDesktop.screenshot({ path: path.join(OUT_DIR, 'LANDING_NEW_LOGO_CLEAN_TEXT_DESKTOP.png') });
  console.log('📸 LANDING_NEW_LOGO_CLEAN_TEXT_DESKTOP.png 저장');

  // 2. Mobile Responsive Hero & Box Check (iPhone 14 Viewport 390x844)
  const pageMobile = await browser.newPage();
  await pageMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pageMobile.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await pageMobile.screenshot({ path: path.join(OUT_DIR, 'LANDING_MOBILE_RESPONSIVE_HERO.png'), fullPage: false });
  console.log('📸 LANDING_MOBILE_RESPONSIVE_HERO.png 저장');

  // 3. Showcase No-Scrollbar Check
  const pageShowcase = await browser.newPage();
  await pageShowcase.setViewport({ width: 1440, height: 900 });
  await pageShowcase.goto(`${BASE_URL}/demo-fashion.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await pageShowcase.screenshot({ path: path.join(OUT_DIR, 'SHOWCASE_NO_SCROLLBAR_CLEAN.png') });
  console.log('📸 SHOWCASE_NO_SCROLLBAR_CLEAN.png 저장');

  await browser.close();
}
run();
