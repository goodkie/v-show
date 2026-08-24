const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Capturing C07 visual validation screenshots...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Login to get session
  await page.goto('http://localhost:3000/index.html');
  await page.evaluate(() => {
    localStorage.setItem('token', 'simulated_dev_token');
  });

  // Login via API to obtain authentic token
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'developer@vshow.com', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // 2. Open Developer Lab
  await page.goto('http://localhost:3000/dev-lab.html');
  await page.evaluate((tok) => {
    localStorage.setItem('token', tok);
  }, token);
  await page.reload({ waitUntil: 'networkidle0' });

  // Switch to Tab 9 Billing Sandbox
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.tab-btn');
    for (const t of tabs) {
      if (t.textContent.includes('Billing Sandbox')) {
        t.click();
        break;
      }
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // Capture Desktop Billing Sandbox
  const desktopPath = path.join(artifactDir, '247_C07_DEV_LAB_BILLING_SANDBOX.png');
  await page.screenshot({ path: desktopPath, fullPage: true });
  console.log('Saved:', desktopPath);

  // Capture Mobile View
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 500));
  const mobilePath = path.join(artifactDir, '248_C07_MOBILE_BILLING_SANDBOX.png');
  await page.screenshot({ path: mobilePath, fullPage: true });
  console.log('Saved:', mobilePath);

  await browser.close();
  console.log('Screenshots complete.');
})();
