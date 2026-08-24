# dn’a-C06.08 — Preview Automation & Time-to-First-Preview

## 1. Automatic Fast Preview Generation
Upon successful source ingest, classification, and derivative creation, the orchestrator automatically generates a low-latency preview URL (`/photo-viewer.html?project=...&preview=true`).

## 2. Benchmark Measurement
Tracks exact timestamp deltas:
$$\text{totalTimeToFirstPreviewSeconds} = \frac{T_{\text{previewReady}} - T_{\text{sourceReceived}}}{1000}$$

## 3. Customer Action Notification
When preview is ready, customer receives prompt:
- **VIEW PREVIEW**
- **ADD PRODUCTS**
- **HAVE dn’a FINISH IT FOR ME** (1-click handoff to Managed Production)
