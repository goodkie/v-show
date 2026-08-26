# 03. Video Playback Root Cause Analysis
- **Root Cause**:
  1. Browser Autoplay Policies: Modern browsers reject async unmuted/muted `play()` promises from `IntersectionObserver` if not directly tied to a user gesture.
  2. Range Streaming: Standard static handlers lacked explicit `206 Partial Content` chunking, causing seek/buffer stalls.
  3. UI Affordance: Absence of prominent manual play button left users stuck on blank/paused states when autoplay was blocked.
- **Remediation**: Implemented Shared Showcase Video Player with 206 streaming and glassmorphic user-gesture play overlays.