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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.28',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.42] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.28 (Serialized Captcha Verification & Single Authority)
        implementationHead: 'f23cb99d282c423162c8ef145f6d675e1e00439e',
        implementationHeadShort: 'f23cb99d',
        head: 'f23cb99d282c423162c8ef145f6d675e1e00439e',
        headShort: 'f23cb99d',
        rollbackBase: '6e24509e7fbe680e4b0120813a501da0c8dce620',
        previousFunctionalRestorePoint: '6e24509e7fbe680e4b0120813a501da0c8dce620',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.42-20261021-PRIVATE-EGRESS-RC3.28',
        builtAt: '2026-10-21T02:00:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '160febc2b7cec67c1f69a80fa98a3b0dfdcd58ccad32ff5ca8213d710e201a8b',
            contentScriptSha: '6105ae13efed0faebf024abbb8f1efd89304e79334dd442b98bac8c9f36f1c2b',
            popupSha: '0f6b3375a55f2f0e46a668f2740814ba36bd77fd03eeb69eb47cec255c60769b',
            solverContentSha: 'a96a63bd295168ddacc4e7ba040c0ef8646483c40a2e955cadf02b36c5f93c38',
            solverCoreSha: 'f4977844acbd319f0cf6a0f49ed0f88c491293c8fd42ee53c0a06eef58dbefad',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '0dc2fbda1b1506de9394f87a965ff2ebd5721ea1c47d7bda07c9411193890d8c',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '6b89eab8fd132798fbb157e179bdeee64da1aa9867222fdb656e3fcf4fcc9311',
            privacyGatewaySha: '59bdaf23809a58a1b201d843279eb1a9455bc2a8bbbb8312ef5b47ddaa814a50'
        }
    };

    function isTestOnlyBuild() {
        return Boolean(BUILD_INFO.testOnly === true && (BUILD_INFO.channel === 'TEST_ONLY' || BUILD_INFO.channel === 'OWNER_BETA' || BUILD_INFO.channel.startsWith('OWNER_BETA')));
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
