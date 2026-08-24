# dn’a-C06.03 — Canonical Production Job Model

## Schema Definition
```typescript
interface ProductionJob {
  jobId: string;                // e.g. "job-DNA-2026-892104"
  projectId: string;            // e.g. "proj-DNA-2026-892104"
  reservationId: string;        // e.g. "DNA-2026-892104"
  organizationId: string;       // e.g. "org-apex-01"
  customerId: string;           // e.g. "user-apex-admin"
  environment: 'REAL' | 'INTERNAL_DEV' | 'CONTROLLED_TEST';
  plan: 'PRO' | 'BUSINESS' | 'CUSTOM' | 'INTERNAL_DEV';
  productionMode: 'DIY' | 'MANAGED' | 'INTERNAL_DEV' | 'CONTROLLED_TEST';
  jobType: 'BOOTH_PRODUCTION' | 'SHOWROOM_UPGRADE' | 'CATALOG_UPDATE';
  status: 'PENDING' | 'RUNNING' | 'BLOCKED_CUSTOMER_INPUT' | 'BLOCKED_OPERATOR_REVIEW' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  showDate: string;             // ISO Date "2026-09-01"
  daysUntilShow: number;
  sourceType: 'EQUIRECTANGULAR_360' | 'MULTI_PHOTO_CAPTURE_SET' | 'SINGLE_BOOTH_PHOTO' | 'PROFESSIONAL_BOOTH_RENDER' | 'EXISTING_PANORAMA' | 'UNKNOWN';
  experienceType: 'PHOTO_IMMERSIVE' | 'MULTI_VIEW_PHOTO' | 'PHOTO_SHOWROOM' | 'DESIGNED_VISUAL_SHOWROOM';
  currentStage: string;         // "01_RESERVATION" .. "23_COMPLETED"
  progressPercent: number;      // 0 .. 100
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  assignedOperatorId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  retryCount: number;
  metrics: {
    reservationToProjectMs: number;
    sourceClassificationMs: number;
    sourceProcessingMs: number;
    previewGenerationMs: number;
    qaRunMs: number;
    publishMs: number;
    totalAutomationMs: number;
    totalTimeToFirstPreviewSeconds: number;
    timeToPublishSeconds: number;
    automatedStageCount: number;
    manualStageCount: number;
    automationRate: number;
    operatorTouchCount: number;
    operatorMinutes: number;
    customerTouchCount: number;
  };
  metadata: Record<string, any>;
}
```
