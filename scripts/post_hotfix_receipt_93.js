const { execSync } = require('child_process');

const commentBody = `## [ANTIGRAVITY][HOTFIX RECEIPT][RC3.60 .93 EXTENSION ACTIVATION REPAIR]

**Issue**: Extension side panel did not open on click.
**Root Cause**: 
1. In \`extension/background.js\` line 5646, an unreachable \`else if (false)\` block followed an existing \`else\` statement, creating an illegal \`} else { ... } else if (...) {\` syntax error (\`SyntaxError: Unexpected token 'catch'\`). This caused Chrome to fail registration of the service worker, rendering the extension unable to boot or respond to action clicks.
2. Additionally, \`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })\` was previously bound solely inside \`chrome.runtime.onInstalled\`, meaning a service worker restart/reload without a formal install event did not re-assert side panel behavior.

**Engineering Fix**:
1. Cleaned up and removed the illegal branching in \`extension/background.js\`. All 21 extension JavaScript files verified with \`node --check\` — **100% Valid Syntax**.
2. Enhanced sidepanel activation:
   - Configures \`setPanelBehavior({ openPanelOnActionClick: true })\` immediately on service worker boot **and** on \`runtime.onInstalled\`.
   - Added active fallback listener on \`chrome.action.onClicked\` to explicitly invoke \`chrome.sidePanel.open({ windowId })\` if action clicks are not captured by behavior configuration.
3. Repackaged and uploaded refreshed release asset \`XPIDER_R6.9G.10.3.7.1.4.93_OWNER_BETA.zip\` (SHA256: \`5714dd98fdb54fd4d3ed15ad2cb8af8d7eeccade1cd7e64708670a241c58fa2b\`).

**Commit**: \`4be780b4\`
**Release Asset**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.93`;

require('fs').writeFileSync('scratch_hotfix_receipt_93.md', commentBody, 'utf8');

try {
    const cmd = `gh issue comment 6 --body-file scratch_hotfix_receipt_93.md`;
    const res = execSync(cmd, { encoding: 'utf8' });
    console.log('Hotfix receipt posted successfully:', res.trim());
} catch (err) {
    console.error('Failed to post hotfix receipt:', err.message);
}

