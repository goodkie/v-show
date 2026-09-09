"""
3D2 / 3DZ - Spherical Branch Cut and Cyclic Longitude Handler
Module: server/spherical_branch_cut.py

Handles the +-pi (180 deg) spherical branch cut without ROI explosion.
Splits wrapped images and masks into cyclic left-edge and right-edge segments.
"""

from __future__ import annotations
import math
import numpy as np
import cv2

def normalize_angle_rad(theta: float) -> float:
    """Normalize angle to [-pi, pi)."""
    return (theta + math.pi) % (2.0 * math.pi) - math.pi

def normalize_angle_deg(deg: float) -> float:
    """Normalize angle to [-180.0, 180.0)."""
    return (deg + 180.0) % 360.0 - 180.0

def angular_difference_deg(deg1: float, deg2: float) -> float:
    """Compute shortest signed angular difference deg1 - deg2 in [-180, 180)."""
    return (deg1 - deg2 + 180.0) % 360.0 - 180.0

def split_wrapped_roi(
    roi: tuple[int, int, int, int], 
    focal_px: float
) -> list[tuple[int, int, int, int]]:
    """
    Split an OpenCV spherical ROI that spans across +-pi.
    If roi[2] (width) > 0.5 * full_circumference, the ROI crosses +-pi.
    """
    rx, ry, rw, rh = roi
    half_circumference = math.pi * float(focal_px)
    
    if rw <= half_circumference:
        return [(rx, ry, rw, rh)]
    
    min_x_bound = int(round(-half_circumference))
    max_x_bound = int(round(half_circumference))
    
    left_w = rw // 2
    right_w = rw - left_w
    
    seg_left = (min_x_bound, ry, left_w, rh)
    seg_right = (max_x_bound - right_w, ry, right_w, rh)
    
    return [seg_right, seg_left]

def split_wrapped_warped_image(
    warped_img: np.ndarray,
    warped_mask: np.ndarray,
    corner: tuple[int, int],
    focal_px: float
) -> list[tuple[tuple[int, int], np.ndarray, np.ndarray]]:
    """
    Given a warped image and mask from PyRotationWarper, if it spans across the branch cut,
    split it into right-edge and left-edge pieces for proper cyclic compositing.
    """
    cx, cy = corner
    h_img, w_img = warped_img.shape[:2]
    half_c = math.pi * float(focal_px)
    
    if w_img <= half_c:
        return [((cx, cy), warped_img, warped_mask)]
    
    col_has_pixels = np.any(warped_mask > 0, axis=0)
    mid_start = int(w_img * 0.25)
    mid_end = int(w_img * 0.75)
    
    zero_cols = np.where(~col_has_pixels[mid_start:mid_end])[0]
    if len(zero_cols) > 0:
        split_x = mid_start + int(np.median(zero_cols))
    else:
        split_x = w_img // 2
        
    left_img = warped_img[:, :split_x]
    left_mask = warped_mask[:, :split_x]
    left_corner = (cx, cy)
    
    right_img = warped_img[:, split_x:]
    right_mask = warped_mask[:, split_x:]
    right_corner = (cx + split_x, cy)
    
    results = []
    if np.any(left_mask > 0):
        results.append((left_corner, left_img, left_mask))
    if np.any(right_mask > 0):
        results.append((right_corner, right_img, right_mask))
        
    return results if results else [((cx, cy), warped_img, warped_mask)]
