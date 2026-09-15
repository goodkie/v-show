# Rectified Structural Metrics Library for Phase 7C.2R4P4-R2B
import math
import numpy as np
import cv2

W_PANO_DEFAULT = 12288
H_PANO_DEFAULT = 1869
PITCH_MAX_DEFAULT = 28.39
PITCH_MIN_DEFAULT = -26.38

def project_source_point(cam_idx, u, v, extrinsics, intrinsics,
                         pano_w=W_PANO_DEFAULT, pano_h=H_PANO_DEFAULT,
                         pitch_max=PITCH_MAX_DEFAULT, pitch_min=PITCH_MIN_DEFAULT):
    """
    Project a source camera coordinate (u, v) into equirectangular panorama space.
    """
    K = intrinsics[cam_idx]
    R = extrinsics[cam_idx, :3, :3]
    K_inv = np.linalg.inv(K)
    
    d_cam = K_inv @ np.array([u, v, 1.0], dtype=np.float64)
    d_cam = d_cam / np.linalg.norm(d_cam)
    d_world = R.T @ d_cam
    
    yaw = (math.degrees(math.atan2(d_world[0], d_world[2])) + 360.0) % 360.0
    pitch = math.degrees(math.atan2(-d_world[1], math.sqrt(d_world[0]**2 + d_world[2]**2)))
    
    pitch_span = pitch_max - pitch_min
    x_pano = (yaw / 360.0) * pano_w
    y_pano = ((pitch_max - pitch) / pitch_span) * (pano_h - 1)
    
    return float(yaw), float(pitch), float(x_pano), float(y_pano)

def build_rectilinear_remap(yaw_deg, pitch_deg, hfov_deg=40.0,
                            out_w=600, out_h=600,
                            pano_w=W_PANO_DEFAULT, pano_h=H_PANO_DEFAULT,
                            pitch_max=PITCH_MAX_DEFAULT, pitch_min=PITCH_MIN_DEFAULT):
    """
    Build remap coordinates (map_x, map_y) for gnomonic rectilinear projection.
    """
    psi_0 = math.radians(yaw_deg)
    theta_0 = math.radians(pitch_deg)
    
    z_virt = np.array([math.sin(psi_0) * math.cos(theta_0),
                       -math.sin(theta_0),
                       math.cos(psi_0) * math.cos(theta_0)], dtype=np.float64)
    z_virt = z_virt / np.linalg.norm(z_virt)
    
    x_virt = np.array([math.cos(psi_0), 0.0, -math.sin(psi_0)], dtype=np.float64)
    x_virt = x_virt / np.linalg.norm(x_virt)
    
    y_virt = np.cross(z_virt, x_virt)
    y_virt = y_virt / np.linalg.norm(y_virt)
    
    R_v2w = np.column_stack([x_virt, y_virt, z_virt])
    
    f = (out_w / 2.0) / math.tan(math.radians(hfov_deg / 2.0))
    c_x = (out_w - 1) / 2.0
    c_y = (out_h - 1) / 2.0
    
    u_grid, v_grid = np.meshgrid(np.arange(out_w, dtype=np.float32),
                                 np.arange(out_h, dtype=np.float32))
    
    r_cam = np.stack([u_grid - c_x, v_grid - c_y, np.full_like(u_grid, f)], axis=-1)
    norm = np.linalg.norm(r_cam, axis=-1, keepdims=True)
    r_cam_unit = r_cam / norm
    
    r_world = np.einsum('ij,...j->...i', R_v2w, r_cam_unit)
    
    X = r_world[..., 0]
    Y = r_world[..., 1]
    Z = r_world[..., 2]
    
    yaw = (np.degrees(np.arctan2(X, Z)) + 360.0) % 360.0
    pitch = np.degrees(np.arctan2(-Y, np.sqrt(X**2 + Z**2)))
    
    pitch_span = pitch_max - pitch_min
    map_x = (yaw / 360.0) * pano_w
    map_y = ((pitch_max - pitch) / pitch_span) * (pano_h - 1)
    
    map_x = np.mod(map_x, pano_w).astype(np.float32)
    map_y = np.clip(map_y, 0, pano_h - 1).astype(np.float32)
    
    return map_x, map_y

