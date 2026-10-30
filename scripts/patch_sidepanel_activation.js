const fs = require('fs');
const path = require('path');

const bgPath = path.resolve('extension/background.js');
let bg = fs.readFileSync(bgPath, 'utf8');
const origCRLF = bg.includes('\r\n');
bg = bg.replace(/\r\n/g, '\n');

const oldBlock = `markBoot("side_panel_config");
chrome.runtime.onInstalled.addListener(() => {
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("[SidePanel Error]", error));
    }
});`;

const newBlock = `markBoot("side_panel_config");
const configureSidePanel = () => {
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("[SidePanel Error]", error));
    }
};
// Configure immediately on boot AND on install
configureSidePanel();
chrome.runtime.onInstalled.addListener(() => {
    configureSidePanel();
});
// Fallback: If action click is not captured by setPanelBehavior, open sidepanel explicitly
if (typeof chrome.action !== 'undefined' && chrome.action.onClicked) {
    chrome.action.onClicked.addListener(async (tab) => {
        try {
            if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.open) {
                if (tab && tab.windowId) {
                    await chrome.sidePanel.open({ windowId: tab.windowId });
                } else if (tab && tab.id) {
                    await chrome.sidePanel.open({ tabId: tab.id });
                }
            }
        } catch (spErr) {
            console.error("[SidePanel Action Fallback Error]", spErr);
        }
    });
}`;

if (bg.includes(oldBlock)) {
    bg = bg.replace(oldBlock, newBlock);
    if (origCRLF) bg = bg.replace(/\n/g, '\r\n');
    fs.writeFileSync(bgPath, bg, 'utf8');
    console.log('✓ Successfully enhanced side panel activation in background.js');
} else {
    console.error('Target block not found in background.js');
}

