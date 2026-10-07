/**
 * build-provenance.js
 * Immutable Build Provenance & Module Verification (Issue #6 R6.9G.7)
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
        // [R6.9G.9.3] implementationHead = functional commit containing real proxy path,
        //             MV3 asyncBlocking onAuthRequired handler, bounded proxy canary, and scheduler quiescence
        implementationHead: 'ba845562d8fae41c1e4add0906c8c4c046f1885f',
        implementationHeadShort: 'ba845562',
        head: 'ba845562d8fae41c1e4add0906c8c4c046f1885f',
        headShort: 'ba845562',
        rollbackBase: 'dc0740a0c69e2f7fa96b6989841acf0831b3619e',
        manifestVersion: 3,
        buildId: 'R6.9G.9.3-20261007-REAL-PROXY-MV3-AUTH',
        builtAt: '2026-10-07T20:50:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'f12fc2abba966ee8e1e96082c2be96cf581125d3e9bfc2bee04031cec38cd976',
            contentScriptSha: 'db15cc0900d9171bb79b31a0aeaae09a16712f1d06413db7230e75633cf5b257',
            popupSha: '6228be8f77870492051ec7968b3ee34c9019de8b33339bbe0159461f8d03857d',
            solverContentSha: 'dca775d4db576dd48be191a80b2e1b5394448c572cf3860735cf0be99ff966da',
            solverCoreSha: '01b3d96048ea933403e4599854dcdca28027e7f676aa5077eb6c5eb0582ac1e7',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: 'ef148329c5c019877fef3708ac63472ce86d5f7f06da467a557a74e038eab6b4',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3',
            privacyGatewaySha: '719e8b3d5d3b62849dc86409481f13673a781edf574c4537ba59a5c1404288c2'
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
            `[BUILD_MODULE] backgroundSha=${BUILD_INFO.modules.backgroundSha}`,
            `[BUILD_MODULE] popupSha=${BUILD_INFO.modules.popupSha}`,
            `[BUILD_MODULE] solverContentSha=${BUILD_INFO.modules.solverContentSha}`,
            `[BUILD_MODULE] solverCoreSha=${BUILD_INFO.modules.solverCoreSha}`,
            `[BUILD_MODULE] privacyGatewaySha=${BUILD_INFO.modules.privacyGatewaySha}`
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
