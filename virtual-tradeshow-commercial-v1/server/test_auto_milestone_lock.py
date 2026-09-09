#!/usr/bin/env python3
import json
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER / 'qa'))

from auto_lock_milestone import validate_evidence  # noqa: E402

policy = json.loads((SERVER / 'qa' / 'milestones' / 'AUTO_LOCK_POLICY.json').read_text(encoding='utf-8'))
evidence = json.loads((SERVER / 'qa' / 'pass_evidence' / 'C12_9_P2R13_CODE_PASS.json').read_text(encoding='utf-8'))

validate_evidence(evidence, policy)
assert evidence['verdict'] == 'PASS'
assert evidence['evidenceLevel'] == 'LIVE_PRODUCTION_VERIFIED'
assert evidence['productionProvenanceVerified'] is True
assert evidence['lockedItems']['CANDIDATE_ID_PASSTHROUGH'] == 'PASS'
assert evidence['lockedItems']['PYTHON_SUBSET_FILTER_APPLICATION'] == 'PASS'
assert evidence['lockedItems']['WORKER_TIMEOUT_60MIN_FOR_LLST42'] == 'PASS'
assert evidence['ownerExplicitApproval'] is False

bad = dict(evidence)
bad['lockedItems'] = dict(evidence['lockedItems'])
bad['lockedItems']['OWNER_VISUAL_ACCEPTANCE'] = True
try:
    validate_evidence(bad, policy)
    raise AssertionError('owner-gated PASS was incorrectly auto-lockable')
except ValueError:
    pass

bad2 = dict(evidence)
bad2['verdict'] = 'PENDING'
try:
    validate_evidence(bad2, policy)
    raise AssertionError('PENDING verdict was incorrectly auto-lockable')
except ValueError:
    pass

print('AUTO_MILESTONE_LOCK_TEST=PASS')
