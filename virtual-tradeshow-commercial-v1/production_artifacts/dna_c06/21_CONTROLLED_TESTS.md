# dn’a-C06.21 — Controlled Test Suite Matrix (Tests A ~ I)

| Test ID | Scenario | Input | Expected Outcome | Result |
| :--- | :--- | :--- | :--- | :---: |
| **TEST A** | PRO Customer 360 Flow | 8K Equirectangular 360 + 3 Products | Auto-classify `PHOTO_IMMERSIVE`, auto-preview, pinpoints placed, QA PASS, atomic publish | **PASS** |
| **TEST B** | BUSINESS Customer Multi-Photo | 6 Standard photos + 10 Products | Multi-photo analysis, truthful `MULTI_VIEW_PHOTO` route, catalog, QR, QA PASS, publish | **PASS** |
| **TEST C** | DIY $\rightarrow$ Managed Handoff | 1 Booth photo + 2 Products | `PHOTO_SHOWROOM` generated, 1-click handoff to Managed with zero data re-entry | **PASS** |
| **TEST D** | Bad Source Rejection | Corrupt / $<720p$ source | Quality tier `Q0_REJECT`, `BLOCKED_CUSTOMER_INPUT`, task `UPLOAD_BETTER_SOURCE` | **PASS** |
| **TEST E** | Failure Injection & Recovery | Injected preview render failure | Bounded exponential retry (3 attempts), data preserved without corruption | **PASS** |
| **TEST F** | Concurrency Lock | 10 workers advancing same stage | Exactly 1 worker executes stage, `DOUBLE_STAGE_EXECUTION = 0` | **PASS** |
| **TEST G** | Publish Idempotency | 10 concurrent publish requests | Atomic publish lease, exactly 1 published record, `DOUBLE_PUBLISH = 0` | **PASS** |
| **TEST H** | INTERNAL_DEV Isolation | Developer Lab test job | Full pipeline visible in Dev Lab, zero billing, isolated analytics | **PASS** |
| **TEST I** | Show Date Lifecycle | `showDate` passes | Auto-transition `PRE_SHOW` $\rightarrow$ `SHOW_LIVE` $\rightarrow$ `POST_SHOW`, real report generated | **PASS** |
