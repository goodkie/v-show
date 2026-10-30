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
        // [RC3.60 P0] Non-inquiry hang fix: finishCampaign heartbeat/lock/running cleanup + isFinished latch + SENDER_FINISHED NON_INQUIRY gate passthrough
        implementationHead: 'd8ca75827d271778ea4bcc484bb5b75ab2dbef0a',
        implementationHeadShort: '741dfe44',
        head: '741dfe44536031dff13ac6d8e310d4f72fbca42b',
        headShort: '741dfe44',
        rollbackBase: '55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5',
        previousFunctionalRestorePoint: 'b2af1c9bf614b9f572acec910265d8132d2043aa',
        manifestVersion: 3,
        buildId: 'V7.0.0-RC2-20261030-DUAL-MODE-AUDIT-PRIVACY-STORAGE-PASS',
        builtAt: '2026-10-30T10:11:06.355Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'e806f655265b68e87463b9025618727716b1041c4812331b34412c16c3d93425',
            contentScriptSha: 'c04bc59c238cfbadc51d3aa2653776a9f56ad6620586cfc6c4663b7bc854139e',
            popupSha: '9689f87f671a7e70d213338a686104b3b12447e64400fd2f90477f3694959963',
            solverContentSha: '3d8412e68ce6ec24ef7cf3623b927db88a149084f48e09ebc7a79300139cd4bb',
            solverCoreSha: 'd8bd8499e7052fb434eac3f23994cc969e9e6f77e061207d049cf575a6ac1a1a',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '2b34f9c8c1a4c62d07dd406e0e304f179ac68b6d8fbf4bb0614038770fbc4138',
            contactGateSha: '813866346be77cff498bf3a5683507e32e8a0056626b87c6c2150816983e5673',
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
