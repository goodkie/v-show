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
        branch: 'major/v7-dual-mode',
        channel: 'OWNER_BETA_V7_DUAL_MODE',
        testOnly: false,
        // [V7.0.0-RC4] Manual-hold resolution handshake + terminal transition fix (#6521464588)
        implementationHead: 'ec56efbd7654ed83b92e099068bdd0acb0b6084b',
        implementationHeadShort: 'ec56efbd',
        head: 'ec56efbd7654ed83b92e099068bdd0acb0b6084b',
        headShort: 'ec56efbd',
        rollbackBase: '55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5',
        previousFunctionalRestorePoint: 'd8ca75827d271778ea4bcc484bb5b75ab2dbef0a',
        manifestVersion: 3,
        buildId: 'V7.0.0-RC4-20261030-MANUAL-HOLD-HANDSHAKE-PASS',
        builtAt: '2026-10-30T11:49:25.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'a143eef1443ec382608c00b4e2a43baa58169bfece5bcbe5bdf99ca6afc87056',
            contentScriptSha: '3246779fdf5e2a6255f5b59010a2e19810efec0eeb36e7276c170e5e6943440c',
            popupSha: '9689f87f671a7e70d213338a686104b3b12447e64400fd2f90477f3694959963',
            solverContentSha: '3d8412e68ce6ec24ef7cf3623b927db88a149084f48e09ebc7a79300139cd4bb',
            solverCoreSha: 'd8bd8499e7052fb434eac3f23994cc969e9e6f77e061207d049cf575a6ac1a1a',
            emailCollectorSha: '631a1bb6a125dd51b1eae0b36905579c490000f471515179c8772f47b2795e06',
            historyStoreSha: '2b34f9c8c1a4c62d07dd406e0e304f179ac68b6d8fbf4bb0614038770fbc4138',
            contactGateSha: 'bc4ea10df952705a5bf50585262dad482234c136e34956359cff4d449b59b84e',
            visionSubmitSha: '6b89eab8fd132798fbb157e179bdeee64da1aa9867222fdb656e3fcf4fcc9311',
            privacyGatewaySha: 'bfa6a4d70ec77a10a508d94d8424d5b90aca6a2d45a09f64e70f7239ae28c6bb'
        }
    };

    function isTestOnlyBuild() {
        const ch = (BUILD_INFO && BUILD_INFO.channel) ? String(BUILD_INFO.channel) : '';
        const isOwnerBeta = ch === 'OWNER_BETA' || ch.startsWith('OWNER_BETA');
        const isTestChannel = ch === 'TEST_ONLY' || BUILD_INFO.testOnly === true;
        return Boolean(isOwnerBeta || isTestChannel);
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
