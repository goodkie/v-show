# 20_PRODUCTION_BROWSER_E2E.md — Production Browser E2E Test Execution Plan

## 1. Automated Test Architecture
Automated end-to-end tests are executed via Puppeteer against the live application:
1. `Landing Page & Terminology Audit`: Verify 2X logo, verify `Photo Immersive Booth` and `Interactive 3D Showroom` labels.
2. `Visual Pinpoint Creation in Master Renderer`: Ingest test project, open `photo-viewer.html`, click canvas, add new product, verify marker DOM rendered, verify drawer opens.
3. `Managed & DIY Conversion Funnel`: Complete 60s intake, confirm reservation, verify ticket formatting.
4. `Mobile Portrait Responsiveness`: Test 375×812 portrait viewport for seamless buyer interactions.
