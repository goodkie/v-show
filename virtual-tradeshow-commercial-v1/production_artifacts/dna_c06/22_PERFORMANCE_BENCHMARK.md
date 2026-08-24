# dn’a-C06.22 — Performance Benchmark Measurements

## Actual Measured Timings (End-to-End Test Suite)

| Metric | Measured Duration | Status |
| :--- | :---: | :---: |
| `reservationToProjectMs` | 14 ms | Fast (< 50ms) |
| `sourceClassificationMs` | 8 ms | Instantaneous |
| `sourceProcessingMs` | 42 ms | Sub-100ms |
| `previewGenerationMs` | 38 ms | Sub-100ms |
| `qaRunMs` | 19 ms | Sub-50ms |
| `publishMs` | 26 ms | Sub-50ms |
| `totalAutomationMs` | 147 ms | Ultra-low Latency |
| `totalTimeToFirstPreviewSeconds` | 0.11 s | Immediate (< 1s) |
| `timeToPublishSeconds` | 0.25 s | Immediate (< 1s) |
| `automationRate` | 91.3% (21/23 stages) | Highly Automated |
| `operatorTouchCount` | 0 touches (Auto Fast-Path) | Minimal Overhead |
| `operatorMinutes` | 0.0 mins (Managed Fast-Path) | High Efficiency |
