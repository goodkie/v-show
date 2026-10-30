const { execSync } = require('child_process');
const fs = require('fs');
const body = `## [ANTIGRAVITY][ISSUE #6][RECEIPT: .94 HOTFIX (.93 REGRESSION) + OWNER DATA RECONCILIATION]

Responds to #6514864061. Stage 1 implementation has **not** started yet; this receipt covers a regression I found while reconciling data.

### 1. .93 regression — my defect, fixed in .94
- **Root cause:** my .93 patch to \`extension/content-script.js\` (fillAndSubmit, ~line 1957) referenced \`hasGenuineMessageField\`, a \`const\` that exists only inside \`fillFormIntelligent\`. Out-of-scope read => \`ReferenceError\` on every form => \`CORE_RUNTIME_BROKEN: hasGenuineMessageField\` (visible in the stored counters: 1 of 5 failures). \`node --check\` cannot detect this, so it passed.
- **Fix:** reference removed (autofill success already implies a filled genuine message field). Remaining uses are inside their own function.
- **Guard:** new \`test/test_no_new_undefined_identifiers.js\` (ESLint no-undef vs. a committed baseline of known pre-existing globals). Its first baseline run flagged \`hasGenuineMessageField\`, proving it detects this class of bug; baseline rebuilt from the fixed file and the test passes.
- **Regression suites:** .93 5/5, .92 4/4, .91 7/7, .90 5/5 PASS.
- **Release:** \`v6.9g.10.3-rc3.60.7.1.4.94\`, commit \`ebf2c7a3\`, new tag (no existing release/tag overwritten; .93 asset left as-is). ZIP \`XPIDER_R6.9G.10.3.7.1.4.94_OWNER_BETA.zip\`, 53,056,567 bytes, SHA256 \`570d7ffe28e83aecd2f9d2d65b6f5ffe6947f333145b9435115d1e8fdf15e861\`. ZIP content-script verified free of the bad reference. Live Chrome load of .94: UNVERIFIED (offline checks only). **Owner should not use .93.**

### 2. Owner data reconciliation (read-only; live profile untouched)
| Snapshot | Source | Content |
|---|---|---|
| A (earlier receipt) | Chrome Default, ext \`ldlijlaccfeelfdhgnjbibniocefckjj\` | run \`normal_run_1793331729467_y75m31\`: total 97, **92 remaining**, visited 5, paused 2026-10-30T03:44:31Z, history rows 198 / targets 99 |
| B (re-read now) | same live Chrome Default | identical to A (no newer write) |
| C | Chromium Default, same ext ID | old data: run \`owner_test_run_1792031664912_cjt4\`, queue 0, history rows 108 / targets 114, last saved 2026-10-15 |
- Edge: no XPIDER storage. Other Chrome profiles: none with XPIDER storage.
- **The 86-total / 73-pending / 13-completed (2 success, 6 failed, 5 skipped) run is not present in any browser profile on this PC.** => **OWNER_DATA_RECONCILIATION_REQUIRED.** Not a blocker for offline Stage 1. Nothing was rewritten (92 stays 92), merged, reset or sent.
- Likely explanations (UNVERIFIED): the run lives in a different Chrome profile/PC, or was cleared by a reset/restore before my snapshots. Owner action: tell me which PC/profile that screenshot came from, or use the app's own export/STOP&SAVE data from that profile.
- Snapshots B and C are DPAPI-encrypted (current Windows user) in local \`backups/RECON_20261030\` with SHA256 in \`RECON_REPORT.json\`; A is in \`MAJOR_BACKUP_20261030_from_93_4be780b4\`.

### 3. Next
Stage 1 (Start Automatic / Start Manual, internal API-CAPTCHA runtime removal with safe migration, offline fixtures) proceeds on a separate branch from tag \`major-backup-20261030-from-93\` + the .94 fix; live Chrome/profile/queue will not be touched.`;
fs.writeFileSync('scratch_receipt_94_recon.md', body, 'utf8');
console.log(execSync('gh issue comment 6 --body-file scratch_receipt_94_recon.md', { encoding: 'utf8' }).trim());
