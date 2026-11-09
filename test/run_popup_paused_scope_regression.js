'use strict';
/** Regression: paused state must remain visible after nested storage hydration block. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../extension/popup.js'),'utf8');
const start=src.indexOf('async function hydrateCampaignState()');
const end=src.indexOf('async function renderAuxiliaryUI()',start);
assert(start>=0 && end>start);
const code=src.slice(start,end);
const top=code.indexOf('let isPausedState = Boolean(response.isPaused);');
const reassignment=code.indexOf('isPausedState = Boolean(response.isPaused || st.xpider_isPaused');
const access=code.indexOf('} else if (isPausedState)');
assert(top>=0,'outer paused variable missing');
assert(reassignment>top,'state not refreshed from storage');
assert(access>reassignment,'scope declaration does not precede use');
assert(!code.includes('const isPausedState'),'nested const shadows outer state');
console.log('4/4 PASS — paused state scope checks (static)');
