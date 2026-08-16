# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from real physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Phase 5 Precision Splat & Spark Integration)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) with Bearer token authentication, Worker authentication, and in-memory rate limiting.
- **Frontend Core**: Vanilla HTML5, CSS3 (B2B Design System with responsive mobile layout), Modern ES6+ JavaScript.
- **3D Graphics Engine & Precision Splatting**:
  - Three.js (r128+) + `@sparkjsdev/spark` Gaussian Splat rendering architecture.
  - Hybrid Representation:
    - **Mode B (Verified Precision 3D)**: High-fidelity Gaussian Splat spatial cloud with dynamic `transform` alignment.
    - **Mode A (Photo Preview Fallback)**: Mandatory fallback rendering textured room geometry if WebGL2 is unsupported or asset fails to load.
  - Shared coordinate mapping ensuring 100% parity across Admin 3D Visual Editor, Precision Alignment Tool, and Public Buyer Viewer.
- **Precision 3D Reconstruction Orchestration**:
  - Capture Validator: Pre-flight photo dataset evaluation (`good`, `acceptable`, `poor`).
  - Asynchronous Job Model (`reconstructionJobs`): Tracks states from `pending` → `processing` → `reconstructed` → `verified`.
  - Standalone Python Dry-Run Worker: Simulates full photogrammetry lifecycle at $0 cost.
- **Realtime Video / Communication**:
  - WebRTC P2P with Google Public STUN (`stun:stun.l.google.com:19302`) and internal WebSocket signaling.
- **Data Layer (Adapter Pattern)**:
  - `JSONDatabaseAdapter` (Schema Version 3) with atomic temp-write/rename and in-process mutation locking.
  - Persistence: Dynamic `DATA_DIR` mounting to Railway Persistent Volume (`/data`).

---

## 3. Data Models (Schema Version 3)

### 3.1 Booth & Spatial Model
```typescript
interface Booth {
  id: string;
  exhibitorId: string;
  name: string;
  description: string;
  themeColor?: string;
  status: 'draft' | 'published' | 'archived';
  reconstructionStatus: 'photo_preview' | 'reconstruction_pending' | 'processing' | 'reconstructed' | 'verified' | 'failed';
  reconstructionJobId: string | null;
  photos: string[];
  spatialModel?: {
    type: 'photo_preview' | 'gaussian_splat' | 'mesh';
    assetUrl?: string;
    format?: 'ply' | 'spz' | 'splat' | 'ksplat';
    transform?: {
      position: [number, number, number]; // [x, y, z]
      rotation: [number, number, number]; // [rx, ry, rz] in degrees
      scale: number;
    };
    environmentLayout?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Precision Viewer & Fallback Architecture

### 4.1 Hybrid Selection Logic
1. When a booth is retrieved, the viewer inspects `reconstructionStatus`:
   - If `status === 'verified'` and `spatialModel.assetUrl` exists:
     - Check WebGL2 capability.
     - Load Gaussian Splat via `PrecisionSplatViewer` (`@sparkjsdev/spark` adapter).
     - Apply spatial transform (`position`, `rotation`, `scale`).
   - If `status !== 'verified'`, WebGL2 unsupported, or asset download fails:
     - Automatically render Mode A Photo Preview room.
     - Display a brief unobtrusive status notification.
2. Hotspot Layer:
   - Product Hotspots are projected onto the 2D screen using 3D world anchors.
   - Hotspot clicks seamlessly trigger the product modal and fire `hotspot_click` analytics with `viewerMode: 'precision_splat' | 'photo_preview'`.
