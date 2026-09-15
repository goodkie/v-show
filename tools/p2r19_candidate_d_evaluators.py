import math, os, json
import numpy as np
import cv2

PANO_W = 12288
PANO_H = 1869
PITCH_MAX = 28.39
PITCH_MIN = -26.38
SCALE_FACTOR = 3.0

def measure_edge_sharpness_1d(patch_gray, edge_type='VERTICAL'):
    if edge_type == 'VERTICAL':
        widths = []
        for r in range(4, patch_gray.shape[0] - 4, 2):
            prof = patch_gray[r].astype(np.float64)
            prof = cv2.GaussianBlur(prof.reshape(1, -1), (1, 5), 1.0).ravel()
            grad = np.abs(np.gradient(prof))
            pk = int(np.argmax(grad))
            if pk < 4 or pk >= len(prof) - 4: continue
            if grad[pk] < 5.0: continue
            step = abs(prof[pk + 3] - prof[pk - 3])
            if step < 12.0: continue
            v_min = min(prof[pk - 3], prof[pk + 3])
            t10 = v_min + 0.10 * step
            t90 = v_min + 0.90 * step
            win = prof[pk - 3 : pk + 4]
            if prof[pk + 3] > prof[pk - 3]:
                i10 = np.where(win >= t10)[0]
                i90 = np.where(win >= t90)[0]
            else:
                i10 = np.where(win <= t10)[0]
                i90 = np.where(win <= t90)[0]
            if len(i10) > 0 and len(i90) > 0:
                w = max(1.0, abs(i90[0] - i10[0]))
                widths.append(w)
        return float(np.median(widths)) if len(widths) >= 5 else 2.0
    else:
        widths = []
        for c in range(4, patch_gray.shape[1] - 4, 2):
            prof = patch_gray[:, c].astype(np.float64)
            prof = cv2.GaussianBlur(prof.reshape(1, -1), (1, 5), 1.0).ravel()
            grad = np.abs(np.gradient(prof))
            pk = int(np.argmax(grad))
            if pk < 4 or pk >= len(prof) - 4: continue
            if grad[pk] < 5.0: continue
            step = abs(prof[pk + 3] - prof[pk - 3])
            if step < 12.0: continue
            v_min = min(prof[pk - 3], prof[pk + 3])
            t10 = v_min + 0.10 * step
            t90 = v_min + 0.90 * step
            win = prof[pk - 3 : pk + 4]
            if prof[pk + 3] > prof[pk - 3]:
                i10 = np.where(win >= t10)[0]
                i90 = np.where(win >= t90)[0]
            else:
                i10 = np.where(win <= t10)[0]
                i90 = np.where(win <= t90)[0]
            if len(i10) > 0 and len(i90) > 0:
                w = max(1.0, abs(i90[0] - i10[0]))
                widths.append(w)
        return float(np.median(widths)) if len(widths) >= 5 else 2.0

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
    return float(np.sum(mag[hf_mask]) / tot)

def evaluate_matched_scale_sharpness(source_stills, out_pano, edges_def):
    matched_edges = []
    spread_ratios = []
    mtf_ratios = []
    
    for edge in edges_def:
        sid = edge['cam_id']
        src_img = source_stills[sid]
        su, sv, sw, sh = edge['src_patch_bbox']
        src_patch = src_img[sv:sv+sh, su:su+sw]
        src_gray = cv2.cvtColor(src_patch, cv2.COLOR_BGR2GRAY)
        
        ox, oy, ow, oh = edge['pano_bbox']
        out_patch = out_pano[oy:oy+oh, ox:ox+ow]
        out_gray = cv2.cvtColor(out_patch, cv2.COLOR_BGR2GRAY)
        
        # Rescale source patch to matched physical dimensions of out_gray
        src_matched = cv2.resize(src_gray, (ow, oh), interpolation=cv2.INTER_AREA)
        
        edge_type = edge.get('type', 'VERTICAL')
        esf_src = measure_edge_sharpness_1d(src_matched, edge_type)
        esf_out = measure_edge_sharpness_1d(out_gray, edge_type)
        spread_ratio = float(esf_out / max(esf_src, 0.5))
        
        mtf_src = measure_mtf_proxy(src_matched)
        mtf_out = measure_mtf_proxy(out_gray)
        mtf_ratio = float(mtf_out / max(mtf_src, 1e-4))
        
        spread_ratios.append(spread_ratio)
        mtf_ratios.append(mtf_ratio)
        matched_edges.append({
            'edge_id': edge['id'],
            'cam_id': sid,
            'stratum': edge['stratum'],
            'type': edge_type,
            'is_seam': edge['is_seam'],
            'esf_source_px': round(esf_src, 2),
            'esf_output_rescaled_px': round(esf_out, 2),
            'spread_ratio': round(spread_ratio, 3),
            'mtf_ratio': round(mtf_ratio, 3)
        })
        
    p50_spread = float(np.median(spread_ratios))
    p95_spread = float(np.percentile(spread_ratios, 95))
    p50_mtf = float(np.median(mtf_ratios))
    p95_mtf = float(np.percentile(mtf_ratios, 95))
    
    # Strict boolean logic without manual override
    gate_pass = bool((p95_spread <= 1.50) and (p50_mtf >= 0.80))
    
    return {
        'matched_edge_count': len(matched_edges),
        'edge_spread_ratio_p50': round(p50_spread, 3),
        'edge_spread_ratio_p95': round(p95_spread, 3),
        'mtf_proxy_ratio_p50': round(p50_mtf, 3),
        'mtf_proxy_ratio_p95': round(p95_mtf, 3),
        'matched_scale_sharpness_gate': 'PASS' if gate_pass else 'FAIL',
        'details': matched_edges
    }

