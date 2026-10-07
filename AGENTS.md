# OCA-DEV-1.3 Workspace Guardrails

PROJECT_ID: xpider-autoform-sender-pro
PROJECT_NAME: XPIDER AutoForm Sender Pro
WORKSPACE_ROOT: E:\\vivpr\\ai\\extension-form-sender
AUTHORITY_SOURCE: goodkie/v-show Issue #6
ACTIVE_BRANCH: upgrade/phase-0-1
PROTOCOL: OCA-DEV-1.3

## Hard Boundary
- Work only inside WORKSPACE_ROOT unless the Owner explicitly authorizes otherwise.
- Do not mix requirements, files, comments, or evidence from other projects.
- One active project per agent session; this project may continue across unlimited new ChatGPT/Antigravity windows.

## Session Start — Fast Path
1. Read `.oca/SESSION_CAPSULE.md`.
2. Verify workspace root and active branch.
3. Fetch only Issue #6 events newer than `AUTHORITY_CURSOR` when available.
4. Continue `NEXT_ACTION` immediately unless a real conflict exists.
5. Read `CURRENT_STATE.md` or deeper history only when needed.

## Role Split
- Owner: intent, credentials/budget/destructive approval, final human smoke only.
- ChatGPT: architecture, sequencing, independent audit, gate decisions.
- Antigravity: implementation, integration/runtime testing, evidence, rollback execution.
- Do not delegate unfinished engineering verification to Owner.

## Communication
- Full project bind is required once per new session, not every turn.
- Use formal [CHATGPT]/[ANTIGRAVITY]/[OWNER] prefixes only for durable Issue #6 messages.
- Prefer action over repeated status reporting.

## Session End
After meaningful state changes:
1. update `CURRENT_STATE.md`;
2. update `.oca/SESSION_CAPSULE.md`;
3. post to Issue #6 only for Directive / Receipt / Audit / Gate / Decision / material Blocker.
