# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from real physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Phase 4 Precision Reconstruction Orchestration)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) with Bearer token authentication, Worker authentication, and in-memory rate limiting.
- **Frontend Core**: Vanilla HTML5, CSS3 (B2B Design System with responsive mobile layout), Modern ES6+ JavaScript.
- **Shared 3D Graphics Engine**: Three.js (r128+) standardized via `booth-engine.js` with dual representation: Mode A (Photo Preview Texture Mapping) & Mode B (3D Precision Gaussian Splatting Spatial Model).
- **Precision 3D Reconstruction Orchestration**:
  - Capture Validator: Pre-flight photo dataset evaluation (`good`, `acceptable`, `poor`).
  - Asynchronous Job Model (`reconstructionJobs`): Tracks states from `pending` → `processing` → `reconstructed` → `verified` with full stage diagnostics.
  - Dedicated Worker Protocol: Token-protected REST interface (`/api/worker/jobs/*`) for local or cloud GPU workers.
  - Zero-Cost Python Dry-Run Worker: Simulates the entire photogrammetry lifecycle without paid GPU usage.
- **Realtime Video / Communication**:
  - WebRTC P2P with Google Public STUN (`stun:stun.l.google.com:19302`) and internal WebSocket signaling.
- **Data Layer (Adapter Pattern)**:
  - `JSONDatabaseAdapter` (Schema Version 3) with atomic temp-write/rename and in-process mutation locking.
  - Persistence: Dynamic `DATA_DIR` mounting to Railway Persistent Volume (`/data`).

---

## 3. Data Models (Schema Version 3)

### 3.1 Booth
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
    format?: string;
    environmentLayout?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 Reconstruction Job
```typescript
interface ReconstructionJob {
  id: string;
  boothId: string;
  status: 'pending' | 'processing' | 'reconstructed' | 'verified' | 'failed' | 'cancelled';
  engine: 'colmap_nerfstudio_splatfacto';
  qualityPreset: 'preview' | 'standard' | 'high';
  sourcePhotoCount: number;
  photos: string[];
  progress: number; // 0 ~ 100
  currentStage: 'preparing' | 'colmap_feature_extraction' | 'colmap_matching' | 'colmap_mapping' | 'nerfstudio_processing' | 'splat_training' | 'splat_export' | 'uploading_result' | 'completed';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workerId: string | null;
  output: {
    type: 'gaussian_splat';
    url: string;
    format: 'ply' | 'splat' | 'spz';
    sizeBytes: number;
  } | null;
  diagnostics: {
    registeredImages: number;
    totalImages: number;
    sparsePoints: number;
    warnings: string[];
  };
  error: {
    stage: string;
    message: string;
  } | null;
}
```

---

## 4. API Endpoints

- **System**:
  - `GET /health` (Returns health status, schemaVersion: 3, and timestamp)
- **Auth**:
  - `POST /api/auth/login` (Admin login)
  - `GET /api/auth/me`
- **Booths**:
  - `GET /api/booths`
  - `POST /api/booths`
  - `GET /api/booths/:id`
  - `PUT /api/booths/:id`
  - `POST /api/booths/:id/photos`
- **Reconstruction Orchestration (Admin)**:
  - `GET /api/booths/:id/reconstruction` (Get capture validation & active job state)
  - `POST /api/booths/:id/reconstruction` (Validate capture & queue reconstruction job)
  - `GET /api/reconstruction/jobs/:id` (Get specific job details)
  - `POST /api/reconstruction/jobs/:id/cancel` (Cancel pending/processing job)
  - `POST /api/reconstruction/jobs/:id/verify` (Admin human approval gate)
- **Reconstruction Worker APIs (Protected by RECONSTRUCTION_WORKER_SECRET)**:
  - `POST /api/worker/jobs/claim` (Atomic claim of next pending job)
  - `POST /api/worker/jobs/:id/progress` (Progress % and current stage reporting)
  - `POST /api/worker/jobs/:id/complete` (Submit output model metadata)
  - `POST /api/worker/jobs/:id/fail` (Report safe error diagnostic)
- **Products & Hotspots**:
  - Full CRUD operations with server-side validation.
- **Real Analytics & Public Engagement**:
  - Rate-limited event collection and lead/RFQ/sample/appointment intake.
