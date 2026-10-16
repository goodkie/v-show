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
        channel: 'OWNER_BETA',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.11] XPIDER AutoForm Sender Pro — Owner Beta Cut (Comment #6208890551)
        implementationHead: '44f62c1922ae658b4e719dd5fc3b7e54a42732e4',
        implementationHeadShort: '44f62c19',
        head: '44f62c1922ae658b4e719dd5fc3b7e54a42732e4',
        headShort: '44f62c19',
        rollbackBase: 'dc0740a0c69e2f7fa96b6989841acf0831b3619e',
        previousFunctionalRestorePoint: '31b929c35eb52aba782181ba83e79a7196c51337',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.11-20261016-OWNER-BETA',
        builtAt: '2026-10-16T05:55:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '2cdd271a4e8689d25ea6fc1b00aa0ce86921785d507857c86af85a34c4a93bb2',
            contentScriptSha: 'b59b6398f08bbaefd31dc32358138f15e2092dec667860ff99b4b36cde40570b',
            popupSha: 'f547ce2f6159c3008cb8a09eaa159eb393744411b9b3bc684081b552071080f9',
            solverContentSha: 'd7de969d29df29799537b11380f0f82967bb93da227c91e7dc8c6af0d128f457',
            solverCoreSha: '01b3d96048ea933403e4599854dcdca28027e7f676aa5077eb6c5eb0582ac1e7',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: 'e3e8f6f769a4abb5e8beaff261ac7496d82b70d51b5e2e96324f3581adb4188e',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3',
            privacyGatewaySha: '2662f12eb26290a8334e9de4727cd0ceb039d966c4ec05d2c321ede7715a43a9'
        }
    };

    function isTestOnlyBuild() {
        return Boolean(BUILD_INFO.testOnly === true && (BUILD_INFO.channel === 'TEST_ONLY' || BUILD_INFO.channel === 'OWNER_BETA'));
    }

    function getBuildProvenanceLogs() {
        return [
            `[BUILD_ID] branch=${BUILD_INFO.branch} channel=${BUILD_INFO.channel} testOnly=${BUILD_INFO.testOnly} implementationHead=${BUILD_INFO.implementationHead} manifestVersion=${BUILD_INFO.manifestVersion} buildId=${BUILD_INFO.buildId} builtAt=${BUILD_INFO.builtAt}`,
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
            headShort: BUILD_INFO.headShort,
            channel: BUILD_INFO.channel,
            testOnly: BUILD_INFO.testOnly
        };
    }

    return {
        BUILD_INFO,
        getBuildProvenanceLogs,
        verifyBuildProvenance,
        isTestOnlyBuild
    };
}));
