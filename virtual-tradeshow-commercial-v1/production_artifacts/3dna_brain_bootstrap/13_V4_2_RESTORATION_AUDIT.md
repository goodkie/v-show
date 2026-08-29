# 13. V4.2 RESTORATION MODEL AUDIT

## 1. Truthful Engine Classification
- **RESTORATION_IS_INDEPENDENT_NEURAL_STAGE**: `false`
- **RESTORATION_ACTUAL_MODEL**: `super_resolution_subpixel_v4_2.onnx (ESPCN Architecture / Algorithmic Pipeline Integration)`
- **RESTORATION_ACTUAL_HASH**: `85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`
- **AUDIT FINDING**: The pipeline utilizes the ESPCN sub-pixel model for neural super-resolution and combines algorithmic bilateral and deblocking filters for noise attenuation. No separate distinct restoration neural model binary is executed.
