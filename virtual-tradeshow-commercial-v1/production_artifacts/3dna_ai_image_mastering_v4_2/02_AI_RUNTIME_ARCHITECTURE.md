# 02. AI RUNTIME ARCHITECTURE

## 1. Runtime Execution Environment
- **EXECUTION PROVIDER**: `CPUExecutionProvider`
- **FRAMEWORK**: `ONNX Runtime Node (v1.20+)`
- **RUNTIME ENGINE**: `Node.js v20+ V8 / Native C++ ONNX Addon`
- **GPU AVAILABILITY**: `GPU=false` (Truthfully aligned with Railway production container specifications)
- **MULTI-THREADING**: `OMP_NUM_THREADS / CPU_THREAD_PARALLEL`
- **MEMORY SAFETY**: Tiled buffer processing with bounded 224x224 execution footprint.
