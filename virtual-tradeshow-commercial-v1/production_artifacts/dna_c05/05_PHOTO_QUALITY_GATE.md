# 05_PHOTO_QUALITY_GATE.md — Upload Validation & Automated Quality Gate

## 1. Automated Validation Checks
When a customer or staff operator uploads booth photos:
1. **File Integrity & Format**: Valid JPEG, PNG, or WebP binary header.
2. **Dimension & Resolution Assessment**:
   - `Min Width`: 1920px (Standard 2D photo), 4096px (360 Equirectangular).
   - `Optimal`: 4096×2048 (4K) to 8192×4096 (8K) or 16384×8192 (16K).
3. **Aspect Ratio**:
   - Equirectangular 360: exactly 2.0 (±0.05).
   - Standard 2D: 16:9, 4:3, or 3:2.
4. **Visual Health**: Exposure clipping check, contrast distribution, blur detection.

---

## 2. Customer-Facing Quality Classifications

| Status Code | Customer Message | Action |
| :--- | :--- | :--- |
| `READY` | *Photo quality is optimal. Ready for instant booth preview.* | Proceed directly to preview. |
| `USABLE` | *Photo is good and will produce a sharp booth.* | Proceed to preview with optional auto-tuning. |
| `DNA_ENHANCEMENT_RECOMMENDED` | *dn'a production team can upscale and color-grade this photo for maximum impact.* | Offer Managed Enhancement. |
| `REPLACEMENT_RECOMMENDED` | *Resolution is below recommended threshold for immersive viewing. Uploading a higher resolution photo is recommended.* | Prompt re-upload with guidance. |

---

## 3. Failure Handling & Guidance
If an uploaded photo cannot produce a viable immersive experience, the system displays:
> **"We need a better source image."**
> 1. *Upload another photo*
> 2. *Let dn'a improve it*
> 3. *Request managed production help*
