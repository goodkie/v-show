# 02_SOURCE_TO_IMMERSIVE_GATE.md — Smart Capture & Source-to-Immersive Gate

## 1. Input Source Taxonomy (7 Canonical Categories)

| Source Key | Visual Asset Description | Aspect Ratio | Qualification Criteria | Deterministic Route |
| :--- | :--- | :--- | :--- | :--- |
| `EQUIRECTANGULAR_360` | Full 360° × 180° equirectangular panoramic image | ~2.0 : 1 (e.g. 8192×4096, 4096×2048) | 2:1 aspect, seamless left/right continuity | `PHOTO_IMMERSIVE` (`PANORAMA_YAW_PITCH`) |
| `360_CAMERA_SOURCE` | Raw dual-fisheye or pre-stitched 360 camera export | ~2.0 : 1 or Dual-Circular | High-resolution 360 device capture | `PHOTO_IMMERSIVE` (`PANORAMA_YAW_PITCH`) |
| `MULTI_PHOTO_CAPTURE_SET` | Set of 2 to 12 overlapping perspective booth photos | Various (4:3, 16:9, 3:2) | Multiple distinct booth viewpoints | `MULTI_VIEW_PHOTO` (`NORMALIZED_2D`) |
| `SINGLE_BOOTH_PHOTO` | Exactly 1 standard perspective photograph | Standard (4:3, 16:9, 3:2) | Single vantage point | `PHOTO_SHOWROOM` (`NORMALIZED_2D`) |
| `PROFESSIONAL_BOOTH_RENDER` | 3D architectural booth rendering (3ds Max, Blender, SketchUp) | High-res 16:9 / 16:10 | Computer-generated architectural render | `DESIGNED_SHOWROOM` (`NORMALIZED_2D`) |
| `EXISTING_PANORAMA` | Legacy cylindrical or wide-angle panoramic photo | > 2.2 : 1 or cylindrical | Wide panorama | `PHOTO_IMMERSIVE` (after normalization) |
| `UNKNOWN` | Unrecognized graphics, logos, or blurry images | Any | Insufficient quality or non-booth image | Rejection / Prompt capture guide |

---

## 2. Absolute Truth Rule & Prohibited Practices

1. **No Artificial Sphere Stretching**: A standard perspective 2D photograph is NEVER stretched across a 360° sphere. It routes cleanly to `PHOTO_SHOWROOM` with interactive pan/zoom and `NORMALIZED_2D` pinpoints.
2. **No Generative Missing Area Hallucinations**: Missing side walls, back walls, and ceilings are NEVER invented or AI-hallucinated (`GENERATIVE_MISSING_VIEW_FILL = false`).
3. **Truthful Showroom Labeling**:
   - `PHOTO IMMERSIVE BOOTH`: Reserved strictly for verified 360° equirectangular captures.
   - `PHOTO SHOWROOM`: Used for single-photo interactive digital showrooms.
   - `MULTI-VIEW PHOTO BOOTH`: Used for multi-photo vantage point navigation.
   - `DESIGNED VISUAL SHOWROOM`: Used for 3D architectural renders (never labeled as real capture).

---

## 3. Experience Upgrade & Lossless Data Migration

When a customer upgrades from a `PHOTO SHOWROOM` to a `PHOTO IMMERSIVE BOOTH`:
- **Preserved Intact (100% Zero Data Loss)**:
  - Company Profile, Trade Show, Reservation Ticket ID
  - Product Registry & Specifications
  - 4K Product Images & Media
  - Digital Catalog & Persistent Product QR Codes
  - Smart Exhibitor NFC Card Pass
  - Wholesale Leads, RFQs, and Buyer Inquiries
- **Pinpoint Migration**:
  - The customer is presented with an intuitive in-viewer prompt to place the pinpoints onto the new 360° canvas (positions are not silently guessed).
