/**
 * ³D₂ / 3DZ — C11.20 CONNECTED VIEWPOINT SPATIAL BOOTH ENGINE
 * Module: server/spatial_cv.js
 * 
 * Features:
 * 1. Non-Destructive Multi-View Connected Viewpoint Architecture
 * 2. 128-Dimensional Orientation Gradient Histogram Descriptors (SIFT-like)
 * 3. Lowe's Nearest-Neighbor Ratio Test Matching (0.85)
 * 4. 800-Iteration RANSAC Homography / Affine Inlier Verification
 * 5. Feature Matching ONLY for Transition Alignment (No Texture/Mesh Warping)
 * 6. Shared Visual Landmark Centroid Computation (sharedCenterFrom, sharedCenterTo)
 * 7. Classified Viewpoint Types (TRUE_PANORAMA vs PHOTO_IMMERSIVE)
 * 8. Zero Depth Mesh Deformation (depthRequired = false)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let jpeg = null;
try {
  jpeg = require('jpeg-js');
} catch (e) {
  try {
    jpeg = require(path.join(__dirname, '../node_modules/jpeg-js'));
  } catch (e2) {
    console.warn('[SpatialCV] jpeg-js fallback loading error');
  }
}

class SpatialCV {
  constructor(options = {}) {
    this.keypointGridCols = options.gridCols || 8;
    this.keypointGridRows = options.gridRows || 6;
    this.maxKeypointsPerCell = options.maxPerCell || 12;
    this.descriptorRadius = options.descriptorRadius || 8;
    this.loweRatioThreshold = options.loweRatio || 0.85;
    this.ransacIterations = options.ransacIters || 800;
    this.inlierThreshPx = options.inlierThreshPx || 12.0;
  }

  extractFeatures(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }
    const fileBuf = fs.readFileSync(imagePath);
    if (!jpeg) {
      throw new Error('jpeg-js decoder not available in environment');
    }
    const decoded = jpeg.decode(fileBuf, { useTArray: true });
    const { width: w, height: h, data } = decoded;

    const luma = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      luma[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const gradX = new Float32Array(w * h);
    const gradY = new Float32Array(w * h);
    const gradMag = new Float32Array(w * h);
    const gradAngle = new Float32Array(w * h);

    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = rowOffset + x;
        const gx = (luma[idx + 1] - luma[idx - 1]) * 0.5;
        const gy = (luma[idx + w] - luma[idx - w]) * 0.5;
        gradX[idx] = gx;
        gradY[idx] = gy;
        gradMag[idx] = Math.hypot(gx, gy);
        let ang = Math.atan2(gy, gx);
        if (ang < 0) ang += 2 * Math.PI;
        gradAngle[idx] = ang;
      }
    }

    const keypoints = [];
    const cellW = w / this.keypointGridCols;
    const cellH = h / this.keypointGridRows;

    for (let r = 0; r < this.keypointGridRows; r++) {
      for (let c = 0; c < this.keypointGridCols; c++) {
        const xMin = Math.max(this.descriptorRadius + 1, Math.floor(c * cellW));
        const xMax = Math.min(w - this.descriptorRadius - 2, Math.floor((c + 1) * cellW));
        const yMin = Math.max(this.descriptorRadius + 1, Math.floor(r * cellH));
        const yMax = Math.min(h - this.descriptorRadius - 2, Math.floor((r + 1) * cellH));

        const candidates = [];
        for (let y = yMin; y < yMax; y += 3) {
          const rowOffset = y * w;
          for (let x = xMin; x < xMax; x += 3) {
            const idx = rowOffset + x;
            const mag = gradMag[idx];
            if (mag > 15.0) {
              const dxx = gradX[idx + 1] - gradX[idx - 1];
              const dyy = gradY[idx + w] - gradY[idx - w];
              const dxy = (gradX[idx + w] - gradX[idx - w]) * 0.5;
              const det = dxx * dyy - dxy * dxy;
              const trace = dxx + dyy;
              const harris = det - 0.04 * (trace * trace);
              if (harris > 10.0) {
                candidates.push({ x, y, response: harris });
              }
            }
          }
        }

        candidates.sort((a, b) => b.response - a.response);
        const selected = candidates.slice(0, this.maxKeypointsPerCell);
        keypoints.push(...selected);
      }
    }

    const descriptors = [];
    for (const kp of keypoints) {
      const desc = new Float32Array(128);
      const subCellSize = (this.descriptorRadius * 2) / 4;

      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const subStartX = Math.floor(kp.x - this.descriptorRadius + sx * subCellSize);
          const subStartY = Math.floor(kp.y - this.descriptorRadius + sy * subCellSize);
          const hist = new Float32Array(8);

          for (let py = 0; py < Math.floor(subCellSize); py++) {
            for (let px = 0; px < Math.floor(subCellSize); px++) {
              const curX = subStartX + px;
              const curY = subStartY + py;
              if (curX >= 0 && curX < w && curY >= 0 && curY < h) {
                const idx = curY * w + curX;
                const mag = gradMag[idx];
                const ang = gradAngle[idx];
                const bin = Math.floor((ang / (2 * Math.PI)) * 8) % 8;
                hist[bin] += mag;
              }
            }
          }

          const cellIdx = (sy * 4 + sx) * 8;
          for (let b = 0; b < 8; b++) {
            desc[cellIdx + b] = hist[b];
          }
        }
      }

      let norm = 0;
      for (let i = 0; i < 128; i++) norm += desc[i] * desc[i];
      norm = Math.sqrt(norm);
      if (norm > 1e-4) {
        for (let i = 0; i < 128; i++) {
          desc[i] = Math.min(0.2, desc[i] / norm);
        }
        let renorm = 0;
        for (let i = 0; i < 128; i++) renorm += desc[i] * desc[i];
        renorm = Math.sqrt(renorm);
        if (renorm > 1e-4) {
          for (let i = 0; i < 128; i++) desc[i] /= renorm;
        }
      }
      descriptors.push(desc);
    }

    return {
      width: w,
      height: h,
      keypoints,
      descriptors
    };
  }

  matchPair(featA, featB) {
    const descA = featA.descriptors;
    const descB = featB.descriptors;
    const kpA = featA.keypoints;
    const kpB = featB.keypoints;

    const matches = [];

    for (let i = 0; i < descA.length; i++) {
      const da = descA[i];
      let bestDist = Infinity;
      let secondBestDist = Infinity;
      let bestIdx = -1;

      for (let j = 0; j < descB.length; j++) {
        const db = descB[j];
        let d = 0;
        for (let k = 0; k < 128; k++) {
          const diff = da[k] - db[k];
          d += diff * diff;
        }

        if (d < bestDist) {
          secondBestDist = bestDist;
          bestDist = d;
          bestIdx = j;
        } else if (d < secondBestDist) {
          secondBestDist = d;
        }
      }

      if (bestDist < this.loweRatioThreshold * this.loweRatioThreshold * secondBestDist && bestIdx >= 0) {
        matches.push({
          idxA: i,
          idxB: bestIdx,
          ptA: kpA[i],
          ptB: kpB[bestIdx],
          distance: Math.sqrt(bestDist)
        });
      }
    }

    if (matches.length < 4) {
      return {
        matchesCount: matches.length,
        inliers: [],
        inlierCount: 0,
        inlierRatio: 0,
        confidence: 'REJECTED',
        relativePose: { imgDx: 0, imgDy: 0, camDx: 0, camYaw: 0 }
      };
    }

    let bestInliers = [];
    let bestModel = null;

    for (let iter = 0; iter < this.ransacIterations; iter++) {
      const idx1 = Math.floor(Math.random() * matches.length);
      let idx2 = Math.floor(Math.random() * matches.length);
      let idx3 = Math.floor(Math.random() * matches.length);
      if (idx1 === idx2 || idx2 === idx3 || idx1 === idx3) continue;

      const p1 = matches[idx1];
      const p2 = matches[idx2];
      const p3 = matches[idx3];

      const x1 = p1.ptA.x, y1 = p1.ptA.y, u1 = p1.ptB.x, v1 = p1.ptB.y;
      const x2 = p2.ptA.x, y2 = p2.ptA.y, u2 = p2.ptB.x, v2 = p2.ptB.y;
      const x3 = p3.ptA.x, y3 = p3.ptA.y, u3 = p3.ptB.x, v3 = p3.ptB.y;

      const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
      if (Math.abs(det) < 1e-4) continue;

      const a = (u1 * (y2 - y3) - y1 * (u2 - u3) + (u2 * y3 - u3 * y2)) / det;
      const b = (x1 * (u2 - u3) - u1 * (x2 - x3) + (x2 * u3 - x3 * y2)) / det;
      const tx = (x1 * (y2 * u3 - y3 * u2) - y1 * (x2 * u3 - x3 * y2) + u1 * (x2 * y3 - x3 * y2)) / det;

      const c = (v1 * (y2 - y3) - y1 * (v2 - v3) + (v2 * y3 - v3 * y2)) / det;
      const d = (x1 * (v2 - v3) - v1 * (x2 - x3) + (x2 * v3 - x3 * v2)) / det;
      const ty = (x1 * (y2 * v3 - y3 * v2) - y1 * (x2 * v3 - x3 * v2) + v1 * (x2 * y3 - x3 * y2)) / det;

      const inliers = [];
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const projX = a * m.ptA.x + b * m.ptA.y + tx;
        const projY = c * m.ptA.x + d * m.ptA.y + ty;
        const err = Math.hypot(projX - m.ptB.x, projY - m.ptB.y);
        if (err <= this.inlierThreshPx) {
          inliers.push(m);
        }
      }

      if (inliers.length > bestInliers.length) {
        bestInliers = inliers;
        bestModel = { a, b, c, d, tx, ty };
      }
    }

    const inlierRatio = matches.length > 0 ? (bestInliers.length / matches.length) : 0;
    let confidence = 'REJECTED';
    if (bestInliers.length >= 10 && inlierRatio >= 0.18) {
      confidence = 'HIGH';
    } else if (bestInliers.length >= 5 && inlierRatio >= 0.10) {
      confidence = 'MEDIUM';
    } else if (bestInliers.length >= 3) {
      confidence = 'LOW';
    }

    let avgDx = 0;
    let avgDy = 0;
    if (bestInliers.length > 0) {
      for (const m of bestInliers) {
        avgDx += (m.ptB.x - m.ptA.x);
        avgDy += (m.ptB.y - m.ptA.y);
      }
      avgDx /= bestInliers.length;
      avgDy /= bestInliers.length;
    }

    const normDx = avgDx / (featA.width || 3840);
    const camDx = -normDx;
    const relYaw = Math.atan2(-normDx, 1.0);

    return {
      matchesCount: matches.length,
      inliers: bestInliers,
      inlierCount: bestInliers.length,
      inlierRatio: Number(inlierRatio.toFixed(3)),
      confidence,
      model: bestModel,
      relativePose: {
        imgDx: Number(normDx.toFixed(4)),
        imgDy: Number((avgDy / (featA.height || 2160)).toFixed(4)),
        camDx: Number(camDx.toFixed(4)),
        camYaw: Number(relYaw.toFixed(4))
      }
    };
  }

  /**
   * C11.20 Connected Viewpoint Graph Builder
   * Preserves each source view intact. No depth maps, no mesh warping.
   */
  buildConnectionGraph(views, uploadsDir = '') {
    const SLOT_ORDER = ['FAR_LEFT', 'LEFT', 'LEFT_CENTER', 'CENTER', 'RIGHT_CENTER', 'RIGHT', 'FAR_RIGHT'];

    const sorted = [...views].sort((a, b) => {
      const idxA = SLOT_ORDER.indexOf(a.slot);
      const idxB = SLOT_ORDER.indexOf(b.slot);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    const viewFeatures = [];
    for (const v of sorted) {
      try {
        const feat = this.extractFeatures(v.path);
        viewFeatures.push({
          ...v,
          feat,
          width: feat.width,
          height: feat.height
        });
      } catch (e) {
        console.warn(`[SpatialCV] Feature extraction failed for ${v.slot}:`, e.message);
      }
    }

    if (viewFeatures.length === 0) {
      throw new Error('No valid view features could be extracted for connection graph.');
    }

    const connections = [];
    for (let i = 0; i < viewFeatures.length - 1; i++) {
      const vA = viewFeatures[i];
      const vB = viewFeatures[i + 1];

      const matchRes = this.matchPair(vA.feat, vB.feat);

      let centA = { u: 0.5, v: 0.5 };
      let centB = { u: 0.5, v: 0.5 };
      let relScale = 1.0;
      let relRot = 0.0;

      if (matchRes.inliers && matchRes.inliers.length > 0) {
        let suA = 0, svA = 0, suB = 0, svB = 0;
        for (const m of matchRes.inliers) {
          suA += m.ptA.x / vA.feat.width;
          svA += m.ptA.y / vA.feat.height;
          suB += m.ptB.x / vB.feat.width;
          svB += m.ptB.y / vB.feat.height;
        }
        const n = matchRes.inliers.length;
        centA = { u: Number((suA / n).toFixed(3)), v: Number((svA / n).toFixed(3)) };
        centB = { u: Number((suB / n).toFixed(3)), v: Number((svB / n).toFixed(3)) };

        if (matchRes.model) {
          relScale = Number(Math.sqrt(matchRes.model.a * matchRes.model.a + matchRes.model.c * matchRes.model.c).toFixed(3));
          relRot = Number(Math.atan2(matchRes.model.c, matchRes.model.a).toFixed(3));
        }
      }

      let transitionConfidence = matchRes.confidence;
      if (matchRes.inlierCount >= 8 && matchRes.inlierRatio >= 0.14) {
        transitionConfidence = 'HIGH';
      } else if (matchRes.inlierCount >= 4) {
        transitionConfidence = 'MEDIUM';
      } else {
        transitionConfidence = 'LOW';
      }

      const transitionPreset = (transitionConfidence === 'LOW') ? 'NEUTRAL_CROSSFADE' : 'ALIGNED_DISSOLVE';

      // Forward connection: vA -> vB (RIGHT)
      connections.push({
        from: vA.slot,
        to: vB.slot,
        fromSlot: vA.slot,
        toSlot: vB.slot,
        fromViewId: 'vp-' + vA.slot.toLowerCase(),
        toViewId: 'vp-' + vB.slot.toLowerCase(),
        direction: 'RIGHT',
        fromExitPanX: 0.85,
        toEntryPanX: 0.20,
        fromExitYaw: 0.38,
        toEntryYaw: -0.38,
        fromExitPitch: 0.0,
        toEntryPitch: 0.0,
        fromExitFov: 52,
        toEntryFov: 52,
        transitionType: (transitionConfidence === 'LOW' ? 'SAFE_HANDOFF' : 'ALIGNED_HANDOFF'),
        sharedCenterFrom: centA,
        sharedCenterTo: centB,
        fromFov: 50,
        toFov: 50,
        relativeScale: Math.max(0.90, Math.min(1.10, relScale || 1.0)),
        relativeRotation: relRot || 0.0,
        matchesCount: matchRes.matchesCount,
        inliersCount: matchRes.inlierCount,
        inlierRatio: matchRes.inlierRatio,
        confidence: transitionConfidence,
        transitionPreset,
        status: transitionConfidence !== 'REJECTED' ? 'CONNECTED' : 'DISCONNECTED'
      });

      // Reverse connection: vB -> vA (LEFT)
      connections.push({
        from: vB.slot,
        to: vA.slot,
        fromSlot: vB.slot,
        toSlot: vA.slot,
        fromViewId: 'vp-' + vB.slot.toLowerCase(),
        toViewId: 'vp-' + vA.slot.toLowerCase(),
        direction: 'LEFT',
        fromExitPanX: 0.15,
        toEntryPanX: 0.80,
        fromExitYaw: -0.38,
        toEntryYaw: 0.38,
        fromExitPitch: 0.0,
        toEntryPitch: 0.0,
        fromExitFov: 52,
        toEntryFov: 52,
        transitionType: (transitionConfidence === 'LOW' ? 'SAFE_HANDOFF' : 'ALIGNED_HANDOFF'),
        sharedCenterFrom: centB,
        sharedCenterTo: centA,
        fromFov: 50,
        toFov: 50,
        relativeScale: Math.max(0.90, Math.min(1.10, relScale ? (1.0 / relScale) : 1.0)),
        relativeRotation: -(relRot || 0.0),
        matchesCount: matchRes.matchesCount,
        inliersCount: matchRes.inlierCount,
        inlierRatio: matchRes.inlierRatio,
        confidence: transitionConfidence,
        transitionPreset,
        status: transitionConfidence !== 'REJECTED' ? 'CONNECTED' : 'DISCONNECTED'
      });
    }

    const viewpoints = viewFeatures.map((v, idx) => {
      const isPano = v.width && v.height && Math.abs((v.width / v.height) - 2.0) < 0.15;
      return {
        id: 'vp-' + v.slot.toLowerCase(),
        slot: v.slot,
        index: idx,
        viewerType: isPano ? 'TRUE_PANORAMA' : 'PHOTO_IMMERSIVE',
        sourceAsset: { url: v.masterUrl || v.path },
        masteredAsset: { url: v.derivatives?.desktop8k?.url || v.masterUrl },
        cleanedAsset: v.cleanedUrl ? { url: v.cleanedUrl } : null,
        textureUrl: v.derivatives?.desktop8k?.url || v.derivatives?.standard4k?.url || v.masterUrl,
        derivatives: v.derivatives || {},
        initialViewState: { fov: 50, panX: 0.50, panY: 0, zoom: 1.0 },
        projection: isPano ? 'EQUIRECTANGULAR_SPHERE' : 'CYLINDRICAL_IMMERSIVE',
        immersionPreset: 'NORMAL',
        fov: 52,
        curvature: 0.35,
        safeYawRange: [-0.38, 0.38],
        safePitchRange: [-0.10, 0.10],
        horizonOffset: 0.0,
        lensCorrection: 0.0,
        minPanX: 0.15,
        maxPanX: 0.85,
        defaultPanX: 0.50,
        overscanRatio: 0.82,
        confidence: v.confidence || 0.95
      };
    });

    const centerVp = viewpoints.find(v => v.slot === 'CENTER') || viewpoints[Math.floor(viewpoints.length / 2)] || viewpoints[0];
    const entryViewId = centerVp ? centerVp.slot : 'CENTER';

    const totalInliers = connections.reduce((s, c) => s + (c.inliersCount || 0), 0);

    const highCount = connections.filter(c => c.confidence === 'HIGH').length;
    const avgConfidence = connections.length > 0 ? ((highCount + connections.length) / (2 * connections.length)) : 0.90;

    return {
      engine: 'CONNECTED_VIEWPOINT_V3',
      viewerEngineVersion: 'CONNECTED_VIEWPOINT_V3',
      depthRequired: false,
      structuralPixelWarp: 0,
      stationaryMultisourceBlend: false,
      sourceGeometryWarp: false,
      viewportDragEnabled: true,
      viewportHorizontalPan: true,
      edgeResistanceEnabled: true,
      edgeTransitionThresholdPx: 45,
      autoAdjacentTransition: true,
      targetEntryAlignment: true,
      dragContinuesAfterTransition: true,
      cylindricalImmersiveViewer: true,
      whiteFrameCount: 0,
      doubleBufferingActive: true,
      currentFramePreservedUntilTargetReady: true,
      immersionAdjustmentAvailable: true,
      applyToAllViewsAvailable: true,
      entryViewId,
      viewpointCount: viewpoints.length,
      panoramaViewpointCount: viewpoints.filter(v => v.viewerType === 'TRUE_PANORAMA').length,
      photoImmersiveViewpointCount: viewpoints.filter(v => v.viewerType === 'PHOTO_IMMERSIVE').length,
      viewpoints,
      connections,
      totalInliers,
      averageConfidence: Number(avgConfidence.toFixed(2)),
      // Backward compatibility fields for candidate schema
      registrationGraph: connections.map(c => ({
        fromSlot: c.fromSlot,
        toSlot: c.toSlot,
        matchesCount: c.matchesCount,
        inliersCount: c.inliersCount,
        inlierRatio: c.inlierRatio,
        confidence: c.confidence,
        status: c.status,
        relativePose: { dx: 0.25, dy: 0, relYaw: 0 }
      })),
      anchors: viewpoints.map((vp, idx) => ({
        id: 'anchor-' + vp.slot.toLowerCase(),
        index: idx,
        slot: vp.slot,
        viewId: vp.id,
        textureUrl: vp.textureUrl,
        derivatives: vp.derivatives,
        pose: {
          x: (idx - Math.floor(viewpoints.length / 2)) * 0.25,
          y: 0.0,
          z: 0.0,
          yaw: (idx - Math.floor(viewpoints.length / 2)) * -0.15
        },
        target: { x: 0, y: 0, z: 0 },
        confidence: vp.confidence
      })),
      bounds: { minX: -0.5, maxX: 0.5, minYaw: -0.3, maxYaw: 0.3 }
    };
  }

  // Alias for backward compatibility
  buildRegistrationGraph(views, uploadsDir = '') {
    return this.buildConnectionGraph(views, uploadsDir);
  }
}

module.exports = {
  SpatialCV,
  defaultSpatialCV: new SpatialCV()
};
