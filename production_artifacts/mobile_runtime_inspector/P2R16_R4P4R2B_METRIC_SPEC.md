# PHASE 7C.2R4P4-R2B: PROJECTION-CORRECT STRUCTURAL ACCEPTANCE METRIC SPECIFICATION

## 1. Executive Summary & Physical Rationale

In Phase 7C.2R4P4-R2A, forensic reconciliation established that the historical edge alignment P95 metric in R4P4 was derived from held-out Sampson epipolar error in geometry space (eval_section30_gate.py), whereas equirectangular line straightness (LSD) in render space regressed by -11.29%.

Critically, measuring straightness directly on equirectangular pixels is physically and mathematically invalid for general architectural structures because equirectangular projection inherently maps straight 3D lines with non-zero pitch into trigonometric curves:
\theta(x) = \arctan\left(\frac{A \sin x + B \cos x}{C}\right)

Evaluating line curvature on the raw equirectangular canvas conflates cartographic projection distortion with physical seam misalignment. Furthermore, forcing identical equirectangular bounding boxes across different candidate poses evaluates different physical scene points because camera rotation refinement shifts scene structures by up to 93 pixels.

Phase 7C.2R4P4-R2B establishes a projection-correct, physically grounded metric framework:
1. Canonical Physical ROIs: Anchored strictly in source camera sensor space (3000 x 4000 portrait stills).
2. Candidate-Specific Projection: Every physical ROI is projected into each candidate panorama according to that candidate extrinsics and intrinsics.
3. Rectified Pinhole Reprojection (Gnomonic Projection): Each candidate panorama is locally reprojected through a virtual pinhole rectilinear camera centered on the physical structure, restoring projective line-preserving geometry.
4. Frozen Threshold Contract: All thresholds (>= 25% structural improvement, >= 20% reprojection improvement) are frozen prior to candidate evaluation.

---

## 2. Virtual Rectilinear Camera Formulation

For an ROI centered at world direction (yaw_0, pitch_0):

### 2.1 Virtual Camera Coordinate Frame
Let world coordinates be defined with +X right, +Y down, +Z forward. The forward optical axis z_hat_virt of the virtual camera is:
\hat{\mathbf{z}}_{\text{virt}} = [\sin\psi_0 \cos\theta_0, -\sin\theta_0, \cos\psi_0 \cos\theta_0]^T

The horizontal right unit vector x_hat_virt (orthogonal to world vertical) is:
\hat{\mathbf{x}}_{\text{virt}} = [\cos\psi_0, 0, -\sin\psi_0]^T

The down unit vector y_hat_virt = z_hat_virt x x_hat_virt is:
\hat{\mathbf{y}}_{\text{virt}} = [-\sin\theta_0 \sin\psi_0, -\cos\theta_0, -\sin\theta_0 \cos\psi_0]^T

The rotation matrix from virtual camera to world frame is:
R_{\text{virt}\to\text{world}} = [\hat{\mathbf{x}}_{\text{virt}} \mid \hat{\mathbf{y}}_{\text{virt}} \mid \hat{\mathbf{z}}_{\text{virt}}]

### 2.2 Reprojection Ray Sampling
For a rectilinear image of size W_rect x H_rect and horizontal field of view HFOV = 40.0 deg:
Focal length:
f = \frac{W_{\text{rect}} / 2}{\tan(\text{HFOV} / 2)}

For each pixel (u_virt, v_virt) with principal point (c_x, c_y) = ((W_rect-1)/2, (H_rect-1)/2):
\mathbf{r}_{\text{cam}} = [u_{\text{virt}} - c_x, v_{\text{virt}} - c_y, f]^T, \quad \mathbf{r}_{\text{world}} = R_{\text{virt}\to\text{world}} \frac{\mathbf{r}_{\text{cam}}}{\|\mathbf{r}_{\text{cam}}\|}

Panorama spherical coordinates:
\text{yaw} = \text{atan2}(r_X, r_Z) \pmod{360^\circ}
\text{pitch} = \text{atan2}(-r_Y, \sqrt{r_X^2 + r_Z^2})

Panorama pixel coordinates (for 12288 x 1869 canvas with pitch range [-26.38 deg, 28.39 deg]):
x_{\text{pano}} = \frac{\text{yaw}}{360^\circ} \times 12288
y_{\text{pano}} = \frac{28.39^\circ - \text{pitch}}{54.77^\circ} \times 1868

The patch is resampled using bilinear interpolation (cv2.INTER_LINEAR).

