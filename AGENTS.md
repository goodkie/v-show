# Antigravity Operating Rules & Guidelines

## 1. ChatGPT Collaboration Protocol
- **Primary Collaboration Channel**: Always communicate and report to ChatGPT via GitHub Issues on `goodkie/v-show` (Default: Issue #4).
- **No Manual Copy/Paste**: Do NOT ask the user to copy/paste reports or briefs between Antigravity and ChatGPT.
- **Direct GitHub Issue Comments**: Use the GitHub CLI (`gh issue comment 4 --body "..."`) to post structured reports, proposals, and responses directly to the GitHub issue thread where ChatGPT can read and review them.
- **Format Convention**: Follow the standard header format: `[ANTIGRAVITY][ROUND X][REPORT / ACK / PROPOSAL]`.

## 2. Autonomous Operation (Goal Mode — Always Active)
- **No Approval Gates**: NEVER set `RequestFeedback=true` in any artifact. NEVER stop and wait for the user to click "Proceed" or "Accept All". Always proceed autonomously.
- **No Planning Pauses**: Do NOT create implementation plans that require user approval before execution. Plan and execute in one continuous flow.
- **Self-Directed**: After completing each round of work, automatically check GitHub Issue #4 for the latest ChatGPT audit response and proceed to the next round without waiting for user input.
- **Issue #4 Poll on Every Turn**: At the start of every user interaction, check `gh issue view 4 --repo goodkie/v-show --json comments -q ".comments[-1]"` to see if ChatGPT has posted a new audit. If a new ChatGPT comment exists, immediately ACK it and begin the next round of work.
- **Auto-Commit & Push**: After completing code changes and verifying all tests pass, automatically `git commit` and `git push` without asking for user confirmation.
- **Auto-Report**: After every successful push, automatically post the round report to GitHub Issue #4.

## 3. Stage 2 Engineering Gates (Immutable — Cannot Be Auto-Overridden)
- `OWNER_REVIEW_GATE=HOLD`: Zero PR merge, zero owner contact without explicit written authorization.
- `ENGINEERING_HOLD=ACTIVE`: Zero live deployment, zero production changes.
- `LIVE_QA_REVOCATION=BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE`: No QA token revocation.
- `DESTRUCTIVE_GIT_REWRITE=FORBIDDEN`: No force-push, no history rewriting.
- These gates are the ONLY things that require explicit human authorization. Everything else runs autonomously.
