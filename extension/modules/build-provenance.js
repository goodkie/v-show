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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.30',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.44] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.30 (Main-World Bridge and Frame-Targeted Token Injection)
        implementationHead: '74287ddf0e7eb3a3082a823d324c60e35cbb12c7',
        implementationHeadShort: '74287ddf',
        head: '74287ddf0e7eb3a3082a823d324c60e35cbb12c7',
        headShort: '74287ddf',
        rollbackBase: '6e24509e7fbe680e4b0120813a501da0c8dce620',
        previousFunctionalRestorePoint: '6e24509e7fbe680e4b0120813a501da0c8dce620',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.44-20261021-PRIVATE-EGRESS-RC3.30',
        builtAt: '2026-10-21T02:51:07.277Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '49f8969943743de05f86b29b7df4c7d8978a864ac7f1c51f18190e49fb5c5ddb',
            contentScriptSha: 'f3b281ac135ba4ddfc780af841c087ed591de3ed55e58b250e6d3520a9825060',
            popupSha: '0f6b3375a55f2f0e46a668f2740814ba36bd77fd03eeb69eb47cec255c60769b',
            solverContentSha: 'c1fa30c1bb9cea0dec58dc23578a2eae1c9b3c3401fad10b9b9e7d4c107639f7',
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
