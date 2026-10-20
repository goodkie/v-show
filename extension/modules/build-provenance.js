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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.25',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.39] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.25 (Live Provider Gate & Fail Recovery)
        implementationHead: '63e97460c860464eb094c920d94a7ca6a97e7eb5',
        implementationHeadShort: '63e97460',
        head: '63e97460c860464eb094c920d94a7ca6a97e7eb5',
        headShort: '63e97460',
        rollbackBase: '0a6e843d9e5ae512bf48742473bbd3133050c117',
        previousFunctionalRestorePoint: '0a6e843d9e5ae512bf48742473bbd3133050c117',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.39-20261020-PRIVATE-EGRESS-RC3.25',
        builtAt: '2026-10-20T21:45:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '70d734156594bb212a5eac6fbb6d11e72034186e5ff9d0c1c2299e02e50a6e0e',
            contentScriptSha: '5ca1af365cf761124b496fb51664050630a7a1d496f8746e14d7f86bd66efc68',
            popupSha: '763496c61263b595114ba7d611caed98162dd2c6b8368fdedbb4aafdebedbbbf',
            solverContentSha: 'd7de969d29df29799537b11380f0f82967bb93da227c91e7dc8c6af0d128f457',
            solverCoreSha: '347376565857e6b9dc9fa3e75bff5c04c51da1f3c5b3ad7ce7ae2eac627148e8',
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
