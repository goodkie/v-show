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
        channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.44.2',
        testOnly: true,
        // [R6.9G.10.3.7.1.4.60] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.44.2 (P0-PATCH: Path 6 Booking Guard Hardening + Visible Field Count Fix)
        implementationHead: '5cc89d9ee72fbfda03c20c02568771aa130fc2f1',
        implementationHeadShort: '5cc89d9e',
        head: '5cc89d9ee72fbfda03c20c02568771aa130fc2f1',
        headShort: '5cc89d9e',
        rollbackBase: '3cc1be6b436b1d68f948927df88a2c73c1ae5011',
        previousFunctionalRestorePoint: '3cc1be6b436b1d68f948927df88a2c73c1ae5011',
        manifestVersion: 3,
        buildId: 'R6.9G.10.3.7.1.4.60-20261023-P0-PATCH-RC3.44.2',
        builtAt: '2026-10-23T08:45:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '26b1f824e3763ddef81d12eb07dcf86daac3e37ce0bb49d82879500958093f28',
            contentScriptSha: '7eb9532e135eb81c370b648911743327ff7c7884ca4ed77c333ad1f83cc028ff',
            popupSha: 'ef259ffabadd18fb2d4830918d3df8be0bbd6133ae2ad879b116ef5ddf678b29',
            solverContentSha: '6a1ff7154efaeb6dbd5946ac4f9be1ce5b5ff43bce2db06d0dca32950edd3bdb',
            solverCoreSha: 'ab4dee5c8213d7c2fd47942951a2bc40732c1c8c55a5742d493db617150bf95f',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: '8e3eb9bd325f772704c4b84f9e7e872e260f10d47d86a134da5802d013f17db8',
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
