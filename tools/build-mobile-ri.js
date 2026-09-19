/**
 * Tracked Reproducible Build Script for Mobile Runtime Inspector Bundle
 * Location: tools/build-mobile-ri.js
 *
 * Reads canonical modular source files and deterministically compiles
 * mobile-ri.bundle.js with normalized LF line endings, synchronizing it
 * across all seven deployment bundle locations and verifying byte identity.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const commercialRoot = path.join(repoRoot, 'virtual-tradeshow-commercial-v1');

const srcRedaction = path.join(repoRoot, 'tools', 'runtime-inspector', 'core', 'redaction.js');
const srcBuffer = path.join(repoRoot, 'tools', 'runtime-inspector', 'adapters', 'mobile', 'mobile-buffer.js');
const srcAdapter = path.join(repoRoot, 'tools', 'runtime-inspector', 'adapters', 'mobile', 'mobile-adapter.js');
const srcUi = path.join(repoRoot, 'tools', 'runtime-inspector', 'adapters', 'mobile', 'mobile-ui.js');
const srcIndex = path.join(repoRoot, 'tools', 'runtime-inspector', 'adapters', 'mobile', 'index.js');

const bundleDestinations = [
  path.join(commercialRoot, 'client', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, 'app_build', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, 'app_build', 'client', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, '_clean_deploy', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, '_clean_deploy', 'client', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, '_railway_deploy', 'mobile-ri.bundle.js'),
  path.join(commercialRoot, '_railway_deploy', 'client', 'mobile-ri.bundle.js')
];

function buildBundle() {
  console.log('[BuildMobileRI] Reading source modules...');
  const codeRedaction = fs.readFileSync(srcRedaction, 'utf8');
  const codeBuffer = fs.readFileSync(srcBuffer, 'utf8');
  const codeAdapter = fs.readFileSync(srcAdapter, 'utf8');
  const codeUi = fs.readFileSync(srcUi, 'utf8');
  const codeIndex = fs.readFileSync(srcIndex, 'utf8');

  // Strip top require block from index.js since they are bound inside the IIFE closure
  const cleanIndex = codeIndex
    .replace(/if \(typeof require !== 'undefined'\) \{[\s\S]*?\n\}/, '// Requires bound via IIFE scope');

  // Format IIFE universal bundle
  const bundleContent = `/**
 * 3DZ Mobile Runtime Inspector Universal Client Bundle v1.1.0
 * Architecture: MobileRollingBuffer (60s) + RedactionEngine + MobileAdapter + MobileInspectorUI
 * Security: Server-Authoritative QA Authorization & Single-Use Token Redemption
 */
(function(window) {
  'use strict';

  var module = { exports: {} };
  var exports = module.exports;
  var require = function(id) {
    return {
      RedactionEngine: window.RedactionEngine,
      MobileRollingBuffer: window.MobileRollingBuffer,
      MobileAdapter: window.MobileAdapter,
      MobileInspectorUI: window.MobileInspectorUI
    };
  };

  // 1. Redaction Engine
  (function() {
${codeRedaction.split('\n').map(l => l.trim() ? ('    ' + l) : '').join('\n')}
    window.RedactionEngine = (typeof module !== 'undefined' && module.exports && module.exports.RedactionEngine) || RedactionEngine;
  })();

  // 2. Mobile Rolling Buffer
  (function() {
    var module = { exports: {} };
${codeBuffer.split('\n').map(l => l.trim() ? ('    ' + l) : '').join('\n')}
    window.MobileRollingBuffer = (typeof module !== 'undefined' && module.exports && module.exports.MobileRollingBuffer) || MobileRollingBuffer;
  })();

  // 3. Mobile Adapter
  (function() {
    var module = { exports: {} };
${codeAdapter.split('\n').map(l => l.trim() ? ('    ' + l) : '').join('\n')}
    window.MobileAdapter = (typeof module !== 'undefined' && module.exports && module.exports.MobileAdapter) || MobileAdapter;
  })();

  // 4. Mobile Inspector UI
  (function() {
    var module = { exports: {} };
${codeUi.split('\n').map(l => l.trim() ? ('    ' + l) : '').join('\n')}
    window.MobileInspectorUI = (typeof module !== 'undefined' && module.exports && module.exports.MobileInspectorUI) || MobileInspectorUI;
  })();

  // 5. Bundle Entry & Server-Authoritative QA Auto-Initializer
  (function() {
    var module = { exports: {} };
${cleanIndex.split('\n').map(l => l.trim() ? ('    ' + l) : '').join('\n')}
    window.MobileRuntimeInspector = (typeof module !== 'undefined' && module.exports && module.exports.MobileRuntimeInspector) || MobileRuntimeInspector;
  })();
})(typeof window !== 'undefined' ? window : globalThis);
`;

  // Normalize to LF line endings for deterministic hashing
  const normalizedBundle = bundleContent.replace(/\r\n/g, '\n');

  const sha = crypto.createHash('sha256').update(Buffer.from(normalizedBundle, 'utf8')).digest('hex');
  console.log(`[BuildMobileRI] Deterministic LF Hash: ${sha} (length: ${normalizedBundle.length} bytes)`);

  for (const dest of bundleDestinations) {
    if (fs.existsSync(path.dirname(dest))) {
      fs.writeFileSync(dest, normalizedBundle, 'utf8');
      const destSha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
      console.log(`  -> Synced: ${path.relative(repoRoot, dest)} (SHA match: ${destSha === sha})`);
    } else {
      console.warn(`  -> Skipping missing directory for: ${dest}`);
    }
  }

  // Also sync modular source to mirrors: app_build and _railway_deploy
  const mirrorDirs = [
    path.join(commercialRoot, 'app_build', 'tools', 'runtime-inspector', 'adapters', 'mobile'),
    path.join(commercialRoot, '_railway_deploy', 'tools', 'runtime-inspector', 'adapters', 'mobile')
  ];

  for (const mDir of mirrorDirs) {
    if (fs.existsSync(mDir)) {
      fs.copyFileSync(srcUi, path.join(mDir, 'mobile-ui.js'));
      fs.copyFileSync(srcIndex, path.join(mDir, 'index.js'));
      console.log(`  -> Synced adapter mirror: ${path.relative(repoRoot, mDir)}`);
    }
  }

  console.log('[BuildMobileRI] Build complete. All 7 bundles synchronized.');
  return {
    sha256: sha,
    sizeBytes: Buffer.byteLength(normalizedBundle, 'utf8'),
    destinations: bundleDestinations
  };
}

if (require.main === module) {
  buildBundle();
}

module.exports = { buildBundle };
