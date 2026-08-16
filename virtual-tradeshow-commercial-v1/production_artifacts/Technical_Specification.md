# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from real physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Phase 3 Online Trial)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) with Bearer token authentication middleware and in-memory rate limiting.
- **Frontend Core**: Vanilla HTML5, CSS3 (B2B Design System with responsive mobile layout), Modern ES6+ JavaScript.
- **Shared 3D Graphics Engine**: Three.js (r128+) standardized via `booth-engine.js` guaranteeing identical coordinates across Admin & Buyer Viewer.
- **Realtime Video / Communication**:
  - WebRTC P2P with Google Public STUN (`stun:stun.l.google.com:19302`) and internal WebSocket signaling.
  - Dynamic consultation room IDs (`?room=...`).
- **Data Layer (Adapter Pattern)**:
  - Trial default: `JSONDatabaseAdapter` (Schema Version 2) with atomic temp-write/rename and in-process mutation locking.
  - Persistence: Dynamic `DATA_DIR` mounting to Railway Persistent Volume (`/data`).
- **Deployment**:
  - Railway Hobby single-service architecture with automatic healthcheck (`/health`) and zero additional cost ($0).

---

## 3. Data Models (Schema Version 2)

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
  photos: string[];
  spatialModel?: {
    type: 'photo_preview' | 'gaussian_splat' | 'mesh';
    assetUrl?: string;
    environmentLayout?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 Product
```typescript
interface Product {
  id: string;
  boothId: string;
  name: string;
  sku: string;
  category?: string;
  moq: number;
  price: number | null;
  contactForPrice: boolean;
  currency: string;
  description: string;
  images: string[];
  specifications: Record<string, string>;
  sampleAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Hotspot
```typescript
interface Hotspot {
  id: string;
  boothId: string;
  productId: string;
  position: { x: number; y: number; z: number };
  label?: string;
  type?: 'product' | 'video' | 'catalog' | 'information' | 'showhost';
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Real Analytics Events
```typescript
interface Event {
  id: string;
  boothId: string;
  productId?: string;
  sessionId?: string;
  type: 'booth_view' | 'product_view' | 'product_click' | 'hotspot_click' | 'lead_capture' | 'sample_request' | 'rfq_submit' | 'appointment_request' | 'consultation_start';
  metadata?: Record<string, any>;
  createdAt: string;
}
```

---

## 4. API Endpoints (Hardened Security & Health)

- **System**:
  - `GET /health` (Returns service health status, schema version, and timestamp)
- **Auth**:
  - `POST /api/auth/login` (Protected by rate limiter; returns cryptographically secure session token)
  - `GET /api/auth/me` (Protected)
- **Booths**:
  - `GET /api/booths` (Public lists only `published` booths; `?all=true` with Bearer auth lists drafts)
  - `POST /api/booths` (Protected)
  - `GET /api/booths/:id` (Public returns `published` only; Protected returns drafts)
  - `PUT /api/booths/:id` (Protected)
  - `POST /api/booths/:id/photos` (Protected, strict MIME `image/jpeg,image/png,image/webp`)
  - `POST /api/booths/:id/reconstruction` (Protected)
- **Products**:
  - `GET /api/booths/:boothId/products`
  - `POST /api/products` (Protected)
  - `PUT /api/products/:id` (Protected)
  - `DELETE /api/products/:id` (Protected)
  - `POST /api/products/upload-image` (Protected)
- **Hotspots (Visual 3D Editor)**:
  - `GET /api/booths/:boothId/hotspots`
  - `POST /api/hotspots` (Protected, validates product-booth ownership)
  - `PUT /api/hotspots/:id` (Protected, supports repositioning)
  - `DELETE /api/hotspots/:id` (Protected)
- **Real Analytics & Events**:
  - `POST /api/events` (Rate limited event collector for whitelisted event types)
  - `GET /api/booths/:boothId/analytics` (Protected, calculates exact real metrics without simulated baselines)
- **Buyer Engagement (Rate Limited)**:
  - `POST /api/leads` (Lead submission & server-side event creation)
  - `POST /api/rfqs` (RFQ submission & server-side event creation)
  - `POST /api/samples` (Sample request & server-side event creation)
  - `POST /api/appointments` (Appointment booking & server-side event creation)
