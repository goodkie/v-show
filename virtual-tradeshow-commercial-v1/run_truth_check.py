"""
PHASE 10.7N-TRUTH-CHECK: Asset Reality Verification Script
"""

import os
import sys
import json
import hashlib
import struct
import subprocess
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
RECOVERY_DIR = ROOT_DIR / "production_artifacts" / "truth_check"
RECOVERY_DIR.mkdir(parents=True, exist_ok=True)

APP_BUILD = ROOT_DIR / "app_build"
DATA_DIR = APP_BUILD / "data"
WILO_EXTERNAL_ROOT = Path(r"C:\Users\vivPR\vshow-demo-assets\wilo")
WILO_BOOTH_DIR = WILO_EXTERNAL_ROOT / "booth"
CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "http://localhost:3000"

def get_jpeg_size(file_path):
    """Read JPEG dimensions without external libraries."""
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
            # Verify magic bytes
            if data[:2] != b'\xff\xd8':
                return None, None
            idx = 2
            while idx < len(data):
                if data[idx] != 0xff:
                    idx += 1
                    continue
                marker = data[idx+1]
                idx += 2
                if marker in (0xd8, 0xd9, 0x00):
                    continue
                if idx + 2 > len(data):
                    break
                length = struct.unpack('>H', data[idx:idx+2])[0]
                if marker in (0xc0, 0xc1, 0xc2, 0xc3):
                    # SOF marker
                    h, w = struct.unpack('>HH', data[idx+3:idx+7])
                    return w, h
                idx += length
    except Exception as e:
        return None, None
    return None, None

print("=" * 60)
print("PHASE 10.7N-TRUTH-CHECK AUDIT START")
print("=" * 60)

# STEP 1 & 2 & 3: Audit Wilo Photo Assets
expected_booth_files = [
    "01_front_hero.jpg", "02_front_center.jpg", "03_left_angle.jpg",
    "04_right_angle.jpg", "05_left_side.jpg", "06_right_side.jpg",
    "07_interior_view.jpg", "08_product_island.jpg", "09_meeting_area.jpg",
    "10_display_screen.jpg", "11_overhead_sign.jpg", "12_wide_overview.jpg"
]

network_reality = []
photo_audit_table = []
all_valid = True

for fn in expected_booth_files:
    file_path = WILO_BOOTH_DIR / fn
    exists = file_path.exists()
    size = file_path.stat().st_size if exists else 0
    
    sha256 = ""
    magic_hex = ""
    width, height = None, None
    
    if exists:
        raw_bytes = file_path.read_bytes()
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        magic_hex = raw_bytes[:4].hex().upper()
        width, height = get_jpeg_size(file_path)
    
    # Query HTTP
    url = f"{BASE_URL}/assets/demo/wilo/booth/{fn}"
    http_status = 0
    content_type = "none"
    http_size = 0
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'TruthCheck/1.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            http_status = resp.status
            content_type = resp.headers.get('Content-Type', '')
            http_size = len(resp.read())
    except Exception as e:
        http_status = getattr(e, 'code', 0)
    
    # Truth Check Criteria
    is_jpeg = magic_hex.startswith("FFD8")
    is_size_valid = size >= 100 * 1024 # > 100KB
    is_dim_valid = (width == 1600 and height == 900)
    
    if not (is_jpeg and is_size_valid and is_dim_valid):
        result_status = "INVALID_ASSET"
        all_valid = False
    else:
        result_status = "VALID_ASSET"
        
    network_reality.append({
        "url": url,
        "httpStatus": http_status,
        "contentType": content_type,
        "byteSize": http_size,
        "dimension": f"{width}x{height}" if width else "UNKNOWN",
        "magicBytes": magic_hex,
        "status": result_status,
        "reasons": []
    })
    
    if not is_size_valid:
        network_reality[-1]["reasons"].append(f"Size {size:,} bytes is < 100KB")
    if not is_dim_valid:
        network_reality[-1]["reasons"].append(f"Dimension {width}x{height} != 1600x900")
    if not is_jpeg:
        network_reality[-1]["reasons"].append(f"Invalid JPEG magic bytes: {magic_hex}")
        
    photo_audit_table.append({
        "filename": fn,
        "url": url,
        "http_status": http_status,
        "content_type": content_type,
        "byte_size": size,
        "dimension": f"{width}x{height}" if width else "UNKNOWN",
        "magic_bytes": magic_hex,
        "sha256": sha256,
        "result": result_status
    })

# Write NETWORK_REALITY_REPORT.json
with open(RECOVERY_DIR / "NETWORK_REALITY_REPORT.json", "w", encoding="utf-8") as f:
    json.dump({
        "audit": "PHASE 10.7N-TRUTH-CHECK",
        "assetsTested": len(network_reality),
        "allAssetsValid": all_valid,
        "networkReality": network_reality
    }, f, indent=2)

# STEP 5: Browser Screenshots
print("\n[STEP 5] Taking Truth Check Browser Screenshots...")
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--window-size=1600,1000",
    f"--screenshot={RECOVERY_DIR / 'TRUTH_01_INITIAL.png'}",
    f"{BASE_URL}/wilo-demo.html"
], capture_output=True)

subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--window-size=1600,1000",
    f"--screenshot={RECOVERY_DIR / 'TRUTH_02_NEXT.png'}",
    f"{BASE_URL}/wilo-demo.html?view=02_front_center"
], capture_output=True)

subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--window-size=1600,1000",
    f"--screenshot={RECOVERY_DIR / 'TRUTH_03_THUMBNAIL.png'}",
    f"{BASE_URL}/wilo-demo.html?view=08_product_island"
], capture_output=True)

print("\nAsset Truth Table:")
for r in photo_audit_table:
    print(f"  - {r['filename']}: Size={r['byte_size']:,} B | Dim={r['dimension']} | Magic={r['magic_bytes']} | Status={r['result']}")

final_pipeline_status = "ASSET_PIPELINE_TRUE" if all_valid else "ASSET_PIPELINE_FALSE"

print("\n" + "=" * 60)
print("PHASE 10.7N-TRUTH-CHECK RESULT")
print("=" * 60)
print(f"FINAL STATUS:\n{final_pipeline_status}\n")
print("STOP.")
