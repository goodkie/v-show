# OCA-DEV-1.4 Workspace Guardrails

PROJECT_ID: xpider-autoform-sender-pro
PROJECT_NAME: XPIDER AutoForm Sender Pro
WORKSPACE_ROOT: E:\\vivpr\\ai\\extension-form-sender
AUTHORITY_SOURCE: goodkie/v-show Issue #6
ACTIVE_BRANCH: upgrade/phase-0-1
PROTOCOL: OCA-DEV-1.4

## Hard Boundary
- Work only inside WORKSPACE_ROOT unless the Owner explicitly authorizes otherwise.
- Do not mix requirements, files, comments, or evidence from other projects.
- One active project per agent session; this project may continue across unlimited new ChatGPT/Antigravity windows.

## Session Start — Mandatory Continuity Recovery
NEW WINDOW != NEW PROJECT
NEW WINDOW -> RECOVER CURRENT PROJECT -> CONTINUE EXISTING WORK
1. Read `.oca/SESSION_CAPSULE.md`.
2. Verify WORKSPACE_ROOT and active branch (`upgrade/phase-0-1`).
3. Search this project/workspace for prior work before starting anything new.
4. Recover the latest valid implementation state from CURRENT_STATE/HANDOVER, git status + relevant recent commits, current source/runtime files, receipts, evidence, tests, build/provenance, blockers, and unfinished tasks.
5. Fetch Issue #6 events newer than `AUTHORITY_CURSOR` when available.
6. Reconcile recovered workspace state with the latest accepted ChatGPT Gate/Audit.
7. Continue the existing `NEXT_ACTION` from the recovered state. Do not restart completed work merely because this is a new window.
8. Read deeper history only if a conflict or missing dependency requires it.

### Antigravity Continuity Command
Search the current WORKSPACE_ROOT for prior project materials and prior work before proceeding. Recover the latest implementation state, recent source changes, state files, handovers, receipts, evidence, tests, builds, branches/commits, and unfinished tasks that belong to this project. Reconstruct the most recent valid working context and continue the existing work from that point. Do not start over, create a parallel replacement, or ask the Owner to repeat information that can be recovered from the current project folder/repository.

### ChatGPT Continuity Command
Search the currently bound project for prior project materials and prior work before proceeding. Recover the latest requirements, decisions, accepted/rejected gates, working files, prior outputs, evidence, blockers, active branch/build state, and unfinished next actions from project files/knowledge, Issue #6, repository/connectors, and recoverable prior project context. Reconstruct the latest valid project state and continue that work from the same point. Do not treat a new chat as a blank project and do not ask the Owner to repeat recoverable information.

## Role Split & Collaboration Loop
- Owner: intent, credentials/budget/destructive approval, final human acceptance only. Not routine project manager.
- ChatGPT: architecture, sequencing, acceptance criteria, consolidated directives, independent audit, gate decisions.
- Antigravity: autonomous execution of active Directive:
  RECOVER STATE -> IMPLEMENT -> TEST -> DIAGNOSE -> SELF-REMEDIATE -> RE-TEST -> COLLECT EVIDENCE -> VERIFY BUILD/REMOTE -> UPDATE STATE -> POST RECEIPT.
- Do not delegate unfinished engineering verification or debugging to Owner.

## No-Chase Invariant
- ACTIVE DIRECTIVE + NO TRUE BLOCKER = ANTIGRAVITY CONTINUES AUTONOMOUSLY.
- RECEIPT POSTED = CHATGPT AUDITS TO GATE.
- OWNER SILENCE != STOP.
- OWNER SILENCE != DESTRUCTIVE / CREDENTIAL / BILLING / LEGAL / PUBLIC-RELEASE APPROVAL.

## Session End & State Maintenance
After meaningful state changes:
1. Update `CURRENT_STATE.md`;
2. Update `.oca/SESSION_CAPSULE.md`;
3. Post to Issue #6 for Directive / Receipt / Audit / Gate / Decision / material Blocker / Progress / Test-Package.

## Response Completion Marker Invariant
- CRITICAL / MANDATORY: Whenever any task, work, briefing, or posting is completely finished, ALWAYS include and display the special character 🟪 in the final response.

## IVCS AI Declaration — Owner Intervention Only When Unavoidable (2026-11-17)
- ChatGPT and Antigravity must perform all work within their available authority and capabilities themselves. Never instruct the Owner to execute any implementation, debugging, tests, deployment, configuration, investigation, evidence collection, or status reporting that Antigravity can perform.
- ChatGPT coordinates and audits; Antigravity independently recovers context, executes, self-remediates, tests, deploys where authorized, and reports results. Do not replace autonomous execution with a copy/paste task list for the Owner.
- Ask the Owner only at a genuine non-delegable blocker: personal login/MFA, account linking or credentials authorization, payment or spending approval, legally required consent, access-grant approval, destructive action approval, or final live-release acceptance. Explain the exact minimal action, why automation is impossible, and what was already attempted.
- Before escalating, check existing permissions, integrations, automation routes, non-secret environment configuration, and recoverable project context. Never request passwords, access tokens, or other secrets in public GitHub issues/comments or chat messages.
- An Owner-dependent step does not stop unrelated autonomous work. Record the blocker in IVCS with evidence and continue all other executable tasks. Do not claim completion, deployment, or verified success without supporting evidence.
- Exception / explicit ownership boundary: IVCS Manager's own scheduling, automatic synchronization, memory recovery, and IVCS state maintenance remain ChatGPT-only responsibilities; do NOT delegate them to Antigravity. XPIDER engineering and deployment may be delegated to Antigravity.
- This declaration takes precedence over older task instructions that ask the Owner to perform delegable work, while preserving approval gates, privacy, security, and release HOLD controls.
