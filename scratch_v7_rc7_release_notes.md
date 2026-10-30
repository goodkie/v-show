# XPIDER v7.0.0-rc7 Dual-Mode Owner Beta

## Overview
Release v7.0.0-rc7 addresses the two critical P0 runtime and visual defects identified by the Owner and ChatGPT Directive (`Comment #6524894891` follow-up):
1. **Runtime Build Handshake Mismatch Resolved**: Fixed a subtle type-coercion defect in `verifyBuildHandshake()` and `START_CAMPAIGN` where `localInfo.manifestVersion || 3` was compared against `bgInfo.manifestVersion` (`undefined`). `Number(undefined)` evaluated to `NaN`, causing `3 === NaN` to evaluate to `false` even when both popup and background Service Worker shared identical `buildId` and `implementationHead`. Manifest version comparison now safely coerces `Number(version || 3)`, completely eliminating the false `⚠️ RUNTIME BUILD MISMATCH — RELOAD EXTENSION` banner.
2. **Generous URL Row Clearance (Zero Clipping)**: Fixed row height, line height, and box-sizing of `.file-urls-preview` and `.preview-item`. Previously, an implicit `18.6px` row height with `12px` vertical padding left only `6.6px` for `13.12px` monospace font, cutting off upper and lower characters with horizontal borders. In RC7, `.preview-item` has an explicit `height: 36px !important; line-height: 20px !important; font-size: 12px !important; padding: 6px 12px !important; display: flex !important; align-items: center !important;`. Full characters and ascenders/descenders (`g`, `y`, `p`, `j`, `q`) are rendered with generous breathing room and zero horizontal clipping across actual side-panel widths (360px - 450px).
3. **Build Provenance Badge Parity**: Updated badge formatting regex to recognize `V7.0.0-RC7` properly, eliminating the legacy `R6.9G` fallback. Badge displays `OWNER BETA V7.0.0-RC7 [8ab1f93b]` cleanly.
4. **100% Package & Installed Folder Parity**: All 9 key extension files share identical SHA256 hashes between the packaged ZIP asset, root `extension/`, and active unpacked directory `XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension`.

## Package Provenance
- **ZIP Asset**: `XPIDER_V7.0.0_RC7_DUAL_MODE_OWNER_BETA.zip`
- **ZIP SHA256**: `786e708e7e4539b018c86b80172927f5dc1d9f6ae9b666f80bac7a2c221aa929`
- **ZIP Size**: `53,066,667 bytes`
- **Build ID**: `V7.0.0-RC7-20261030-RUNTIME-HANDSHAKE-AND-LAYOUT-PASS`
- **Commit**: `fb120fba` on `major/v7-dual-mode`

## File Hash Parity Table (3-Way Comparison)
| File | Packaged ZIP Staging SHA256 | Active Unpacked Directory SHA256 | Git Root extension/ SHA256 | Status |
|---|---|---|---|---|
| `manifest.json` | `40b86e4776f52f7fa9ce425c28e938920ff9d248ecfa4f759600a9d8213697e8` | `40b86e4776f52f7fa9ce425c28e938920ff9d248ecfa4f759600a9d8213697e8` | `40b86e4776f52f7fa9ce425c28e938920ff9d248ecfa4f759600a9d8213697e8` | **MATCH** |
| `popup.html` | `e78fb06b5ad58fb24d34b93da929578cdf64da2e7724e1423bdd0fba75989334` | `e78fb06b5ad58fb24d34b93da929578cdf64da2e7724e1423bdd0fba75989334` | `e78fb06b5ad58fb24d34b93da929578cdf64da2e7724e1423bdd0fba75989334` | **MATCH** |
| `popup.js` | `91e40375b0fce52ef1e0d375d31599557fc7088b64e5659fb2ee178dbca6a386` | `91e40375b0fce52ef1e0d375d31599557fc7088b64e5659fb2ee178dbca6a386` | `91e40375b0fce52ef1e0d375d31599557fc7088b64e5659fb2ee178dbca6a386` | **MATCH** |
| `popup.css` | `5ae7f46d0b850e7829871587593c66289b4b0ebf49e1e550209c158ea7daef6f` | `5ae7f46d0b850e7829871587593c66289b4b0ebf49e1e550209c158ea7daef6f` | `5ae7f46d0b850e7829871587593c66289b4b0ebf49e1e550209c158ea7daef6f` | **MATCH** |
| `background.js` | `1d82d43bac88946059fb92543d34ffad4a9c8f00062a472a1296f8c7b8089226` | `1d82d43bac88946059fb92543d34ffad4a9c8f00062a472a1296f8c7b8089226` | `1d82d43bac88946059fb92543d34ffad4a9c8f00062a472a1296f8c7b8089226` | **MATCH** |
| `content-script.js` | `19345f75b1d1b0f4dc262f53bc275ed935f064f527d7b65b99238018371c9bb8` | `19345f75b1d1b0f4dc262f53bc275ed935f064f527d7b65b99238018371c9bb8` | `19345f75b1d1b0f4dc262f53bc275ed935f064f527d7b65b99238018371c9bb8` | **MATCH** |
| `modules/build-provenance.js` | `862355a06b6fe64fd5a359275cbef10c7e5bf41cc83b0a2d3df253b27b4097f4` | `862355a06b6fe64fd5a359275cbef10c7e5bf41cc83b0a2d3df253b27b4097f4` | `862355a06b6fe64fd5a359275cbef10c7e5bf41cc83b0a2d3df253b27b4097f4` | **MATCH** |
| `modules/privacy-gateway.js` | `bfa6a4d70ec77a10a508d94d8424d5b90aca6a2d45a09f64e70f7239ae28c6bb` | `bfa6a4d70ec77a10a508d94d8424d5b90aca6a2d45a09f64e70f7239ae28c6bb` | `bfa6a4d70ec77a10a508d94d8424d5b90aca6a2d45a09f64e70f7239ae28c6bb` | **MATCH** |
| `modules/challenge-gate.js` | `509cf0be725a1b0e78d2caff4936a6fb85b0d6d35f24b39f7ee237112bc827f2` | `509cf0be725a1b0e78d2caff4936a6fb85b0d6d35f24b39f7ee237112bc827f2` | `509cf0be725a1b0e78d2caff4936a6fb85b0d6d35f24b39f7ee237112bc827f2` | **MATCH** |

## Safe Reload-Only Procedure for Owner
> 🛑 **NEVER click "Remove" or "Load unpacked"** in `chrome://extensions`!
1. Open `chrome://extensions` in Chrome.
2. Locate **XPIDER AutoForm Sender Pro** (ID: `ldlijlaccfeelfdhgnjbibniocefckjj`).
3. Click the circular **Reload (🔄)** icon on the card.
4. Open the extension side panel:
   - The red mismatch banner is completely gone.
   - The build badge reads `OWNER BETA V7.0.0-RC7 [8ab1f93b]`.
   - URL rows are clearly legible with 36px height, no clipping, and pure white text.
   - Click green **▶️ Resume**, choose mode, and click **Confirm & Resume**.
