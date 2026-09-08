#!/usr/bin/env python3
"""
3D2 / 3DZ Virtual Tradeshow - Stitch-Aware Keyframe Selector & Adaptive Multi-Hop Bridge Recovery
Script: stitch_aware_selector.py
Production Version: 3D2-C12.9-P2R10

Authoritative Principles:
- CANONICAL_CAPTURE_TARGET = 8-16 (compact customer contract preserved)
- panoramaStitchFrameIds = canonical + supplemental physical bridge candidates
- Multi-hop shortest path over calibrated SO(3) pure-rotation valid edges
- No fixed-24 assumption; adaptive minimization subject to full ring connectivity
- MAX_PANORAMA_STITCH_INPUTS = 48 (safety ceiling)
"""

import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

import json
import math
import hashlib
import cv2
import numpy as np
import networkx as nx

# Import shared SO(3) pure-rotation geometry validator
from panorama_geometry_validator import (
    validate_edge_features,
    build_intrinsics_matrix,
    MIN_INLIER_COUNT,
    MIN_INLIER_RATIO,
    MAX_PURE_ROT_REPROJ_PX,
    RAW_H_CONDITION_NUMBER_HARD_GATE,
    ESSENTIAL_MATRIX_PRIMARY_MODEL,
    FORCED_EDGE_POLICY
)

cv2.ocl.setUseOpenCL(False)

MAX_ALLOWED_STITCH_INPUT_COUNT = 48

