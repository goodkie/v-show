# 3D2 Automatic PASS Lock

This system automatically freezes code only after a milestone item has been explicitly proven PASS by high-grade evidence.

## What gets auto-locked

A machine-readable evidence file under `server/qa/pass_evidence/` is eligible only when:

- `verdict` is exactly `PASS`
- evidence level is `PHYSICAL_PRODUCTION_VERIFIED`, `LIVE_PRODUCTION_VERIFIED`, or `OWNER_VISUAL_VERIFIED`
- production-scoped locks prove Production provenance
- the exact source commit and code paths are supplied

The lock captures the immutable source commit and SHA256 of every locked code path as it existed at that source commit.

## What never auto-locks

`FAIL`, `PENDING`, `NOT_PROVEN`, and `NEEDS_IMPROVEMENT` are never promoted.

Owner-gated acceptance fields (`OWNER_VISUAL_ACCEPTANCE`, `FULL_360_ACCEPTANCE`, `PANORAMA_ACCEPTANCE`) cannot become PASS unless evidence is `OWNER_VISUAL_VERIFIED` and `ownerExplicitApproval=true`.

## Immutability

Existing `*.LOCK.json` artifacts are never overwritten. A future phase may supersede a locked PASS only with new evidence; physical/Production PASS states may only be revoked by explicit new physical Production regression evidence.

## Automatic flow

1. A phase completes and produces a high-grade PASS result.
2. The phase writes a `server/qa/pass_evidence/<EVIDENCE_ID>.json` file.
3. On merge/push to `master`, GitHub Actions runs the legacy baseline regression test and the auto-lock policy test.
4. `auto_lock_milestone.py --promote-all` materializes immutable lock artifacts under `server/qa/milestones/auto/`.
5. The lock bot commits newly created lock artifacts back to `master`.

Future Antigravity directives must create PASS evidence for every independently proven code fix. Items still pending or visually unaccepted remain unlocked.
