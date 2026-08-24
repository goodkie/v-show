# 09_VIEW_MODEL.md — Canonical View & Vantage Point Model

## 1. View Data Model
```typescript
interface BoothView {
  viewId: string;                 // e.g. "view-0"
  projectId: string;
  experienceId: string;
  
  name: string;                   // Customer-facing friendly name (e.g. "OVERVIEW", "FRONT", "LEFT ROBOTIC CELL")
  assetId: string;                // References BoothSourceAsset
  
  viewType: 'PANORAMA_360' | 'PHOTO_2D';
  
  displayOrder: number;           // 0, 1, 2...
  
  previewUrl: string;             // 2K quick load
  highResUrl: string;             // 8K / 16K master texture
  
  puckPosition?: { x: number; y: number; z: number }; // Floor navigation puck in 3D space
  radarPosition?: { x: number; y: number };            // Minimap 2D coordinate
  
  status: 'ACTIVE' | 'ARCHIVED';
}
```

## 2. Customer-Facing View Naming
- Technical names (`view_01.jpg`, `img_004`, `camera_03`) are NEVER exposed to the buyer.
- Standard customer labels: `OVERVIEW`, `FRONT`, `LEFT SIDE`, `RIGHT SIDE`, `PRODUCT AREA`, `VIP AREA`.
