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
        implementationHead: 'b97d85ecf026221a85d0ef880a2743cb98ec3059',
        implementationHeadShort: 'b97d85e',
        head: 'b97d85ecf026221a85d0ef880a2743cb98ec3059',
        headShort: 'b97d85e',
        rollbackBase: 'b8e1d0362946cd6ca8c77c1aa990998da62c2c91',
        manifestVersion: 3,
        buildId: 'R6.9D-20261004-OUTCOME',
        builtAt: '2026-10-04T12:15:18.569Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'bbc93f7b0cf2eaa4daf239fb83bef56f379ebe5471256b1d8d416fb34b5a34c4',
            contentScriptSha: '20947ca0aa03240ad6dc8820e7155f9245d40f79a9d029ab6b3c912c6660b3da',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '7c9e22e0f62c4f1b3d82510dcc6604eaefff72e80f79c25041319bdf169305ac',
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
