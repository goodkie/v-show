from pathlib import Path

txt_path = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01-rescue\attempts\attempt_b\images.txt")
lines = txt_path.read_text().splitlines()

names = []
for line in lines:
    if line.strip() and not line.startswith("#"):
        parts = line.strip().split()
        if len(parts) >= 10:
            names.append(parts[9])

print(f"Found {len(names)} registered images in Attempt B:")
for i, n in enumerate(sorted(names)):
    print(f"{i+1:2d}. {n}")
