# dn’a-C03 — 16 REALTIME EXHIBITION ANALYTICS ENGINE

**Status**: `IMPLEMENTED & VERIFIED`  
**Rule**: `FAKE_REAL_ANALYTICS = 0`  

## 1. Real Project Telemetry
The analytics engine records authentic exhibition metrics:
- `boothVisits`: Total unique visits to the digital showroom
- `productViews`: Plinth and modal inspection count
- `qrScans`: Waypoint scans on the trade show floor
- `catalogDownloads`: Lookbook PDF downloads
- `leadsCaptured`: Trade buyer contacts collected
- `rfqsSubmitted`: Direct price quotes requested

Newly published booths start truthfully at zero (no synthetic numbers injected).
