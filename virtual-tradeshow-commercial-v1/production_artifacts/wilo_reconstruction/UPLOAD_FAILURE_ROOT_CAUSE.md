# ROOT CAUSE ANALYSIS — MULTI-VIEW BOOTH CAPTURE UPLOAD PIPELINE

**Investigation Date:** 2026-08-17  
**Target:** Virtual Trade Show Commercial V1 / vivPR V-Show  
**Affected Modules:** `client/admin.html`, `client/admin.js`, `server/index.js`, `server/db.js`

---

## 1. Executive Summary

An audit of the multi-view booth capture upload pipeline revealed four structural failure vectors that prevented production-grade booth reconstruction datasets:
1. **Flat, Non-Isolated Storage Architecture:** Files were dumped into a single unstructured `data/uploads/` directory without organization, booth, or capture dataset partitioning.
2. **Unvalidated Upload Filter (Security Vulnerability):** Multer configuration lacked strict MIME / magic byte filtering, permitting non-image file types or double extensions.
3. **Monolithic Batch Transfer Without Per-File State:** The client sent all files in a single unchunked HTTP multipart request with no individual progress, retry, or per-file failure reporting.
4. **Shallow Database Representation:** Uploaded photos were stored merely as an array of string URLs (`booth.photos`) instead of a structured capture dataset entity containing timestamps, image dimensions, SHA-256 hashes, and geometric quality ratings.

---

## 2. Detailed Failure Breakdown

### A. Storage Architecture (Flat Directory)
- **Original Code (`server/index.js:30-38`):**
  ```javascript
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
    filename: function (req, file, cb) { ... }
  });
  ```
- **Root Cause:** All tenant uploads shared the same root folder. This violated multi-tenant isolation principles and prevented dataset-level lifecycle management (e.g., deleting an entire capture version without scanning filenames).

### B. Security & Validation Gaps
- **Root Cause:** Absence of `fileFilter` in `multer` allowed any file extension to be uploaded. Lack of magic byte inspection allowed spoofed MIME types.
- **Risk:** Malicious payloads, SVG/HTML XSS vectors, or corrupted files could enter the pipeline.

### C. Client Upload UX & Batch Failures (`client/admin.js:1016-1045`)
- **Original Code:** Loops through `e.target.files` into one `FormData` under key `photos` and executes a single `fetch()` call.
- **Root Cause:** If any file in a 20–80 photo dataset caused a timeout or payload size error, the entire batch failed with a generic toast message (`"Photo upload failed"`). No per-file status or retry was possible.

### D. Missing Capture Dataset Entity
- **Root Cause:** The database lacked a dedicated `captures` store linked to `organizationId`, `boothId`, and `reconstructionJobId`.

---

## 3. Corrective Architecture (Phase 10.7N-E Implementation)

1. **Tenant-Partitioned Directory Structure:**
   ```
   data/uploads/organizations/{organizationId}/booths/{boothId}/captures/{captureId}/images/
   ```
2. **Strict MIME & Magic Byte Validation:**
   - Allowed: `image/jpeg`, `image/png`, `image/webp`
   - Rejection of SVG, HTML, executables, double extensions, and path traversal strings.
3. **Structured Dataset API:**
   - `POST /api/booths/:id/captures/upload` with per-file response and dataset registration.
   - `GET /api/booths/:id/captures` with metadata and QA rating.
4. **Enhanced UI in Exhibitor Admin:**
   - Multi-file drag-and-drop with individual upload progress, thumbnail previews, delete, replace, reorder, and retry capabilities.
