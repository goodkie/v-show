import os
from pathlib import Path
from PIL import Image

INCOMING_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\data\capture-ingest\wilo\incoming")

files = sorted(list(INCOMING_DIR.glob("*.*")))
print(f"Total files in incoming: {len(files)}")

by_res = {}
for f in files:
    if f.suffix.lower() in [".jpg", ".jpeg", ".png"]:
        try:
            with Image.open(f) as im:
                w, h = im.size
                res_key = f"{w}x{h}"
                by_res.setdefault(res_key, []).append((f.name, f.stat().st_size))
        except Exception as e:
            print(f"Error reading {f.name}: {e}")

print("\n--- Files Grouped by Resolution ---")
for res, items in sorted(by_res.items(), key=lambda x: -len(x[1])):
    print(f"\nResolution {res} (Count: {len(items)}):")
    for name, size in items[:5]:
        print(f"  - {name} ({size/1024:.1f} KB)")
    if len(items) > 5:
        print(f"  ... and {len(items)-5} more")
