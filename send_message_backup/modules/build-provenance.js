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
        buildId: 'R6.9G.10.3.7.1.4.93-20261029-P0-RC3.60-CAPTCHA-FORM-QA-PASS',
        builtAt: '2026-10-30T03:32:00.818Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '97491a1d46d483d3a6ba00ac6e758387f8d1ba7247ce7749d2b69c2ae47f65eb',
            contentScriptSha: '1b01d4ada6a9ac0e38b4037a3c4e3193f6649ecd5380bbc72364c96bda36ff40',
            popupSha: '27c43a22669e6fad2c4013ccd977cf7ac383d099b01e229f3cc7e54aec64a61c',
            solverContentSha: '6a1ff7154efaeb6dbd5946ac4f9be1ce5b5ff43bce2db06d0dca32950edd3bdb',
            solverCoreSha: 'd8bd8499e7052fb434eac3f23994cc969e9e6f77e061207d049cf575a6ac1a1a',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '2b34f9c8c1a4c62d07dd406e0e304f179ac68b6d8fbf4bb0614038770fbc4138',
            contactGateSha: '813866346be77cff498bf3a5683507e32e8a0056626b87c6c2150816983e5673',
            visionSubmitSha: '6b89eab8fd132798fbb157e179bdeee64da1aa9867222fdb656e3fcf4fcc9311',
            privacyGatewaySha: 'c01e83ccaa4dbebddcf8b973bd7625c6257cc9e90a961b9dd4f3828f12eafef0'
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
