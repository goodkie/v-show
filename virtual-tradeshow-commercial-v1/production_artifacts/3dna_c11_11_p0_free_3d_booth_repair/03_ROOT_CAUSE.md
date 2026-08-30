# 03_ROOT_CAUSE — IDENTIFIED ROOT CAUSES

1. **DOM ID Reference Crash**: The `confirm-email-input` element had been removed from form HTML in a prior layout change, but `handleFreeBoothSubmit(e)` and `executeBoothGeneration()` still called `document.getElementById('confirm-email-input').value`.
2. **Missing Action Controls in Verification Panel**: `#inline-verify-panel` was missing `#btn-verify-otp` ("VERIFY & CREATE MY 3D BOOTH") and `#btn-check-verify-status` ("I'VE VERIFIED MY EMAIL / CHECK STATUS").
3. **Mailer Method Missing**: `mailer.getLatestEmail` was missing on `EmailService`, crashing sandbox test link retrieval.
4. **Stale Customer-Facing Terminology**: UI showed outdated "Photo Immersive Booth" instead of "3D Booth".
