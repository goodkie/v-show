import os
import re

client_dir = r"e:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client"
hangul_pattern = re.compile(r'[\uac00-\ud7af]')

results = {}

for root, _, files in os.walk(client_dir):
    for file in sorted(files):
        if file.endswith(('.html', '.js')):
            fpath = os.path.join(root, file)
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            matches = []
            for idx, line in enumerate(lines):
                found = hangul_pattern.findall(line)
                if found:
                    matches.append((idx + 1, line.strip(), "".join(found[:5])))
            
            rel_path = os.path.relpath(fpath, client_dir)
            results[rel_path] = matches

print("=== Hangul Scan in client/ ===")
total_hangul = 0
for fname, matches in results.items():
    print(f"{fname}: {len(matches)} lines with Hangul")
    total_hangul += len(matches)
    for lnum, lcontent, hchars in matches[:5]:
        print(f"   L{lnum}: {lcontent[:80]} (chars: {hchars})")

print(f"\nTOTAL HANGUL LINES: {total_hangul}")
