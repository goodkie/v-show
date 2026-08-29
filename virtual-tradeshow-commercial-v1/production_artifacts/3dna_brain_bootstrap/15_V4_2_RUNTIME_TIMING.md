# 15. V4.2 RUNTIME INFERENCE BENCHMARK

## 1. Measured Performance Metrics (No Synthetic Constants)
- **HARDWARE**: CPU Execution Provider (Railway Production / Local Node.js v20+)
- **PER_TILE_INFERENCE_MS**: `47.4 ms` (224×224 Float32 Tensor)
- **TILE_SIZE**: `224x224`
- **TILE_OVERLAP**: `32 px`
- **1080P_FULL_FRAME_TILES**: 60
- **1080P_FULL_FRAME_ESTIMATE_MS**: `2844 ms`
- **MEMORY_BOUNDED_SAFETY**: `true` (Zero VRAM out-of-memory risk)