def run_stitch_aware_selection(capture_session_dir, output_dir, session_id):
    os.makedirs(output_dir, exist_ok=True)
    candidates_dir = os.path.join(capture_session_dir, "candidates")
    pool_manifest_path = os.path.join(capture_session_dir, "candidate_pool.json")

    if not os.path.exists(pool_manifest_path):
        raise FileNotFoundError(f"Candidate pool manifest not found at: {pool_manifest_path}")

    with open(pool_manifest_path, 'r', encoding='utf-8') as f:
        pool_data = json.load(f)

    candidates = pool_data.get("candidates", [])
    if not candidates:
        raise ValueError("Candidate pool is empty!")

    # Sort candidates in deterministic rotational order (by yaw angle)
    candidates.sort(key=lambda c: (c.get("estimatedYawDeg", c.get("sensorYaw", c.get("angle", 0.0))), c.get("index", 0)))
    N = len(candidates)
    print(f"[Selector] Loaded {N} candidates for session {session_id}.")

    # 1. Load images and compute SIFT features
    sift = cv2.SIFT_create()
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
            print(f"[Selector] Warning: Candidate file {cand_file} missing, skipping.")
            continue

        img = cv2.imread(cand_file)
        if img is None:
            print(f"[Selector] Warning: Could not decode {cand_file}, skipping.")
            continue

        h, w = img.shape[:2]
        s = min(1.0, max_dim / max(h, w))
        img_sm = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)

        kp, des = sift.detectAndCompute(img_sm, None)
        if des is None or len(kp) < 4:
            print(f"[Selector] [{cid}] Warning: Insufficient keypoints ({len(kp) if kp else 0})")
            des = np.zeros((0, 128), dtype=np.float32)
            kp = []

        cand["loadedIndex"] = len(loaded_candidates)
        cand["actualFile"] = cand_file
        loaded_candidates.append(cand)
        kps.append(kp)
        descs.append(des)
        images_sm.append(img_sm)
        images_orig.append(img)

    num_loaded = len(loaded_candidates)
    if num_loaded < 4:
        raise ValueError(f"Insufficient valid candidate images loaded ({num_loaded})")

    # 2. Build Candidate Match Graph using Shared SO(3) Pure-Rotation Validator
    graph_edges = {}
    adj_matrix = {i: [] for i in range(num_loaded)}
    visual_graph = nx.Graph()
    for i in range(num_loaded):
        cid = loaded_candidates[i].get("candidateId")
        yaw = loaded_candidates[i].get("estimatedYawDeg", loaded_candidates[i].get("sensorYaw", loaded_candidates[i].get("angle", 0.0)))
        visual_graph.add_node(i, candidateId=cid, yaw=yaw)

    def evaluate_pair(i, j):
        key = (min(i, j), max(i, j))
        if key in graph_edges:
            return graph_edges[key]

        cand_a = loaded_candidates[key[0]]
        cand_b = loaded_candidates[key[1]]
        cand_a_id = cand_a.get("candidateId")
        cand_b_id = cand_b.get("candidateId")
        yaw_a = cand_a.get("estimatedYawDeg", cand_a.get("sensorYaw", cand_a.get("angle", 0.0)))
        yaw_b = cand_b.get("estimatedYawDeg", cand_b.get("sensorYaw", cand_b.get("angle", 0.0)))

        des1, des2 = descs[key[0]], descs[key[1]]
        kp1, kp2 = kps[key[0]], kps[key[1]]

        img_h, img_w = images_sm[key[0]].shape[:2]
        K = build_intrinsics_matrix(width=img_w, height=img_h)

        val_res = validate_edge_features(
            kp1, des1, kp2, des2,
            img_shape=(img_h, img_w),
            sensor_yaw_a=yaw_a,
            sensor_yaw_b=yaw_b,
            K=K
        )

        connected = val_res["valid"]
        inliers = val_res["nInliers"]
        inlier_ratio = val_res["inlierRatio"]
        reproj = val_res["reprojErrorPx"]

        res = {
            "i": key[0],
            "j": key[1],
            "candA": cand_a_id,
            "candB": cand_b_id,
            "rawMatches": val_res["nMatches"],
            "goodMatches": val_res["nMatches"],
            "inliers": inliers,
            "inlierRatio": inlier_ratio,
            "medianError": reproj,
            "connected": connected,
            "rotationDeg": val_res["rotationDeg"],
            "orthogonalityError": val_res["orthogonalityError"],
            "firstFailedGate": val_res["firstFailedGate"]
        }
        graph_edges[key] = res

        if connected:
            adj_matrix[key[0]].append(key[1])
            adj_matrix[key[1]].append(key[0])
            # Weight favors high inliers, high ratio, low reprojection residual
            weight = (100.0 / max(1.0, inliers * inlier_ratio)) + (reproj / 10.0)
            visual_graph.add_edge(key[0], key[1], weight=weight, inliers=inliers, ratio=inlier_ratio, reproj=reproj)

        return res

    # Evaluate sequence-aware neighborhood pairs: offset 1..4
    for i in range(num_loaded):
        for offset in range(1, min(5, num_loaded)):
            j = (i + offset) % num_loaded
            evaluate_pair(i, j)

    # 3. Stitch-Aware Canonical Selection (Customer Contract: 8-16, default 12)
    target_count = min(12, num_loaded)
    bucket_deg = 360.0 / target_count
    selected_indices = []

    for b in range(target_count):
        center_angle = b * bucket_deg
        in_bucket = []
        for idx, c in enumerate(loaded_candidates):
            ang = c.get("estimatedYawDeg", c.get("sensorYaw", c.get("angle", 0.0)))
            diff = abs((ang - center_angle + 180.0) % 360.0 - 180.0)
            if diff <= bucket_deg * 0.65:
                in_bucket.append((diff, idx, c))

        if in_bucket:
            in_bucket.sort(key=lambda item: (item[0], -item[2].get("sharpnessScore", 0)))
            chosen_idx = in_bucket[0][1]
            if chosen_idx not in selected_indices:
                selected_indices.append(chosen_idx)

    selected_indices.sort(key=lambda idx: loaded_candidates[idx].get("estimatedYawDeg", loaded_candidates[idx].get("sensorYaw", 0.0)))

    # 4. Adaptive Multi-Hop Bridge Frame Recovery
    canonical_ring = list(selected_indices)
    augmented_sequence = []
    bridge_records = []

    M = len(canonical_ring)
    for m in range(M):
        idx_a = canonical_ring[m]
        idx_b = canonical_ring[(m + 1) % M]
        edge_res = evaluate_pair(idx_a, idx_b)

        # Append canonical frame
        augmented_sequence.append({
            "idx": idx_a,
            "type": "CANONICAL",
            "candidate": loaded_candidates[idx_a]
        })

        # If direct edge is not valid under SO(3) validator, find shortest multi-hop path
        if not edge_res.get("connected", False) or edge_res.get("inliers", 0) < MIN_INLIER_COUNT:
            cid_a = loaded_candidates[idx_a]["candidateId"]
            cid_b = loaded_candidates[idx_b]["candidateId"]
            print(f"[Selector] Gap detected between {cid_a} and {cid_b} (Direct inliers: {edge_res.get('inliers', 0)}). Searching multi-hop bridge path...")

            bridge_path = None
            try:
                bridge_path = nx.shortest_path(visual_graph, source=idx_a, target=idx_b, weight="weight")
            except nx.NetworkXNoPath:
                # Expand local search around gap if not found
                print(f"[Selector] Expanding local search for sector {cid_a}->{cid_b}...")
                low = min(idx_a, idx_b)
                high = max(idx_a, idx_b)
                for u in range(max(0, low - 2), min(num_loaded, high + 3)):
                    for v in range(u + 1, min(num_loaded, u + 6)):
                        evaluate_pair(u, v)
                try:
                    bridge_path = nx.shortest_path(visual_graph, source=idx_a, target=idx_b, weight="weight")
                except nx.NetworkXNoPath:
                    bridge_path = None

            if bridge_path and len(bridge_path) > 2:
                # Path contains intermediate bridge nodes: idx_a -> b1 -> b2 -> ... -> idx_b
                intermediates = bridge_path[1:-1]
                min_bridge_inliers = 9999
                path_str = " -> ".join([loaded_candidates[node]["candidateId"] for node in bridge_path])
                print(f"  -> Found multi-hop bridge: {path_str} ({len(intermediates)} bridge frames)")

                for b_idx in intermediates:
                    augmented_sequence.append({
                        "idx": b_idx,
                        "type": "BRIDGE",
                        "candidate": loaded_candidates[b_idx],
                        "bridgePath": path_str
                    })

                # Calculate min inliers across path hops
                for h in range(len(bridge_path) - 1):
                    u = bridge_path[h]
                    v = bridge_path[h + 1]
                    key = (min(u, v), max(u, v))
                    hop_inl = graph_edges.get(key, {}).get("inliers", 0)
                    if hop_inl < min_bridge_inliers:
                        min_bridge_inliers = hop_inl

                bridge_records.append({
                    "sector": f"{cid_a}->{cid_b}",
                    "src": cid_a,
                    "dst": cid_b,
                    "bridgePath": path_str,
                    "bridgeCandidates": [loaded_candidates[node]["candidateId"] for node in intermediates],
                    "bridgeHops": len(bridge_path) - 1,
                    "originalEdgeInliers": edge_res.get("inliers", 0),
                    "minPathInliers": min_bridge_inliers,
                    "valid": min_bridge_inliers >= MIN_INLIER_COUNT
                })
            else:
                print(f"  -> Warning: No valid visual bridge path found for sector {cid_a}->{cid_b}")

    # Safety ceiling check (NO fixed 24 assumption)
    if len(augmented_sequence) > MAX_ALLOWED_STITCH_INPUT_COUNT:
        print(f"[Selector] Warning: Augmented sequence count {len(augmented_sequence)} exceeds safety ceiling {MAX_ALLOWED_STITCH_INPUT_COUNT}, capping.")
        augmented_sequence = augmented_sequence[:MAX_ALLOWED_STITCH_INPUT_COUNT]

    # 4b. Registration Retention Audit & Adaptive Densification
    def check_retention(seq_items):
        imgs = [images_sm[item["idx"]] for item in seq_items]
        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
        status = stitcher.estimateTransform(imgs)
        comp = stitcher.component()
        conn_idx = list(comp) if hasattr(comp, '__iter__') else []
        ret = len(conn_idx) / len(seq_items) if seq_items else 0.0
        return ret, status, len(conn_idx)

    curr_ret, curr_status, curr_conn = check_retention(augmented_sequence)
    print(f"[Selector] Initial ring retention: {curr_conn}/{len(augmented_sequence)} ({curr_ret*100:.1f}%)")

    if curr_ret < 0.85 and len(augmented_sequence) < min(num_loaded, MAX_ALLOWED_STITCH_INPUT_COUNT):
        print(f"[Selector] Retention {curr_ret*100:.1f}% < 85%. Densifying bridge candidates to satisfy camera retention...")
        canonical_set = set(canonical_ring)
        if num_loaded <= MAX_ALLOWED_STITCH_INPUT_COUNT:
            augmented_sequence = [
                {
                    "idx": i,
                    "candidate": loaded_candidates[i],
                    "type": "CANONICAL" if i in canonical_set else "BRIDGE"
                }
                for i in range(num_loaded)
            ]
        else:
            step = (num_loaded - 1) / float(MAX_ALLOWED_STITCH_INPUT_COUNT - 1)
            sampled_indices = sorted(list(set(canonical_ring + [int(round(i * step)) for i in range(MAX_ALLOWED_STITCH_INPUT_COUNT)])))
            if len(sampled_indices) > MAX_ALLOWED_STITCH_INPUT_COUNT:
                sampled_indices = sampled_indices[:MAX_ALLOWED_STITCH_INPUT_COUNT]
            augmented_sequence = [
                {
                    "idx": i,
                    "candidate": loaded_candidates[i],
                    "type": "CANONICAL" if i in canonical_set else "BRIDGE"
                }
                for i in sampled_indices
            ]
        curr_ret, curr_status, curr_conn = check_retention(augmented_sequence)
        print(f"[Selector] Densified ring retention: {curr_conn}/{len(augmented_sequence)} ({curr_ret*100:.1f}%)")

    # 5. Measure Final Ring Connectivity and Graph Component Count
    K = len(augmented_sequence)
    final_adj_inliers = []
    final_connected = True
    weakest_edge = None
    min_inliers = 9999

    # Build final ring subgraph to verify component count
    final_indices = [item["idx"] for item in augmented_sequence]
    final_subgraph = visual_graph.subgraph(final_indices)
    component_count = nx.number_connected_components(final_subgraph) if len(final_indices) > 0 else 0

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
    full_ring_ready = bool(final_connected and closure_edge.get("connected", False) and component_count == 1)

    print(f"[Selector] Final ring input count: {K} (Canonical: {len(canonical_ring)}, Bridges: {len(augmented_sequence) - len(canonical_ring)})")
    print(f"[Selector] Full ring connected: {final_connected}, Components: {component_count}, Full ring ready: {full_ring_ready}")

    # 6. Save Visualizations
    # A. 03_STITCH_AWARE_CANONICAL_SET.jpg
    canon_imgs = [images_sm[idx] for idx in canonical_ring]
    c_cols = 4
    c_rows = int(math.ceil(len(canon_imgs) / float(c_cols)))
    th_w, th_h = 320, 180
    canon_sheet = np.zeros((c_rows * th_h, c_cols * th_w, 3), dtype=np.uint8)
    for idx_pos, img in enumerate(canon_imgs):
        r = idx_pos // c_cols
        c = idx_pos % c_cols
        th = cv2.resize(img, (th_w, th_h))
        cid = loaded_candidates[canonical_ring[idx_pos]]["candidateId"]
        yaw = loaded_candidates[canonical_ring[idx_pos]].get("estimatedYawDeg", 0.0)
        cv2.putText(th, f"{cid} ({yaw:.1f}deg)", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        canon_sheet[r*th_h:(r+1)*th_h, c*th_w:(c+1)*th_w] = th
    cv2.imwrite(os.path.join(output_dir, "03_STITCH_AWARE_CANONICAL_SET.jpg"), canon_sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # B. 05_AUGMENTED_STITCH_RING.jpg
    aug_imgs = [images_sm[item["idx"]] for item in augmented_sequence]
    a_cols = 4
    a_rows = int(math.ceil(len(aug_imgs) / float(a_cols)))
    aug_sheet = np.zeros((a_rows * th_h, a_cols * th_w, 3), dtype=np.uint8)
    for idx_pos, item in enumerate(augmented_sequence):
        r = idx_pos // a_cols
        c = idx_pos % a_cols
        th = cv2.resize(images_sm[item["idx"]], (th_w, th_h))
        cid = item["candidate"]["candidateId"]
        lbl = f"{cid} ({item['type']})"
        col = (0, 255, 0) if item["type"] == "CANONICAL" else (0, 165, 255)
        cv2.putText(th, lbl, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
        aug_sheet[r*th_h:(r+1)*th_h, c*th_w:(c+1)*th_w] = th
    cv2.imwrite(os.path.join(output_dir, "05_AUGMENTED_STITCH_RING.jpg"), aug_sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # C. Polar Match Graph: 02_REAL_CANDIDATE_MATCH_GRAPH.png
    g_size = 1400
    g_center = (g_size // 2, g_size // 2 + 20)
    g_rad = 480
    graph_img = np.full((g_size, g_size, 3), (29, 15, 10), dtype=np.uint8)
    c_coords = {}
    for i, cand in enumerate(loaded_candidates):
        ang_rad = math.radians(cand.get("estimatedYawDeg", cand.get("sensorYaw", 0.0)) - 90.0)
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
        cv2.line(graph_img, c_coords[u], c_coords[v], (56, 189, 248), 3, cv2.LINE_AA)

    for i, cand in enumerate(loaded_candidates):
        pt = c_coords[i]
        in_final = any(item["idx"] == i for item in augmented_sequence)
        is_bridge = any(item["idx"] == i and item["type"] == "BRIDGE" for item in augmented_sequence)
        node_color = (245, 158, 11) if is_bridge else ((56, 189, 248) if in_final else (70, 50, 40))
        rad = 24 if in_final else 14
        cv2.circle(graph_img, pt, rad, node_color, -1, cv2.LINE_AA)
        cv2.circle(graph_img, pt, rad, (248, 250, 252), 1, cv2.LINE_AA)
        cv2.putText(graph_img, cand.get("candidateId"), (pt[0] - 18, pt[1] + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

    cv2.putText(graph_img, "02_REAL_CANDIDATE_MATCH_GRAPH: Polar Feature Connectivity & Adaptive Ring Path", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (248, 250, 252), 2, cv2.LINE_AA)
    cv2.putText(graph_img, f"Session: {session_id} | Total Candidates: {num_loaded} | Adaptive Ring Input: {K} | Min Inliers: {min_inliers}", (50, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (184, 163, 148), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(output_dir, "02_REAL_CANDIDATE_MATCH_GRAPH.png"), graph_img)

    # 7. Save Authoritative Production Fields in Manifests
    canonical_frame_ids = [loaded_candidates[idx]["candidateId"] for idx in canonical_ring]
    panorama_stitch_frame_ids = [item["candidate"]["candidateId"] for item in augmented_sequence]
    supplemental_bridge_frame_ids = list(dict.fromkeys([item["candidate"]["candidateId"] for item in augmented_sequence if item["type"] == "BRIDGE"]))

    match_graph_json = {
        "sessionId": session_id,
        "candidateCount": num_loaded,
        "edgesEvaluated": len(graph_edges),
        "edges": [
            {
                "pair": f"{e['candA']}->{e['candB']}",
                "rawMatches": e["rawMatches"],
                "inliers": e["inliers"],
                "inlierRatio": e["inlierRatio"],
                "reprojError": e["medianError"],
                "rotationDeg": e.get("rotationDeg"),
                "connected": e["connected"]
            }
            for e in graph_edges.values()
        ]
    }
    with open(os.path.join(output_dir, "candidate_match_graph.json"), 'w', encoding='utf-8') as f:
        json.dump(match_graph_json, f, indent=2)

    selection_json = {
        "sessionId": session_id,
        "canonicalCount": len(canonical_ring),
        "canonicalCandidates": canonical_frame_ids,
        "canonicalFrameIds": canonical_frame_ids,
        "panoramaStitchFrameIds": panorama_stitch_frame_ids,
        "supplementalBridgeFrameIds": supplemental_bridge_frame_ids,
        "supplementalBridgeFrameCount": len(supplemental_bridge_frame_ids),
        "bridgesAdded": len(bridge_records),
        "bridgeDetails": bridge_records,
        "visualGraphConnected": final_connected,
        "visualGraphComponentCount": component_count,
        "minConnectedStitchInputCount": K,
        "maxAllowedStitchInputs": MAX_ALLOWED_STITCH_INPUT_COUNT
    }
    with open(os.path.join(output_dir, "stitch_aware_selection.json"), 'w', encoding='utf-8') as f:
        json.dump(selection_json, f, indent=2)

    panorama_input_manifest = {
        "sessionId": session_id,
        "panoramaInputCount": K,
        "graphConnected": final_connected,
        "visualGraphConnected": final_connected,
        "visualGraphComponentCount": component_count,
        "fullRingReady": full_ring_ready,
        "minAdjacentInliers": min_inliers,
        "weakestEdge": weakest_edge,
        "closureInliers": closure_edge.get("inliers", 0),
        "canonicalFrameIds": canonical_frame_ids,
        "panoramaStitchFrameIds": panorama_stitch_frame_ids,
        "supplementalBridgeFrameIds": supplemental_bridge_frame_ids,
        "minConnectedStitchInputCount": K,
        "maxAllowedStitchInputs": MAX_ALLOWED_STITCH_INPUT_COUNT,
        "frames": [
            {
                "sequenceIndex": i + 1,
                "type": item["type"],
                "candidateId": item["candidate"]["candidateId"],
                "estimatedYawDeg": item["candidate"].get("estimatedYawDeg", item["candidate"].get("sensorYaw", 0.0)),
                "hash": item["candidate"].get("contentHash", item["candidate"].get("sha256", "")),
                "file": os.path.basename(item["candidate"].get("actualFile", "")),
                "path": item["candidate"].get("actualFile", "")
            }
            for i, item in enumerate(augmented_sequence)
        ]
    }
    with open(os.path.join(output_dir, "panorama_input_manifest.json"), 'w', encoding='utf-8') as f:
        json.dump(panorama_input_manifest, f, indent=2)

    # 06_RING_CONNECTIVITY_REPORT.md
    report_md = f"""# 06_RING_CONNECTIVITY_REPORT
**Session ID**: {session_id}
**Total Accepted Candidates**: {num_loaded}
**Stitch-Aware Canonical Count**: {len(canonical_ring)}
**Bridges Added**: {len(bridge_records)}
**Supplemental Bridge Frames**: {len(supplemental_bridge_frame_ids)} ({', '.join(supplemental_bridge_frame_ids) if supplemental_bridge_frame_ids else 'None'})
**Final Panorama Input Count**: {K}

## Ring Geometry & Graph Metrics
- **Graph Connected**: {final_connected}
- **Component Count**: {component_count}
- **Full Ring Ready**: {full_ring_ready}
- **Min Adjacent Inliers**: {min_inliers}
- **Weakest Edge**: {weakest_edge}
- **Closure Inliers**: {closure_edge.get('inliers', 0)} ({closure_edge.get('inlierRatio', 0.0)} inlier ratio)

## Bridge Recoveries
"""
    if bridge_records:
        for b in bridge_records:
            report_md += f"- **Sector {b['sector']}**: Multi-hop path `{b['bridgePath']}` (min inliers: {b['minPathInliers']}, hops: {b['bridgeHops']})\n"
    else:
        report_md += "- None required; canonical set was fully connected.\n"

    with open(os.path.join(output_dir, "06_RING_CONNECTIVITY_REPORT.md"), 'w', encoding='utf-8') as f:
        f.write(report_md)

    print(f"[Selector] Adaptive multi-hop selection completed successfully: {K} frames selected.")
    return panorama_input_manifest

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Stitch-Aware Keyframe Selector & Adaptive Multi-Hop Bridge Recovery")
    parser.add_argument("pos_session_dir", nargs="?", default=None, help="Capture session directory")
    parser.add_argument("pos_output_dir", nargs="?", default=None, help="Output directory")
    parser.add_argument("pos_session_id", nargs="?", default=None, help="Session ID")
    parser.add_argument("--session-dir", dest="named_session_dir", default=None, help="Capture session directory")
    parser.add_argument("--output-dir", dest="named_output_dir", default=None, help="Output directory")
    parser.add_argument("--session-id", dest="named_session_id", default=None, help="Session ID")

    args = parser.parse_args()
    session_dir = args.named_session_dir or args.pos_session_dir
    output_dir = args.named_output_dir or args.pos_output_dir or session_dir
    session_id = args.named_session_id or args.pos_session_id or (os.path.basename(session_dir.rstrip("/\\")) if session_dir else "SESSION")

    if not session_dir:
        parser.print_help()
        sys.exit(1)

    run_stitch_aware_selection(session_dir, output_dir, session_id)
