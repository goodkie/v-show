# V-SHOW Physical Camera Capture Ingest Pipeline (Wilo)

---

## 1. Directory Structure

- `incoming/`: Upload raw, unprocessed camera image files directly from the physical DSLR/Mirrorless/Smartphone camera.
- `accepted/`: Authenticated original photogrammetry datasets that have passed `validate_real_capture_dataset.js` and human provenance verification.
- `rejected/`: Files that fail validation (e.g. synthetic renders, screenshots, AI-generated images, corrupted files).
- `manifests/`: Ingest receipts, SHA-256 integrity catalogs, and pre-flight evaluation reports.

---

## 2. Ingest Rules & Strict Policy

1. **ONLY ORIGINAL PHYSICAL CAMERA PHOTOGRAPHS ARE ACCEPTED**:
   - Must be captured on-site at the physical trade show exhibition booth.
   - Preserves original camera EXIF metadata (Focal length, Camera Model, ISO, Exposure).
2. **STRICTLY FORBIDDEN IN INCOMING/**:
   - Synthetic 3D engine renders (Three.js, Blender, Unreal screenshots).
   - AI-generated booth visuals (Midjourney, Stable Diffusion).
   - 2D Photo Tour carousel screenshots or re-encoded thumbnails.
   - Any synthetic test geometry from earlier development phases.
