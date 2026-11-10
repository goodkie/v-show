'use strict';
// XPIDER email outbox: local draft-only persistence. No network or sending.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const STATES=new Set(['DRAFT','HOLD','CANCELLED']);
function address(v){const s=String(v||'').trim().toLowerCase();return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)?s:null}
class DraftOutbox{
  constructor(file){
    if(!path.isAbsolute(file))throw Error('ABSOLUTE_FILE_REQUIRED');
    this.file=file;
    this.data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,jobs:[],suppressed:[]};
    if(this.data.version!==1||!Array.isArray(this.data.jobs)||!Array.isArray(this.data.suppressed))throw Error('INVALID_STORE');
    if(this.data.jobs.some(j=>!STATES.has(j.status)))throw Error('INVALID_JOB_STATE');
  }
  persist(){
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    const temp=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{fs.writeFileSync(temp,JSON.stringify(this.data),{flag:'wx',mode:0o600});fs.renameSync(temp,this.file)}
    finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
  }
  add(input={}){
    const email=address(input.email);
    if(!email)throw Error('INVALID_EMAIL');
    if(input.authorized!==true||!input.authorizationSource||!input.authorizationAt||!Number.isFinite(Date.parse(input.authorizationAt)))throw Error('AUTHORIZATION_EVIDENCE_REQUIRED');
    if(input.source==='EMAIL_COLLECTOR')throw Error('COLLECTED_ADDRESS_NOT_AUTHORIZATION');
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(input.key||''))throw Error('IDEMPOTENCY_KEY_REQUIRED');
    if(this.data.suppressed.some(x=>x.email===email))return {status:'SUPPRESSED'};
    if(this.data.jobs.some(x=>x.key===input.key))return {status:'DUPLICATE'};
    const job={id:crypto.randomUUID(),email,key:input.key,templateId:String(input.templateId||''),
      authorizationSource:String(input.authorizationSource),authorizationAt:input.authorizationAt,
      status:'DRAFT'};
    this.data.jobs.push(job);this.persist();return {status:'DRAFT',id:job.id};
  }
  suppress(email,reason='MANUAL'){
    const e=address(email);
    if(!e)throw Error('INVALID_EMAIL');
    if(!['MANUAL','UNSUBSCRIBED','BOUNCED','COMPLAINED'].includes(reason))throw Error('INVALID_REASON');
    if(!this.data.suppressed.some(x=>x.email===e))this.data.suppressed.push({email:e,reason});
    for(const x of this.data.jobs)if(x.email===e)x.status='CANCELLED';
    this.persist();return {status:'SUPPRESSED'};
  }
  holdAll(){for(const x of this.data.jobs)if(x.status==='DRAFT')x.status='HOLD';this.persist()}
  snapshot(){return structuredClone(this.data)}
}
module.exports={DraftOutbox};
