# Technical Specification — Virtual Trade Show Commercial V1

## 1. Executive Summary
Virtual Trade Show Commercial V1 is a commercial-grade SaaS platform connecting Event Organizers, Exhibitors, Buyers, and Showhosts. It generates realistic, navigable 3D virtual trade show booths from real physical booth captures (photos/videos), empowering exhibitors to showcase products, engage buyers, capture leads, process RFQs, and conduct 1:1 live consultations.

---

## 2. Core Architecture

### 2.1 Technology Stack (Trial / Commercial V1)
- **Backend Runtime**: Node.js (v18+)
- **Server Framework**: Express.js + Native `ws` (WebSocket) for signaling and realtime notifications.
- **Frontend Core**: Vanilla HTML5, CSS3 (Custom B2B Design System), Modern ES6+ JavaScript.
- **3D Graphics Engine**: Three.js (r128+) with OrbitControls, Raycasting for 3D hotspots, and spatial projection planes for Photo Preview.
- **Data Layer (Adapter Pattern)**:
  - Trial default: `JSONFileAdapter` + Local file storage for uploads.
  - Production path: PostgreSQL (Prisma/Knex) + AWS S3 / Cloudflare R2 object storage.
- **Realtime / Video**:
  - Trial: WebRTC P2P with internal WebSocket signaling.
  - Production: TURN Server / LiveKit SFU.

---

## 3. Data Models

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
  photos: string[]; // URLs of uploaded capture photos
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
  price: number | null; // null if contactForPrice is true
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
  type?: 'product' | 'info' | 'video';
  createdAt: string;
}
```

### 3.4 Lead & Business Card
```typescript
interface Lead {
  id: string;
  boothId: string;
  company: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
  createdAt: string;
}
```

### 3.5 RFQ (Request for Quotation)
```typescript
interface RFQ {
  id: string;
  boothId: string;
  productId: string;
  buyerName: string;
  company: string;
  email: string;
  quantity: number;
  targetPrice?: number;
  deliveryDate?: string;
  shippingTerms?: string;
  notes?: string;
  status: 'new' | 'viewed' | 'responded' | 'negotiating' | 'won' | 'lost';
  createdAt: string;
}
```

### 3.6 Sample Request & Appointment
```typescript
interface SampleRequest {
  id: string;
  boothId: string;
  productId: string;
  buyerName: string;
  company: string;
  email: string;
  quantity: number;
  shippingAddress?: string;
  notes?: string;
  createdAt: string;
}

interface Appointment {
  id: string;
  boothId: string;
  buyerName: string;
  company: string;
  email: string;
  requestedTime: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}
```

---

## 4. API Endpoints

- **Auth**:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- **Booths**:
  - `GET /api/booths` (List booths)
  - `POST /api/booths` (Create booth)
  - `GET /api/booths/:id` (Get booth details)
  - `PUT /api/booths/:id` (Update booth & publish status)
  - `POST /api/booths/:id/photos` (Upload capture photos)
  - `POST /api/booths/:id/reconstruction` (Request precision reconstruction)
- **Products**:
  - `GET /api/booths/:boothId/products` (List products)
  - `POST /api/products` (Create product)
  - `PUT /api/products/:id` (Update product)
  - `DELETE /api/products/:id` (Delete product)
  - `POST /api/products/upload-image` (Upload product media)
- **Hotspots**:
  - `GET /api/booths/:boothId/hotspots` (Get booth hotspots)
  - `POST /api/hotspots` (Create/Save hotspot coordinates)
  - `DELETE /api/hotspots/:id` (Delete hotspot)
- **Buyer Engagement**:
  - `POST /api/leads` (Digital business card submission)
  - `POST /api/rfqs` (RFQ submission)
  - `POST /api/samples` (Sample request)
  - `POST /api/appointments` (Meeting booking)
  - `GET /api/booths/:boothId/analytics` (Exhibitor engagement metrics)

---

## 5. Reconstruction State Machine
1. `photo_preview`: Immediate 3D room texture mapping with uploaded capture photos (Zero GPU cost).
2. `reconstruction_pending`: Queued for background precision processing.
3. `processing`: Running COLMAP / NeRF / Gaussian Splatting pipeline on GPU worker.
4. `reconstructed`: 3D asset (PLY/SPZ/GLB) generated and ready.
5. `verified`: Exhibitor has verified and approved the precision 3D booth.
6. `failed`: Reconstruction pipeline reported an error (insufficient overlap, blur, etc.).
