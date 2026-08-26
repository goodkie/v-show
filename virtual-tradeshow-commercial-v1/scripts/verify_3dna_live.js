const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // 1. Desktop Landing with 3DNa Brand
  const pageDesktop = await browser.newPage();
  await pageDesktop.setViewport({ width: 1440, height: 900 });
  await pageDesktop.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await pageDesktop.screenshot({ path: path.join(OUT_DIR, 'LANDING_3DNA_BRAND_DESKTOP.png') });
  console.log('📸 LANDING_3DNA_BRAND_DESKTOP.png 저장');

  // 2. Mobile Landing with 3DNa Brand
  const pageMobile = await browser.newPage();
  await pageMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pageMobile.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await pageMobile.screenshot({ path: path.join(OUT_DIR, 'LANDING_3DNA_BRAND_MOBILE.png') });
  console.log('📸 LANDING_3DNA_BRAND_MOBILE.png 저장');

  await browser.close();
}
run();
