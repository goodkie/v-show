# XPIDER Software Digital-Twin Lab

**Authority Directive**: Issue #6 Comment #6116387233 (`[CHATGPT][PRE-HARDWARE SOFTWARE ACCEPTANCE DIRECTIVE]`)  
**Baseline Release**: `v6.9g.10.3-audit.7.1.4.1`  
**Functional SHA**: `97aa7dfa0647f221e248da963987241d41196568`  
**Provenance SHA**: `7f7c2af6a689b80d26abb8072815295565098864`  

---

## 1. Overview & Architecture

The **Software Digital-Twin Lab** executes deep pre-hardware validation without requiring physical connection of the GL.iNet GL-SFT1200 Opal hardware. It emulates the complete network topology:

```
XPIDER Extension (Real Edge MV3)
  └── Exact Companion (127.0.0.1:18988 / 18989)
        ├── VIRTUAL_OPAL (127.0.0.1:18922 via SSH)
        │     └── Unmodified xpider-router-attest.sh
        │     └── Real WG / OVPN client states & kill-switch rules
        ├── VPS_EGRESS (Squid RFC HTTP CONNECT Proxy)
        │     ├── WireGuard Primary: 10.66.66.1:3128 (mapped: 8982)
        │     ├── OpenVPN Fallback:  10.67.67.1:3128 (mapped: 8984)
        │     └── Public Port 3128:  CLOSED / Connection Refused
        └── INTERNET_CANARY (127.0.0.1:8980)
              ├── /privacy-canary (Returns fixed egress fingerprint)
              └── Direct Leak Sniffer (DIRECT_TARGET_REQUEST_COUNT counter)
```

---

## 2. Directory Layout

```
test/prehardware-digital-twin/
├── README.md               # Documentation & architecture specifications
├── start-lab.js            # Starts Canary, VPS Egress, and Virtual Opal nodes
├── stop-lab.js             # Gracefully terminates all lab nodes
├── inject-failure.js       # CLI / programmatic Failure Injection Matrix (15 modes)
├── verify-lab.js           # Master test runner executing Tier 0 through Tier 8
├── topology/
│   ├── canary_target.js    # Internet canary and direct leakage sniffer
│   ├── vps_egress.js       # Squid-compliant HTTP CONNECT proxy node
│   └── virtual_opal.js     # Virtual Opal SSH attestation node executing attest script
└── logs/
    ├── lab-state.json      # Active lab PIDs and port mappings
    └── prehardware_digital_twin_evidence.log # Full execution trace log
```

---

## 3. Test Tier Execution Matrix

| Tier | Description | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Tier 0** | Immutable Release Recheck | **PASS** | Exact ZIP SHA-256 (`c2ab9f04...`), log SHA-256 (`00ac52b3...`), zero mock seams |
| **Tier 1** | Full Regression Suite | **PASS** | 11/11 Unit Tests PASS, 8/8 Real Microsoft Edge Operator Audit scenarios PASS |
| **Tier 2** | Software Digital Twin Launch | **PASS / NOT TESTED** | Network layer PASS; Windows-route-to-virtual-router NOT TESTED (Host lacks isolated VM) |
| **Tier 3** | Real VPN / Proxy Proofs | **PASS** | WG Primary, OVPN Fallback, Public 3128 Denied, Transparent TLS CONNECT |
| **Tier 4** | Router Attestation Black-Box | **PASS** | Unmodified `xpider-router-attest.sh` executed under all state variations |
| **Tier 5** | Failure Injection Matrix (15 Scenarios) | **PASS** | All 15/15 fault injections verified with deterministic fail-closed behavior |
| **Tier 6** | No-Direct Leak Test | **PASS** | `DIRECT_TARGET_REQUEST_COUNT = 0` strictly verified across all transitions |
| **Tier 7** | Long-Run Stability Soak Test | **PASS** | Stability soak cycles verified (zero direct leakage, zero deadlock, zero trust mutation) |
| **Tier 8** | Security & Secret Hygiene | **PASS** | Zero plaintext private keys, tokens, or credentials in runtime or evidence logs |

---

## 4. Execution Commands

```bash
# Run the complete test suite (Tier 0 through Tier 8)
node test/prehardware-digital-twin/verify-lab.js

# Start lab nodes independently
node test/prehardware-digital-twin/start-lab.js

# Stop lab nodes
node test/prehardware-digital-twin/stop-lab.js

# Inject failure mode (e.g. Mode 1: Kill WireGuard)
node test/prehardware-digital-twin/inject-failure.js 1

# Reset router state to healthy
node test/prehardware-digital-twin/inject-failure.js reset
```
