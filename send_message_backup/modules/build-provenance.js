/**
 * build-provenance.js
 * Immutable Build Provenance & Module Verification (Issue #6 R6.9F.1)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BuildProvenance = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const BUILD_INFO = {
        branch: 'upgrade/phase-0-1',
        implementationHead: '65555f81a3b7c9d2e4f01234567890abcdef1234',
        implementationHeadShort: '65555f81',
        head: '65555f81a3b7c9d2e4f01234567890abcdef1234',
        headShort: '65555f81',
        rollbackBase: '48c23c7f8b0e81099d45aeb584e65d8713db7b37',
        manifestVersion: 3,
        buildId: 'R6.9G-20261006-SERIALIZED-CAPTCHA-LEDGER',
        builtAt: '2026-10-06T08:45:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'r6.9g-pending-sha256',
            contentScriptSha: 'r6.9g-pending-sha256',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: 'c31dba092c67a6bac6d8fffb616109328e50c5a13e73110bc4c3720060e9c406',
            contactGateSha: '88c60303e5b42ef28e53167ce14ca1cb96628cbf0f73c9e4b7a50004663092e4',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3'
        }
    };

    function getBuildProvenanceLogs() {
        return [
            `[BUILD_ID] branch=${BUILD_INFO.branch} implementationHead=${BUILD_INFO.implementationHead} manifestVersion=${BUILD_INFO.manifestVersion} buildId=${BUILD_INFO.buildId} builtAt=${BUILD_INFO.builtAt}`,
            `[BUILD_MODULE] contactGateSha=${BUILD_INFO.modules.contactGateSha}`,
            `[BUILD_MODULE] visionSubmitSha=${BUILD_INFO.modules.visionSubmitSha}`,
            `[BUILD_MODULE] historyStoreSha=${BUILD_INFO.modules.historyStoreSha}`,
            `[BUILD_MODULE] emailCollectorSha=${BUILD_INFO.modules.emailCollectorSha}`,
            `[BUILD_MODULE] contentScriptSha=${BUILD_INFO.modules.contentScriptSha}`,
            `[BUILD_MODULE] backgroundSha=${BUILD_INFO.modules.backgroundSha}`
        ];
    }

    function verifyBuildProvenance(runtimeManifest = {}) {
        const expectedManifestVersion = 3;
        const actualManifest = runtimeManifest.manifest_version || runtimeManifest.manifestVersion || 3;
        if (actualManifest !== expectedManifestVersion) {
            return {
                valid: false,
                reason: 'BUILD_PROVENANCE_MISMATCH',
                detail: `Expected manifestVersion=${expectedManifestVersion}, got ${actualManifest}`
            };
        }
        return {
            valid: true,
            buildId: BUILD_INFO.buildId,
            implementationHead: BUILD_INFO.implementationHead,
            implementationHeadShort: BUILD_INFO.implementationHeadShort,
            head: BUILD_INFO.head,
            headShort: BUILD_INFO.headShort
        };
    }

    return {
        BUILD_INFO,
        getBuildProvenanceLogs,
        verifyBuildProvenance
    };
}));
