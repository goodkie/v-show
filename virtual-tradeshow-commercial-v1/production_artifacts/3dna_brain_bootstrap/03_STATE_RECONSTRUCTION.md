# 03. COMPLETE PLATFORM STATE RECONSTRUCTION

## 1. Architectural Foundations
The ³DNa platform operates on a single unified multi-tenant Node.js + Express backend with an in-memory JSON transactional datastore (`db.js`), serving static frontends, WebGL 3D/panoramic showrooms, and RESTful API endpoints.

## 2. Active Milestone Map
1. **Commercial Acquisition (C08 / C10-R1 / C10-R2 / C10-R3)**:
   - 1-Photo Free Virtual Booth Funnel with email verification and duplicate prevention.
   - Fail-closed IP hashing and rate controls (`BAD_IMAGE_CONSUMES_FREE_ALLOWANCE=false`).
2. **Commercial Pricing & Gating (C11 / C11.3)**:
   - Canonical 3-tier structure: PRO ($299/mo), BUSINESS ($799/mo), CUSTOM (Quote).
   - Server-enforced resource ceilings (PRO: 3 views, 30 products; BUSINESS: 60 images, 100 products, 30 adv media).
   - Stripe safety lock: `PAYMENT_PILOT_ARMED=false`, `REAL_CHARGE_COUNT=0`.
3. **AI Virtual Showcases (C11.1 / C11.2)**:
   - AI Virtual Fitting Room & AI Virtual Makeup Artist showcases with status `CONSULTATION`.
4. **Image Mastering Engine (C11.5 / V4.2)**:
   - Executable ONNX Neural Super-Resolution engine (`3DNA_ONNX_SUBPIXEL_SR_V4_2`) with commercial content locking and canonical 8K PNG master generation.
