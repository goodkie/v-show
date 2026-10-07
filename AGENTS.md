# OCA-DEV-1.4 Workspace Guardrails

PROJECT_ID: goodkie/v-show:issue4
PROJECT_NAME: 3D2 Panorama Fast Track
WORKSPACE_ROOT: c:\Users\server4\ai\v-show-stage2-fast-track
AUTHORITY_SOURCE: https://github.com/goodkie/v-show/issues/4
ACTIVE_BRANCH: fix/panorama-capture-rotation-repair-round119
PROTOCOL: OCA-DEV-1.4

## Hard Boundary
- Work only inside WORKSPACE_ROOT unless Owner explicitly authorizes otherwise.
- Do not mix requirements, files, comments, or evidence from other projects.
- One active project per agent session.

## Startup
1. Read .oca/SESSION_CAPSULE.md.
2. Verify workspace + branch.
3. Search this project/workspace for prior work and reconstruct the latest valid state.
4. Fetch authority delta after AUTHORITY_CURSOR when available.
5. Reconcile recovered state with the latest accepted gate/audit.
6. Continue the existing NEXT_ACTION immediately unless a real conflict exists.

## Execution
- ChatGPT decides architecture, acceptance criteria, remediation direction, and gates.
- Antigravity autonomously implements, tests, diagnoses, remediates, proves, commits/pushes when appropriate, and posts the final Receipt.
- An accepted Directive remains active until completed, blocked by a true dependency, superseded, or cancelled.
- Do not wait for Owner/ChatGPT reminders between ordinary substeps.
- Do not delegate unfinished engineering verification to Owner.
- Automatically report material progress, real blockers, faults/rollbacks, and final completion.
- Prefer action over repeated status discussion.

## Shutdown
Update CURRENT_STATE.md and SESSION_CAPSULE.md after meaningful state changes.

