# Runtime Inspector Client SDK

The **Runtime Inspector Client SDK** is an optional, ultra-lightweight client utility that web applications can embed to voluntarily emit semantic domain events without manual reverse engineering.

## 1. Quick Install

Include in your HTML header:

```html
<script src="/path/to/runtime-inspector-sdk.js"></script>
```

## 2. Usage Examples

```javascript
// Emit business action events
RI.emit("ORDER", "CHECKOUT_INITIATED", { orderId: "ord-123", amount: 49.00 });

// Correlation IDs for multi-stage actions
const corrId = RI.createCorrelationId("GENERATE_BOOTH");
RI.emit("SPATIAL", "STAGE_1_EXTRACT", { photos: 3 }, { correlationId: corrId });
// ... later in the pipeline
RI.emit("SPATIAL", "STAGE_2_HOMOGRAPHY", { inliers: 54 }, { correlationId: corrId });

// Mark an immediate user problem
RI.markProblem("Canvas turned black after clicking Apply");
```

## 3. Production Safety
- **Zero Overhead**: When the extension is not inspecting, function calls return immediately in < 0.001ms.
- **Zero Cloud Leak**: Emits strictly into local browser buffers.
