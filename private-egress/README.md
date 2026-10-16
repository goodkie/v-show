# XPIDER Private Egress Stack

Protocol: OCA-DEV-1.4 (Issue #6 R6.9G.10.3)
Target OS: Ubuntu 22.04 / 24.04 LTS, Debian 11 / 12

## Overview
The XPIDER Private Egress stack establishes an isolated, Owner-controlled HTTP CONNECT proxy over TLS on a remote VPS (e.g. DigitalOcean Ultra Economy $6/mo tier).

## Security & Architectural Invariants
1. **Strict TLS Listener (Port 8443)**: All traffic between XPIDER Companion and the proxy is protected with TLS.
2. **Pinned CA Trust Model**: Private CA generated during bootstrap. Client certificate validation against the pinned CA cert ensures zero dependence on public domain names or DNS while maintaining RFC 5280 strict certificate verification (`rejectUnauthorized: true`).
3. **Authenticated CONNECT**: Unauthenticated requests receive `407 Proxy Authentication Required` and are immediately closed.
4. **Zero Open Proxy**: Binds with firewall default-deny.
5. **Fail-Closed**: If the proxy is unreachable or authentication fails, XPIDER halts. Zero silent fallback to DIRECT mode.
6. **Telemetry & Health**:
   - `GET /_health`: Unauthenticated health check.
   - `GET /_telemetry`: Authenticated CPU, RAM, swap, and active tunnel telemetry for evidence-based upgrade recommendations.

## Files
- `proxy-service.js`: Dedicated Node.js TLS proxy and telemetry daemon.
- `bootstrap.sh`: Idempotent automated installer.
- `uninstall.sh`: Clean teardown and rollback script.
- `rotate_credentials.sh`: Live credential rotation with SIGHUP.
- `healthcheck.sh`: Local status check probe.
