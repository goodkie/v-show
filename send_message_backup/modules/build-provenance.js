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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.56',
        testOnly: false,
        // [R6.9G.10.3.7.1.4.69] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.53 (Immutable Receipt-ID Ledger Binding & DOM Confirmation Parity)
        implementationHead: '98d984f21317f566818f51df598e5456ab575f6d',
        implementationHeadShort: '98d984f2',
        head: '98d984f21317f566818f51df598e5456ab575f6d',
        headShort: '98d984f2',
        rollbackBase: '55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5',
        previousFunctionalRestorePoint: 'b2af1c9bf614b9f572acec910265d8132d2043aa',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.72-20261025-P0-RC3.56',
        builtAt: '2026-10-25T06:48:34.344Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '9012f722dd5794dae16f9fe69452bce0c6aa29d8cf7c9e6ffcd47f25aca3d23a',
            contentScriptSha: '68ecc67c55c2bf8bd3e8ec75e1b7495772095c959507f05cd33ffc6ea7aa1cd9',
            popupSha: 'dd02b0cf62d406c13e4fa5958d42011d6ddadbb6d8463ff95244ba83db4b15cd',
            solverContentSha: '6a1ff7154efaeb6dbd5946ac4f9be1ce5b5ff43bce2db06d0dca32950edd3bdb',
            solverCoreSha: 'ab4dee5c8213d7c2fd47942951a2bc40732c1c8c55a5742d493db617150bf95f',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '2b34f9c8c1a4c62d07dd406e0e304f179ac68b6d8fbf4bb0614038770fbc4138',
            contactGateSha: '9007adceec8b4e8ec7f7a14ee8a7d21af460a01ed043c578e1e3c2579cfae88e',
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