### 2.3 Mathematical Proof of Line Straightness
Any 3D straight line in world space parameterizes as P(s) = P_0 + s v. Under central perspective projection into a pinhole camera, the line of sight rays form a plane through the optical center:
\mathbf{n}_{\text{plane}} \cdot \mathbf{r}_{\text{cam}} = 0
Intersecting with the image plane z = f yields:
n_x (u - c_x) + n_y (v - c_y) + n_z f = 0
which is strictly a straight line in (u, v) rectilinear image coordinates. Specifically, world vertical lines (v = [0, -1, 0]^T) have x_hat_virt . v = 0, guaranteeing that they project to strictly vertical line segments (u = const).

---

## 3. Metric A: RECTIFIED_VERTICAL_LINE_DEVIATION_P95

### 3.1 Target Domain
Evaluated across all canonical vertical architectural ROIs:
- ROI_01_DOOR_FRAME (Door jamb)
- ROI_02_WINDOW_MULLION (Window mullion)
- ROI_03_CABINET_LATCH_EDGE (Cabinet latch edge)
- ROI_06_WALL_CORNER (Drywall vertical corner)

### 3.2 Algorithm
1. Extract candidate-specific rectilinear patch centered at the projected physical ROI center.
2. Compute horizontal image gradients and gradient magnitude.
3. For each scanline y in [y_start, y_end], detect the primary edge position x_i(y) via subpixel parabolic interpolation on gradient peaks.
4. Fit the optimal straight line x = m y + c using total least squares (principal component analysis).
5. For all detected edge points (x_i, y_i), compute the orthogonal distance to the fitted line:
   d_i = \frac{|x_i - (m y_i + c)|}{\sqrt{1 + m^2}}
6. Compute the 95th percentile deviation P95_k for ROI k.
7. Aggregate the global metric as the sample-weighted P95 across all vertical ROIs:
   \text{RECTIFIED\_VERTICAL\_LINE\_DEVIATION\_P95} = \text{percentile}_{95}\left(\bigcup_k \{d_{i,k}\}\right)

---

## 4. Metric B: RECTIFIED_SEAM_EDGE_DISCONTINUITY_P95

### 4.1 Target Domain
Evaluated across all canonical structural seam zones:
- ROI_07_CLOSURE_BOUNDARY (Ring closure seam)
- ROI_08_SEAM_060_ZONE (Sector 3 seam)
- ROI_09_SEAM_150_ZONE (Sector 1 seam)
- ROI_10_SEAM_240_ZONE (Sector 2 seam)

### 4.2 Algorithm
1. Extract candidate-specific rectilinear patch and corresponding source camera ownership mask.
2. Locate the seam boundary interface separating camera A and camera B.
3. Trace the prominent structural edge on side A approaching the seam, and fit line L_A.
4. Trace the corresponding physical edge on side B departing the seam, and fit line L_B.
5. Evaluate the orthogonal jump / step offset delta_j at seam interface points:
   \delta_j = |\mathbf{n}_A \cdot \mathbf{x}_{\text{seam}, j} + c_A|
6. Compute the 95th percentile discontinuity across all seam interface observations:
   \text{RECTIFIED\_SEAM\_EDGE\_DISCONTINUITY\_P95} = \text{percentile}_{95}(\{\delta_j\})

---

## 5. Frozen Acceptance Criteria (Contractual Gate)

Technical acceptance of R4P4R1_BOUNDED requires meeting ALL of the following criteria simultaneously:

| Metric | Baseline (R4P3) | Required Gate | Required Improvement |
| :--- | :--- | :--- | :--- |
| **Pixel Reprojection RMS** | 204.97 px | <= 163.98 px | >= 20.0% (Locked at +21.89%) |
| **Rectified Vertical P95** | Baseline Measured | <= 0.75 x Baseline | >= 25.0% |
| **Rectified Seam Edge P95** | Baseline Measured | <= 0.75 x Baseline | >= 25.0% |
| **Max Rotation Delta** | N/A | <= 3.0 deg | PASS (Hard Bound 3.0 deg) |
| **Second-Neighbor Validation**| N/A | Stable (<10% global) | PASS (+2.38%, 0 catastrophic) |
| **Geometry Foldovers** | N/A | 0 | PASS (0) |
| **Black Crack Pixels** | N/A | 0 | PASS (0) |
| **Inpaint Used** | N/A | false | PASS (false) |

No threshold modifications or post-hoc exemptions are permitted. If either structural metric fails the >= 25% threshold, the candidate technical acceptance verdict is strictly **FAIL**.