def extract_rectilinear_patch(panorama, yaw_deg, pitch_deg, hfov_deg=40.0,
                              out_w=600, out_h=600,
                              pano_w=W_PANO_DEFAULT, pano_h=H_PANO_DEFAULT,
                              pitch_max=PITCH_MAX_DEFAULT, pitch_min=PITCH_MIN_DEFAULT,
                              interpolation=cv2.INTER_LINEAR):
    """
    Sample a rectified rectilinear pinhole patch from the equirectangular panorama.
    """
    map_x, map_y = build_rectilinear_remap(yaw_deg, pitch_deg, hfov_deg,
                                           out_w, out_h, pano_w, pano_h,
                                           pitch_max, pitch_min)
    return cv2.remap(panorama, map_x, map_y, interpolation=interpolation, borderMode=cv2.BORDER_WRAP)

def measure_rectified_line_deviation(points):
    """
    Compute orthogonal line deviation (P95 and RMS) using Total Least Squares (PCA/SVD).
    """
    pts = np.asarray(points, dtype=np.float64)
    if len(pts) < 3:
        return 0.0, 0.0, []
    
    mean = np.mean(pts, axis=0)
    centered = pts - mean
    _, _, vh = np.linalg.svd(centered)
    
    normal = vh[1]
    normal = normal / np.linalg.norm(normal)
    
    distances = np.abs(np.dot(centered, normal))
    p95 = float(np.percentile(distances, 95))
    rms = float(np.sqrt(np.mean(distances**2)))
    
    return p95, rms, distances.tolist()

def extract_prominent_vertical_edge_points(gray_patch, margin_x=50, margin_y=30):
    """
    Detect prominent vertical edge points along scanlines in a rectilinear patch.
    """
    h, w = gray_patch.shape[:2]
    gx = cv2.Sobel(gray_patch, cv2.CV_64F, 1, 0, ksize=3)
    abs_gx = np.abs(gx)
    
    roi_gx = abs_gx[margin_y:h-margin_y, margin_x:w-margin_x]
    if roi_gx.size == 0:
        return np.empty((0, 2), dtype=np.float64)
        
    col_sums = np.sum(roi_gx, axis=0)
    best_col_rel = int(np.argmax(col_sums))
    expected_x = margin_x + best_col_rel
    
    search_radius = 25
    edge_points = []
    
    for y in range(margin_y, h - margin_y):
        x_start = max(0, expected_x - search_radius)
        x_end = min(w - 1, expected_x + search_radius + 1)
        profile = abs_gx[y, x_start:x_end]
        if len(profile) < 3:
            continue
        max_idx = int(np.argmax(profile))
        peak_val = profile[max_idx]
        
        if peak_val > 10.0:
            if 0 < max_idx < len(profile) - 1:
                alpha = profile[max_idx - 1]
                beta = profile[max_idx]
                gamma = profile[max_idx + 1]
                denom = (alpha - 2 * beta + gamma)
                if abs(denom) > 1e-6:
                    delta = 0.5 * (alpha - gamma) / denom
                    subpixel_x = (x_start + max_idx) + delta
                else:
                    subpixel_x = float(x_start + max_idx)
            else:
                subpixel_x = float(x_start + max_idx)
            edge_points.append([subpixel_x, float(y)])
            
    return np.array(edge_points, dtype=np.float64)

def measure_rectified_seam_discontinuity(pts_side_a, pts_side_b, seam_eval_coord, axis='y'):
    """
    Measure orthogonal step discontinuity across a seam boundary.
    """
    pts_a = np.asarray(pts_side_a, dtype=np.float64)
    pts_b = np.asarray(pts_side_b, dtype=np.float64)
    
    if len(pts_a) < 2 or len(pts_b) < 2:
        return 0.0
    
    if axis == 'y':
        p_a = np.polyfit(pts_a[:, 1], pts_a[:, 0], 1)
        p_b = np.polyfit(pts_b[:, 1], pts_b[:, 0], 1)
        x_a = float(np.polyval(p_a, seam_eval_coord))
        x_b = float(np.polyval(p_b, seam_eval_coord))
        m_avg = (p_a[0] + p_b[0]) / 2.0
        offset = abs(x_b - x_a) / math.sqrt(1.0 + m_avg**2)
    else:
        p_a = np.polyfit(pts_a[:, 0], pts_a[:, 1], 1)
        p_b = np.polyfit(pts_b[:, 0], pts_b[:, 1], 1)
        y_a = float(np.polyval(p_a, seam_eval_coord))
        y_b = float(np.polyval(p_b, seam_eval_coord))
        m_avg = (p_a[0] + p_b[0]) / 2.0
        offset = abs(y_b - y_a) / math.sqrt(1.0 + m_avg**2)
        
    return float(offset)
