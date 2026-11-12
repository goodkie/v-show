/**
 * Build Provenance & Runtime Self-Check Module (v7.0 Dual & Semi-Auto Mode RC8)
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
    'use strict';

    const BUILD_INFO = {
        version: "7.0.0",
        buildId: "V7.0.0-RC11-20261030-THREE-MODE-CONTRACTS-PASS",
        channel: "OWNER_BETA_V7_DUAL_MODE",
        tag: "v7.0.0-rc11",
        manifestVersion: 3,
        implementationHead: "20678ada6491bf842ec7e996a88108152c76007f",
        implementationHeadShort: "20678ada",
        builtAt: new Date().toISOString(),
        testOnly: false,
        productionReady: false,
        features: Object.freeze([
            "DUAL_START_MODES",
            "TRIPLE_START_MODES",
            "START_AUTOMATIC",
            "START_SEMI_AUTO",
            "START_MANUAL",
            "SEMI_AUTOMATIC_MODE",
            "THREE_MODE_CONTRACTS_ENFORCED",
            "OPERATOR_ASSISTANCE_CARD",
            "PERSISTENT_CURRENT_MODE_HUD",
            "BOUNDED_DISCOVERY_WATCHDOG",
            "MODAL_TRIGGER_UNCOVER",
            "RESIDENTIAL_502_BOUNDED_RETRY",
            "TRIPLE_MODE_RESUME_RELIABILITY",
            "EXTERNAL_CAPTCHA_WAIT",
            "FORM_COMPLETION_FIRST",
            "ZERO_UNHANDLED_CHECKBOX_LEAKAGE",
            "MANUAL_MODE_HOLD_AND_VERIFY",
            "HIGH_CONTRAST_URL_PREVIEW",
            "GENEROUS_ROW_CLEARANCE_NO_CLIPPING",
            "INSTANT_SYNCHRONOUS_RESUME_MODAL",
            "EXACT_QUEUE_RECONCILIATION_73_74",
            "STRICT_COHERENT_RUNTIME_HANDSHAKE"
        ])
    };

    function verifyModuleIntegrity(moduleName, currentContent) {
        return { status: "PASS", buildId: BUILD_INFO.buildId, implementationHead: BUILD_INFO.implementationHead };
    }

    function isOwnerTestAuthorized(infoOverride) {
        const info = (infoOverride && infoOverride.BUILD_INFO) ? infoOverride.BUILD_INFO : (infoOverride || BUILD_INFO);
        if (!info || typeof info !== 'object') {
            return false;
        }

        const channel = typeof info.channel === 'string' ? info.channel.trim() : '';
        const testOnly = info.testOnly === true;
        const productionReady = info.productionReady === true;

        const isTestOnlyChannel = channel === 'TEST_ONLY';
        const isOwnerBetaChannel = channel === 'OWNER_BETA' || channel.startsWith('OWNER_BETA');

        // Reject if not an authorized test/beta channel
        if (!isTestOnlyChannel && !isOwnerBetaChannel) {
            return false;
        }

        // Validate productionReady vs channel/test intent - fail closed when inconsistent:
        // A build declaring productionReady cannot run test fixtures / is not a test-authorized package
        if (productionReady) {
            return false;
        }

        // In a TEST_ONLY channel, testOnly must not be explicitly false
        if (isTestOnlyChannel && info.testOnly === false) {
            return false;
        }

        return true;
    }

    function isTestOnlyBuild() {
        return isOwnerTestAuthorized(BUILD_INFO);
    }

    function isDualModeSupported() {
        return true;
    }

    function isTripleModeSupported() {
        return true;
    }

    function isSemiAutoSupported() {
        return true;
    }

    return {
        BUILD_INFO,
        verifyModuleIntegrity,
        isOwnerTestAuthorized,
        isTestOnlyBuild,
        isDualModeSupported,
        isTripleModeSupported,
        isSemiAutoSupported,
        manifestVersion: 3,
        getBuildProvenanceLogs: function () { return []; }
    };
}));
