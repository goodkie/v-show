# 08_PHOTO_IMMERSIVE_EXPERIENCE_MODEL.md — Canonical Experience Model

## 1. Experience Data Model
```typescript
interface PhotoImmersiveExperience {
  experienceId: string;           // UUIDv4 (e.g. "exp-dna-2026-000184")
  projectId: string;              // Linked Project ID
  
  experienceType: 'PHOTO_IMMERSIVE'; // Fixed enum
  
  title: string;                  // e.g. "Apex Industrial Automation Showroom"
  slug: string;                   // e.g. "apex-industrial-automation"
  
  heroViewId: string;             // Default starting view (e.g. "view-0")
  
  views: BoothView[];             // Array of spatial vantage points
  pinpoints: ProductPinpoint[];   // Array of interactive product tags
  
  templateVersion: string;        // "v2026.5"
  generatorVersion: string;       // "photo-immersive-engine-v1.0"
  
  draftRevision: number;          // e.g. 2
  publishedRevision?: number;     // e.g. 1
  
  status: ExperienceStatus;       // DRAFT | PROCESSING | PREVIEW_READY | CLIENT_REVIEW | APPROVED | PUBLISHED
  previewUrl: string;             // "/photo-viewer.html?project=projectId&preview=true"
  publicUrl?: string;             // "/s/apex-industrial-automation"
}

enum ExperienceStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  PREVIEW_READY = 'PREVIEW_READY',
  CLIENT_REVIEW = 'CLIENT_REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED'
}
```
