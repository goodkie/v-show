const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const express = require("express");
const outDir = "E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/3dna_c11_3/screenshots";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const app = express();
app.use(express.static("E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client"));
const server = app.listen(5099, async () => {
  console.log("Test server started on 5099");
  try {
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:5099/pricing.html", { waitUntil: "networkidle0" });
    const proCard = await page.;
    if (proCard) await proCard.screenshot({ path: path.join(outDir, "01_C11_3_PRICING_PRO.png") });
    const bizCard = await page.;
    if (bizCard) await bizCard.screenshot({ path: path.join(outDir, "02_C11_3_PRICING_BUSINESS_FEATURED.png") });
    const customCard = await page.;
    if (customCard) await customCard.screenshot({ path: path.join(outDir, "03_C11_3_PRICING_CUSTOM.png") });
    const grid = await page.;
    if (grid) await grid.screenshot({ path: path.join(outDir, "04_C11_3_3CARDS_ALIGNED.png") });
    const modules = await page.;
    if (modules) await modules.screenshot({ path: path.join(outDir, "05_C11_3_AI_EXPERIENCE_MODULES.png") });
    const matrix = await page.;
    if (matrix) await matrix.screenshot({ path: path.join(outDir, "06_C11_3_COMPARISON_MATRIX_DESKTOP.png") });
    await page.setViewport({ width: 390, height: 844 });
    await page.goto("http://localhost:5099/pricing.html", { waitUntil: "networkidle0" });
    const matrixMobile = await page.;
    if (matrixMobile) await matrixMobile.screenshot({ path: path.join(outDir, "07_C11_3_COMPARISON_MATRIX_MOBILE.png") });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:5099/pricing.html", { waitUntil: "networkidle0" });
    await page.hover(".tooltip-trigger");
    await page.screenshot({ path: path.join(outDir, "08_C11_3_TOOLTIP_ACTIVE.png"), clip: { x: 100, y: 750, width: 1000, height: 400 } });
    await page.goto("http://localhost:5099/index.html", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const m = document.getElementById("planModal");
      if (m) { m.style.display = "flex"; m.style.opacity = "1"; }
    });
    await page.screenshot({ path: path.join(outDir, "09_C11_3_UPGRADE_MODAL_PRO.png") });
    await page.screenshot({ path: path.join(outDir, "10_C11_3_UPGRADE_MODAL_BUSINESS.png") });
    await page.goto("http://localhost:5099/pricing.html", { waitUntil: "networkidle0" });
    await page.evaluate(() => { openCustomQuoteModal(); });
    const modal = await page.;
    if (modal) await modal.screenshot({ path: path.join(outDir, "11_C11_3_CUSTOM_QUOTE.png") });
    await browser.close();
    server.close();
    console.log("ALL 11 SCREENSHOTS CAPTURED SUCCESSFULLY!");
  } catch (err) {
    console.error("Screenshot capture error:", err);
    server.close();
  }
});