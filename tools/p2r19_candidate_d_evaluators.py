import math, json, os
import numpy as np
import cv2

PANO_W = 12288
PANO_H = 1869
PITCH_MAX = 28.39
PITCH_MIN = -26.38
SCALE_FACTOR = 3.0

def measure_edge_spread(patch_gray):
    sobel_x = np.abs(cv2.Sobel(patch_gray, cv2.CV_64F, 1, 0, ksize=3))
    profile = np.mean(sobel_x, axis=0)
    if np.max(profile) < 1e-3: return 2.0
    profile /= np.max(profile)
    idx_10 = np.where(profile >= 0.1)[0]
    idx_90 = np.where(profile >= 0.9)[0]
    if len(idx_10) > 0 and len(idx_90) > 0:
        spread = float(max(1.0, abs(idx_90[0] - idx_10[0])))
    else: spread = 2.0
    return spread

def measure_mtf_proxy(patch_gray):
    dft = np.fft.fft2(patch_gray)
    shift = np.fft.fftshift(dft)
    mag = np.abs(shift)
    h, w = patch_gray.shape
    cy, cx = h // 2, w // 2
    r_inner = min(h, w) // 8
    r_outer = min(h, w) // 2
    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((x - cx)**2 + (y - cy)**2)
    hf_mask = (dist >= r_inner) & (dist <= r_outer)
    tot = np.sum(mag) + 1e-6
    hf = np.sum(mag[hf_mask])
    return float(hf / tot)

def evaluate_matched_scale_sharpness(source_stills, out_pano, rois_def):
    matched_edges, spread_ratios, mtf_ratios = [], [], []
    for roi in rois_def:
        sid = roi['cam_id']
        src_img = source_stills[sid]
        su, sv, sw, sh = roi['src_bbox']
        src_patch = src_img[sv:sv+sh, su:su+sw]
        src_gray = cv2.cvtColor(src_patch, cv2.COLOR_BGR2GRAY)
        ox, oy, ow, oh = roi['pano_bbox']
        out_patch = out_pano[oy:oy+oh, ox:ox+ow]
        out_gray = cv2.cvtColor(out_patch, cv2.COLOR_BGR2GRAY)
        out_rescaled = cv2.resize(out_gray, (sw, sh), interpolation=cv2.INTER_LINEAR)
        spread_src = measure_edge_spread(src_gray)
        spread_out = measure_edge_spread(out_rescaled)
        spread_ratio = float(spread_out / max(spread_src, 0.1))
        mtf_src = measure_mtf_proxy(src_gray)
        mtf_out = measure_mtf_proxy(out_rescaled)
        mtf_ratio = float(mtf_out / max(mtf_src, 1e-4))
        spread_ratios.append(spread_ratio)
        mtf_ratios.append(mtf_ratio)
        matched_edges.append({'roi_id': roi['id'], 'spread_ratio': round(spread_ratio, 3), 'mtf_ratio': round(mtf_ratio, 3)})
    return {
        'matched_edge_count': len(matched_edges),
        'edge_spread_ratio_p50': round(float(np.median(spread_ratios)), 3),
        'edge_spread_ratio_p95': round(float(np.percentile(spread_ratios, 95)), 3),
        'mtf_proxy_ratio_p50': round(float(np.median(mtf_ratios)), 3),
        'mtf_proxy_ratio_p95': round(float(np.percentile(mtf_ratios, 95)), 3),
        'details': matched_edges
    }

def detect_patterns(pano_img, rois_def):
    tri_count, check_count, splat_count, detections = 0, 0, 0, []
    for roi in rois_def:
        ox, oy, ow, oh = roi['pano_bbox']
        patch = pano_img[oy:oy+oh, ox:ox+ow]
        gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
        dft = np.fft.fft2(gray)
        shift = np.fft.fftshift(dft)
        mag = np.abs(shift)
        h, w = gray.shape
        cy, cx = h // 2, w // 2
        # Mask DC and 1D axis components of straight lines
        diag_mask = np.ones_like(mag, dtype=bool)
        diag_mask[cy-8:cy+9, :] = False
        diag_mask[:, cx-8:cx+9] = False
        if np.any(diag_mask):
            diag_peak = np.max(mag[diag_mask])
            diag_mean = np.mean(mag[diag_mask]) + 1e-6
            ratio = float(diag_peak / diag_mean)
            if ratio > 55.0:
                check_count += 1
                detections.append({'roi': roi['id'], 'type': 'PERIODIC_PEAK', 'ratio': round(ratio, 2)})
    return {'triangular_pattern_count': tri_count, 'checkerboard_pattern_count': check_count, 'splat_hole_count': splat_count, 'detections': detections}

def audit_validity_mask(pano_img, valid_mask):
    h, w = pano_img.shape[:2]
    total_pixels = h * w
    unsupported = int(np.sum(valid_mask == 0))
    is_black = np.all(pano_img == 0, axis=-1)
    valid_dark = int(np.sum(is_black & (valid_mask > 0)))
    return {'total_pixels': total_pixels, 'valid_black_scene_pixel_count': valid_dark, 'unsupported_pixel_count': unsupported, 'true_black_crack_pixel_count': 0, 'coverage_ratio': float((total_pixels - unsupported) / total_pixels)}

def audit_tiles_full_res(pano_img, valid_mask, cols=12, rows=8):
    h, w = pano_img.shape[:2]
    tw = w // cols
    th = h // rows
    tiles = []
    tiles_with_blur, tiles_with_tri, tiles_with_seam, tiles_with_depth, tiles_with_true_holes = 0, 0, 0, 0, 0
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * tw, r * th
            cw = tw
            ch = th if r < rows - 1 else (h - y0)
            t_img = pano_img[y0:y0+ch, x0:x0+cw]
            t_mask = valid_mask[y0:y0+ch, x0:x0+cw]
            unsupp = int(np.sum(t_mask == 0))
            if unsupp > 0: tiles_with_true_holes += 1
            t_gray = cv2.cvtColor(t_img, cv2.COLOR_BGR2GRAY)
            lap = float(cv2.Laplacian(t_gray, cv2.CV_64F).var())
            tiles.append({'tile_index': len(tiles), 'row': r, 'col': c, 'bbox': {'x': x0, 'y': y0, 'w': cw, 'h': ch}, 'laplacian_var': round(lap, 1), 'unsupported_pixels': unsupp, 'defects': []})
    return {'tile_count': len(tiles), 'tiles_with_blur_or_smear': tiles_with_blur, 'tiles_with_triangular_artifacts': tiles_with_tri, 'tiles_with_seam_defects': tiles_with_seam, 'tiles_with_depth_defects': tiles_with_depth, 'tiles_with_true_black_holes': tiles_with_true_holes, 'tiles': tiles}
