# Mobile Landscape 3D Player Specification

**Platform:** Virtual Trade Show Commercial V1  
**Target Viewports:** Mobile Landscape (e.g. 844×390, 932×430, 915×412, 740×360), Tablet Landscape (1024×768)  
**Engine:** Three.js r128 + OrbitControls + Spark Gaussian Splatting (PrecisionSplatViewer)  

---

## 1. Overview & Problem Statement

Mobile browsers in portrait mode suffer from cramped vertical space, navigation bars obscuring 3D viewports, and non-optimal spatial aspect ratios for trade show booths. The **Mobile Landscape 3D Player** optimizes the viewport, safe-area insets, HUD ergonomics, touch target sizes, and WebGL memory lifecycle for high-fidelity spatial exploration.

---

## 2. Core Architectural Features

### A. Dual-Layer Orientation Detection
```javascript
const isLandscape = window.matchMedia('(orientation: landscape)').matches || (window.innerWidth > window.innerHeight);
```
- Non-intrusive rotation suggestion banner displayed on mobile portrait viewports (`"For the best 3D experience, rotate your device to landscape."`) with a dismiss option stored in `sessionStorage`.
- Dynamic viewport resize listener updating Three.js camera aspect ratio and WebGL renderer resolution on `orientationchange` and `resize`.

### B. Safe-Area Inset & Full-Height Standard
- Implements CSS `height: 100vh; height: 100dvh;` with `viewport-fit=cover`.
- Safe areas handled via `env(safe-area-inset-top)`, `env(safe-area-inset-right)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)` to avoid notch and home-indicator overlap.

### C. Touch Target Ergonomics
- All interactive hotspot markers and action buttons are sized to $\ge 44 \times 44\text{px}$ touch targets with `touch-action: manipulation`.
- 1-finger drag for 360° orbit rotation, 2-finger pinch for smooth camera zoom.

### D. Responsive Product Drawer
- Viewport width $\ge 700\text{px}$: Right drawer overlay ($320\text{--}420\text{px}$) leaving the 3D booth visible.
- Viewport width $< 700\text{px}$: Bottom sheet modal with scrollable specification tables.

### E. WebGL Lifecycle & Background Throttling
- `document.visibilitychange` event listener halts the animation render loop when the browser tab is hidden or backgrounded, conserving battery and GPU memory.
- `webglcontextlost` and `webglcontextrestored` event handlers dynamically recover and rebuild the 3D scene without requiring a full page refresh.
