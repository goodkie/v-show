"""
PHASE 10.7N-R8A: Owner-Facing Production Reality Captures
Captures screenshots from actual Railway deployment:
https://v-show-commercial-v1-production.up.railway.app
"""

import subprocess
from pathlib import Path

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
R8A_DIR = ROOT_DIR / "production_artifacts" / "r8a"
R8A_DIR.mkdir(parents=True, exist_ok=True)

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "https://v-show-commercial-v1-production.up.railway.app"

# Test 1: Public Photo Tour
out1 = R8A_DIR / "R8A_01_PUBLIC_PRODUCTION.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out1}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)
print(f"Captured R8A_01_PUBLIC_PRODUCTION.png: {out1.stat().st_size:,} bytes")

# Test 2: Former Gaussian Owner URL
out2 = R8A_DIR / "R8A_02_OWNER_URL_PRODUCTION.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out2}",
    f"{BASE_URL}/wilo-demo.html?mode=gaussian3d&review=owner"
], capture_output=True)
print(f"Captured R8A_02_OWNER_URL_PRODUCTION.png: {out2.stat().st_size:,} bytes")

# Test 5: UI Control State (Same as public production view)
out5 = R8A_DIR / "R8A_05_3D_CONTROL_STATE.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out5}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)
print(f"Captured R8A_05_3D_CONTROL_STATE.png: {out5.stat().st_size:,} bytes")

# Copy to root production_artifacts
(ROOT_DIR / "production_artifacts" / "R8A_01_PUBLIC_PRODUCTION.png").write_bytes(out1.read_bytes())
(ROOT_DIR / "production_artifacts" / "R8A_02_OWNER_URL_PRODUCTION.png").write_bytes(out2.read_bytes())
(ROOT_DIR / "production_artifacts" / "R8A_05_3D_CONTROL_STATE.png").write_bytes(out5.read_bytes())
print("All R8A production screenshots captured and copied successfully.")
