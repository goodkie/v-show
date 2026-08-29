# ³DNa — FIRST REAL CUSTOMER OPERATOR LAUNCH CHECKLIST

## 1. PRE-ONBOARDING VERIFICATION
- [ ] Confirm `3DNA_BRAIN.md` is synchronized.
- [ ] Verify Cloudflare R2 backup status is `200 OK`.
- [ ] Verify Stripe is in Test Mode (`PAYMENT_PILOT_ARMED=false`).
- [ ] Verify AI inference queue concurrency limit is set to 3.

---

## 2. CUSTOMER ACCOUNT CREATION
- [ ] Create tenant and business record.
- [ ] Select canonical plan (`PRO` $299 / `BUSINESS` $799 / `CUSTOM` Quote).
- [ ] Ensure customer source image and product limits match plan entitlements.

---

## 3. SOURCE UPLOAD & TIER 0 BACKUP
- [ ] Ingest source images via secure dashboard.
- [ ] Validate MIME type, dimensions, and aspect ratio (2:1 for panorama).
- [ ] Confirm Tier 0 original is uploaded to Cloudflare R2 (`TIER0_R2_BACKUP=true`).
- [ ] Verify SHA256 integrity match between primary and R2 backup.

---

## 4. AI IMAGE MASTERING & QA
- [ ] Trigger AI subpixel super-resolution job.
- [ ] Verify 8K output master dimensions (7680x4320 PNG for normal photo).
- [ ] Verify commercial content lock (logos, text, barcodes, product shapes unchanged).
- [ ] Inspect manual review queue if human occlusions were detected.

---

## 5. PINPOINT & PRODUCT SETUP
- [ ] Ingest product catalog (single canonical model).
- [ ] Map pinpoints with normalized u,v coordinates (photo) or yaw,pitch (panorama).
- [ ] Verify QR code generator resolves to persistent product URL.

---

## 6. PRE-PUBLISH PREVIEW & CUSTOMER APPROVAL
- [ ] Generate project-scoped pre-publish preview link.
- [ ] Send preview to customer for review.
- [ ] Receive and record explicit customer sign-off (`CUSTOMER_APPROVAL_PERSISTED=true`).

---

## 7. PUBLICATION & BUYER FLOW VERIFICATION
- [ ] Publish project as `v1.0`.
- [ ] Test buyer interactions (showroom navigation, pinpoint click, RFQ submission, meeting booking).
- [ ] Verify buyer notifications route strictly to customer contact destination.

---

## 8. POST-PUBLISH & DISASTER RECOVERY
- [ ] Confirm atomic database snapshot uploaded to R2.
- [ ] Verify analytics exclude internal test events.
- [ ] If revision is requested, create `v1.1` without product re-entry.
- [ ] Rollback to `v1.0` if requested by customer.
