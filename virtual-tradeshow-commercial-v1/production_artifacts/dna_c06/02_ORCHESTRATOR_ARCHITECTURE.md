# dn’a-C06.02 — Automated Production Orchestrator Architecture

```mermaid
flowchart TD
    A[Reservation Ticket DNA-XXXXXX] --> B[01_RESERVATION Auto Project & Job]
    B --> C[02_PROJECT_CREATED]
    C --> D[03_WAITING_FOR_SOURCE]
    D --> E[04_SOURCE_RECEIVED]
    E --> F[05_SOURCE_CLASSIFICATION]
    F --> G[06_SOURCE_QUALITY_GATE]
    G -->|Q0 Reject| H[BLOCKED_CUSTOMER_INPUT Task]
    G -->|Q1..Q4 Pass| I[07_EXPERIENCE_ROUTING]
    I --> J[08_ASSET_PROCESSING]
    J --> K[09_PREVIEW_GENERATION]
    K --> L[10_PREVIEW_READY]
    L --> M[11_PRODUCT_SETUP]
    M --> N[12_PINPOINT_SETUP]
    N --> O[13_BUYER_TOOLS_BINDING]
    O --> P[14_INTERNAL_QA]
    P -->|QA Pass| Q[15_CLIENT_REVIEW]
    Q -->|Revision Request| R[16_REVISION_REQUIRED]
    Q -->|Approved| S[17_APPROVED]
    S --> T[18_PUBLISH_QUEUED]
    T --> U[19_PUBLISHING Atomic]
    U --> V[20_PUBLISHED]
    V --> W[21_SHOW_LIVE]
    W -->|Show Date Passed| X[22_POST_SHOW Keep Available]
    X --> Y[23_COMPLETED]
```

## Core Architectural Guarantees
1. **1-to-1 Mapping**: Every reservation ticket spawns exactly 1 canonical project and 1 production job (`RESERVATION_TO_PROJECT_1_TO_1 = true`).
2. **Locking & Stage Idempotency**: Jobs are acquired with atomic leases. Stage retries are idempotent and generate 0 duplicate projects, derivatives, or publish records (`DOUBLE_STAGE_EXECUTION = 0`).
3. **Traceability**: All transitions record actor, reason, execution duration, and metadata.
