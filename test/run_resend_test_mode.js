'use strict';
const assert=require('node:assert/strict');
const {TEST_FROM,TEST_RECIPIENTS,check}=require('../companion/resend-test-mode');
let n=0;
const test=(name,f)=>{f();console.log('PASS',name);n++};
test('test-from exact provider owned address',()=>assert.equal(TEST_FROM,'onboarding@resend.dev'));
for (const address of TEST_RECIPIENTS)test('official simulator '+address,()=>{
 const x=check({mode:'TEST',from:TEST_FROM,to:[address]});assert.equal(x.allowed,true);assert.equal(x.sendEnabled,false)});
test('test rejects real recipient',()=>assert.equal(check({mode:'TEST',from:TEST_FROM,to:'customer@example.com'}).allowed,false));
test('test rejects production sender',()=>assert.equal(check({mode:'TEST',from:'notify@vivpr.pro',to:TEST_RECIPIENTS[0]}).allowed,false));
test('test rejects multiple recipients',()=>assert.equal(check({mode:'TEST',from:TEST_FROM,to:[TEST_RECIPIENTS[0],TEST_RECIPIENTS[1]]}).allowed,false));
test('production rejects provider test sender',()=>assert.equal(check({mode:'PRODUCTION',from:TEST_FROM,to:'customer@example.com',providerDomainVerified:true,recipientAuthorizationVerified:true}).allowed,false));
test('production rejects provider test target',()=>assert.equal(check({mode:'PRODUCTION',from:'notice@vivpr.pro',to:TEST_RECIPIENTS[0],providerDomainVerified:true,recipientAuthorizationVerified:true}).allowed,false));
test('production requires domain verification',()=>assert.equal(check({mode:'PRODUCTION',from:'notice@vivpr.pro',to:'customer@example.com',recipientAuthorizationVerified:true}).allowed,false));
test('production requires authorized recipient',()=>assert.equal(check({mode:'PRODUCTION',from:'notice@vivpr.pro',to:'customer@example.com',providerDomainVerified:true}).allowed,false));
test('unspecified mode blocks',()=>assert.equal(check({from:TEST_FROM,to:TEST_RECIPIENTS[0]}).allowed,false));
console.log(n+'/'+n+' PASS');
