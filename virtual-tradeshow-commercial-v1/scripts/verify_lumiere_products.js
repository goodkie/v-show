const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Lumiere 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-cosmetic.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LUMIERE_UPDATED_PRODUCTS_TRAY.png') });
  console.log('📸 LUMIERE_UPDATED_PRODUCTS_TRAY.png 저장');

  // 첫 번째 상품 카드 클릭하여 드로어 열기
  const cards = await page.$$('#product-cards-tray .product-card');
  if (cards.length > 0) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(OUT_DIR, 'LUMIERE_UPDATED_PRODUCT_DRAWER.png') });
    console.log('📸 LUMIERE_UPDATED_PRODUCT_DRAWER.png 저장');
  }

  await browser.close();
}
run();
