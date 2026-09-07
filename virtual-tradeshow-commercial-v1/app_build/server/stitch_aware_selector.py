#!/usr/bin/env python3
"""
3D2 / 3DZ Virtual Tradeshow - Stitch-Aware Keyframe Selector & Bridge Recovery
Script: stitch_aware_selector.py
"""

import os
import sys
import json
import math
import hashlib
import cv2
import numpy as np

cv2.ocl.setUseOpenCL(False)

def run_stitch_aware_selection(capture_session_dir, output_dir, session_id):
    os.makedirs(output_dir, exist_ok=True)
    candidates_dir = os.path.join(capture_session_dir, "candidates")
    pool_manifest_path = os.path.join(capture_session_dir, "candidate_pool.json")

    if not os.path.exists(pool_manifest_path):
        raise FileNotFoundError(f"Candidate pool manifest not found at: {pool_manifest_path}")

    with open(pool_manifest_path, 'r') as f:
        pool_data = json.load(f)

    candidates = pool_data.get("candidates", [])
    if not candidates:
        raise ValueError("Candidate pool is empty!")

    # Sort candidates in deterministic rotational order (by angle)
    candidates.sort(key=lambda c: (c.get("estimatedYawDeg", c.get("angle", 0.0)), c.get("index", 0)))
    N = len(candidates)
    print(f"Loaded {N} candidates for session {session_id}.")

    # 1. Load images and compute SIFT features
    sift = cv2.SIFT_create()
    bf = cv2.BFMatcher(cv2.NORM_L2)
    max_dim = 960

    loaded_candidates = []
    kps = []
    descs = []
    images_sm = []
    images_orig = []

    for idx, cand in enumerate(candidates):
        cid = cand.get("candidateId", f"C{idx+1:03d}")
        cand_file = os.path.join(candidates_dir, f"{cid}.jpg")
        if not os.path.exists(cand_file):
            print(f"Warning: Candidate file {cand_file} missing, skipping.")
            continue

        img = cv2.imread(cand_file)
        if img is None:
            print(f"Warning: Could not decode {cand_file}, skipping.")
            continue

        h, w = img.shape[:2]
        s = min(1.0, max_dim / max(h, w))
        img_sm = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)

        kp, des = sift.detectAndCompute(img_sm, None)
        if des is None or len(kp) < 4:
            print(f"[{cid}] Warning: Insufficient keypoints ({len(kp) if kp else 0})")
            des = np.zeros((0, 128), dtype=np.float32)
            kp = []

        cand["loadedIndex"] = len(loaded_candidates)
        cand["actualFile"] = cand_file
        loaded_candidates.append(cand)
        kps.append(kp)
        descs.append(des)
        images_sm.append(img_sm)
        images_orig.append(img)
        print(f"[{cid}] Yaw: {cand.get('estimatedYawDeg', 0.0)} deg | SIFT KPs: {len(kp)}")

    num_loaded = len(loaded_candidates)
    if num_loaded < 4:
        raise ValueError(f"Insufficient valid candidate images loaded ({num_loaded})")

    # 2. Build Candidate Match Graph
    # We evaluate adjacent neighbors, nearby neighbors (gap up to 4), and loop closure
    graph_edges = {}
    adj_matrix = {i: [] for i in range(num_loaded)}

    def evaluate_pair(i, j):
        key = (min(i, j), max(i, j))
        if key in graph_edges:
            return graph_edges[key]

        des1, des2 = descs[key[0]], descs[key[1]]
        kp1, kp2 = kps[key[0]], kps[key[1]]

        cand_a_id = loaded_candidates[key[0]].get("candidateId")
        cand_b_id = loaded_candidates[key[1]].get("candidateId")

        if des1 is None or des2 is None or len(des1) < 4 or len(des2) < 4:
            res = {"i": key[0], "j": key[1], "candA": cand_a_id, "candB": cand_b_id, "rawMatches": 0, "goodMatches": 0, "inliers": 0, "inlierRatio": 0.0, "medianError": 999.0, "connected": False}
            graph_edges[key] = res
            return res

        raw_matches = bf.knnMatch(des1, des2, k=2)
        good = []
        for m_tuple in raw_matches:
            if len(m_tuple) == 2:
                m, n = m_tuple
                if m.distance < 0.75 * n.distance:
                    good.append(m)

        if len(good) < 15:
            res = {"i": key[0], "j": key[1], "candA": cand_a_id, "candB": cand_b_id, "rawMatches": len(raw_matches), "goodMatches": len(good), "inliers": 0, "inlierRatio": 0.0, "medianError": 999.0, "connected": False}
            graph_edges[key] = res
            return res

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 4.0)
        if H is None or mask is None:
            res = {"i": key[0], "j": key[1], "candA": cand_a_id, "candB": cand_b_id, "rawMatches": len(raw_matches), "goodMatches": len(good), "inliers": 0, "inlierRatio": 0.0, "medianError": 999.0, "connected": False}
            graph_edges[key] = res
            return res

        inliers = int(np.sum(mask))
        inlier_ratio = round(inliers / max(1, len(good)), 3)
        inlier_src = src_pts[mask.ravel() == 1]
        inlier_dst = dst_pts[mask.ravel() == 1]

        if len(inlier_src) > 0:
            proj = cv2.perspectiveTransform(inlier_src, H)
            errors = np.linalg.norm(inlier_dst - proj, axis=2).ravel()
            median_err = round(float(np.median(errors)), 2)
        else:
            median_err = 999.0

        connected = (inliers >= 15 and inlier_ratio >= 0.18 and median_err <= 6.0)
        res = {
            "i": key[0],
            "j": key[1],
            "candA": loaded_candidates[key[0]].get("candidateId"),
            "candB": loaded_candidates[key[1]].get("candidateId"),
            "rawMatches": len(raw_matches),
            "goodMatches": len(good),
            "inliers": inliers,
            "inlierRatio": inlier_ratio,
            "medianError": median_err,
            "connected": connected
        }
        graph_edges[key] = res
        if connected:
            adj_matrix[key[0]].append(key[1])
            adj_matrix[key[1]].append(key[0])
        return res

    # Evaluate neighborhood pairs
    for i in range(num_loaded):
        for offset in range(1, min(5, num_loaded)):
            j = (i + offset) % num_loaded
            evaluate_pair(i, j)

    # 3. Stitch-Aware Canonical Selection
    target_count = min(12, num_loaded)
    bucket_deg = 360.0 / target_count
    selected_indices = []

    for b in range(target_count):
        center_angle = b * bucket_deg
        in_bucket = []
        for idx, c in enumerate(loaded_candidates):
            ang = c.get("estimatedYawDeg", c.get("angle", 0.0))
            diff = abs((ang - center_angle + 180) % 360 - 180)
            if diff <= bucket_deg * 0.65:
                in_bucket.append((diff, idx, c))

        if in_bucket:
            in_bucket.sort(key=lambda item: (item[0], -item[2].get("sharpnessScore", 0)))
            chosen_idx = in_bucket[0][1]
            if chosen_idx not in selected_indices:
                selected_indices.append(chosen_idx)

    selected_indices.sort(key=lambda idx: loaded_candidates[idx].get("estimatedYawDeg", 0.0))

    # 4. Bridge Frame Recovery
    canonical_ring = list(selected_indices)
    augmented_sequence = []
    bridge_records = []

    M = len(canonical_ring)
    for m in range(M):
        idx_a = canonical_ring[m]
        idx_b = canonical_ring[(m + 1) % M]
        edge_res = evaluate_pair(idx_a, idx_b)

        augmented_sequence.append({
            "idx": idx_a,
            "type": "CANONICAL",
            "candidate": loaded_candidates[idx_a]
        })

        if not edge_res.get("connected", False) or edge_res.get("inliers", 0) < 15:
            print(f"Weak edge detected between {loaded_candidates[idx_a]['candidateId']} and {loaded_candidates[idx_b]['candidateId']} (Inliers: {edge_res.get('inliers', 0)}). Searching bridge...")
            
            if idx_b > idx_a:
                intermediates = list(range(idx_a + 1, idx_b))
            else:
                intermediates = list(range(idx_a + 1, num_loaded)) + list(range(0, idx_b))

            best_bridge = None
            best_bridge_score = -1

            for cand_cand in intermediates:
                e1 = evaluate_pair(idx_a, cand_cand)
                e2 = evaluate_pair(cand_cand, idx_b)
                score = min(e1.get("inliers", 0), e2.get("inliers", 0))
                if score > best_bridge_score:
                    best_bridge_score = score
                    best_bridge = (cand_cand, e1, e2)

            if best_bridge and best_bridge_score >= 10:
                bridge_idx, e1, e2 = best_bridge
                print(f"  -> Found bridge: {loaded_candidates[bridge_idx]['candidateId']} (min inliers: {best_bridge_score})")
                augmented_sequence.append({
                    "idx": bridge_idx,
                    "type": "BRIDGE",
                    "candidate": loaded_candidates[bridge_idx],
                    "bridgeMinInliers": best_bridge_score
                })
                bridge_records.append({
                    "sector": f"{loaded_candidates[idx_a]['candidateId']}->{loaded_candidates[idx_b]['candidateId']}",
                    "bridgeCandidate": loaded_candidates[bridge_idx]['candidateId'],
                    "bridgeIndex": bridge_idx,
                    "originalEdgeInliers": edge_res.get("inliers", 0),
                    "bridgeMinInliers": best_bridge_score,
                    "valid": best_bridge_score >= 15
                })

    if len(augmented_sequence) > 24:
        augmented_sequence = augmented_sequence[:24]

    # 5. Measure Final Ring Connectivity
    K = len(augmented_sequence)
    final_adj_inliers = []
    final_connected = True
    weakest_edge = None
    min_inliers = 9999

    for k in range(K):
        i_curr = augmented_sequence[k]["idx"]
        i_next = augmented_sequence[(k + 1) % K]["idx"]
        res = evaluate_pair(i_curr, i_next)
        inl = res.get("inliers", 0)
        final_adj_inliers.append(inl)
        if inl < min_inliers:
            min_inliers = inl
            weakest_edge = f"{loaded_candidates[i_curr]['candidateId']}->{loaded_candidates[i_next]['candidateId']} ({inl} inliers)"
        if not res.get("connected", False):
            final_connected = False

    closure_edge = evaluate_pair(augmented_sequence[-1]["idx"], augmented_sequence[0]["idx"])
    full_ring_ready = (final_connected and closure_edge.get("connected", False))

    print(f"\n--- FINAL GRAPH EVALUATION ---")
    print(f"Panorama Input Count: {K}")
    print(f"Min Adjacent Inliers: {min_inliers}")
    print(f"Weakest Edge: {weakest_edge}")
    print(f"Closure Inliers: {closure_edge.get('inliers', 0)}")
    print(f"Full Ring Connected: {full_ring_ready}")

    # 6. Generate Contact Sheets & Visual Artifacts
    # A. 01_REAL_ACCEPTED_CANDIDATE_POOL.jpg
    pool_cols = 4
    pool_rows = int(math.ceil(num_loaded / pool_cols))
    tile_w, tile_h = 480, 270
    pool_sheet = np.full((pool_rows * tile_h, pool_cols * tile_w, 3), (29, 15, 10), dtype=np.uint8)

    for i, cand in enumerate(loaded_candidates):
        r = i // pool_cols
        c = i % pool_cols
        x = c * tile_w
        y = r * tile_h
        img_tile = cv2.resize(images_orig[i], (tile_w, tile_h), interpolation=cv2.INTER_AREA)
        cv2.rectangle(img_tile, (0, tile_h - 36), (tile_w, tile_h), (29, 15, 10), -1)
        lbl = f"[{cand.get('candidateId')}] Yaw: {cand.get('estimatedYawDeg', 0.0)} deg"
        cv2.putText(img_tile, lbl, (10, tile_h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (248, 189, 56), 1, cv2.LINE_AA)
        sub = f"#{cand.get('contentHash', cand.get('hash', ''))[:6]} | S:{cand.get('sharpnessScore', 0)}"
        cv2.putText(img_tile, sub, (tile_w - 180, tile_h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (184, 163, 148), 1, cv2.LINE_AA)
        pool_sheet[y:y+tile_h, x:x+tile_w] = img_tile

    cv2.imwrite(os.path.join(output_dir, "01_REAL_ACCEPTED_CANDIDATE_POOL.jpg"), pool_sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # B. 03_STITCH_AWARE_CANONICAL_SET.jpg
    canon_cols = 4
    canon_rows = int(math.ceil(len(canonical_ring) / canon_cols))
    canon_sheet = np.full((canon_rows * tile_h, canon_cols * tile_w, 3), (29, 15, 10), dtype=np.uint8)

    for i, c_idx in enumerate(canonical_ring):
        r = i // canon_cols
        c = i % canon_cols
        x = c * tile_w
        y = r * tile_h
        cand = loaded_candidates[c_idx]
        img_tile = cv2.resize(images_orig[c_idx], (tile_w, tile_h), interpolation=cv2.INTER_AREA)
        cv2.rectangle(img_tile, (0, tile_h - 36), (tile_w, tile_h), (29, 15, 10), -1)
        lbl = f"[CANONICAL {i+1}] {cand.get('candidateId')} | {cand.get('estimatedYawDeg')} deg"
        cv2.putText(img_tile, lbl, (10, tile_h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (56, 189, 248), 1, cv2.LINE_AA)
        canon_sheet[y:y+tile_h, x:x+tile_w] = img_tile

    cv2.imwrite(os.path.join(output_dir, "03_STITCH_AWARE_CANONICAL_SET.jpg"), canon_sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # C. 05_FINAL_PANORAMA_INPUT_SET.jpg (with [BRIDGE] clearly marked)
    final_cols = 4
    final_rows = int(math.ceil(K / final_cols))
    final_sheet = np.full((final_rows * tile_h, final_cols * tile_w, 3), (29, 15, 10), dtype=np.uint8)

    for i, item in enumerate(augmented_sequence):
        r = i // final_cols
        c = i % final_cols
        x = c * tile_w
        y = r * tile_h
        cand = item["candidate"]
        img_tile = cv2.resize(images_orig[item["idx"]], (tile_w, tile_h), interpolation=cv2.INTER_AREA)
        cv2.rectangle(img_tile, (0, tile_h - 36), (tile_w, tile_h), (29, 15, 10), -1)

        is_bridge = (item["type"] == "BRIDGE")
        color = (16, 185, 129) if not is_bridge else (245, 158, 11)
        tag = "[BRIDGE]" if is_bridge else f"[KF{i+1:02d}]"
        lbl = f"{tag} {cand.get('candidateId')} | {cand.get('estimatedYawDeg')} deg"
        cv2.putText(img_tile, lbl, (10, tile_h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 1, cv2.LINE_AA)

        if is_bridge:
            cv2.rectangle(img_tile, (0, 0), (tile_w, tile_h), (245, 158, 11), 3)

        final_sheet[y:y+tile_h, x:x+tile_w] = img_tile

    cv2.imwrite(os.path.join(output_dir, "05_FINAL_PANORAMA_INPUT_SET.jpg"), final_sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # D. 02_REAL_CANDIDATE_MATCH_GRAPH.png
    g_size = 1400
    g_center = (g_size // 2, g_size // 2 + 20)
    g_rad = 480
    graph_img = np.full((g_size, g_size, 3), (29, 15, 10), dtype=np.uint8)

    c_coords = {}
    for i, cand in enumerate(loaded_candidates):
        ang_rad = math.radians(cand.get("estimatedYawDeg", 0.0) - 90.0)
        cx = int(round(g_center[0] + g_rad * math.cos(ang_rad)))
        cy = int(round(g_center[1] + g_rad * math.sin(ang_rad)))
        c_coords[i] = (cx, cy)

    for (u, v), res in graph_edges.items():
        if res.get("connected", False):
            inl = res.get("inliers", 0)
            c = (129, 185, 16) if inl >= 30 else (11, 158, 245)
            cv2.line(graph_img, c_coords[u], c_coords[v], c, 1, cv2.LINE_AA)

    for k in range(K):
        u = augmented_sequence[k]["idx"]
        v = augmented_sequence[(k + 1) % K]["idx"]
        key = (min(u, v), max(u, v))
        inl = graph_edges.get(key, {}).get("inliers", 0)
        cv2.line(graph_img, c_coords[u], c_coords[v], (56, 189, 248), 3, cv2.LINE_AA)
        mx = (c_coords[u][0] + c_coords[v][0]) // 2
        my = (c_coords[u][1] + c_coords[v][1]) // 2
        cv2.putText(graph_img, f"{inl}", (mx, my), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

    for i, cand in enumerate(loaded_candidates):
        pt = c_coords[i]
        in_final = any(item["idx"] == i for item in augmented_sequence)
        is_bridge = any(item["idx"] == i and item["type"] == "BRIDGE" for item in augmented_sequence)
        
        node_color = (245, 158, 11) if is_bridge else ((56, 189, 248) if in_final else (70, 50, 40))
        rad = 24 if in_final else 14
        cv2.circle(graph_img, pt, rad, node_color, -1, cv2.LINE_AA)
        cv2.circle(graph_img, pt, rad, (248, 250, 252), 1, cv2.LINE_AA)
        cv2.putText(graph_img, cand.get("candidateId"), (pt[0] - 18, pt[1] + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

    cv2.putText(graph_img, "02_REAL_CANDIDATE_MATCH_GRAPH: Polar Feature Connectivity & Ring Path", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (248, 250, 252), 2, cv2.LINE_AA)
    cv2.putText(graph_img, f"Session: {session_id} | Total Candidates: {num_loaded} | Final Ring Input: {K} | Min Inliers: {min_inliers}", (50, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (184, 163, 148), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(output_dir, "02_REAL_CANDIDATE_MATCH_GRAPH.png"), graph_img)

    # E. 04_BRIDGE_FRAME_ANALYSIS.png
    b_img = np.full((600, 1200, 3), (29, 15, 10), dtype=np.uint8)
    cv2.putText(b_img, "04_BRIDGE_FRAME_ANALYSIS: Weak Transitions & Recovery Paths", (40, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (248, 250, 252), 2, cv2.LINE_AA)
    y_pos = 110
    if bridge_records:
        for b_rec in bridge_records:
            t = f"Sector {b_rec['sector']}: Original Inliers = {b_rec['originalEdgeInliers']} -> Bridge {b_rec['bridgeCandidate']} -> Min Inliers = {b_rec['bridgeMinInliers']} (Valid: {b_rec['valid']})"
            cv2.putText(b_img, t, (40, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (245, 158, 11), 1, cv2.LINE_AA)
            y_pos += 45
    else:
        cv2.putText(b_img, "No weak transitions required bridge insertion (All canonical edges connected >= 15 inliers).", (40, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (16, 185, 129), 1, cv2.LINE_AA)

    cv2.imwrite(os.path.join(output_dir, "04_BRIDGE_FRAME_ANALYSIS.png"), b_img)

    # F. Save Manifests
    match_graph_json = {
        "sessionId": session_id,
        "candidateCount": num_loaded,
        "edgesEvaluated": len(graph_edges),
        "edges": [
            {
                "pair": f"{e['candA']}->{e['candB']}",
                "rawMatches": e["rawMatches"],
                "goodMatches": e["goodMatches"],
                "inliers": e["inliers"],
                "inlierRatio": e["inlierRatio"],
                "connected": e["connected"]
            }
            for e in graph_edges.values()
        ]
    }
    with open(os.path.join(output_dir, "candidate_match_graph.json"), 'w') as f:
        json.dump(match_graph_json, f, indent=2)

    selection_json = {
        "sessionId": session_id,
        "canonicalCount": len(canonical_ring),
        "canonicalCandidates": [loaded_candidates[idx]["candidateId"] for idx in canonical_ring],
        "bridgesAdded": len(bridge_records),
        "bridgeDetails": bridge_records
    }
    with open(os.path.join(output_dir, "stitch_aware_selection.json"), 'w') as f:
        json.dump(selection_json, f, indent=2)

    panorama_input_manifest = {
        "sessionId": session_id,
        "panoramaInputCount": K,
        "graphConnected": final_connected,
        "fullRingReady": full_ring_ready,
        "minAdjacentInliers": min_inliers,
        "weakestEdge": weakest_edge,
        "closureInliers": closure_edge.get("inliers", 0),
        "frames": [
            {
                "sequenceIndex": i + 1,
                "type": item["type"],
                "candidateId": item["candidate"]["candidateId"],
                "estimatedYawDeg": item["candidate"].get("estimatedYawDeg", 0.0),
                "hash": item["candidate"].get("contentHash", item["candidate"].get("hash", "")),
                "file": os.path.basename(item["candidate"].get("actualFile", ""))
            }
            for i, item in enumerate(augmented_sequence)
        ]
    }
    with open(os.path.join(output_dir, "panorama_input_manifest.json"), 'w') as f:
        json.dump(panorama_input_manifest, f, indent=2)

    # G. 06_RING_CONNECTIVITY_REPORT.md
    report_md = f"""# 06_RING_CONNECTIVITY_REPORT
**Session ID**: {session_id}
**Total Accepted Candidates**: {num_loaded}
**Stitch-Aware Canonical Count**: {len(canonical_ring)}
**Bridges Added**: {len(bridge_records)}
**Final Panorama Input Count**: {K}

## Ring Geometry & Graph Metrics
- **Graph Connected**: {final_connected}
- **Full Ring Ready**: {full_ring_ready}
- **Min Adjacent Inliers**: {min_inliers}
- **Weakest Edge**: {weakest_edge}
- **Closure Inliers**: {closure_edge.get('inliers', 0)} ({closure_edge.get('inlierRatio', 0.0)} inlier ratio)

## Bridge Recoveries
"""
    if bridge_records:
        for b in bridge_records:
            report_md += f"- **Sector {b['sector']}**: Bridge `{b['bridgeCandidate']}` inserted (min inliers: {b['bridgeMinInliers']})\n"
    else:
        report_md += "- None required; canonical set was fully connected.\n"

    with open(os.path.join(output_dir, "06_RING_CONNECTIVITY_REPORT.md"), 'w') as f:
        f.write(report_md)

    print("Stitch-aware selection and artifact generation completed successfully.")
    return panorama_input_manifest

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python stitch_aware_selector.py <capture_session_dir> <output_dir> <session_id>")
        sys.exit(1)
    run_stitch_aware_selection(sys.argv[1], sys.argv[2], sys.argv[3])
