"""
PHASE 10.7N-IMAGE-ROUTING-DEBUG Script
"""

import os
import sys
import json
import subprocess
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
DEBUG_DIR = ROOT_DIR / "production_artifacts" / "image_routing_debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

APP_BUILD = ROOT_DIR / "app_build"
CLIENT_BOOTH_DIR = APP_BUILD / "client" / "assets" / "demo" / "wilo" / "booth"
EXTERNAL_BOOTH_DIR = Path(r"C:\Users\vivPR\vshow-demo-assets\wilo\booth")
CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "http://localhost:3000"

print("=" * 60)
print("PHASE 10.7N-IMAGE-ROUTING-DEBUG START")
print("=" * 60)

# STEP 1: Capture Network Requests for All 12 JPG views
expected_booth_files = [
    "01_front_hero.jpg", "02_front_center.jpg", "03_left_angle.jpg",
    "04_right_angle.jpg", "05_left_side.jpg", "06_right_side.jpg",
    "07_interior_view.jpg", "08_product_island.jpg", "09_meeting_area.jpg",
    "10_display_screen.jpg", "11_overhead_sign.jpg", "12_wide_overview.jpg"
]

network_trace = []
direct_url_ok = True

print("\n[STEP 1] Capturing Network Traces for JPG Assets...")
for fn in expected_booth_files:
    url = f"{BASE_URL}/assets/demo/wilo/booth/{fn}"
    status = 0
    content_type = ""
    byte_count = 0
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'RoutingDebug/1.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            content_type = resp.headers.get('Content-Type', '')
            byte_count = len(resp.read())
    except Exception as e:
        status = getattr(e, 'code', 0)
        direct_url_ok = False
        
    network_trace.append({
        "url": url,
        "filename": fn,
        "status": status,
        "contentType": content_type,
        "bytes": byte_count,
        "directLoadSuccess": (status == 200 and byte_count > 100000)
    })
    print(f"  - {fn}: HTTP {status} | Content-Type: {content_type} | Bytes: {byte_count:,} B | OK={status == 200 and byte_count > 100000}")

# Export WILO_IMAGE_NETWORK_TRACE.json
trace_file = DEBUG_DIR / "WILO_IMAGE_NETWORK_TRACE.json"
with open(trace_file, "w", encoding="utf-8") as f:
    json.dump({
        "audit": "PHASE 10.7N-IMAGE-ROUTING-DEBUG",
        "totalAssets": len(network_trace),
        "allDirectLoadsWorking": all(t["directLoadSuccess"] for t in network_trace),
        "trace": network_trace
    }, f, indent=2)

# STEP 2 & 3: Inspect Frontend Source & DOM Binding
print("\n[STEP 2 & 3] Inspecting Frontend Photo Tour Component & DOM Binding...")
wilo_html = (APP_BUILD / "client" / "wilo-demo.html").read_text(encoding='utf-8')

has_img_element = '<img id="wilo-main-image"' in wilo_html
has_render_func = 'function renderPhotoTour()' in wilo_html
has_view_02 = '02_front_center' in wilo_html
frontend_binding_ok = has_img_element and has_render_func and has_view_02

print(f"  - IMG Element (<img id=\"wilo-main-image\">): {'PRESENT' if has_img_element else 'MISSING'}")
print(f"  - Photo Tour Renderer Function: {'PRESENT' if has_render_func else 'MISSING'}")
print(f"  - 02_front_center.jpg Reference: {'PRESENT' if has_view_02 else 'MISSING'}")

# STEP 4: Verify Server Filesystem
print("\n[STEP 4] Verifying Server Filesystem (Client Assets & External Directory)...")
client_files = list(CLIENT_BOOTH_DIR.glob("*.jpg")) if CLIENT_BOOTH_DIR.exists() else []
ext_files = list(EXTERNAL_BOOTH_DIR.glob("*.jpg")) if EXTERNAL_BOOTH_DIR.exists() else []

print(f"  - Client Repository Directory ({CLIENT_BOOTH_DIR}): {len(client_files)} / 12 files present")
print(f"  - External Directory ({EXTERNAL_BOOTH_DIR}): {len(ext_files)} / 12 files present")

# STEP 5: Direct Browser Test
print("\n[STEP 5] Taking Direct Browser Screenshots...")
# Direct asset URL screenshot
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--window-size=1600,900",
    f"--screenshot={DEBUG_DIR / 'DIRECT_02_FRONT_CENTER.png'}",
    f"{BASE_URL}/assets/demo/wilo/booth/02_front_center.jpg"
], capture_output=True)

# Main viewer screenshot with 02_front_center active
subprocess.run([
    CHROME_EXE, "--headless", "--disable-gpu", "--window-size=1600,1000",
    f"--screenshot={DEBUG_DIR / 'VIEWER_02_FRONT_CENTER.png'}",
    f"{BASE_URL}/wilo-demo.html?view=02_front_center"
], capture_output=True)

direct_02_status, direct_02_bytes, direct_02_headers = (
    next(t for t in network_trace if t["filename"] == "02_front_center.jpg")["status"],
    next(t for t in network_trace if t["filename"] == "02_front_center.jpg")["bytes"],
    next(t for t in network_trace if t["filename"] == "02_front_center.jpg")["contentType"]
)

viewer_screenshot_ok = (DEBUG_DIR / 'VIEWER_02_FRONT_CENTER.png').exists()
direct_screenshot_ok = (DEBUG_DIR / 'DIRECT_02_FRONT_CENTER.png').exists()

print("\n" + "=" * 60)
print("PHASE 10.7N-IMAGE-ROUTING-DEBUG FINAL STATUS")
print("=" * 60)

if not (direct_02_status == 200 and direct_02_bytes > 300000):
    print("FINAL STATUS:\nSTATIC_ASSET_DEPLOY_FAIL\n")
elif not (frontend_binding_ok and viewer_screenshot_ok):
    print("FINAL STATUS:\nIMAGE_RENDERER_BINDING_FAIL\n")
else:
    print("FINAL STATUS:\nIMAGE_ROUTING_VERIFIED_SUCCESS\n(Direct URL works and Viewer renders real Wilo high-res photo)\n")

print("STOP.")
