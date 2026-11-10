# XPIDER Disposable-Profile Browser Verification Gate & CI Lane Specification

- **Branch:** `feature/consent-based-email-delivery-20261109`
- **Gate Runner Script:** `test/run_email_browser_gate.js`
- **Underlying CDP Suites:**
  1. `test/run_email_studio_browser_runtime_cdp.js` (**25 assertions**)
  2. `test/run_popup_paused_runtime_cdp.js` (**14 assertions**)
- **Hosted GitHub Actions Browser-CI Status:** **`UNKNOWN` (`NOT_YET_IN_WORKFLOW_YML`)** — Local GitHub OAuth credentials lack the `workflow` OAuth scope required by GitHub to push modifications to `.github/workflows/email-feature-ci.yml`. Therefore, per Directives `#6760076943` and `#6765989147`, `test/run_email_browser_gate.js` is provided as a reproducible single-command gated runner with committed artifact evidence (`evidence/browser_gate_latest/`), and hosted `browser-CI` is explicitly marked **`UNKNOWN`** (never claimed PASS from Node-only CI).

---

## 1. Single-Command Reproducible Execution

```bash
node test/run_email_browser_gate.js --ext extension --browser edge --out evidence/browser_gate_latest
```
Or positional syntax:
```bash
node test/run_email_browser_gate.js extension "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" evidence/browser_gate_latest
```

### Enforced Invariants (`16 / 16` Gate Checks + `39 / 39` Underlying Browser Assertions)
1. **Disposable Profile Only:** Creates isolated temp profiles (`os.tmpdir()/xpider_email_studio_*` and `xpider_popup_scope_*`), verifies zero reference to any user `User Data` directory, and removes temp profiles on exit.
2. **Hosted Image Opt-In Positive/Negative Control:**
   - `serverHitsBeforeOptIn === 0` while `#loadRemoteImages` is unchecked.
   - `EXPORT_HTML_INCLUDES_HTTPS_IMAGE_WHILE_UNCHECKED`: HTML export includes the `https://` image URL while `#loadRemoteImages` remains unchecked (`serverHitsBeforeOptIn === 0`).
   - `serverHitsAfterOptIn >= 1` (`GET /fixture-remote-banner.png`) against the local self-signed X.509 HTTPS fixture server immediately after checking `#loadRemoteImages`.
   - `EXPORT_HTML_HAS_NO_BLOB_URL`: Local file preview uses `blob:` inside the sandboxed preview iframe only; exported HTML contains zero `blob:` URLs.
3. **Live MV3 `background.js` Service Worker Popup State:**
   - Attaches to the real `chrome-extension://<id>/background.js` Service Worker target and verifies `GET_STATE` and `PAUSE_CAMPAIGN` across `LIVE_BG_IDLE`, `LIVE_BG_PAUSED_CHECKPOINT`, `LIVE_BG_ACTIVE`, and popup `chrome.storage.local.get` throw fallback modes with `0` `isPausedState` `ReferenceError`s.
4. **Downloadable Artifacts & SHA-256 Inventory:**
   - Writes `<outDir>/report_email_browser_gate.json` containing `gitHeadSha`, `extensionTreeSha`, `nodeVersion`, `browserVersion`, per-suite exit codes, and SHA-256 hashes of all 14 generated files (`email_studio_run.log`, `popup_paused_run.log`, 2 JSON reports, and 10 PNG screenshots).

---

## 2. Ready-to-Add GitHub Actions Job Snippet (For Connector / Token with `workflow` Scope)

When updating `.github/workflows/email-feature-ci.yml` with a `workflow`-scoped token, append `test/run_email_browser_gate.js` and `test/run_email_feature_uat_readiness_preflight.js` to `dry-run-only` / add the `browser-runtime-edge` job below:

```yaml
  browser-runtime-edge:
    runs-on: windows-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run disposable-profile Edge MV3 browser gate and UAT readiness preflight
        run: |
          node test/run_email_feature_uat_readiness_preflight.js
          node test/run_email_browser_gate.js --ext extension --browser edge --out evidence/browser_gate_ci
      - name: Upload browser gate logs, JSON reports, and screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: xpider-email-browser-gate-artifacts
          path: |
            evidence/browser_gate_ci/**
            evidence/uat_readiness/**
          if-no-files-found: error
```

