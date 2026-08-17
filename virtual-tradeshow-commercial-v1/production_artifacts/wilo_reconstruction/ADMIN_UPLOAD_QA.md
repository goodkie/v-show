# ADMIN UPLOAD & CAPTURE QA — PHASE 10.7N-E

**Audit Date:** 2026-08-17  
**Module:** Multi-View Capture Upload & Product 3D Management (`/admin.html`)

---

## 1. Storage & Tenant Isolation
- [x] **Partitioned Paths**: Files stored under `data/uploads/organizations/{orgId}/booths/{boothId}/captures/{captureId}/images/`.
- [x] **Cross-Tenant Guard**: Unauthorized cross-tenant uploads, deletions, and updates return HTTP 403 Forbidden.

---

## 2. File Validation & Security
- [x] **MIME & Magic Bytes**: Strict inspection of JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), and WEBP header bytes.
- [x] **Rejection of Unsafe Payloads**: Rejection of double extensions (`.php.jpg`, `.exe.png`), SVGs, HTML, and path traversal strings (`../`, `..\`).
- [x] **File Size Limit**: 25 MB per image enforced by Multer.

---

## 3. Capture Dataset Lifecycle
- [x] **Batch Upload**: Multi-file batch upload (20+ files) supported with thumbnail cards.
- [x] **Individual Actions**: Delete (`🗑️`), Replace (`🔄`), Reorder (`◀`, `▶`), and Clear All.
- [x] **Capture QA Integration**: Real-time evaluation (15–49 images = `GOOD`, 50+ images = `EXCELLENT`).
