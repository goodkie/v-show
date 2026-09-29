# Stage 2 Non-Secret Activation-Readiness Matrix (R47)

**Document Version**: `R47_ACTIVATION_READINESS_MATRIX_V1`  
**Governance**: Stage 2 Fast Track Protocol / ChatGPT Round 46 Source Audit & Directives  
**Operating Status**: `OWNER_REVIEW_GATE=HOLD` | `ENGINEERING_HOLD=ACTIVE` | `ZERO_SPEND_DEFAULT`  
**Execution Status**: `ACTUAL_ENGINE_EXECUTION=NOT_VERIFIED` | `NEW_3D_MODEL_GENERATION=NOT_VERIFIED`  

---

## Executive Summary

Per ChatGPT Round 46 Audit / Round 47 Directives, the zero-spend / source-only track has saturated local file-lock hardening and reached the external resource boundary. This document specifies the non-secret **Activation-Readiness Matrix** for the smallest approved non-owner engine path, defining all five required architectural pillars for future activation without executing, provisioning, or incurring cost:

1. **Executable & Worker Identity**: Pinned binary identity, numeric semver floors, cryptographic SHA-256 bindings, and capability probes.
2. **Persistent Roots & Storage Mounts**: Strict isolation, read-only input confinement, transient workspaces, and static root non-overlap.
3. **Fail-Closed Configuration Schema**: Typed schemas, anti-placeholder secrets, path traversal defenses, and invariant boundaries.
4. **Bounded Resource Envelope**: Hardware VRAM, memory, time quotas, output caps, tree-termination mechanisms, and $0.00 spend ceiling.
5. **Deterministic Evidence Sequence**: Unbroken causal chain from non-owner inputs -> engine execution -> hash-bound PLY/SPZ -> Pro Viewer decode/render.

---

## Pillar 1: Required Executable / Worker Identity, Digest, Version & Capability

### 1.1 Smallest Approved Non-Owner Engine Path
- **Path Selection**: `LOCAL_PINNED_CLI_OR_EPHEMERAL_CONTAINER`
- **Rationale**: Minimal architectural surface, zero proprietary software licenses, zero cloud subscription commitments, and zero standing infrastructure overhead.

### 1.2 Canonical Executable Identities
| Component | Binary Target | Minimum Semver | License & Provenance | Capability Probe |
| :--- | :--- | :--- | :--- | :--- |
| **Structure-from-Motion (SfM)** | `colmap` / `colmap.exe` | `>= 3.8.0` | BSD-3-Clause (Johannes Schönberger) | `colmap -h`, `colmap --version` exiting 0 |
| **Gaussian Splatting (3DGS)** | `ns-train` / `ns-train.exe` (`splatfacto`) or `gsplat_train` | `>= 1.0.0` (Nerfstudio) / `>= 0.1.0` (gsplat) | Apache-2.0 (Nerfstudio / gsplat team) | `ns-train --help` exiting 0 |

### 1.3 Cryptographic Digest Binding
- Binary integrity is anchored in the infrastructure policy via mandatory SHA-256 hash environment variables:
  - `COLMAP_BINARY_SHA256`: Hex-encoded SHA-256 of the exact host or container binary.
  - `NSTRAIN_BINARY_SHA256`: Hex-encoded SHA-256 of the exact host or container binary.
- **Fail-Closed Guard**: Any mismatch between `crypto.createHash('sha256').update(fs.readFileSync(targetPath))` and the policy immediately aborts with `ERR_ADAPTER_BINARY_HASH_MISMATCH`.

### 1.4 Hardware Acceleration & Capability Probe
- **Target**: NVIDIA GPU with Compute Capability `>= 7.5` (Turing, Ampere, Ada Lovelace, Hopper).
- **Driver / CUDA Floor**: CUDA `>= 11.8`.
- **Probe Command**: `nvidia-smi -L` exiting 0 with detected GPU device.

---

## Pillar 2: Required Persistent Roots & Storage Mounts

| Root Identifier | Logical Role | Confinement & Access Policy | Overlap Defense |
| :--- | :--- | :--- | :--- |
| **`inputRoot`** | Source multi-position capture images (`.jpg`, `.jpeg`, `.png`) | Strictly read-only (`ro`); traversal protected via `validatePathConfinement` | Zero overlap with web static roots |
| **`scratchRoot`** | Ephemeral working tree (`SERVER_TRUSTED_WORKSPACE_BASE/<jobId>`) | Read-write; created dynamically per job; wiped or quarantined | Non-overlapping with `_clean_deploy`, `_railway_deploy`, `app_build`, `client/assets` |
| **`outputRoot`** | Staging vault for generated `.ply` and `.spz` assets | Write-once; immediate server-side SHA-256 digest derivation | Isolated tenant vault; token-authenticated access |
| **`databaseRoot`** | Ephemeral COLMAP SQLite database (`<scratchRoot>/colmap.db`) | Confined entirely inside `scratchRoot` | Prohibits access outside workspace boundary |

---

## Pillar 3: Exact Fail-Closed Configuration Schema & Invariants

### 3.1 Mandatory Environment Authorization Gates
```ini
RECONSTRUCTION_ADAPTER_AUTHORIZED=1
RECONSTRUCTION_ENTITLEMENT_SECRET=<vault_entropy_min_32_chars>
COLMAP_AUTHORIZED=1
COLMAP_BINARY_SHA256=<64_hex_sha256>
CUDA_VISIBLE_DEVICES=0
```

