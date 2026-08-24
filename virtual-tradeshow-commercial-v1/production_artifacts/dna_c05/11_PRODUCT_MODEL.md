# 11_PRODUCT_MODEL.md — Canonical Product Model & Progressive Completion

## 1. Product Data Schema
```typescript
interface ProductRecord {
  productId: string;              // e.g. "prod-apex-cobot-x16"
  projectId: string;
  slug: string;                   // e.g. "apex-cobot-x16"
  
  name: string;                   // Required: Name
  heroImage: string;              // Required: Main Product Image
  
  modelNumber?: string;           // e.g. "APX-CB-16"
  sku?: string;
  category?: string;              // e.g. "Collaborative Robotics"
  
  shortDescription?: string;      // 1-2 sentences
  longDescription?: string;       // Rich text overview
  
  galleryImages: string[];        // Multi-angle photo URLs
  videoAsset?: string;            // Product demo video URL
  
  specificationGroups: Array<{
    groupName: string;            // e.g. "Technical Parameters"
    specs: Array<[string, string]>; // [ ["Payload Capacity", "16.0 kg"], ... ]
  }>;
  
  catalogAsset?: string;          // PDF line sheet URL
  
  priceDisplayMode: 'CALL_FOR_PRICE' | 'FIXED' | 'RANGE' | 'TIERED';
  price?: string;                 // e.g. "$28,500"
  currency?: string;              // "USD"
  
  moq?: string;                   // e.g. "1 Unit"
  leadTime?: string;              // e.g. "2-3 Weeks"
  
  completionLevel: 'BASIC' | 'STANDARD' | 'COMPLETE';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}
```

## 2. Progressive Completion Levels (Zero Blocking)
- **BASIC (Minimum viable product content = 2 fields)**:
  - `name` + `heroImage`.
  - Creates active PINPOINT & working Product Drawer immediately!
- **STANDARD**:
  - `name` + `heroImage` + `shortDescription` + `category`.
- **COMPLETE**:
  - Full specs, gallery, downloads, commercial MOQ/pricing, sales rep binding.
- **Rule**: Missing optional commercial fields (SKU, MOQ, Price, Video, PDF) MUST NEVER block booth creation or pinpoint placement.
