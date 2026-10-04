/**
 * math-captcha-solver.js
 * Human Verification Equation & Math Quiz Solver
 * Handles:
 *  - Standard arithmetic: "6 + 1 = ?", "15 - 7 =", "3 x 4 = ?"
 *  - Human verification prompts: "6 + 1 = ?Please prove that you are human by solving the equation *"
 *  - Word equations: "What is four plus six?", "seven minus three"
 *  - Korean equations: "삼 더하기 오 = ?", "9 빼기 4 = ?"
 *  - Missing operand equations: "? + 4 = 10", "15 - ? = 6"
 *  - Sum / Difference phrases: "sum of 8 and 7", "difference between 20 and 6"
 *  - Comparison questions: "Which is bigger, 4 or 9?"
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

    const WORD_MAP = {
        zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
        thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
        '영': 0, '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9, '십': 10,
        '하나': 1, '둘': 2, '셋': 3, '넷': 4, '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9, '열': 10
    };

    const HUMAN_QUIZ_KEYWORDS = [
        'prove that you are human', 'prove you are human', 'prove you\'re human',
        'human verification', 'human test', 'security question', 'security quiz',
        'anti-spam question', 'spam prevention', 'solving the equation', 'solve the equation',
        'solve the math', 'math quiz', 'math captcha', 'math problem',
        '방정식', '휴먼 테스트', '로봇이 아님', '보안 퀴즈', '수식 계산', '계산해 주세요', '사람임을 증명'
    ];

    function parseOperand(str) {
        if (!str) return null;
        const s = str.trim().toLowerCase();
        if (/^-?\d+$/.test(s)) return parseInt(s, 10);
        if (WORD_MAP[s] !== undefined) return WORD_MAP[s];
        return null;
    }

    /**
     * Determines if given context text likely contains a human verification math captcha.
     */
    function isMathCaptcha(text) {
        if (!text || typeof text !== 'string') return false;
        const clean = text.replace(/[\u00A0\s]+/g, ' ').trim();

        // Phone numbers (e.g. 123-456-7890) or ISO dates (2026-10-04) exclusion
        if (/\b\d{2,4}-\d{2,4}-\d{4}\b/.test(clean) || /\b\d{4}-\d{2}-\d{2}\b/.test(clean)) {
            return false;
        }

        const hasKeyword = HUMAN_QUIZ_KEYWORDS.some(k => clean.toLowerCase().includes(k.toLowerCase()));
        const hasEqualOrQuestion = /=|\?|equals|equal/i.test(clean);

        // Check for arithmetic operator between two numbers/words
        const hasArith = /(?:\d+|[a-zA-Z가-힣]+)\s*([\+\-\*xX×·\/÷]|plus|minus|times|multiplied\s+by|divided\s+by|더하기|빼기|곱하기|나누기)\s*(?:\d+|[a-zA-Z가-힣]+)/i.test(clean);

        // Missing operand: ? + 4 = 10 or 8 + ? = 15
        const hasMissingOp = /(?:\?|__+)\s*[\+\-\*\/]\s*\d+\s*=\s*\d+|\d+\s*[\+\-\*\/]\s*(?:\?|__+)\s*=\s*\d+/i.test(clean);
        // Comparison: which is bigger/smaller
        const hasComp = /(?:bigger|larger|greater|smaller|less|더\s*큰|더\s*작은).*?\d+/i.test(clean);
        // Sum / difference
        const hasSumDiff = /(?:sum\s+of|difference\s+between)\s+\w+\s+and\s+\w+/i.test(clean);

        return (hasKeyword && (hasArith || hasMissingOp || hasComp || hasSumDiff)) ||
               (hasArith && hasEqualOrQuestion) ||
               hasMissingOp ||
               hasComp ||
               hasSumDiff;
    }

    /**
     * Solves the math equation from text and returns an integer, or null if unresolvable.
     */
    function solveMathCaptcha(text) {
        if (!text || typeof text !== 'string') return null;
        let clean = text.replace(/[\u00A0\s]+/g, ' ').trim();

        if (!isMathCaptcha(clean)) {
            return null;
        }

        // 1. Missing Operand Equation: e.g. "? + 4 = 10" or "6 + ? = 11"
        const missingLeftMatch = clean.match(/(?:\?|__+)\s*([\+\-\*\/])\s*(\d+|[a-zA-Z]+)\s*=\s*(\d+)/i);
        if (missingLeftMatch) {
            const op = missingLeftMatch[1];
            const b = parseOperand(missingLeftMatch[2]);
            const c = parseInt(missingLeftMatch[3], 10);
            if (b !== null && !isNaN(c)) {
                if (op === '+') return c - b;
                if (op === '-') return c + b;
                if (op === '*' && b !== 0) return Math.floor(c / b);
                if (op === '/') return c * b;
            }
        }

        const missingRightMatch = clean.match(/(\d+|[a-zA-Z]+)\s*([\+\-\*\/])\s*(?:\?|__+)\s*=\s*(\d+)/i);
        if (missingRightMatch) {
            const a = parseOperand(missingRightMatch[1]);
            const op = missingRightMatch[2];
            const c = parseInt(missingRightMatch[3], 10);
            if (a !== null && !isNaN(c)) {
                if (op === '+') return c - a;
                if (op === '-') return a - c;
                if (op === '*' && a !== 0) return Math.floor(c / a);
                if (op === '/' && c !== 0) return Math.floor(a / c);
            }
        }

        // 2. Comparison: "Which is bigger, 4 or 9?" / "Which is smaller, 7 or 2?"
        const biggerMatch = clean.match(/(?:which\s+is\s+)?(?:bigger|larger|greater|더\s*큰)\s*,?\s*(\d+|[a-zA-Z]+)\s*(?:or|and|와|과)?\s*(\d+|[a-zA-Z]+)/i);
        if (biggerMatch) {
            const a = parseOperand(biggerMatch[1]);
            const b = parseOperand(biggerMatch[2]);
            if (a !== null && b !== null) return Math.max(a, b);
        }

        const smallerMatch = clean.match(/(?:which\s+is\s+)?(?:smaller|less|더\s*작은)\s*,?\s*(\d+|[a-zA-Z]+)\s*(?:or|and|와|과)?\s*(\d+|[a-zA-Z]+)/i);
        if (smallerMatch) {
            const a = parseOperand(smallerMatch[1]);
            const b = parseOperand(smallerMatch[2]);
            if (a !== null && b !== null) return Math.min(a, b);
        }

        // 3. Sum / Difference phrases
        const sumMatch = clean.match(/sum\s+of\s+(\d+|[a-zA-Z]+)\s+and\s+(\d+|[a-zA-Z]+)/i);
        if (sumMatch) {
            const a = parseOperand(sumMatch[1]);
            const b = parseOperand(sumMatch[2]);
            if (a !== null && b !== null) return a + b;
        }

        const diffMatch = clean.match(/difference\s+between\s+(\d+|[a-zA-Z]+)\s+and\s+(\d+|[a-zA-Z]+)/i);
        if (diffMatch) {
            const a = parseOperand(diffMatch[1]);
            const b = parseOperand(diffMatch[2]);
            if (a !== null && b !== null) return Math.abs(a - b);
        }

        // 4. Standard arithmetic expression: A [op] B [= ?]
        // Example: "6 + 1 = ?Please prove that you are human by solving the equation *"
        const numsWords = '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|[영일이삼사오육칠팔구십하나둘셋넷다섯여섯일곱여덟아홉열])';
        const ops = '([\\+\\-\\xb7\\*\\/\\xf7\\u00D7\\u00F7]|plus|minus|times|multiplied\\s+by|divided\\s+by|\\+|\\-|x|X|\\u00D7|\\u00F7|더하기|빼기|곱하기|나누기)';

        // Match equation embedded in text
        const arithRegex = new RegExp(numsWords + '\\s*' + ops + '\\s*' + numsWords + '(?:\\s*(?:=|<|=|equals|is|\\?|\\:)?|\\s*$)', 'i');
        const match = clean.match(arithRegex);
        if (match) {
            const a = parseOperand(match[1]);
            const opRaw = match[2].toLowerCase().trim();
            const b = parseOperand(match[3]);

            if (a !== null && b !== null) {
                if (['+', 'plus', '더하기'].includes(opRaw)) return a + b;
                if (['-', 'minus', '빼기'].includes(opRaw)) return a - b;
                if (['*', 'x', 'times', 'multiplied by', '곱하기', '×', '·'].includes(opRaw)) return a * b;
                if (['/', '÷', 'divided by', '나누기'].includes(opRaw) && b !== 0) return Math.floor(a / b);
            }
        }

        return null;
    }

    /**
     * Resolves human quiz equation for a given DOM input element by checking all surrounding context.
     */
    function solveField(el, getContextFn) {
        if (!el) return null;

        // 1. Custom context function if provided
        if (typeof getContextFn === 'function') {
            const ctxText = getContextFn(el);
            const ans = solveMathCaptcha(ctxText);
            if (ans !== null) return ans;
        }

        // 2. Element attributes (placeholder, aria-label, title)
        const attrContext = [
            el.getAttribute ? el.getAttribute('placeholder') : '',
            el.getAttribute ? el.getAttribute('aria-label') : '',
            el.getAttribute ? el.getAttribute('title') : '',
            el.getAttribute ? el.getAttribute('data-placeholder') : ''
        ].filter(Boolean).join(' ');
        const attrAns = solveMathCaptcha(attrContext);
        if (attrAns !== null) return attrAns;

        // 3. Associated label elements
        if (el.id && typeof document !== 'undefined') {
            try {
                const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (label && label.textContent) {
                    const labelAns = solveMathCaptcha(label.textContent);
                    if (labelAns !== null) return labelAns;
                }
            } catch (_) {}
        }
        if (el.labels && el.labels.length > 0) {
            for (let i = 0; i < el.labels.length; i++) {
                if (el.labels[i].textContent) {
                    const lAns = solveMathCaptcha(el.labels[i].textContent);
                    if (lAns !== null) return lAns;
                }
            }
        }

        // 4. Surrounding DOM nodes (parent, preceding sibling, closest label/fieldset)
        if (el.parentElement) {
            // Preceding sibling text
            if (el.previousElementSibling && el.previousElementSibling.textContent) {
                const prevAns = solveMathCaptcha(el.previousElementSibling.textContent);
                if (prevAns !== null) return prevAns;
            }
            // Parent label or container text
            const parentLabel = el.closest ? el.closest('label, .form-group, .field, .wpcf7-form-control-wrap, div') : el.parentElement;
            if (parentLabel && parentLabel.textContent) {
                const pAns = solveMathCaptcha(parentLabel.textContent);
                if (pAns !== null) return pAns;
            }
        }

        return null;
    }

    return {
        WORD_MAP,
        HUMAN_QUIZ_KEYWORDS,
        isMathCaptcha,
        solveMathCaptcha,
        solveField
    };
}));