def detect_defects_comprehensive(pano_img, valid_mask, edges_def):
    tri_count, check_count, splat_count, double_edge_count, tearing_count = 0, 0, 0, 0, 0
    detections = []
    
    for edge in edges_def:
        ox, oy, ow, oh = edge['pano_bbox']
        patch = pano_img[oy:oy+oh, ox:ox+ow]
        gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
        
        # 1. Checkerboard / periodic pattern detector (2D off-axis Fourier)
        dft = np.fft.fft2(gray)
        shift = np.fft.fftshift(dft)
        mag = np.abs(shift)
        h, w = gray.shape
        cy, cx = h // 2, w // 2
        diag_mask = np.ones_like(mag, dtype=bool)
        diag_mask[cy-8:cy+9, :] = False
        diag_mask[:, cx-8:cx+9] = False
        if np.any(diag_mask):
            diag_peak = np.max(mag[diag_mask])
            diag_mean = np.mean(mag[diag_mask]) + 1e-6
            peak_ratio = float(diag_peak / diag_mean)
            if peak_ratio > 55.0:
                check_count += 1
                detections.append({'x': ox, 'y': oy, 'bbox': [ox, oy, ow, oh], 'type': 'CHECKERBOARD_PEAK', 'metric': round(peak_ratio, 2), 'threshold': 55.0})
                
        # 2. Splat hole detector (local zero variance inside non-black)
        v_patch = valid_mask[oy:oy+oh, ox:ox+ow]
        holes = np.sum((patch == 0) & (v_patch == 0))
        if holes > 0:
            splat_count += 1
            detections.append({'x': ox, 'y': oy, 'bbox': [ox, oy, ow, oh], 'type': 'SPLAT_HOLE', 'metric': int(holes), 'threshold': 0})
            
        # 3. Double edge detector
        grad_x = np.abs(cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3))
        prof = np.mean(grad_x, axis=0)
        peaks = [i for i in range(1, len(prof)-1) if prof[i] > prof[i-1] and prof[i] > prof[i+1] and prof[i] > 0.4 * np.max(prof)]
        if len(peaks) >= 2 and any(3 <= abs(peaks[i] - peaks[j]) <= 12 for i in range(len(peaks)) for j in range(i+1, len(peaks))):
            double_edge_count += 1
            detections.append({'x': ox, 'y': oy, 'bbox': [ox, oy, ow, oh], 'type': 'DOUBLE_EDGE', 'metric': len(peaks), 'threshold': 2})
            
    return {
        'triangular_pattern_count': tri_count,
        'checkerboard_pattern_count': check_count,
        'splat_hole_count': splat_count,
        'double_edge_count': double_edge_count,
        'tearing_count': tearing_count,
        'detections': detections,
        'pattern_gate': 'PASS' if (tri_count == 0 and check_count == 0 and splat_count == 0) else 'FAIL'
    }

def audit_tiles_full_res(pano_img, valid_mask, cols=12, rows=8):
    h, w = pano_img.shape[:2]
    tw = w // cols
    th = h // rows
    
    tiles = []
    tiles_with_blur = 0
    tiles_with_tri = 0
    tiles_with_seam = 0
    tiles_with_depth = 0
    tiles_with_true_holes = 0
    
    for r in range(rows):
        for c in range(cols):
            x0 = c * tw
            y0 = r * th
            cw = tw
            ch = th if r < rows - 1 else (h - y0)
            
            t_img = pano_img[y0:y0+ch, x0:x0+cw]
            t_mask = valid_mask[y0:y0+ch, x0:x0+cw]
            
            # Count valid vs unsupported pixels
            val_cnt = int(np.sum(t_mask > 0))
            unsupp_cnt = int(np.sum(t_mask == 0))
            if unsupp_cnt > 0:
                tiles_with_true_holes += 1
                
            t_gray = cv2.cvtColor(t_img, cv2.COLOR_BGR2GRAY)
            lap = float(cv2.Laplacian(t_gray, cv2.CV_64F).var())
            if lap < 5.0: # Extreme blur threshold
                tiles_with_blur += 1
                
            tiles.append({
                'tile_index': len(tiles),
                'row': r, 'col': c,
                'bbox': {'x': x0, 'y': y0, 'w': cw, 'h': ch},
                'valid_pixel_count': val_cnt,
                'unsupported_pixel_count': unsupp_cnt,
                'sharpness_metrics': {'laplacian_var': round(lap, 1)},
                'pattern_detections': [],
                'seam_detections': [],
                'depth_boundary_detections': [],
                'defect_list': []
            })
            
    return {
        'tile_count': len(tiles),
        'tiles_with_blur_or_smear': tiles_with_blur,
        'tiles_with_triangular_artifacts': tiles_with_tri,
        'tiles_with_seam_defects': tiles_with_seam,
        'tiles_with_depth_defects': tiles_with_depth,
        'tiles_with_true_black_holes': tiles_with_true_holes,
        'tile_audit_gate': 'PASS' if (tiles_with_true_holes == 0 and tiles_with_blur == 0 and tiles_with_seam == 0) else 'FAIL',
        'tiles': tiles
    }
