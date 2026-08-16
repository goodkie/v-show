# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from real physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Phase 8 Commercial Beta SaaS)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) with Signed Bearer session tokens, Worker authentication, RBAC, and sliding window rate limiting.
- **Security & Password Hashing**: Node.js native `crypto.scryptSync` with 16-byte random salt.
- **Frontend Core**: Vanilla HTML5, CSS3 (B2B Design System with responsive mobile layout), Modern ES6+ JavaScript.
- **Public Event Experience**: Public Event Lobby (`/lobby.html`) with category filtering, instant keyword search, and seamless booth entry.
- **Console Experience**:
  - **Organizer Admin Console (`/organizer.html`)**: Multi-event management, exhibitor onboarding, event-wide analytics, and reconstruction approval.
  - **Exhibitor Admin Console (`/admin.html`)**: Booth customization, 3D alignment, product/hotspot placement, leads/RFQ tracking, and showhost signaling.
- **3D Graphics Engine & Precision Splatting**:
  - Three.js (`0.185.1`) + `@sparkjsdev/spark@2.1.0` Gaussian Splat rendering architecture.
  - Dual Format Engine: High-density binary PLY and 88.7% compressed SPZ streaming with WebGL2 radiance rasterization.
  - Mandatory Fallback: Robust Photo Preview room mode if asset is missing or WebGL2 is unsupported.
- **Precision 3D Reconstruction Orchestration**:
  - Pre-flight Capture Validator (50~100 photos recommended for production).
  - Reconstruction Approval Workflow: Exhibitor submit -> `awaiting_approval` -> Organizer approval -> GPU Worker.
- **Data Layer & Multi-Tenancy**:
  - `JSONDatabaseAdapter` (**Schema Version 4**) with atomic temp-write/rename.
  - Strict Server-Side Tenant Isolation (Cross-tenant requests rejected with `403 Forbidden`).
  - Storage Driver Abstraction (`STORAGE_DRIVER=volume`).
  - Clean separation between Git-tracked Seed Data (`seed/db.seed.json`) and Runtime Persistence (`DATA_DIR/db.json`).

---

## 3. Data Models (Schema Version 4)

### 3.1 Organizations, Users & Events
```typescript
interface Organization {
  id: string;
  type: 'organizer' | 'exhibitor';
  name: string;
  slug: string;
  category?: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'organizer_admin' | 'exhibitor_admin' | 'showhost';
  hash: string;
  salt: string;
  status: 'active' | 'suspended';
}

interface Event {
  id: string;
  organizerOrganizationId: string;
  name: string;
  slug: string;
  description: string;
  bannerImage?: string;
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'published' | 'archived';
}
```

### 3.2 Booth & Reconstruction Job
```typescript
interface Booth {
  id: string;
  organizationId: string;
  eventId: string;
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
    format?: 'ply' | 'spz';
    splatCount?: number;
    transform?: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: number;
    };
  };
}

interface ReconstructionJob {
  id: string;
  organizationId: string;
  eventId: string;
  boothId: string;
  status: 'awaiting_approval' | 'pending' | 'processing' | 'reconstructed' | 'verified' | 'failed';
  approvalStatus: 'awaiting_approval' | 'approved' | 'rejected';
  progress: number;
  currentStage: string;
  qualityPreset: string;
  engine: string;
  output?: {
    url: string;
    format: 'ply' | 'spz';
    sizeBytes: number;
  };
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
