# 10_PRODUCT_PINPOINT_MODEL.md — Canonical Product Pinpoint Model & Coordinate Systems

## 1. Pinpoint Data Model
```typescript
interface ProductPinpoint {
  pinpointId: string;             // UUIDv4 (e.g. "pin-01")
  projectId: string;
  experienceId: string;
  viewId: string;                 // Belongs to a specific vantage point
  
  label: string;                  // e.g. "Apex Cobot X16"
  shortLabel?: string;            // e.g. "Apex Cobot"
  categoryTag?: string;           // e.g. "Collaborative Robotics"
  
  coordinateSystem: CoordinateSystem; // NORMALIZED_2D | PANORAMA_UV | WORLD_3D
  
  // Normalized 0..1 coordinates for 2D views, or World 3D vector for 360 sphere
  x: number;
  y: number;
  z?: number;
  
  targetType: 'PRODUCT' | 'CATALOG' | 'VIDEO' | 'MEETING';
  targetId: string;               // e.g. productId "prod-apex-cobot-x16"
  
  displayOrder: number;
  isVisible: boolean;
  
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

enum CoordinateSystem {
  NORMALIZED_2D = 'NORMALIZED_2D',
  PANORAMA_UV = 'PANORAMA_UV',
  WORLD_3D = 'WORLD_3D'
}
```

## 2. In-Viewer Visual Pinpoint Creator UX
1. Customer clicks any location on the booth canvas.
2. A lightweight modal pops up: `Product Name *`, `Product Photo *`, `Short Description (Optional)`.
3. Clicking **Add Product** creates the pinpoint instantly on the canvas.
4. Clicking the pinpoint immediately opens the **Product Drawer** without requiring page reloads or manual developer intervention.
