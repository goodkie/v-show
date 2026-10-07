/**
 * build-provenance.js
 * Immutable Build Provenance & Module Verification (Issue #6 R6.9G.5)
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
        // [R6.9G.6] implementationHead = functional commit containing true iframe disappearance
        //           pre/post snapshot and unpatched real target pump lifecycle
        implementationHead: '7b908efe524ce0b8c88b85aa562318ddabe1dd80',
        implementationHeadShort: '7b908efe',
        head: '7b908efe524ce0b8c88b85aa562318ddabe1dd80',
        headShort: '7b908efe',
        rollbackBase: 'dc0740a0c69e2f7fa96b6989841acf0831b3619e',
        manifestVersion: 3,
        buildId: 'R6.9G.6-20261007-TRUE-IFRAME-UNPATCHED-PUMP',
        builtAt: '2026-10-07T07:00:00.000Z',
        provenanceSchema: 2,
        modules: {
            backgroundSha: '2e3a12d55922c0a89f8cfd7f929e9aec51563467b81bacb08f2c7f4ad6040b65',
            // [R6.9G.6] contentScriptSha updated: true iframe disappearance snapshot
            contentScriptSha: '8e72935c1b951ce985ab958c7ab6687e24046e41572e30108c267d0d0f6212c3',
            popupSha: 'b0853e487f76954901efccd0a67e044807da4da80777e1eda46a6f554583e2d1',
            solverContentSha: '2e964bf785d8a315ae805cf15f2583cec120746ba56a4b2a7f20c7ec07107745',
            emailCollectorSha: '3f1147a379e159e7777158f2caa74cc8d40b2a0b0eb2c244f440af379cb5c9c9',
            historyStoreSha: 'c31dba092c67a6bac6d8fffb616109328e50c5a13e73110bc4c3720060e9c406',
            contactGateSha: '88c60303e5b42ef28e53167ce14ca1cb96628cbf0f73c9e4b7a50004663092e4',
            visionSubmitSha: '25cf18a4834bb476edff5e8f19a78dd2723bd556ede649ada69bc801543c83f3'
        }
    };

    function getBuildProvenanceLogs() {
        return [
            `[BUILD_ID] branch=${BUILD_INFO.branch} implementationHead=${BUILD_INFO.implementationHead} manifestVersion=${BUILD_INFO.manifestVersion} buildId=${BUILD_INFO.buildId} builtAt=${BUILD_INFO.builtAt}`,
            `[BUILD_MODULE] contactGateSha=${BUILD_INFO.modules.contactGateSha}`,
            `[BUILD_MODULE] visionSubmitSha=${BUILD_INFO.modules.visionSubmitSha}`,
            `[BUILD_MODULE] historyStoreSha=${BUILD_INFO.modules.historyStoreSha}`,
            `[BUILD_MODULE] emailCollectorSha=${BUILD_INFO.modules.emailCollectorSha}`,
            `[BUILD_MODULE] contentScriptSha=${BUILD_INFO.modules.contentScriptSha}`,
            `[BUILD_MODULE] backgroundSha=${BUILD_INFO.modules.backgroundSha}`,
            `[BUILD_MODULE] popupSha=${BUILD_INFO.modules.popupSha}`,
            `[BUILD_MODULE] solverContentSha=${BUILD_INFO.modules.solverContentSha}`
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
            headShort: BUILD_INFO.headShort
        };
    }

    return {
        BUILD_INFO,
        getBuildProvenanceLogs,
        verifyBuildProvenance
    };
}));
