<!-- ANTIGRAVITY_RECEIPT: DIRECTIVE_6699808184 -->
### [ANTIGRAVITY -> CHATGPT / OWNER][RECEIPT][Issue #6][DIRECTIVE #6699808184 TRANSACTIONAL UPDATE + RESTORABLE BACKUP + INTERRUPTION MATRIX]

Functional source: `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree identical at documentation HEAD `15d0cca0a4a98b84a0dee3f4afba2819b1ea1e40`; verified with git diff = empty). Branch `candidate/p0-core-regressions-v7`. **RELEASE HOLD.** Nothing applied to any owner install; disposable temp dirs/profiles only; localhost fixture only (0 POSTs asserted); IVCS untouched.

#### Corrections to my previous receipt (#6699788220)
1. **EXPORT OWNER DEBUG BUNDLE is NOT a backup.** Measured: sanitized output != storage.local (e.g. Email Collector entries not retained), no restore function exists in popup.js. My earlier recommendation of it as the backup prerequisite is withdrawn.
2. **Delivery is not authentication-gated:** `gh repo view` reports `goodkie/v-show` = PUBLIC. Anonymous download of `https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` returned 4,467,833 bytes with SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e` (matches). Note: the artifact is therefore publicly reachable on the branch (audited: no secrets). The ZIP embeds timestamps, so a rebuild changes its hash; per-file hashes are in dist/PACKAGE_INVENTORY_SHA256.json.

#### Item 1 - Transactional updater (`scripts/xpider_safe_update.js`) - 31/31 PASS
Report: `dist/report_safe_update_transaction.json` (cmd: `node test/run_safe_update_transaction_tests.js`, exit 0). Flow: `plan` (dry run, target unchanged, prints PLAN_TOKEN) -> separate `apply --approve <token>` -> verified full-tree backup -> temp+rename writes -> post-verify -> auto-rollback; `rollback`/`recover` commands. Verifies archive SHA, ZIP entry names, manifest key->ID (target AND candidate), exact 50-file inventory in staging. Removes baseline-only files only if listed in the baseline manifest, byte-identical, and backed up; unknown user files untouched (tested). Refuses --skip-backup, symlink/junction, drift after preview.
Negative/failure cases PASS: no approval, wrong token, skip-backup, corrupted archive (sha mismatch AND matching-sha-but-unreadable), wrong ID target/candidate, missing manifest target/candidate, extra unlisted file, tampered file, ZIP slip, junction, missing target, drift after preview, access denied (read-only file), disk-full (**simulated ENOSPC injection**, not a real full disk), staging fault, post-verify fault, crash mid-commit (exit 88, journal COMMITTING) -> `recover` byte-identical, crash during rollback (exit 77) -> `recover` byte-identical.

#### Items 2+3 - Browser layer (`test/run_backup_restore_parity_harness.js`) - 28/28 PASS
Report: `dist/report_backup_restore_parity.json` (exit 0). Disposable Edge profiles, sentinel data (templates_v2, CSV queue lists, paused checkpoint with queue, settings, history, run ledger/submittedTargets, Email Collector, secret sentinel never printed).
- Verified backup path: close browser, copy `<profile>\Default\Local Extension Settings\ldlij...` (5 files, 5,819 B, plaintext incl. credentials). Restore into a fresh profile: all 12 seeded keys hash-identical; checkpoint still paused with 2-item queue; **no campaign launched** (0 fixture tabs, 0 POSTs). No extension IndexedDB exists on disk (nothing else to back up).
- Real updater applied to an install dir bound to the profile: running background.js hash == candidate (no stale code); all keys identical; ledger submittedTargets 3 / history 2 (no duplicates); no auto launch. Downgrade via `rollback`: tree identical to RC11, running code == RC11, keys identical. Crash mid-commit: install dir proven split before recovery, `recover` -> RC11 tree, running code RC11, keys identical, no auto launch. Keyless target (fork risk) refused.

#### Item 4 - Owner guide
`dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md` (exact hash, source revision, verified URL, backup/plan/apply/rollback/recover). Owner self-service of the updater needs Node.js 18+; if absent -> **BLOCKED** (manual folder-copy backup only; do not hand-overlay the ZIP).

#### Gate table
| Gate | Status |
|---|---|
| Updater dry-run/apply/rollback/recover (sim. FS) | PASS |
| Failure/negative matrix incl. crash+recover | PASS (disk-full = simulated) |
| Backup->fresh profile->restore parity (Edge, storage.local) | PASS |
| Same-ID upgrade/downgrade/interrupt on real browser profile | PASS (Edge) |
| Owner Debug Bundle as backup | FAIL (withdrawn) |
| Delivery of ZIP | PASS (public repo; hash verified) - Owner decides if public exposure acceptable |
| Chrome (non-Edge) profile backup/restore | NOT_TESTED |
| Selective/global reset UI flows | NOT_TESTED |
| Windows 10 owner desktop smoke / real NopeCHA / Decodo-DO IP-DNS-IPv6-WebRTC | NOT_TESTED |
| Owner approval to apply on live install | NOT GIVEN |
