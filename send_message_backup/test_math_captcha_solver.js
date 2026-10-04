/**
 * test_math_captcha_solver.js
 * Unit and Integration Tests for Human Verification Math Captcha Solver
 */

const assert = require('assert');
const path = require('path');
const solver = require('./modules/math-captcha-solver.js');

console.log('======================================================================');
console.log(' [TEST SUITE: Human Verification Equation & Math Captcha Solver]');
console.log('======================================================================\n');

const testCases = [
    { name: 'User Prompt Exact Case', text: '6 + 1 = ?Please prove that you are human by solving the equation *', expected: 7 },
    { name: 'Standard addition with question mark', text: '6 + 1 = ?', expected: 7 },
    { name: 'Standard addition without question mark', text: '14 + 5 =', expected: 19 },
    { name: 'Standard subtraction', text: '15 - 7 = ?', expected: 8 },
    { name: 'Multiplication with x', text: '3 x 4 = ?', expected: 12 },
    { name: 'Multiplication with *', text: '5 * 6 = ?', expected: 30 },
    { name: 'Multiplication with ×', text: '7 × 8 = ?', expected: 56 },
    { name: 'Division with /', text: '20 / 4 = ?', expected: 5 },
    { name: 'Division with ÷', text: '35 ÷ 7 = ?', expected: 5 },
    { name: 'English words equation', text: 'What is four plus six?', expected: 10 },
    { name: 'English words subtraction', text: 'What is ten minus three?', expected: 7 },
    { name: 'English words times', text: 'What is three times five?', expected: 15 },
    { name: 'Missing left operand', text: '? + 4 = 10', expected: 6 },
    { name: 'Missing right operand', text: '8 + ? = 15', expected: 7 },
    { name: 'Missing right subtraction', text: '20 - ? = 14', expected: 6 },
    { name: 'Sum of A and B', text: 'sum of 9 and 11', expected: 20 },
    { name: 'Difference between A and B', text: 'difference between 25 and 10', expected: 15 },
    { name: 'Korean equation', text: '칠 더하기 삼 = ?', expected: 10 },
    { name: 'Korean subtraction', text: '구 빼기 사 = ?', expected: 5 },
    { name: 'Comparison bigger', text: 'Which is bigger, 12 or 25?', expected: 25 },
    { name: 'Comparison smaller', text: 'Which is smaller, 18 or 7?', expected: 7 },
    { name: 'Non-math phone number (should be null)', text: 'Phone: 123-456-7890', expected: null },
    { name: 'Non-math date string (should be null)', text: 'Date: 2026-10-04', expected: null },
    { name: 'Non-math normal message (should be null)', text: 'Hello, I have an inquiry about your services.', expected: null }
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
    const isMath = solver.isMathCaptcha(tc.text);
    const result = solver.solveMathCaptcha(tc.text);
    const ok = result === tc.expected;

    if (ok) {
        passed++;
        console.log(`✅ PASS: [${tc.name}] "${tc.text.substring(0, 50)}..." => ${result}`);
    } else {
        failed++;
        console.error(`❌ FAIL: [${tc.name}] "${tc.text}" => Got ${result}, expected ${tc.expected}`);
    }
}

console.log('\n--- DOM Mock Element Tests ---');

// Mock DOM element test
const mockEl = {
    id: 'quiz-field',
    name: 'captcha_quiz',
    parentElement: {
        textContent: 'Please prove that you are human by solving the equation: 6 + 1 = ?'
    }
};

const domAnswer = solver.solveField(mockEl);
assert.strictEqual(domAnswer, 7, 'solveField must resolve 7 from mockEl parent text');
console.log('✅ PASS: solveField resolved 7 from DOM parent wrapper');

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED`);
console.log(`======================================================================\n`);

if (failed > 0) process.exit(1);
