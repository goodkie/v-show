from PIL import Image
from pathlib import Path

artifacts_dir = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_2e")
exp_qa_dir = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01\qa")
gemini_dir = Path(r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8")

views = ["R10_2E_FRONT.png", "R10_2E_LEFT.png", "R10_2E_RIGHT.png", "R10_2E_CLOSE.png"]
sheet = Image.new("RGB", (1400, 900), (15, 23, 42))

for idx, vname in enumerate(views):
    p = artifacts_dir / vname
    if p.exists():
        with Image.open(p) as im:
            im.thumbnail((650, 400))
            r = idx // 2
            c = idx % 2
            sheet.paste(im, (30 + c * 690, 40 + r * 420))

for p in [artifacts_dir / "R10_2E_CONTACT_SHEET.png",
          exp_qa_dir / "R10_2E_CONTACT_SHEET.png",
          gemini_dir / "R10_2E_CONTACT_SHEET.png"]:
    sheet.save(p)

print(f"Saved R10_2E_CONTACT_SHEET.png ({sheet.size})")
