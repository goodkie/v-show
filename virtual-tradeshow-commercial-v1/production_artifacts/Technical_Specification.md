# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Platform Owners, Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Phase 10.7 First Real Customer Pre-Activation)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) with Signed Bearer session tokens, Worker authentication, RBAC, and sliding window rate limiting.
- **First Real Customer Pre-Activation Engine**:
  - 5-Step Onboarding Wizard in Grand Control Console (`/grand-control.html`).
  - Server-side quota guard (`LIVE_PILOT_MAX_CUSTOMERS = 1`, HTTP 409 `LIVE_PILOT_CUSTOMER_LIMIT_REACHED`).
  - Explicit data classification: `dataEnvironment: "REAL"`, `commercialStatus: "pre_activation"`, `billingStatus: "not_activated"`, `pilotCustomer: true`, `liveBillingAllowed: false`.
  - 13-Point Pre-Activation Gate Matrix & 9-Card Launch Board.
  - Read-only Stripe Live Pre-Flight Panel.
- **Canonical Health Endpoint**: `/health` (Legacy alias `/api/health` supported) providing minimal unprivileged diagnostic payload.
- **Stripe Billing Engine (Test Mode)**: Official `stripe@22.5.0` SDK with Checkout sessions, Customer Portal, raw body webhook verification, and deterministic checkout consent auditing.
- **Security & Password Hashing**: Node.js native `crypto.scryptSync` with 16-byte random salt, minimum 12-character policy with structured `WEAK_PASSWORD` error codes, and 16+ CSPRNG temporary password generation.
- **Business Identity & Legal Core**: Centralized `vivPR` statutory configuration (Fort Lee, NJ, USA, info@vivpr.pro, NJ Law).
- **Frontend Core**: Vanilla HTML5, CSS3 (Enterprise SaaS Design System with dark operations styling, safe-area insets), Modern ES6+ JavaScript. **100% English-Only UI**.
- **Mobile Landscape 3D Player**:
  - `window.matchMedia('(orientation: landscape)')` & `screen.orientation` listener with portrait suggestion banner.
  - Safe-area insets (`env(safe-area-inset-*)`) & `100dvh` full-bleed rendering.
  - Touch targets $\ge 44 \times 44\text{px}$, 1-finger orbit, 2-finger pinch zoom.
  - Background throttling on `document.visibilitychange` & WebGL context loss recovery.
- **Console Experiences**:
  - **Platform Owner Grand Control Console (`/grand-control.html`)**: Master tenant oversight, First Real Customer Pre-Activation Wizard, Launch Board, Customer 360, Test MRR / revenue intelligence, 3DGS pipeline control, in-app messaging, feature flags, commercial governance blockers, and CSV exports.
  - **Organizer Admin Console (`/organizer.html`)**: Multi-event management, exhibitor onboarding, event-wide analytics, and reconstruction approval.
  - **Exhibitor Admin Console (`/admin.html`)**: Booth customization, 3D alignment, product/hotspot placement, leads/RFQ tracking, showhost signaling, and Stripe self-serve billing.
- **3D Graphics Engine & Precision Splatting**:
  - Three.js (`0.185.1`) + `@sparkjsdev/spark@2.1.0` Gaussian Splat rendering architecture.
  - Dual Format Engine: High-density binary PLY and 88.7% compressed SPZ streaming with WebGL2 radiance rasterization.
  - Mandatory Fallback: Robust Photo Preview room mode if asset is missing or WebGL2 is unsupported.
- **Precision 3D Reconstruction Orchestration**:
  - Pre-flight Capture QA Validator (60–100 photos recommended for production).
  - Double-Gate Reconstruction Guard: Exhibitor plan check (`PRO` / `BUSINESS` required) -> `awaiting_approval` -> Platform/Organizer approval -> GPU Worker.
- **Data Layer & Multi-Tenancy**:
  - `JSONDatabaseAdapter` (**Schema Version 5**) with atomic temp-write/rename.
  - Strict Server-Side Tenant Isolation (Cross-tenant requests rejected with `403 Forbidden`).
  - Data Environment Isolation (`REAL`, `TEST`, `SYNTHETIC_TEST`).
  - Storage Driver Abstraction (`STORAGE_DRIVER=volume`).
  - Clean separation between Git-tracked Seed Data (`seed/db.seed.json`) and Runtime Persistence (`DATA_DIR/db.json`).




---

## 3. Data Models (Schema Version 5)

### 3.1 Organizations, Users, Subscriptions & Messages
```typescript
interface Organization {
  id: string;
  type: 'platform' | 'organizer' | 'exhibitor';
  name: string;
  slug: string;
  category?: string;
  status: 'active' | 'suspended';
  subscription: {
    plan: 'free' | 'pro' | 'business';
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    dataEnvironment?: 'REAL' | 'TEST' | 'SYNTHETIC_TEST';
    upgradedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'platform_owner' | 'organizer_admin' | 'exhibitor_admin' | 'showhost';
  hash: string;
  salt: string;
  mustChangePassword?: boolean;
  status: 'active' | 'suspended';
}

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
