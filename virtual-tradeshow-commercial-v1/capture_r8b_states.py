"""
PHASE 10.7N-R8B: Capture R8B_01_PUBLIC_TRUTH_STATE.png & R8B_02_OWNER_TRUTH_STATE.png
Captures current live Railway production screenshots
"""

import subprocess
from pathlib import Path

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
R8B_DIR = ROOT_DIR / "production_artifacts" / "r8b"
R8B_DIR.mkdir(parents=True, exist_ok=True)

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "https://v-show-commercial-v1-production.up.railway.app"

# 1. Public Truth State
out1 = R8B_DIR / "R8B_01_PUBLIC_TRUTH_STATE.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out1}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)
print(f"Captured R8B_01_PUBLIC_TRUTH_STATE.png: {out1.stat().st_size:,} bytes")

# 2. Owner Truth State
out2 = R8B_DIR / "R8B_02_OWNER_TRUTH_STATE.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out2}",
    f"{BASE_URL}/wilo-demo.html?mode=gaussian3d&review=owner"
], capture_output=True)
print(f"Captured R8B_02_OWNER_TRUTH_STATE.png: {out2.stat().st_size:,} bytes")

# Copy to root production_artifacts
(ROOT_DIR / "production_artifacts" / "R8B_01_PUBLIC_TRUTH_STATE.png").write_bytes(out1.read_bytes())
(ROOT_DIR / "production_artifacts" / "R8B_02_OWNER_TRUTH_STATE.png").write_bytes(out2.read_bytes())
print("All R8B screenshots saved.")
