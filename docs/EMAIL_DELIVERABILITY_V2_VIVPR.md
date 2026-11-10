# XPIDER Deliverability V2 — vivpr.pro / Resend / owner Windows PC

Status: DESIGN + POLICY CODE ONLY. NO PRODUCTION SEND. RELEASE HOLD.
Date: 2026-11-09. Base: feature/consent-based-email-delivery-20261109.
Goal: authorized service/transactional notices at 10k–50k/month, improved inbox placement by authentication, trust, recipient experience, and measurable reputation. No guarantee of inbox placement.

## Architecture
1. XPIDER operator UI (Windows): compose, classify, consent/legitimate relationship evidence, preview and explicit approval. Email Collector address alone is NEVER authorization to email.
2. Local Node companion (separate queue/store): consent & suppression records, immutable message ID/idempotency, verified per-hour quota, pauses, audit entries and delivery statuses.
3. Privacy Relay: unchanged local HTTP CONNECT proxy 127.0.0.1:18988 only for owner-machine HTTPS API connectivity. This is an IP privacy boundary, NOT a sending IP, reputation tool, or SMTP host. Fail closed on HTTP_407, quota exhausted, relay blocked, failed CONNECT/TLS; never silently downgrade to direct network or rotate residential IP to bypass controls.
4. Resend HTTPS API: provider verified vivpr.pro sending identity; API token stored in OS secure store/local process, never GitHub, Chrome extension, or telemetry. Provider sends from its shared, monitored IP pool. Do not use unowned SMTP host names. Optional own SMTP requires verified host/port/TLS and a separate adapter, NOT inferred from vivpr.pro.
5. Receiving systems: Gmail/Outlook assess provider source IP reputation, authenticated From domain, recipient response; no guaranteed inbox placement.
6. Signed provider webhooks on HTTPS endpoint with replay prevention update local queue state (provider accepted vs delivered vs bounced vs complained), suppression on hard bounce/complaint; provider dashboard event retrieval as safer fallback until webhook endpoint is owner controlled.

## Identity and authentication gates
- Verify domain ownership first; Resend provider status for vivpr.pro must be VERIFIED.
- SPF for sending Envelope-From/Return-Path, DKIM aligned with visible vivpr.pro From, DMARC record and alignment; verify received headers with real mailbox tests. Never publish guessed DKIM/CNAME/MX records, never remove existing inbound MX, never add second root SPF TXT record.
- From address e.g. notices@vivpr.pro is SAMPLE ONLY, not confirmed mailbox or selected sending identity. Stable sender identity for each category, Reply-To must be a monitored mailbox.
- Domain reputation monitoring: Google Postmaster Tools verified domain; provider bounce/complaint stats; weekly review; automatic stop on degraded signals.
- For subscription or marketing: RFC 8058 one-click unsubscribe POST + visible body URL + physical sender details and permission rationale. HTTPS unsubscribe endpoint must function and promptly suppress. For transactional: do not use fake marketing classification to evade requirements; respect opt-out as applicable.

## Abuse & authorization gate
- Resend AUP (2026-10-13): no cold outreach, purchased or scraped contacts; all recipients must explicitly opt in. XPIDER collector findings, website contact emails, scraped lists must NEVER feed Resend sends.
- Provider-specific policy enforced even when other laws might permit some individual B2B notices. Maintain explicit opt-in evidence for every recipient. Distinguish actual customer service/transactional from promotional content; when in doubt hold for review.
- Strict unsubscribe, suppression, bounces, complaint handling, no opt-out bypass.

## Queue and sending plan
- 10k/month ≈ 334/day average; 50k ≈ 1,667/day. These are volume planning figures, NOT guaranteed ramp speed. Do not start at full volume for a new sender. Begin with limited permitted test addresses, then gradually increase according to Resend and Postmaster feedback.
- Consistent rate rather than bursts. Per-recipient deduplication and provider idempotency keys; transient 429/5xx => capped exponential retry with backoff; permanent 4xx => never retry blindly.
- Circuit breakers for quota/HTTP_407, failed domain auth, provider limits, missing opt-out, complaint or bounce spikes.
- Do not treat HTTP 200/202 accepted as delivered or inboxed. Track provider accepted, delivered (if provider event), bounced, complained; inbox placement remains UNKNOWN unless directly tested.

## Local Storage, Concurrency, Unsubscribe POST & Signed Webhook Guarantees
- **Disk Encryption & Plaintext PII Restriction**: `companion/email-draft-outbox.js` stores local JSON only for development/testing. Storing real recipient PII on an unencrypted disk is prohibited; production deployment on Windows 10/11 requires OS disk encryption (BitLocker / DPAPI) and an independently verified consent ledger (`consentVerification: 'LEDGER_VERIFIED'`). Caller-supplied `authorized: true` alone is tagged `UNVERIFIED_CALLER_ASSERTION` and `sendEligible: false`.
- **Single-Writer Lock & Atomic Persistence**: Atomic temp-file rename alone does not prevent lost updates across concurrent instances. `DraftOutbox` enforces an exclusive `<file>.lock` with stale-lock recovery, reloads the latest committed disk state inside the lock before applying mutations, sweeps orphaned `.tmp` partial writes on startup, and rejects any payload or metadata containing API keys/secrets (`re_...`, `whsec_...`, `apiKey`, `proxyPassword`).
- **RFC 8058 One-Click Unsubscribe (`companion/email-unsubscribe-server.js`)**: Issues per-recipient HMAC-SHA256 tokens with key-rotation IDs (`kid`), 128-bit `jti` nonces, and expiration (`exp`). Raw email query/body parameters are rejected. `GET /unsubscribe/:token` never mutates state (preventing scanner/prefetch unsubscribes) and renders a confirmation form; `POST /unsubscribe/:token` with `List-Unsubscribe=One-Click` works without login, is idempotent on replay, and immediately suppresses the recipient and cancels pending drafts. Public HTTPS reachability on `vivpr.pro` remains `UNKNOWN` until Owner deployment.
- **Signed Resend Svix Webhook Intake (`companion/resend-webhook-intake.js`)**: Verifies `svix-id`, `svix-timestamp` (±300s window), and `svix-signature` (`v1,<base64>`) using `crypto.timingSafeEqual`, deduplicates replayed `svix-id` events on disk, keeps `ACCEPTED` (`email.sent`, `delivered: false`) strictly distinct from `DELIVERED` (`email.delivered`, `delivered: true`), immediately suppresses `BOUNCED` and `COMPLAINED` recipients in `DraftOutbox`, and prevents out-of-order events from downgrading terminal failure states.

## Before enablement (all must be evidenced)
[ ] Owner's vivpr.pro DNS access and Resend verified sending domain
[ ] Actual SPF/DKIM/DMARC values confirmed with non-secret read-only DNS records
[ ] Verified sender, monitored Reply-To, unsubscribe POST handler and suppression
[ ] Recipient authorization/opt-in evidence and list hygiene
[ ] Provider account approved, API credential securely installed only on Windows local process
[ ] Owner Privacy Relay READY and actual Resend CONNECT reachable; Decodo quota previously exhausted: currently BLOCKED unless owner restores legitimate service
[ ] Test suite and negative privacy/abuse tests actually executed with published receipt
[ ] Windows 10 owner backup/restore verification; staging test delivery to explicitly authorized addresses
[ ] Owner explicit go-live approval. Until then RELEASE HOLD.

References: https://support.google.com/mail/answer/81126 ; https://support.google.com/mail/answer/14229414 ; https://resend.com/features/dedicated-ips ; https://resend.com/legal/acceptable-use
