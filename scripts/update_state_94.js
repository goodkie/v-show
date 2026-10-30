const fs = require('fs');
let p = '.oca/SESSION_CAPSULE.md', s = fs.readFileSync(p, 'utf8');
const set = (k, v) => { s = s.replace(new RegExp('^' + k + ':.*$', 'm'), k + ': ' + v); };
set('STATE_REV', '2026-10-30.244');
set('AUTHORITY_CURSOR', '6514864061');
set('BUILD_ID', 'R6.9G.10.3.7.1.4.94-20261029-P0-RC3.60-SCOPE-ERROR-HOTFIX-PASS');
set('RELEASE_ASSET_TAG', 'v6.9g.10.3-rc3.60.7.1.4.94');
set('RELEASE_ASSET_ZIP', 'XPIDER_R6.9G.10.3.7.1.4.94_OWNER_BETA.zip');
set('RELEASE_ASSET_SIZE', '53056567');
set('RELEASE_ASSET_SHA256', '570d7ffe28e83aecd2f9d2d65b6f5ffe6947f333145b9435115d1e8fdf15e861');
set('NEXT_ACTION', 'Stage 1 (Start Automatic/Manual, remove internal API-CAPTCHA runtime) on separate branch from major-backup-20261030-from-93 + .94 fix. OWNER_DATA_RECONCILIATION_REQUIRED for 86/73 run (not in any local profile). Do not use .93. Receipt #6515848744.');
fs.writeFileSync(p, s);
p = 'CURRENT_STATE.md'; s = fs.readFileSync(p, 'utf8');
s = s.replace(/- State Rev: .*/, '- State Rev: 2026-10-30.244')
  .replace(/- Build ID: .*/, '- Build ID: `R6.9G.10.3.7.1.4.94-20261029-P0-RC3.60-SCOPE-ERROR-HOTFIX-PASS`')
  .replace(/- Verified Release Asset: .*/, '- Verified Release Asset: `XPIDER_R6.9G.10.3.7.1.4.94_OWNER_BETA.zip` (Tag: `v6.9g.10.3-rc3.60.7.1.4.94`, 53,056,567 bytes, SHA256: `570d7ffe28e83aecd2f9d2d65b6f5ffe6947f333145b9435115d1e8fdf15e861`); .93 has a CORE_RUNTIME_BROKEN regression - do not use.');
fs.writeFileSync(p, s);
