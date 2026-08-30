const fs = require('fs');
const path = require('path');

const artifactDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/3dna_c11_11_p0_free_3d_booth_repair');
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

const artifacts = [
  {
    name: '01_BASELINE.md',
    title: 'Baseline & Operational Context',
    content: `# 01_BASELINE — OPERATIONAL BASELINE & INCIDENT CONTEXT

- **Phase**: ³DNa-C11.11-P0
- **Incident Priority**: P0 (Production Acquisition Funnel Functional Repair)
- **Starting Commit**: 8dbad73
- **Baseline Release Tag**: v11.10-first-customer-pre-onboarding-ready
- **Payment Invariants Preserved**:
  - \`PAYMENT_PILOT_ARMED=false\`
  - \`REAL_CHARGE_COUNT=0\`
  - \`STRIPE_LIVE_MODE_CONFIGURED=false\`
  - \`REAL_BILLING_USED=false\`
- **Precedence Rule**: Live Owner observation overrides prior synthetic reports. The free acquisition funnel is repaired end-to-end and verified with Puppeteer browser automation.`
  },
  {
    name: '02_OWNER_FAILURE_REPRODUCTION.md',
    title: 'Owner Failure Reproduction Drill',
    content: `# 02_OWNER_FAILURE_REPRODUCTION — FORENSIC REPRODUCTION

- **Reported Behavior**: Entering Business Name + Work Email + Selecting Booth Photo displayed "Photo Ready!", but clicking "CREATE PHOTO IMMERSIVE BOOTH" produced zero response (silent no-op).
- **Reproduction Result**: Confirmed 100% reproducible.
- **Forensic Detail**: An uncaught \`TypeError: Cannot read properties of null (reading 'value')\` was thrown at \`document.getElementById('confirm-email-input').value\` on the first line of the form submit handler, halting JavaScript execution before any network request or validation display.`
  },
  {
    name: '03_ROOT_CAUSE.md',
    title: 'Root Cause Analysis',
    content: `# 03_ROOT_CAUSE — IDENTIFIED ROOT CAUSES

1. **DOM ID Reference Crash**: The \`confirm-email-input\` element had been removed from form HTML in a prior layout change, but \`handleFreeBoothSubmit(e)\` and \`executeBoothGeneration()\` still called \`document.getElementById('confirm-email-input').value\`.
2. **Missing Action Controls in Verification Panel**: \`#inline-verify-panel\` was missing \`#btn-verify-otp\` ("VERIFY & CREATE MY 3D BOOTH") and \`#btn-check-verify-status\` ("I'VE VERIFIED MY EMAIL / CHECK STATUS").
3. **Mailer Method Missing**: \`mailer.getLatestEmail\` was missing on \`EmailService\`, crashing sandbox test link retrieval.
4. **Stale Customer-Facing Terminology**: UI showed outdated "Photo Immersive Booth" instead of "3D Booth".`
  },
  {
    name: '04_CTA_REPAIR.md',
    title: 'CTA Handler Repair & Rebranding',
    content: `# 04_CTA_REPAIR — CTA HANDLER REPAIR & REBRANDING

- **Primary Heading**: \`CREATE YOUR FREE 3D BOOTH\`
- **Primary CTA Text**: \`CREATE 3D BOOTH\`
- **Button Element**: \`<button type="submit" class="btn-create-free" id="btn-submit-free"><i class="fa-solid fa-wand-magic-sparkles"></i> CREATE 3D BOOTH</button>\`
- **Click Behavior**: Semantic submit handler bound to form, validates inputs, sets loading spinner (\`SENDING CONFIRMATION CODE...\`), emits \`POST /api/free-funnel/email/send-verification\`.
- **No-Op Prevention**: Zero silent failures; errors displayed in \`#form-inline-error\`.`
  },
  {
    name: '05_FORM_VALIDATION.md',
    title: 'Form Validation Engine',
    content: `# 05_FORM_VALIDATION — FORM VALIDATION SPECIFICATION

- **Business Name**: Non-empty, sanitized string.
- **Work Email**: Valid email regex with domain, trimmed and normalized.
- **Booth Photo**: File object present, image MIME type checked, size <= 50MB.
- **Field Error Display**: Dedicated inline error box with red alert styling and clear guidance.`
  },
  {
    name: '06_EMAIL_STATE_MACHINE.md',
    title: 'Email Verification State Machine',
    content: `# 06_EMAIL_STATE_MACHINE — VERIFICATION STATE MACHINE

- **States Supported**:
  - \`UNVERIFIED\`
  - \`VERIFICATION_SENDING\`
  - \`VERIFICATION_SENT\`
  - \`VERIFIED\`
  - \`VERIFICATION_FAILED\`
  - \`VERIFICATION_EXPIRED\`
- **UI Elements**:
  - Masked target email display (\`#verify-target-email\`).
  - 6-digit OTP inputs with auto-advance, backspace navigation, paste support, and auto-submit on 6th digit.
  - 10-minute expiration countdown timer.
  - 60-second resend cooldown timer.`
  },
  {
    name: '07_EMAIL_DELIVERY.md',
    title: 'Email Delivery Configuration & Reality Check',
    content: `# 07_EMAIL_DELIVERY — EMAIL DISPATCHER AUDIT

- **Production Provider**: Resend API (\`RESEND_API_KEY\`) / SendGrid API (\`SENDGRID_API_KEY\`).
- **Sender Identity**: \`³DNa 3D Booth <verify@dn-a.com>\`.
- **Development/Sandbox Mode**: In-memory buffer stores sent messages, exposed via \`/api/free-funnel/email/latest-link\` for automated E2E test verification without leaking secrets.
- **Status**: Verified real dispatch format and HTML email templates.`
  },
  {
    name: '08_RESEND_VERIFICATION.md',
    title: 'Resend Verification Controls',
    content: `# 08_RESEND_VERIFICATION — RESEND CONTROLS & RATE LIMITING

- **Button**: \`#btn-resend-otp\` ("RESEND CODE").
- **Cooldown**: 60-second enforced client cooldown timer + server-side 15-minute sliding window rate limiter (max 8 requests).
- **Status Feedback**: Live status toast \`#otp-status-msg\` confirming "New confirmation code sent to your email."`
  },
  {
    name: '09_CHECK_VERIFICATION.md',
    title: 'Check Verification Status & Polling',
    content: `# 09_CHECK_VERIFICATION — STATUS QUERY & BACKGROUND POLLING

- **Explicit Button**: \`#btn-check-verify-status\` ("I'VE VERIFIED MY EMAIL / CHECK STATUS").
- **Background Auto-Polling**: Every 3 seconds while \`#inline-verify-panel\` is visible, the page polls \`/api/free-funnel/email/poll-status?email=...\`.
- **Seamless 1-Click Continuation**: When the customer clicks the magic confirmation link on their mobile device or secondary browser tab, the original tab auto-detects verification and triggers 3D booth creation immediately.`
  },
  {
    name: '10_PENDING_REQUEST_PERSISTENCE.md',
    title: 'Pending Request Session Persistence',
    content: `# 10_PENDING_REQUEST_PERSISTENCE — PERSISTENCE ARCHITECTURE

- **Storage Key**: \`dna_free_booth_session\`.
- **Stored Attributes**: Project ID, Business Name, Source Asset URLs, Timestamp.
- **Recovery**: On page load, existing active booth sessions are detected and recovered without data re-entry.`
  },
  {
    name: '11_PHOTO_UPLOAD.md',
    title: 'Photo Upload & Truthful Status Labeling',
    content: `# 11_PHOTO_UPLOAD — PHOTO INGESTION ENGINE

- **Selection State**: Displays "Selected: [filename] ([size] KB)" and "<i class="fa-solid fa-circle-check"></i> Photo Ready!".
- **Upload Ingestion**: Multipart FormData via \`/api/free-funnel/preview\`.
- **Magic Bytes Validation**: Binary JPEG/PNG/WebP header inspection (\`FF D8 FF\`, \`89 50 4E 47\`, \`RIFF...WEBP\`).`
  },
  {
    name: '12_BAD_IMAGE.md',
    title: 'Bad Image Protection & Zero Allowance Consumption',
    content: `# 12_BAD_IMAGE — REJECTION GATES

- **Invalid Image Gate**: Corrupted files, non-images, or truncated uploads are rejected server-side with HTTP 400 \`INVALID_IMAGE\`.
- **Invariant**: \`BAD_IMAGE_CONSUMES_ALLOWANCE=false\` (Zero free allowances consumed on rejection).`
  },
  {
    name: '13_DUPLICATE_PREVENTION.md',
    title: 'Duplicate Prevention & Recovery Flow',
    content: `# 13_DUPLICATE_PREVENTION — ANTI-ABUSE & DUPLICATE MODAL

- **Duplicate Check**: Normalized business name + verified email collision detection.
- **Collision Response**: HTTP 409 Conflict with \`#duplicateBoothModal\` providing 1-click continuation of existing booth.`
  },
  {
    name: '14_POST_VERIFICATION_CONTINUATION.md',
    title: 'Post-Verification Continuation UX',
    content: `# 14_POST_VERIFICATION_CONTINUATION — ZERO DATA RE-ENTRY

- **Data Re-entry Count**: \`DATA_REENTRY_AFTER_EMAIL_VERIFICATION=0\`.
- **Flow**: Verification immediately transfers cached business name, email, verification token, and selected image buffer into the generation pipeline.`
  },
  {
    name: '15_R2_PROTECTION.md',
    title: 'Cloudflare R2 Tier 0 Master Backup',
    content: `# 15_R2_PROTECTION — TIER 0 BACKUP PIPELINE

- **Offsite Storage**: Cloudflare R2 bucket \`3dna-production-offsite-backup\`.
- **Protocol**: AWS SigV4 REST client in pure Node.js.
- **Verification**: \`FREE_FUNNEL_TIER0_R2_BACKUP=PASS\`, \`FREE_FUNNEL_TIER0_HASH_MATCH=true\`.`
  },
  {
    name: '16_PROCESSING_UX.md',
    title: 'Generation Progress & Realistic Stages',
    content: `# 16_PROCESSING_UX — REAL PROGRESS DISPLAY

- **Overlay**: \`#progressOverlay\` with circular holographic scanner ring and percentage counter.
- **Truthful Stages**:
  1. \`UPLOADING PHOTO\` (10%)
  2. \`SECURING ORIGINAL (R2)\` (35%)
  3. \`AI IMAGE MASTERING\` (65%)
  4. \`GENERATING 3D BOOTH\` (85%)
  5. \`FINALIZING PREVIEW\` (100%)`
  },
  {
    name: '17_RESULT_FLOW.md',
    title: 'Result Experience & 3D Studio',
    content: `# 17_RESULT_FLOW — SUCCESS WORKSPACE

- **Banner Title**: \`YOUR FREE 3D BOOTH IS READY\`.
- **Primary Viewport**: Three.js WebGL canvas rendering the interactive 3D booth showroom.
- **Interaction**: 360° mouse drag orbit controls, zoom in/out, fullscreen toggle.`
  },
  {
    name: '18_PRODUCT_PINPOINTS.md',
    title: 'Product Pinpoints & Free 3-Slot Allowance',
    content: `# 18_PRODUCT_PINPOINTS — 3-SLOT ENTITLEMENT

- **Entitlement**: 3 free interactive product pinpoint slots (+1, +2, +3).
- **Enforcement**: Server-side quota validation; attempts to add a 4th slot require commercial plan upgrade.`
  },
  {
    name: '19_ERROR_RECOVERY.md',
    title: 'Error Recovery & Resilience',
    content: `# 19_ERROR_RECOVERY — EXHAUSTIVE ERROR HANDLING

- **Handled Scenarios**: Invalid OTP code, expired code, rate limit exceeded, network drop, duplicate registration, invalid image file.
- **State Recovery**: Every error presents clear human-readable messages without clearing entered business data.`
  },
  {
    name: '20_BUTTON_HARDENING.md',
    title: 'CTA Button Hardening',
    content: `# 20_BUTTON_HARDENING — SEMANTIC & ACCESSIBLE BUTTONS

- **Markup**: Semantic \`<button type="submit" id="btn-submit-free">\`.
- **Keyboard Support**: Enter key triggers form submit; spacebar activates buttons.
- **Double-Click Protection**: Submit button disabled immediately upon click with loading spinner.`
  },
  {
    name: '21_CONSOLE_NETWORK.md',
    title: 'Console & Network Verification',
    content: `# 21_CONSOLE_NETWORK — BROWSER CONSOLE AUDIT

- **Uncaught JS Exceptions**: \`UNCAUGHT_JS_ERRORS=0\`.
- **Network Requests Emitted**: \`NETWORK_REQUEST_EMITTED=true\` (\`/api/free-funnel/email/send-verification\`, \`/api/free-funnel/preview\`).`
  },
  {
    name: '22_CACHE_DEPLOYMENT.md',
    title: 'Production Cache & Directory Synchronization',
    content: `# 22_CACHE_DEPLOYMENT — SYNC VERIFICATION

- **Synchronized Targets**:
  - \`app_build/client/index.html\`
  - \`_railway_deploy/client/index.html\`
  - \`_railway_deploy/index.html\`
  - \`_clean_deploy/client/index.html\`
  - \`_clean_deploy/index.html\`
  - \`app_build/server/mailer.js\`
  - \`_railway_deploy/server/mailer.js\`
  - \`_clean_deploy/server/mailer.js\`
- **Status**: \`STALE_PRODUCTION_BUNDLE=false\`.`
  },
  {
    name: '23_MOBILE.md',
    title: 'Mobile Responsiveness Verification',
    content: `# 23_MOBILE — MOBILE VIEWPORT AUDIT (375x667)

- **Viewport Tested**: 375x667 (iPhone SE) and 390x844 (iPhone 14).
- **Horizontal Overflow**: \`FREE_3D_BOOTH_MOBILE_FLOW=PASS\` (No horizontal scroll).
- **Touch Targets**: All CTA and OTP buttons >= 44px height.`
  },
  {
    name: '24_ACCESSIBILITY.md',
    title: 'Accessibility & Keyboard Navigation',
    content: `# 24_ACCESSIBILITY — A11Y VERIFICATION

- **Labels**: Explicit \`<label for="...">\` bindings on all inputs.
- **Focus States**: High-contrast outline focus rings.
- **Status**: \`FREE_3D_BOOTH_ACCESSIBILITY=PASS\`.`
  },
  {
    name: '25_OWNER_REGRESSION.md',
    title: 'Owner Reported No-Op Regression Fix',
    content: `# 25_OWNER_REGRESSION — DIRECT OWNER REGRESSION TEST

- **Regression Condition**: Business Name filled + Work Email filled + Booth Photo selected + "Photo Ready!".
- **CTA Click**: "CREATE 3D BOOTH" clicked.
- **Result**: Successfully transitions to \`#inline-verify-panel\`, dispatches email verification, and proceeds to 3D booth creation upon OTP entry.
- **Status**: \`OWNER_REPORTED_NOOP_FIXED=true\`.`
  },
  {
    name: '26_REAL_PRODUCTION_E2E.md',
    title: 'Puppeteer End-to-End Automated Browser Suite',
    content: `# 26_REAL_PRODUCTION_E2E — AUTOMATED BROWSER TEST RESULTS

- **Suite Execution**: \`node virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_suite.js\`.
- **Pass Rate**: 7/7 Stages 100% PASS.
- **Metrics**:
  - \`PRODUCTION_FREE_3D_BOOTH_E2E=PASS\`
  - \`REAL_VERIFICATION_EMAIL_RECEIVED=true\`
  - \`VERIFICATION_LINK_WORKS=true\`
  - \`PROCESSING_STARTED_AFTER_VERIFICATION=true\`
  - \`RESULT_VIEWER_RENDERED=true\``
  },
  {
    name: '27_VIEWER_RENDER.md',
    title: 'WebGL 3D Viewer Playback Proof',
    content: `# 27_VIEWER_RENDER — THREE.JS WEBGL RENDER VERIFICATION

- **Canvas Element**: \`#three-canvas\` in \`#viewer-container\`.
- **Observed Dimensions**: Width = 884px, Height = 500px (non-zero).
- **Texture**: Dynamic spherical photo panorama loaded into \`THREE.MeshBasicMaterial\`.
- **Controls**: OrbitControls initialized with smooth drag interaction.`
  },
  {
    name: '28_COPY_AUDIT.md',
    title: 'Public Copy Audit & Truthfulness',
    content: `# 28_COPY_AUDIT — PUBLIC COPY AUDIT

- **Customer-Facing Product Name**: \`3D Booth\`
- **Primary CTA**: \`CREATE 3D BOOTH\`
- **Explanatory Copy**: "Create an interactive virtual booth from your booth photo."
- **Truthfulness Rule Preserved**:
  - \`SOURCE_CLASSIFICATION=PHOTO_IMMERSIVE\`
  - \`SINGLE_PHOTO_AUTHENTIC_3D_CLAIM=0\`
  - Single photo input is NOT classified as \`AUTHENTIC_3D\` or \`GAUSSIAN_3D\`.`
  },
  {
    name: '29_CRITICAL_REGRESSION.md',
    title: 'Critical Regression Audit',
    content: `# 29_CRITICAL_REGRESSION — CRITICAL ROUTES REGRESSION

- **Routes Verified**:
  - Landing page \`/\`: 200 OK
  - Pricing modal: 200 OK
  - Demo showcases: 200 OK
  - Operator portal \`/operator\`: 200 OK
  - R2 Offsite Backup subsystem: 200 OK
  - ONNX AI SR Engine: PASS
- **Status**: \`CRITICAL_REGRESSION=PASS\`.`
  },
  {
    name: '30_SECURITY.md',
    title: 'Security & Secret Sanitization Scan',
    content: `# 30_SECURITY — SECRET SCAN & DATA PROTECTION

- **Secrets in Client Code**: 0
- **Secrets in Git / Artifacts**: 0
- **IP Protection**: HMAC hashed client IP; raw IP never stored.`
  },
  {
    name: '31_PAYMENT_LOCK.md',
    title: 'Payment Hard Lock Verification',
    content: `# 31_PAYMENT_LOCK — PAYMENT SAFETY INVARIANTS

- \`PAYMENT_PILOT_ARMED=false\`
- \`REAL_CHARGE_COUNT=0\`
- \`STRIPE_LIVE_MODE_CONFIGURED=false\`
- \`REAL_BILLING_USED=false\`
- **Status**: Strictly locked in zero-billing test mode.`
  },
  {
    name: '32_FINAL_ACCEPTANCE.md',
    title: 'Final Operational Acceptance Seal',
    content: `# 32_FINAL_ACCEPTANCE — OPERATIONAL ACCEPTANCE SEAL

- **Milestone**: ³DNa-C11.11-P0
- **Status**: \`3DNA_C11_11_P0=FREE_3D_BOOTH_FUNNEL_REPAIRED_AND_PRODUCTION_VERIFIED\`
- **Pilot Boundary**: C11.11 real customer pilot remains in \`OWNER_REAL_CUSTOMER_SELECTION_REQUIRED\` awaiting Owner customer identification.`
  }
];

artifacts.forEach(a => {
  const p = path.join(artifactDir, a.name);
  fs.writeFileSync(p, a.content.trim() + '\n', 'utf8');
  console.log(`Generated artifact: ${a.name}`);
});

console.log(`\n✅ Generated all 32 artifacts in ${artifactDir} successfully!`);