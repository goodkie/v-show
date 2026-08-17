# VIEWER QUALITY ASSURANCE — WILO TRUE 3D SHOWROOM
**Phase 10.7N-E Verification**

---

## 1. 3D Scene Viewport & Controls
- [x] **Three.js Radiance Engine**: Initialized WebGL2 renderer with ACESFilmic tone mapping and soft shadows.
- [x] **3D Orbit Mode**: Mouse drag rotation, wheel zooming (1.8m–14m distance bounds), right-click panning.
- [x] **3D Walkthrough Mode**: Locomotion via WASD / Arrow keys at 3.5m/s speed, fixed eye-level height (1.65m), spatial perimeter constraints `[-5.0, 5.0] x [-2.5, 6.0]`.
- [x] **World-Space 3D Hotspots**: 8 pulsing 3D billboard markers mapped to Wilo commercial pumps with Three.js raycasting on click/touch.
- [x] **Mobile Touch Optimization**: 1-finger orbit, 2-finger pinch zoom, 44px+ touch targets, 100dvh safe-area viewport support.

---

## 2. Product 3D Inspection Viewer
- [x] **Interactive 3D Assembly**: Dedicated Three.js canvas in product modal displaying 3D pump geometry with auto-rotation, orbit controls, and zoom.
- [x] **Spec Matrix & CTAs**: Instant linking to Technical Consultation, Request for Quote (RFQ), and digital catalog.

---

## 3. Graceful Fallback Architecture
- [x] **WebGL2 / Network Error Detection**: Automatic seamless switch to `PHOTO_TOUR` mode (12-view photo tour with thumbnails) if WebGL2 is unsupported or 3D assets fail to load.
- [x] **Manual Mode Switcher**: Visitors can switch freely between `3D Orbit`, `3D Walk`, and `Photo Tour`.
