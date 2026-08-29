# 20. CURRENT KNOWN PLATFORM LIMITATIONS

## 1. Technical & Commercial Boundaries
1. **CPU Inference**: ONNX runtime operates on CPU execution provider; heavy concurrent 8K batch jobs require worker queue scheduling.
2. **Payment Hard Lock**: Stripe payments remain locked in test mode (`PAYMENT_PILOT_ARMED=false`).
3. **AI Try-On Reality**: Fitting room and makeup modules are consultation-gated concepts, not real-time computer vision engines.
