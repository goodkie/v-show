# 01_C04_BASELINE.md — dn'a-C04 Baseline State Verification

## 1. Executive Summary
- **Baseline Release**: `dn'a-C04`
- **Master Commit**: `c658c82`
- **Status**: `PASS`
- **Primary Achievements in C04**:
  1. Conversion-First Smart Booth Wizard replaced the legacy 8-step configuration-first builder.
  2. 200% Logo scale (`LOGO_SCALE_2X = true`, ~58px rendered height) deployed across all primary navbars.
  3. Server-persisted Reservation Tickets (`DNA-2026-XXXXXX`) integrated with the Operations Command Center queue (`RESERVED_INTAKE_PENDING`).
  4. Canonical Global Product Registry (`products.js`) created for the 4 industrial robotics systems.
  5. Zero-loss DIY-to-Managed handoff implemented (`DATA_REENTRY = 0`).
  6. Direct `BUILD A BOOTH LIKE THIS →` CTAs added to reference viewers.

## 2. Baseline Architecture State
```
┌──────────────────────────────────────────────────────────┐
│                   LANDING PAGE (index.html)              │
│  - 2X Logo                                               │
│  - Showcase Switcher                                     │
│  - Start My Booth CTA -> /builder.html                   │
└───────────────┬──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────┐
│             SMART BOOTH WIZARD (builder.html)            │
│  - Step 0: Path Selection (Managed vs DIY)               │
│  - Managed: M1 (60s Intake) -> M2 (Plan) -> M3 (Ticket)  │
│  - DIY: D1 (Assets) -> D2 (Fast 3D Preview) -> D3 (Handoff)│
└───────────────┬──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────┐
│         REFERENCE VIEWERS & OPERATIONAL QUEUES           │
│  - /demo-matterport.html (Photo Immersive Reference Master)│
│  - /demo.html (Interactive 3D Reference Master)          │
│  - /production.html (Internal Operations Pipeline)       │
└──────────────────────────────────────────────────────────┘
```

## 3. Preservation Directives for C05
- All C04 reservation tickets, project database models, and lead capture endpoints MUST remain backward compatible.
- The 4 canonical robotics systems (`Apex Cobot X16`, `Vector AMR 600`, `Titan Delta D12`, `Hyperion SCARA S8`) remain the master reference data.
