# 05. CPU ONNX PRODUCTION CAPACITY

## 1. Measured Benchmarks
- **MODEL**: `super_resolution_subpixel_v4_2.onnx` (ESPCN 4-Layer Conv)
- **EXECUTION_PROVIDER**: `CPUExecutionProvider`
- **TILE_INFERENCE_P50**: `50.90 ms`
- **TILE_INFERENCE_P95**: `64.32 ms`
- **NORMAL_PHOTO_P50_TIME**: `3.05 seconds` (60 tiles)
- **NORMAL_PHOTO_P95_TIME**: `3.86 seconds`
- **DAILY_ESTIMATED_SAFE_THROUGHPUT**: `~1,200 images/day`
- **PROCESS_MEMORY_RSS**: `125.55 MB`
