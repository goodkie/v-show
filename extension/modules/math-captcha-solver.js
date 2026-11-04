/**
 * math-captcha-solver.js
 * [v7.0 RETIRED per Owner External-Extension-Only Contract]
 * In-app CAPTCHA and math solving retired. XPIDER delegates challenge solving
 * strictly to external extensions or operator assistance.
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MathCaptchaSolver = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
        retired: true,
        solveMathCaptcha: function () { return null; },
        solveField: function () { return null; },
        isMathCaptchaContext: function () { return false; }
    };
}));