### 3.2 Typed Argv Enforcement (`TYPED_ARGV_SCHEMAS`)
- **Process Spawning**: Direct `execFile` with `shell: false` and `windowsHide: true`.
- **Prohibited Patterns**: Shell metacharacters (`|`, `&`, `;`, `$`), response file indirections (`@args.txt`), and duplicate argument flags.
- **Option Confinement**: Strictly validated against typed schemas (integer ranges, float ranges, enums, confined paths).
- **Environment Scrubbing**: Scrubbed via `getScrubbedProcessEnv()` to strip all API tokens, database keys, and application secrets.

### 3.3 Fail-Closed Invariant Table
| Fault / Trigger Condition | Fail-Closed Mechanism | Error Code |
| :--- | :--- | :--- |
| Missing or trivial (< 16 chars) secret | Immediate rejection before adapter creation | `ERR_ADAPTER_SECRET_NOT_PROVISIONED_OR_TRIVIAL` |
| Adapter flag unset (`!== '1'`) | Immediate rejection before adapter creation | `ERR_ADAPTER_FLAG_NOT_ENABLED` |
| Executable SHA-256 mismatch | Fails before process execution | `ERR_ADAPTER_BINARY_HASH_MISMATCH` |
| Semver version below floor | Fails before process execution | `ERR_ADAPTER_BINARY_VERSION_INCOMPATIBLE` |
| Path escapes scratch/input root | Path canonicalization & boundary check | `ERR_ADAPTER_PATH_TRAVERSAL_OR_UNCONFINED` |
| Execution wall-clock timeout exceeded | Forceful process tree termination (`taskkill` / `SIGKILL`) | `ERR_ADAPTER_TIMEOUT_QUOTA_EXCEEDED` |
| Input view count < 3 views | Pre-execution validation failure | `ERR_INSUFFICIENT_VIEWS` |
| Translation baseline < 0.05m | Parallax verification failure | `ERR_ZERO_BASELINE` |
| SfM or Splat divergence / NaN loss | Exit code non-zero; quarantine workspace | `ERR_RECONSTRUCTION_FAILED` |

---

## Pillar 4: Bounded Resource Envelope & Spending Ceiling

| Resource Dimension | Approved Ceiling | Enforcement Mechanism |
| :--- | :--- | :--- |
| **GPU VRAM** | 8 GB minimum floor; 16–24 GB ceiling | Pre-flight probe & PyTorch memory ceiling allocation |
| **Host System RAM** | 32 GB RAM ceiling (`34,359,738,368 bytes`) | OS process memory monitoring |
| **Wall-Clock Time Quota** | 1,800,000 ms (30 minutes max per job) | Node.js process supervisor timeout quota |
| **Max Process Buffer / Output** | 50 MB standard output / error buffer | `maxBuffer` parameter on child process spawn |
| **Scratch Disk Quota** | 20 GB temporary disk ceiling | Ephemeral scratch directory quota & post-run cleanup |
| **Process Tree Termination** | Zero lingering orphan processes | Windows `taskkill /PID <PID> /T /F`; POSIX group `SIGKILL` |
| **Current Spend Allocation** | **$0.00 USD** (`ZERO_SPEND_DEFAULT`) | Zero cloud instances provisioned, zero paid APIs |
| **Max Per-Job Budget** | Bounded at `<= $5.00 USD` (if authorized) | Hard runtime spend cap; requires affirmative owner authorization |

---

## Pillar 5: Deterministic End-to-End Evidence Sequence

When affirmative owner authorization is granted, the positive gate must satisfy this unbroken causal chain:

```
[1. Non-Owner Multi-Position Inputs (12 views, baseline > 0.05m)]
                          │
                          ▼
[2. Pinned Engine Verification (SHA-256 binary hash + semver floor)]
                          │
                          ▼
[3. Isolated Process Launch (Scrubbed env, shell=false, typed argv)]
                          │
                          ▼
[4. Authentic SfM & 3DGS Execution (Sparse points -> Radiance splats)]
                          │
                          ▼
[5. Newly Generated Output Hashing (Server-side hash(PLY), hash(SPZ))]
                          │
                          ▼
[6. Strict PLY / SPZ Schema Validation (248-byte stride, valid headers)]
                          │
                          ▼
[7. Pro 3D Viewer Ingestion (Serve exact byte stream & hash)]
                          │
                          ▼
[8. Pro Viewer Optical Proof (WebGL/WebGPU render: Front/Left/Top proofs)]
                          │
                          ▼
[9. Machine-Verifiable Receipt (Head-bound linkage of all hashes & proof)]
```

### Critical Integrity Invariant
- **Failure states cannot count as PASS**: If any step in the sequence fails (zero matches, divergence, timeout, hash mismatch, decode failure), the pipeline immediately halts fail-closed, records an explicit `FAIL` in the ledger, and quarantines the workspace.

---

## Current Status & Next Actions

- **Current State**:
  - `OWNER_REVIEW_GATE=HOLD`
  - `ENGINEERING_HOLD=ACTIVE`
  - `ZERO_SPEND_DEFAULT=ENFORCED`
  - `ACTUAL_ENGINE_EXECUTION=NOT_VERIFIED`
- **Rule of Engagement**:
  - Do NOT provision, connect, spend, deploy, contact owner, or run an engine without explicit authorization.
  - Zero private credentials, customer data, or internal tokens disclosed.
