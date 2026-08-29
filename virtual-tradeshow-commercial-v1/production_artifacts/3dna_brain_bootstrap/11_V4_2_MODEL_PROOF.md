# 11. V4.2 ONNX MODEL EXECUTION PROOF

## 1. Neural Model Identification
- **MODEL_FILE**: `super_resolution_subpixel_v4_2.onnx`
- **FILE_SIZE**: `240078 bytes`
- **SHA256**: `85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`
- **ARCHITECTURE**: ESPCN (Efficient Sub-Pixel Convolutional Neural Network, 4 Conv Layers)
- **FRAMEWORK**: `ONNX Runtime Node`
- **EXECUTION_PROVIDER**: `CPUExecutionProvider`
- **ONNX_GRAPH_VALID**: `true`
- **INPUT_NODE**: `input` ([1, 1, 224, 224])
- **OUTPUT_NODE**: `output` ([1, 1, 672, 672])
- **NATIVE_NEURAL_SCALE**: `3.0x`
- **REAL_ONNX_INFERENCE_EXECUTED**: `true`
