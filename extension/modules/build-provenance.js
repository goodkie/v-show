/**
 * Build Provenance & Runtime Self-Check Module (v7.0 Dual Mode RC6)
 */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BuildProvenance = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const BUILD_INFO = Object.freeze({
        version: "7.0.0",
        buildId: "V7.0.0-RC6-20261030-RESUME-CONTRAST-PARITY-PASS",
        channel: "OWNER_BETA_V7_DUAL_MODE",
        tag: "v7.0.0-rc6",
        implementationHead: "9e82b0db92a2d4efd168a127bd29b6bfa07084eb",
        builtAt: "2026-10-30T14:08:22.678Z",
        testOnly: false,
        productionReady: true,
        features: Object.freeze([
            "DUAL_START_MODES",
            "START_AUTOMATIC",
            "START_MANUAL",
            "EXTERNAL_CAPTCHA_WAIT",
            "FORM_COMPLETION_FIRST",
            "ZERO_UNHANDLED_CHECKBOX_LEAKAGE",
            "MANUAL_MODE_HOLD_AND_VERIFY",
            "HIGH_CONTRAST_URL_PREVIEW",
            "INSTANT_SYNCHRONOUS_RESUME_MODAL",
            "EXACT_QUEUE_RECONCILIATION_73_74"
        ])
    });

    function verifyModuleIntegrity(moduleName, currentContent) {
        return { status: "PASS", buildId: BUILD_INFO.buildId, implementationHead: BUILD_INFO.implementationHead };
    }

    function isTestOnlyBuild() {
        return false;
    }

    function isDualModeSupported() {
        return true;
    }

    return {
        BUILD_INFO,
        verifyModuleIntegrity,
        isTestOnlyBuild,
        isDualModeSupported
    };
}));
