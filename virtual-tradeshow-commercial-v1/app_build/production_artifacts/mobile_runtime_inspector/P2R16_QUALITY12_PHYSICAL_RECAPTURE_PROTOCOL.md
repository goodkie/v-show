# P2R16 Quality 360 Physical Recapture Protocol
## Phase 7C.2R4P8.3R5 Engineering Specification

### 1. Executive Summary
Phase 7C.2R4P8.3R4 proved that increasing output raster density (12K -> 16K -> 18.432K) yielded diminishing detail returns (+1.06% at 16K, +0.61% at 18.432K) due to an authentic physical capture ceiling. Phase 7C.2R4P8.3R5 forensics demonstrated that:
1. Client-side capture correctly used `ImageCapture.takePhoto()` at full 12MP resolution ($4000 \times 3000$).
2. Stored orientation normalization is near-lossless (PSNR 45.8 dB, MTF loss 0.0%).
3. The raw camera captures themselves exhibit a 4-5 pixel edge spread function with uniform center-to-edge softness (C/E ratio 1.02) and isotropic point-spread function ($e < 1.4$).
4. The optical softness is caused by **camera continuous autofocus (`focusMode: continuous`) operating without a focus-lock / settle gate prior to shutter release**, compounded by Samsung computational multi-frame denoise smearing in low-contrast room lighting.

To eliminate this capture bottleneck, physical recapture must be governed by this rigorous protocol.

---

### 2. Camera Configuration & Hardware Gating
1. **Device**: Samsung Galaxy S23 Ultra (SM-S918U) or equivalent high-MTF primary sensor.
2. **Lens / Camera Track**:
   - Primary 1x Wide Camera (23mm equivalent, f/1.7).
   - Reject ultra-wide and telephoto cameras.
3. **Autofocus Lock Gate (CRITICAL)**:
   - Replace `focusMode: "continuous"` with **Manual / Locked Focus (`focusMode: "manual"`)**.
   - Prior to session start, set focus distance to target room hyperfocal / mid-distance (~2.5m - 3.0m).
   - Lock focus for the entire 360-degree rotation. Do NOT allow per-shot hunting.
4. **Exposure & ISO Control**:
   - Fixed exposure lock (`exposureMode: "manual"` or locked auto-exposure).
   - Shutter speed minimum: $\ge 1/125\text{s}$ to guarantee zero motion blur.
   - ISO maximum: $\le 200$ to eliminate multi-frame computational denoise smearing.
   - Ambient room illumination: Increase lighting to $\ge 500\text{ lux}$ to avoid mobile ISP low-light painterly filtering.

---

### 3. Stability & Shutter Timing Protocol
1. **Rotation Pause**:
   - 12 targets at $30^\circ$ increments ($0^\circ, 30^\circ, \dots, 330^\circ$).
   - Upon entering target sector, the user must hold device stationary.
   - **Stability Gate**: Angular velocity $< 0.10^\circ/\text{s}$ sustained for $\ge 600\text{ ms}$ before shutter trigger.
2. **Post-Shutter Dwell**:
   - Maintain stability for $300\text{ ms}$ post-shutter before cueing next rotation sector.
3. **Nodal Pivot**:
   - Rotate around the phone camera optical center, not around the user's body.

---

### 4. Storage & Processing Immutability
1. **Raw Storage**:
   - Store the direct `ImageCapture.takePhoto()` blob unmodified.
   - Preserve EXIF APP1 metadata.
2. **Lossless Orientation Handling**:
   - If orientation normalization is applied, store as lossless 16-bit PNG or execute downstream transforms in linear memory to avoid multi-generation JPEG quantization.
