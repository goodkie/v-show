#!/usr/bin/env python3
"""Materialize immutable PASS locks from machine-readable evidence files.

Only evidence explicitly marked PASS and backed by physical/live production or
owner-visual verification is lockable. FAIL/PENDING/NOT_PROVEN states are never
promoted. Existing locks are immutable. Code hashes are taken from the evidence
source commit, never from the current checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SERVER = Path(__file__).resolve().parents[1]
POLICY_PATH = SERVER / "qa" / "milestones" / "AUTO_LOCK_POLICY.json"
EVIDENCE_DIR = SERVER / "qa" / "pass_evidence"
LOCK_DIR = SERVER / "qa" / "milestones" / "auto"


def git_head() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_at_commit(commit: str, relpath: str) -> str:
    data = subprocess.check_output(["git", "show", f"{commit}:{relpath}"], cwd=ROOT)
    return hashlib.sha256(data).hexdigest()


def validate_evidence(ev: dict, policy: dict) -> None:
    required = ["evidenceId", "milestone", "verdict", "evidenceLevel", "sourceCommit", "codePaths", "lockedItems"]
    missing = [k for k in required if not ev.get(k)]
    if missing:
        raise ValueError(f"missing required evidence fields: {missing}")
    if ev["verdict"] != policy["lockOnlyVerdict"]:
        raise ValueError(f"not lockable verdict: {ev['verdict']}")
    if ev["evidenceLevel"] not in policy["allowedEvidenceLevels"]:
        raise ValueError(f"insufficient evidence level: {ev['evidenceLevel']}")
    if ev.get("productionScoped", False) and not ev.get("productionProvenanceVerified", False):
        raise ValueError("production-scoped PASS lacks verified production provenance")
    owner_fields = set(policy.get("ownerGatedFields", []))
    if any(k in owner_fields and v is True for k, v in ev.get("lockedItems", {}).items()):
        if not (ev.get("evidenceLevel") == "OWNER_VISUAL_VERIFIED" and ev.get("ownerExplicitApproval") is True):
            raise ValueError("owner-gated PASS cannot auto-lock without explicit owner verification")


def materialize(ev_path: Path, policy: dict) -> Path:
    ev = load_json(ev_path)
    validate_evidence(ev, policy)
    source_commit = ev["sourceCommit"]
    current = git_head()
    subprocess.check_call(["git", "cat-file", "-e", f"{source_commit}^{{commit}}"], cwd=ROOT)

    hashes = {}
    for rel in ev["codePaths"]:
        try:
            hashes[rel] = sha256_at_commit(source_commit, rel)
        except subprocess.CalledProcessError as exc:
            raise ValueError(f"code path missing at source commit {source_commit}: {rel}") from exc

    lock = {
        "schemaVersion": 1,
        "lockType": "IMMUTABLE_PASS_CODE_LOCK",
        "evidenceId": ev["evidenceId"],
        "milestone": ev["milestone"],
        "verdict": "PASS",
        "evidenceLevel": ev["evidenceLevel"],
        "sourceCommit": source_commit,
        "materializedFromHead": current,
        "productionScoped": bool(ev.get("productionScoped", False)),
        "productionProvenanceVerified": bool(ev.get("productionProvenanceVerified", False)),
        "ownerExplicitApproval": bool(ev.get("ownerExplicitApproval", False)),
        "lockedItems": ev["lockedItems"],
        "codePaths": ev["codePaths"],
        "codeSha256": hashes,
        "evidence": ev.get("evidence", {}),
        "regressionRevocationPolicy": policy["regressionRule"],
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "immutable": True
    }

    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    out = LOCK_DIR / f"{ev['evidenceId']}.LOCK.json"
    if out.exists():
        existing = load_json(out)
        comparison = dict(lock)
        for k in ["createdAtUtc", "materializedFromHead"]:
            existing.pop(k, None)
            comparison.pop(k, None)
        if existing != comparison:
            raise ValueError(f"immutable lock conflict: {out}")
        return out
    out.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("evidence", nargs="?", help="one PASS evidence JSON")
    ap.add_argument("--promote-all", action="store_true")
    args = ap.parse_args()
    policy = load_json(POLICY_PATH)
    if args.promote_all:
        paths = sorted(EVIDENCE_DIR.glob("*.json"))
        if not paths:
            print(json.dumps({"AUTO_LOCK_PASS": True, "locks": [], "note": "no evidence files"}, indent=2))
            return 0
    else:
        if not args.evidence:
            ap.error("provide evidence JSON or --promote-all")
        paths = [Path(args.evidence)]
    outputs = [str(materialize(p, policy)) for p in paths]
    print(json.dumps({"AUTO_LOCK_PASS": True, "locks": outputs}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
