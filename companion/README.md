# XPIDER Privacy Relay Companion Service (R6.9G.10)

## Overview
The XPIDER Privacy Relay is a companion daemon providing a dedicated, loopback-authenticated proxy bridge between the XPIDER browser extension and an Owner-controlled egress node pool.

## Key Capabilities
1. **Zero-Manual-Launch UX (Windows)**:
   - Auto-starts silently on logon via Windows Startup registry/shortcut.
   - Native Messaging Host allows the browser extension to check status, start, or restart the service with zero terminal commands.
2. **Safe Rotation Modes**:
   - `FIXED`: Sticky node until manually changed.
   - `MANUAL`: Rotates on explicit Owner command.
   - `CAMPAIGN_BOUNDARY`: Rotates once at campaign start; remains strictly sticky throughout the campaign.
   - `HEALTH_FAILOVER`: Automatically selects next healthy egress node if current node drops.
3. **Fail-Closed Invariant**:
   - Traffic is never sent over Owner's direct network. If all egress nodes are unreachable or the relay is paused, outbound traffic is rejected with HTTP 502 / socket abort.
4. **Secret Redaction**:
   - Upstream credentials and raw IPs are never leaked in logs, control API responses, or diagnostic reports.

## Ports & Endpoints
- **Control API**: `http://127.0.0.1:18989` (GET `/health`, GET `/status`, POST `/rotate`, POST `/select`, POST `/mode`, POST `/pause`, POST `/resume`, POST `/stop`)
- **Forwarding Proxy**: `http://127.0.0.1:18988` (HTTP & HTTPS CONNECT)

## Installation (Windows)
Double-click `install_companion.bat` or run:
```powershell
node install_autostart.js
node install_native_host.js
wscript.exe start_relay_silent.vbs
```

## Uninstallation
Double-click `uninstall_companion.bat`.
