'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DraftOutbox}=require('../companion/email-draft-outbox');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpider-outbox-test-'));
const file=path.join(dir,'nested','drafts.json');
const base={email:'Approved@Example.test',authorized:true,authorizationSource:'customer written permission',
 authorizationAt:'2026-11-01T12:00:00Z',source:'CUSTOMER',templateId:'notice_1',key:'authorized-job-key-20261109'};
let n=0;
function check(name,fn){fn();n++;console.log('PASS',name)}
try{
 const box=new DraftOutbox(file);
 check('new outbox is empty',()=>assert.equal(box.snapshot().jobs.length,0));
 check('invalid address rejected',()=>assert.throws(()=>box.add({...base,email:'bad'}),/INVALID_EMAIL/));
 check('email collector source rejected',()=>assert.throws(()=>box.add({...base,source:'EMAIL_COLLECTOR'}),/COLLECTED_ADDRESS_NOT_AUTHORIZATION/));
 check('no authorization denied',()=>assert.throws(()=>box.add({...base,authorized:false}),/AUTHORIZATION_EVIDENCE_REQUIRED/));
 check('invalid idempotency key denied',()=>assert.throws(()=>box.add({...base,key:'abc'}),/IDEMPOTENCY_KEY_REQUIRED/));
 check('authorized draft saved',()=>assert.equal(box.add(base).status,'DRAFT'));
 check('file persisted',()=>assert(fs.existsSync(file)));
 check('idempotency duplicate denied',()=>assert.equal(box.add(base).status,'DUPLICATE'));
 check('reload keeps draft',()=>assert.equal(new DraftOutbox(file).snapshot().jobs.length,1));
 check('draft has no sending state',()=>assert.equal(box.snapshot().jobs[0].status,'DRAFT'));
 check('suppress cancels drafts',()=>{box.suppress('approved@example.test','UNSUBSCRIBED');assert.equal(box.snapshot().jobs[0].status,'CANCELLED')});
 check('suppression persists across restart',()=>assert.equal(new DraftOutbox(file).snapshot().suppressed.length,1));
 check('suppressed recipient cannot queue',()=>assert.equal(box.add({...base,key:'authorized-second-key-20261109'}).status,'SUPPRESSED'));
 check('hold never changes cancellation',()=>{box.holdAll();assert.equal(box.snapshot().jobs[0].status,'CANCELLED')});
 check('snapshot cannot mutate internal state',()=>{const x=box.snapshot();x.jobs[0].status='HOLD';assert.equal(box.snapshot().jobs[0].status,'CANCELLED')});
 check('corrupted JSON is rejected',()=>{const bad=path.join(dir,'bad.json');fs.writeFileSync(bad,'{bad');assert.throws(()=>new DraftOutbox(bad),SyntaxError)});
 check('invalid state is rejected',()=>{const bad=path.join(dir,'bad-state.json');fs.writeFileSync(bad,JSON.stringify({version:1,jobs:[{status:'SENT'}],suppressed:[]}));assert.throws(()=>new DraftOutbox(bad),/INVALID_JOB_STATE/)});
 console.log(n+'/'+n+' PASS; NO SENDS');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
