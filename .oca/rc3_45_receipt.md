[ANTIGRAVITY][IMPLEMENTATION-RECEIPT][ISSUE-6][RC3.45-FIREWALL-GUARDIAN][T+0 PHASE]

Directives addressed: #6362473624, #6362505721. Development session IS active (Antigravity IDE, workspace E:\vivpr\ai\extension-form-sender, branch upgrade/phase-0-1).

## Implemented (commit ceafa445784b8d9575ecb4d668970f8c21e72e6d, in-place, no rewrite)
- `companion/firewall-guardian.js` — DO Cloud Firewall guardian: DPAPI-stored PAT (existing `winsec`, real DPAPI roundtrip verified on this PC), multi-source public-IPv4 detection (>=2 sources must agree; private/loopback/CGNAT rejected), writes ONLY a single `<ip>/32` for inbound TCP 8443, removes SSH 22 / world-open rules, preserves outbound/droplets/tags, post-write GET verification, single-flight mutex, bounded exponential backoff (429/5xx/network), 401/403 => `TOKEN_INVALID` fail-closed with no retry.
- `companion/firewall-guardian-ui.js` + `setup_firewall_guardian.bat` — LOCAL-ONLY one-time PAT entry (127.0.0.1, one-time nonce URL, token validated against DO `/v2/account` and stored via DPAPI; never in GitHub/chat/logs/status API). Revoke-local button included.
- `companion/privacy-relay-service.js` — guardian reconciles BEFORE the startup egress probe, then every 60 s; new authenticated `GET /firewall-guardian/status` and `POST /firewall-guardian/reconcile` (token is never accepted or returned there).
- `.gitignore` excludes PAT/state files.

## Tests (MOCK/simulated — no real DO calls, no credentials)
`node test/test_rc3_45_firewall_guardian.js` => ALL 16 PASS: IP validation, 0.0.0.0/0 refusal, 2-source IP quorum, token format/401/403 on set, IP rotation update + SSH closure + outbound preserved + idempotent re-run, NO_TOKEN, revoked token (401/403), 429 backoff success and exhaustion, PUT failure, verify mismatch, unverified IP no-write, race single-flight, local revoke.
Relay syntax check: `node --check` OK. Not yet run: the existing relay integration suite (companion/test_privacy_relay.js hangs on service start — pre-existing, not yet diagnosed).

## Real vs simulated — exact verified status
- REAL: DPAPI roundtrip; real TCP probe to 143.198.40.33:8443 from owner PC => NOT reachable. Current public IP = 74.39.42.139 (firewall still scoped to prior CIDR).
- SIMULATED only: all provider interactions (firewall GET/PUT, 401/403/429).
- NOT DONE: real firewall update, TCP/TLS/CONNECT/exit-IP canary, Relay READY, authorized owned-fixture genuine submit through relay, new ZIP. Gate must stay HOLD.

## NEED_OWNER_ACTION (one-time, ~1 minute, credential-dependent only)
1. DigitalOcean > API > Generate New Token > Custom Scopes: `firewall:read`, `firewall:update`, `account:read` only (no droplet/write scopes). Expiry: owner's choice.
2. Double-click `E:\vivpr\ai\extension-form-sender\companion\setup_firewall_guardian.bat` — a local browser page opens; paste token there (NOT in chat/GitHub). It validates, stores via DPAPI, and immediately syncs firewall d6fd3a95-d9d9-417d-9d27-c6b57e94240a 8443 to the current IP /32.
After that no manual /32 updates are needed on IP rotation.

Continuing without credentials: diagnosing relay integration test, owned-fixture E2E (pre-submit) regression, release packaging prep. Will post only substantive results.
