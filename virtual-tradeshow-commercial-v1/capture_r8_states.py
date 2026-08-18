"""
PHASE 10.7N-R8: Capture R8_01_PUBLIC_PHOTO_TOUR.png & R8_02_3D_UNAVAILABLE_STATE.png
"""

import subprocess
from pathlib import Path

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
R8_DIR = ROOT_DIR / "production_artifacts" / "r8"
R8_DIR.mkdir(parents=True, exist_ok=True)

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
LOCAL_BASE = "http://localhost:3000"

# 1. Public Photo Tour View
out1 = R8_DIR / "R8_01_PUBLIC_PHOTO_TOUR.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out1}",
    f"{LOCAL_BASE}/wilo-demo.html"
], capture_output=True)
print(f"Captured {out1} ({out1.stat().st_size:,} bytes)")

# 2. Owner Review 3D Unavailable State
out2 = R8_DIR / "R8_02_3D_UNAVAILABLE_STATE.png"
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
    "--window-size=1600,1000",
    f"--screenshot={out2}",
    f"{LOCAL_BASE}/wilo-demo.html?mode=gaussian3d&review=owner"
], capture_output=True)
print(f"Captured {out2} ({out2.stat().st_size:,} bytes)")

# Copy to root production_artifacts
(ROOT_DIR / "production_artifacts" / "R8_01_PUBLIC_PHOTO_TOUR.png").write_bytes(out1.read_bytes())
(ROOT_DIR / "production_artifacts" / "R8_02_3D_UNAVAILABLE_STATE.png").write_bytes(out2.read_bytes())
