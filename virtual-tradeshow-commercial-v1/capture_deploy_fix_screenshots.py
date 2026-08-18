"""
PHASE 10.7N-R8B-DEPLOY-FIX: Capture Live Production Screenshots
"""

import subprocess
from pathlib import Path

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
FIX_DIR = ROOT_DIR / "production_artifacts" / "r8b_deploy_fix"
FIX_DIR.mkdir(parents=True, exist_ok=True)

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "https://v-show-commercial-v1-production.up.railway.app"

# 1. Public Capture Required State
out1 = FIX_DIR / "11_PUBLIC_CAPTURE_REQUIRED.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out1}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)
print(f"Captured 11_PUBLIC_CAPTURE_REQUIRED.png: {out1.stat().st_size:,} bytes")

# 2. Owner Capture Required State
out2 = FIX_DIR / "12_OWNER_CAPTURE_REQUIRED.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out2}",
    f"{BASE_URL}/wilo-demo.html?mode=gaussian3d&review=owner"
], capture_output=True)
print(f"Captured 12_OWNER_CAPTURE_REQUIRED.png: {out2.stat().st_size:,} bytes")

# 3. Control State (Same as public capture required)
out3 = FIX_DIR / "13_CONTROL_STATE.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out3}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)
print(f"Captured 13_CONTROL_STATE.png: {out3.stat().st_size:,} bytes")

# Copy to root production_artifacts
(ROOT_DIR / "production_artifacts" / "11_PUBLIC_CAPTURE_REQUIRED.png").write_bytes(out1.read_bytes())
(ROOT_DIR / "production_artifacts" / "12_OWNER_CAPTURE_REQUIRED.png").write_bytes(out2.read_bytes())
(ROOT_DIR / "production_artifacts" / "13_CONTROL_STATE.png").write_bytes(out3.read_bytes())
print("All deploy-fix production screenshots captured and copied successfully.")
