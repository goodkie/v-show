# dn’a-C06.12 — Deterministic 12-Point QA Checklist

```javascript
const QA_CHECKLIST_RULES = [
  'viewerLoads',             // WebGL / 2D Canvas initializes cleanly
  'sourceExists',            // Source media reachable
  'sourceRouteTruthful',     // Experience type matches source classification
  'assetsLoad',              // All asset derivative URLs return 200 OK
  'viewsLoad',               // Primary view valid
  'pinpointsValid',          // Pinpoints correctly bound to product targets
  'productsLoad',            // Products present in project registry
  'productImageExists',      // Product hero images valid
  'catalogWorks',            // Digital catalog accessible
  'qrLinksValid',            // QR destination links resolve
  'rfqEndpointWorks',        // RFQ submission operational
  'revisionIntegrity'        // Revisions correctly snapshot without data loss
];
```

- **FAIL**: Blocks publish immediately (`QA_BLOCKING = true`).
- **WARNING**: Only non-blocking warnings permitted.
- **PASS**: Progresses job to Client Review / Publish Staging.
