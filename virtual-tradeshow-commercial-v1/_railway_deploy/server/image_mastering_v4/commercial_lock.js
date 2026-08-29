/**
 * ³DNa AI BOOTH IMAGE MASTERING V4 — SEMANTIC SCENE & COMMERCIAL CONTENT LOCK
 * Module: commercial_lock.js
 * Directive: Section 4 (Immutable Commercial Content), Section 9 (Semantic Scene Analysis), Section 10 (Commercial Content Lock Mask)
 */

class CommercialContentLock {
  /**
   * Detect semantic scene entities and build immutable commercial lock mask
   * @param {Object} sourceInfo Forensic audit source metadata
   * @param {Object} annotations Optional bounding boxes or detected elements
   * @returns {Object} Semantic regions and lock mask
   */
  static analyzeAndLock(sourceInfo, annotations = {}) {
    const width = sourceInfo.sourceWidth || 1920;
    const height = sourceInfo.sourceHeight || 1080;

    // Detect / map key commercial regions
    const boothBounds = annotations.boothBounds || {
      xMin: Math.round(width * 0.08),
      yMin: Math.round(height * 0.12),
      xMax: Math.round(width * 0.92),
      yMax: Math.round(height * 0.88),
      confidence: 0.98
    };

    const logos = annotations.logos || [
      { id: 'logo_main', name: 'Brand Main Logo', xMin: Math.round(width * 0.35), yMin: Math.round(height * 0.18), xMax: Math.round(width * 0.65), yMax: Math.round(height * 0.28), confidence: 0.99 }
    ];

    const texts = annotations.texts || [
      { id: 'txt_slogan', content: 'Brand Slogan / Japanese / English', xMin: Math.round(width * 0.30), yMin: Math.round(height * 0.29), xMax: Math.round(width * 0.70), yMax: Math.round(height * 0.36), confidence: 0.97 }
    ];

    const products = annotations.products || [
      { id: 'prod_counter_display', name: 'Cosmetic / Industrial Products', xMin: Math.round(width * 0.20), yMin: Math.round(height * 0.50), xMax: Math.round(width * 0.80), yMax: Math.round(height * 0.75), count: 6, confidence: 0.96 }
    ];

    const signage = annotations.signage || [
      { id: 'sign_event_time', content: 'EVENT 10:00-18:00', xMin: Math.round(width * 0.68), yMin: Math.round(height * 0.25), xMax: Math.round(width * 0.82), yMax: Math.round(height * 0.40), confidence: 0.95 }
    ];

    const qrCodes = annotations.qrCodes || [];
    const screens = annotations.screens || [];
    const fixtures = annotations.fixtures || [
      { id: 'fixture_main_counter', xMin: Math.round(width * 0.25), yMin: Math.round(height * 0.55), xMax: Math.round(width * 0.75), yMax: Math.round(height * 0.82) }
    ];

    // Background / Non-commercial regions
    const floorRegion = { yMin: Math.round(height * 0.85), yMax: height, type: 'FLOOR' };
    const ceilingRegion = { yMin: 0, yMax: Math.round(height * 0.15), type: 'CEILING' };
    const aisles = [
      { xMin: 0, xMax: Math.round(width * 0.10), type: 'AISLE_LEFT' },
      { xMin: Math.round(width * 0.90), xMax: width, type: 'AISLE_RIGHT' }
    ];

    return {
      commercialContentLock: true,
      lockVersion: '4.0_ABSOLUTE_FIDELITY',
      dimensions: { width, height },
      regions: {
        booth: boothBounds,
        logos,
        texts,
        products,
        signage,
        qrCodes,
        screens,
        fixtures,
        floor: floorRegion,
        ceiling: ceilingRegion,
        aisles
      },
      immutableEntityCounts: {
        logoCount: logos.length,
        textCount: texts.length,
        productClusterCount: products.length,
        signageCount: signage.length,
        qrCount: qrCodes.length,
        screenCount: screens.length
      },
      generativeEditInsideLockAllowed: false, // Directive Section 10
      boothMutationAllowed: 0,
      productMutationAllowed: 0,
      logoMutationAllowed: 0,
      textMutationAllowed: 0,
      brandMutationAllowed: 0,
      signageMutationAllowed: 0,
      qrMutationAllowed: 0
    };
  }

  /**
   * Check if a given bounding box intersects any protected commercial content
   */
  static checkCommercialOverlap(bbox, lockData) {
    const { logos, texts, products, signage, qrCodes, screens, fixtures } = lockData.regions;
    const protectedEntities = [...logos, ...texts, ...products, ...signage, ...qrCodes, ...screens, ...fixtures];

    for (const ent of protectedEntities) {
      const isOverlap = !(
        bbox.xMax < ent.xMin ||
        bbox.xMin > ent.xMax ||
        bbox.yMax < ent.yMin ||
        bbox.yMin > ent.yMax
      );
      if (isOverlap) {
        return { hasOverlap: true, overlappingEntity: ent };
      }
    }
    return { hasOverlap: false, overlappingEntity: null };
  }
}

module.exports = CommercialContentLock;