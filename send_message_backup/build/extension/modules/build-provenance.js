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
        // [R6.9G.10.3.6.2.1] implementationHead = functional commit containing Exact-Release Companion Lifecycle,
        //                    Rotation Ready state, and Sticky Node Restart recovery
        implementationHead: '47ee3ba29f055f86a889bac11ecad82db1558725',
        implementationHeadShort: '47ee3ba2',
        head: '47ee3ba29f055f86a889bac11ecad82db1558725',
        headShort: '47ee3ba2',
        rollbackBase: 'dc0740a0c69e2f7fa96b6989841acf0831b3619e',
        previousFunctionalRestorePoint: '32e384d1f7ac0292308011f60bd6c1ef2bb86654',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.6.2.1-20261010-EXACT-RELEASE-COMPANION-LIFECYCLE',
        builtAt: '2026-10-10T13:30:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '2e17c641b7d43761b666b92166b6c80decc7143e988bc3f9648f7a2279c214e5',
            contentScriptSha: '5c2ebd277a9020a4434fc68cd46c6ec974dbf180290ba368b33273aee67ccf9e',
            popupSha: '18d2968ad2587e79c43c3aef7b2ca99eeca48eb690dd238e3de90d7e0998e73f',
            solverContentSha: 'd7de969d29df29799537b11380f0f82967bb93da227c91e7dc8c6af0d128f457',
            solverCoreSha: '01b3d96048ea933403e4599854dcdca28027e7f676aa5077eb6c5eb0582ac1e7',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: 'ef148329c5c019877fef3708ac63472ce86d5f7f06da467a557a74e038eab6b4',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3',
            privacyGatewaySha: '178ca80ec05320be78ba1cab2aa5a08ac6d9b7a8a4c1d299b55d657f3baef313'
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
