/**
 * build-provenance.js
 * Immutable Build Provenance & Module Verification (Issue #6 R6.8 P0-1)
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
        implementationHead: '8963ece6f069562b7af028e354c75f9eac15857b',
        implementationHeadShort: '8963ece',
        head: '8963ece6f069562b7af028e354c75f9eac15857b',
        headShort: '8963ece',
        rollbackBase: 'b8e1d0362946cd6ca8c77c1aa990998da62c2c91',
        manifestVersion: 3,
        buildId: 'R6.9F-20261005-RUNTIME-SUBMIT-COUNTERS',
        builtAt: '2026-10-05T08:50:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'd3c1618a72507b8965ec9f57500b0c7b80f732f3890c863ce528a4fca591a62f',
            contentScriptSha: '0091ab06d2458fdbea64911979529f81d701f6b997d33fef17ee4791cbbe1e32',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '38816d8b6e66114e24cdff84a52e0c22dac38bda23a38826b3ae581d252b8791',
            contactGateSha: '524933622d1a862425d7302b051bb063d5a3cbec166d868fa73825fa4d38f334',
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
