'use strict';
const assert=require('node:assert/strict');
const policy=require('../extension/modules/email-delivery-policy.js');
const defaults={transportConfigured:true,spfVerified:true,dkimVerified:true,dmarcVerified:true,domainAligned:true,
 unsubscribeEndpointVerified:true,bounceWebhookVerified:true,complaintWebhookVerified:true,operatorApproved:true,maxPerHour:20};
const person=(email,consentStatus='OPTED_IN')=>({email,consentStatus,consentProof:{method:'double_opt_in',timestamp:'2026-11-01T00:00:00Z',source:'signup-form-123'}});
const run=(overrides={})=>policy.planCampaign({settings:defaults,subject:'Update',content:'Hello',unsubscribeUrl:'https://example.test/unsubscribe/token',recipients:[person('one@example.test')],now:Date.parse('2026-11-09'),...overrides});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
test('valid consent + all settings yields preview only',()=>{const p=run();assert.equal(p.approved,true);assert.equal(p.mode,'PREVIEW_ONLY');assert.equal(p.eligibleCount,1)});
test('source collector address alone is not opt in',()=>{let p=run({recipients:[{email:'collected@example.test'}]});assert.equal(p.approved,false);assert(p.excluded.some(x=>x.reason==='CONSENT_NOT_VERIFIED'))});
test('unsubscribed and complained suppressed',()=>{let p=run({recipients:[{...person('x@example.test'),unsubscribed:true}, {...person('y@example.test'),complained:true}]});assert.equal(p.eligibleCount,0);assert.equal(p.excludedCount,2)});
test('external suppression applied',()=>{let p=run({recipients:[person('ONE@example.test')],suppressionList:['one@example.test']});assert.equal(p.approved,false);assert.equal(p.excluded[0].reason,'SUPPRESSED')});
test('dedupe case insensitive',()=>{let p=run({recipients:[person('ONE@example.test'),person('one@example.test')]});assert.equal(p.eligibleCount,1);assert.equal(p.excluded[0].reason,'DUPLICATE')});
test('missing SPF fails closed',()=>{let p=run({settings:{...defaults,spfVerified:false}});assert.equal(p.approved,false);assert(p.blockingReasons.includes('SPF_NOT_VERIFIED'))});
test('no unverified unsubscribe endpoint',()=>{let p=run({settings:{...defaults,unsubscribeEndpointVerified:false}});assert.equal(p.approved,false)});
test('no operator approval',()=>{let p=run({settings:{...defaults,operatorApproved:false}});assert.equal(p.approved,false)});
test('no unauthorized high rate',()=>{let p=run({settings:{...defaults,maxPerHour:1000}});assert.equal(p.approved,false)});
test('future consent invalid',()=>{let p=run({recipients:[{...person('one@example.test'),consentProof:{method:'double_opt_in',timestamp:'2030-01-01',source:'form'}}]});assert.equal(p.approved,false)});
test('over 50 denied',()=>{let p=run({recipients:Array.from({length:51},(_,i)=>person('person'+i+'@example.test'))});assert(p.blockingReasons.includes('BATCH_EXCEEDS_SAFE_LIMIT'))});
test('no subject blocked',()=>{let p=run({subject:'  '});assert.equal(p.approved,false)});
test('no external POST or transport present',()=>{assert.equal(typeof policy.send,'undefined');assert.equal(typeof policy.planCampaign,'function')});
console.log(checks+'/'+checks+' PASS');