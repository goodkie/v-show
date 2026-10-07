# OCA-DEV-1.3 Workspace Guardrails

PROJECT_ID: goodkie-v-show
PROJECT_NAME: v-show
WORKSPACE_ROOT: c:\Users\server4\ai\v-show-stage2-fast-track
AUTHORITY_SOURCE: https://github.com/goodkie/v-show/issues/4
ACTIVE_BRANCH: fix/panorama-capture-rotation-repair-round119
PROTOCOL: OCA-DEV-1.3

## Hard Boundary
- Work only inside WORKSPACE_ROOT unless Owner explicitly authorizes otherwise.
- Do not mix requirements, files, comments, or evidence from other projects.
- One active project per agent session.

## Startup
1. Read .oca/SESSION_CAPSULE.md.
2. Verify workspace + branch.
3. Fetch authority delta after AUTHORITY_CURSOR when available.
4. Continue NEXT_ACTION immediately unless a real conflict exists.

## Execution
- ChatGPT decides architecture/gates.
- Antigravity implements/tests/proves.
- Do not delegate unfinished engineering verification to Owner.
- Prefer action over repeated status discussion.

## Shutdown
Update CURRENT_STATE.md and SESSION_CAPSULE.md after meaningful state changes.
