# Installation & Setup Guide

## 1. Load Chrome Extension in Developer Mode
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the directory:
   ```
   e:\vivpr\ai\v-show\tools\runtime-inspector\extension
   ```
5. The **Runtime Inspector (RI)** extension icon will appear in the Chrome toolbar.

## 2. Managing Approved Domains
1. Right-click the Runtime Inspector icon in Chrome and click **Options** (or open `chrome-extension://<id>/options.html`).
2. Verify approved domains (default: `v-show-commercial-v1-production.up.railway.app`, `localhost`, `127.0.0.1`).
3. Add any new development domains as needed.
