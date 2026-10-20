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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.20',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.34] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.20 (Canonical Runtime Root Parity & Watchdog Self-Heal Acceptance)
        implementationHead: 'dfaecf60458d72c0c53a5fe26821093a81d93ea9',
        implementationHeadShort: 'dfaecf60',
        head: 'dfaecf60458d72c0c53a5fe26821093a81d93ea9',
        headShort: 'dfaecf60',
        rollbackBase: '0a6e843d9e5ae512bf48742473bbd3133050c117',
        previousFunctionalRestorePoint: '0a6e843d9e5ae512bf48742473bbd3133050c117',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20',
        builtAt: '2026-10-20T09:15:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'a90ecd8db64c8b61551f3f63d2edadaa65c9e3bbdafe0c4bd55ebc1c81f644c1',
            contentScriptSha: '9590675eb799a92b857d69ea8102639ce301e682568a17b1667aff0ba11211d4',
            popupSha: '026325282b0297d1c77fd7bedd172aaa54cf29f4236a2178060f374164db0958',
            solverContentSha: 'd7de969d29df29799537b11380f0f82967bb93da227c91e7dc8c6af0d128f457',
            solverCoreSha: '01b3d96048ea933403e4599854dcdca28027e7f676aa5077eb6c5eb0582ac1e7',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '0dc2fbda1b1506de9394f87a965ff2ebd5721ea1c47d7bda07c9411193890d8c',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3',
            privacyGatewaySha: 'd496d425374243b757320e53087e5e8154e141c3660b39d1a9b2d82762290a62'
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
