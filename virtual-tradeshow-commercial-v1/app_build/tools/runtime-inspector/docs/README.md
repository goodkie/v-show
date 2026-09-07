# Runtime Inspector (RI) — Universal Web Application Runtime Diagnostics

**Runtime Inspector (RI)** is a reusable, browser-based runtime diagnostic platform engineered for pair-programming and automated incident resolution with Owner + ChatGPT.

Unlike single-use diagnostic scripts or monolithic app extensions, Runtime Inspector is architected into three distinct layers:
1. **Universal Core**: Zero application-specific knowledge. Captures console, network, unhandled exceptions, canvas/WebGL state, DOM actions, storage metadata, and performance.
2. **App Adapters**: Pluggable domain modules (e.g. `3DZ Adapter`, `Restaurant SaaS Adapter`, `AR Fitting Adapter`).
3. **Delivery Channels**: Unpacked Chrome Extension, Main-world Page Bridge, or Embedded Client SDK (`runtime-inspector-sdk.js`).

---

## Key Features

- **Generic Fallback Mode**: Functions automatically on ANY web application even without an adapter or embedded SDK.
- **Strict Secret Redaction**: Central multi-tier engine (STRICT / STANDARD / INTERNAL) scrubbing Bearer tokens, JWTs, cookies, passwords, and sensitive query strings.
- **Export Pre-Flight Scanner**: Blocks diagnostic bundle generation if suspected live credentials or unredacted keys are detected.
- **ChatGPT Optimized Report**: Produces a standardized `summary.txt` and `diagnostic.json` structured for direct consumption by LLMs to yield immediate, single-shot repair solutions.
- **Automatic Failure Stage Detection**: Traces user interactions through network requests and visual render updates to pinpoint the exact failing stage (e.g., `FIRST_FAILED_STAGE = RENDER`).
- **User Problem Marker**: One-click timestamped bookmarks with optional annotations during reproduction runs.
