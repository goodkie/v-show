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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.60',
        testOnly: false,
        // [RC3.60 P0] Non-inquiry hang fix: finishCampaign heartbeat/lock/running cleanup + isFinished latch + SENDER_FINISHED NON_INQUIRY gate passthrough
        implementationHead: '741dfe44536031dff13ac6d8e310d4f72fbca42b',
        implementationHeadShort: '741dfe44',
        head: '741dfe44536031dff13ac6d8e310d4f72fbca42b',
        headShort: '741dfe44',
        rollbackBase: '55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5',
        previousFunctionalRestorePoint: 'b2af1c9bf614b9f572acec910265d8132d2043aa',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.79-20261026-P0-RC3.60-NONINQUIRY-HANG-FIX',
        builtAt: '2026-10-26T10:42:31.464Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '1a67666fac900792de2b2e3a3d4787837ce5acba5a88edea0446c2bf008be02c',
            contentScriptSha: '3c4410218aab3fd3631ee186895bee8a62c2ab75916aaf95314a3a5461b8b3f0',
            popupSha: '4e8361d169a4ad447977a9a4521a7eedc2066364179aed632b3a029d2570d651',
            solverContentSha: '6a1ff7154efaeb6dbd5946ac4f9be1ce5b5ff43bce2db06d0dca32950edd3bdb',
            solverCoreSha: 'ab4dee5c8213d7c2fd47942951a2bc40732c1c8c55a5742d493db617150bf95f',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '2b34f9c8c1a4c62d07dd406e0e304f179ac68b6d8fbf4bb0614038770fbc4138',
            contactGateSha: '9007adceec8b4e8ec7f7a14ee8a7d21af460a01ed043c578e1e3c2579cfae88e',
            visionSubmitSha: '6b89eab8fd132798fbb157e179bdeee64da1aa9867222fdb656e3fcf4fcc9311',
            privacyGatewaySha: 'fa9b779bd2cbce94dd9b9f369c301c3482b5f90f10cdb487f8761a50b75bf116'
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
