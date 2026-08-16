# Antigravity Onboarding & Workspace Guide

Welcome to the **Virtual Trade Show Commercial V1** repository.

## 1. Absolute Safety & Scope
- **Authorized modification directory**: `virtual-tradeshow-commercial-v1/` ONLY.
- Never modify anything outside this directory.
- Never commit credentials, passwords, or paid API keys.

## 2. Directory Structure
```
virtual-tradeshow-commercial-v1/
├── ANTIGRAVITY_START_HERE.md         # Onboarding & rules
├── .agents/                           # Agent guidance & workflow instructions
│   └── guidelines.md
├── production_artifacts/              # Shared specifications and handoffs
│   ├── Technical_Specification.md     # Architectural blueprint & API specs
│   └── HANDOFF.md                     # Antigravity <-> ChatGPT shared state
└── app_build/                         # Application source code
    ├── package.json
    ├── server/                        # Express + WebSocket backend & Data Adapters
    │   ├── index.js
    │   └── db.js
    ├── client/                        # Web client (Buyer Viewer & Exhibitor Admin)
    │   ├── index.html                 # Public 3D Booth Viewer
    │   ├── admin.html                 # Exhibitor Admin Dashboard
    │   ├── style.css                  # Commercial UI Design System
    │   ├── viewer.js                  # Three.js Booth Engine & Hotspots
    │   └── admin.js                   # Admin Operations & Management
    └── data/                          # Trial data storage (JSON & uploads)
```

## 3. Development Commands
Navigate to `virtual-tradeshow-commercial-v1/app_build/`:
- `npm install`: Install dependencies (express, ws, multer, cors, uuid, etc.)
- `npm start`: Launch the unified backend and frontend static server on port 3000 (or `PORT` env var).

## 4. Key Milestones
- **P0/P1**: Foundation, Admin Login, Booth Creation, Photo Upload, 3D Photo Preview, Product CRUD, Booth Publish, Public 3D Viewer.
- **P2/P3**: Visual Hotspot Editor, Digital Business Card (Lead), Sample Request, RFQ, Appointment.
- **P4/P5**: Online Railway Trial, WebSocket Signaling, WebRTC 1:1 Live Consultation.
- **P6/P7**: Precision Reconstruction Adapter (COLMAP / Gaussian Splat), Web Viewer fallback.
