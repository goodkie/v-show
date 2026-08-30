# 09_CHECK_VERIFICATION — STATUS QUERY & BACKGROUND POLLING

- **Explicit Button**: `#btn-check-verify-status` ("I'VE VERIFIED MY EMAIL / CHECK STATUS").
- **Background Auto-Polling**: Every 3 seconds while `#inline-verify-panel` is visible, the page polls `/api/free-funnel/email/poll-status?email=...`.
- **Seamless 1-Click Continuation**: When the customer clicks the magic confirmation link on their mobile device or secondary browser tab, the original tab auto-detects verification and triggers 3D booth creation immediately.
