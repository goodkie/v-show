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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.41',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.55] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.41 (Live Solver Lifecycle Timeout & WAF 1020 Fast-Fail Classification)
        implementationHead: '478b719db519dbbef052aa0a8765f898140ccba4',
        implementationHeadShort: '478b719d',
        head: '478b719db519dbbef052aa0a8765f898140ccba4',
        headShort: '478b719d',
        rollbackBase: 'd987bca65b0e5d0786e110efaa45ad91622bc85f',
        previousFunctionalRestorePoint: 'd987bca65b0e5d0786e110efaa45ad91622bc85f',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.55-20261022-FINAL-SPRINT-RC3.41',
        builtAt: '2026-10-22T09:34:31.216Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: 'f5979373e4ca71766818b5e33cc6d583bad190384e51036fdd80304996745e7f',
            contentScriptSha: '7eb9532e135eb81c370b648911743327ff7c7884ca4ed77c333ad1f83cc028ff',
            popupSha: 'ef259ffabadd18fb2d4830918d3df8be0bbd6133ae2ad879b116ef5ddf678b29',
            solverContentSha: '6a1ff7154efaeb6dbd5946ac4f9be1ce5b5ff43bce2db06d0dca32950edd3bdb',
            solverCoreSha: 'ab4dee5c8213d7c2fd47942951a2bc40732c1c8c55a5742d493db617150bf95f',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '8e3eb9bd325f772704c4b84f9e7e872e260f10d47d86a134da5802d013f17db8',
            contactGateSha: '0d01acb2d0a9448d154353fac5b527c17afa42fed56c68d6a49b39053629bd7d',
            visionSubmitSha: '6b89eab8fd132798fbb157e179bdeee64da1aa9867222fdb656e3fcf4fcc9311',
            privacyGatewaySha: 'cc5c8cc9c83adf3b985aa4bab74b04189c00fdba4f3ac3a555bd00e38fc79993'
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
