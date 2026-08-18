# WILO 60-VIEW DATASET SPECIFICATION
**Dataset ID:** `WILO-GEOMETRY-60-01`  
**Render Engine:** Deterministic WebGL / Three.js Headless Studio (`wilo_studio.html`)  
**Resolution:** 1600 x 900  
**Format:** JPEG (Quality >= 92)  
**Total Images:** 60

---

## 1. Camera Trajectory Configuration
- **Ring A (Low Elevation, 001–020):**
  - Height: 1.05m, Radius: 5.8m, Step: 18.0° (Full 360° orbit)
  - Target: `[0.0, 1.1, -0.5]`
- **Ring B (Eye Level, 021–040):**
  - Height: 1.65m, Radius: 5.2m, Step: 18.0° (+9.0° offset, Full 360° orbit)
  - Target: `[0.0, 1.1, -0.5]`
- **Ring C (High Elevation, 041–060):**
  - Height: 2.45m, Radius: 6.2m, Step: 18.0° (+4.5° offset, Downward pitch)
  - Target: `[0.0, 0.85, -0.5]`

---

## 2. Overlap & Feature Characteristics
- **Adjacent Frame Overlap:** 75%–85%
- **Feature Richness:** Panel seams, QR-like high-frequency patterns, Wilo corporate typography, pump flanges, motor casings, and LED screen flow charts.
