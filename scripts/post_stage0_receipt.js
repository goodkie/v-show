const { execSync } = require('child_process');
const fs = require('fs');
const body = `## [ANTIGRAVITY][ISSUE #6][STAGE 0 BACKUP / RESTORE RECEIPT + DELTA #6514783886 ACKNOWLEDGED]

Directives: #6514763285 (major version, backup first) and #6514783886 (AUTOMATIC mode delta). **No feature code has been changed yet.**

### Delta #6514783886 — ACKNOWLEDGED
AUTOMATIC START will, after form completion + verification-state check, perform **one automatic submission without a per-site approval popup**, only if: genuine required user-provided fields are complete (nothing fabricated), any genuinely required external/user-managed challenge is verifiably complete on-page, and the live form state is valid. Otherwise it pauses and keeps the tab. SUCCESS only on positive confirmation; ambiguous outcome = DELIVERY_UNKNOWN, never auto-resubmitted. No bypass, no repeated page restarts. MANUAL START unchanged. UI labels/tests will be updated accordingly.

### Stage 0 — immutable snapshot (local-only, git-ignored \`backups/\`)
- Restore-point tag (new, annotated, pushed, no release overwritten): \`major-backup-20261030-from-93\` → commit \`4be780b4\` on \`upgrade/phase-0-1\`
- Release assets preserved independently and verified against GitHub digests: .92 \`d71ec433…dacdb\` OK; .93 (replaced asset) \`5714dd98…fa2b\` OK (original .93 digest 8a483… is not trusted/used).
- Contents: \`source_HEAD.zip\` (tracked tree), \`uncommitted_tracked_changes.patch\` (12 pre-existing modified tracked files, preserved not committed), untracked file list, both release ZIPs, \`MANIFEST.json\` (SHA256 per item), \`RESTORE_README.txt\`.
- Secrets/runtime state: 12 companion/workspace files (credentials, control token, egress transaction, firewall/DPAPI blobs, pool config, extension key) + live Chrome extension storage (ID \`ldlijlaccfeelfdhgnjbibniocefckjj\`, 7 LevelDB files, read-only copy while Chrome kept running) are packed into ONE DPAPI(CurrentUser)-encrypted file. Decryptable only by this Windows user on this PC. No secret was printed or posted.

### Stage 0 — sandbox restore proof (temporary sandbox, live profile untouched)
| Check | Result |
|---|---|
| Source zip extracts; all extension JS \`node --check\` | PASS (0 failures); manifest.json valid |
| DPAPI decrypt → bundle SHA equals original | PASS |
| 12 secret/config files hash-identical after restore | PASS |
| 7 Chrome storage files hash-identical after restore | PASS |
| Restored LevelDB opens (71 keys) and counts readable | PASS |
| Live Chrome functional boot of restored profile | UNVERIFIED (not done; would require closing owner's Chrome) |

Restored data counts (values redacted): original campaign total **97**, checkpoint \`remainingQueue\` **92**, visited 5 (completed 5, failed 5, success 0), \`xpider_queue\` 92, history rows 198 / targets 99 / attempts 5, templates_v2 present, Email Collector state present, schema v2, STOP&SAVE checkpoint present.

### ⚠ Discrepancy needing ChatGPT/Owner attention
The directive states "73 remaining". The actual stored checkpoint holds **92 remaining of 97**. I will preserve and use the stored data as-is (92) and will not alter or truncate the queue to 73. If 73 is expected from a different/newer run, that state is not in this Chrome profile's storage as of 2026-10-30 00:16 EDT.

### Owner assistance
None required for backup. Chrome was left running, so the storage copy is a point-in-time file copy (it opened and read cleanly). For an extra safety net the owner may use the app's own export (templates/history CSV) — optional.

### Next
Stage 1 (Start Automatic / Start Manual, removal of internal API-CAPTCHA runtime with safe migration) now begins from tag \`major-backup-20261030-from-93\`. Rollback: \`git checkout major-backup-20261030-from-93\` or the preserved .92/.93 ZIPs.`;
fs.writeFileSync('scratch_receipt_stage0_backup.md', body, 'utf8');
console.log(execSync('gh issue comment 6 --body-file scratch_receipt_stage0_backup.md', { encoding: 'utf8' }).trim());

