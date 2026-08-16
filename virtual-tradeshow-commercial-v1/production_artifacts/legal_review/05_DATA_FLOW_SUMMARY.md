# 05. DATA FLOW SUMMARY
**vivPR V-Show — Technical Data Flow & Privacy Mapping**

---

```
[Exhibitor Admin] ──────► [vivPR API / Railway] ──────► [Volume Storage]
 (Photos & Metadata)         (Auth & Scrypt Hash)         (Encrypted DB & Media)
                                      │
                                      ▼
                            [GPU Reconstruction]
                             (Modal / Worker)
                                      │
                                      ▼
[Buyer / Attendee] ◄───── [Spark 3D WebGL] ◄───── [SPZ / PLY Asset]
 (Hotspot click, RFQ)
         │
         ▼
[Lead / RFQ Store] ──────► [Exhibitor Admin CSV Export]
```

1. **Isolation:** Cross-organization data access is rejected at server layer with HTTP 403.
2. **Payment Isolation:** All checkout transactions redirect to Stripe Checkout; only webhook signatures and customer IDs return to vivPR.
