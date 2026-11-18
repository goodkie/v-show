
'use strict';
const ids=['kind','subject','preheader','brand','heading','body','image','alt','cta','link','reply','company','address','unsubscribe'];
const el=id=>document.getElementById(id);
const val=id=>el(id).value.trim();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}};
let previewFileUrl='';
let previewDataUrl='';
let previewFileMeta=null;
let remoteProbeTimer=null;
let remoteProbeState={url:'',status:'IDLE',detail:''};
let importedHtmlLayout='';
const paragraphs=s=>s.split(/\n\s*\n/).filter(x=>x.trim()).map(x=>'<p style="margin:0 0 18px;line-height:1.65">'+esc(x.trim()).replace(/\n/g,'<br>')+'</p>').join('');
function values(){return Object.fromEntries(ids.map(i=>[i,val(i)]))}
function htmlFor(v,preview=false){
 if(importedHtmlLayout){
  const storeApi=typeof window!=='undefined'?window.XpiderStudioStorage:null;
  const safeFrag=storeApi&&typeof storeApi.sanitizeImportedHtmlFragment==='function'
   ? storeApi.sanitizeImportedHtmlFragment(importedHtmlLayout).sanitizedHtml
   : importedHtmlLayout;
  const previewText=esc(v.preheader);
  const manualUnsub=url(v.unsubscribe);
  const autoUnsubBase=(typeof autoUnsubBaseUrl==='string'&&autoUnsubBaseUrl)?autoUnsubBaseUrl:'https://vivpr.pro';
  const effectiveUnsub=manualUnsub||(autoUnsubBase.replace(/\/+$/,'')+'/unsubscribe/preview-sample-only');
  const opt=(v.kind==='marketing'&&!/unsubscribe/i.test(safeFrag))
   ?('<hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><div style="font-size:12px;color:#64748b"><p><a href="'+esc(effectiveUnsub)+'" style="color:#475569">구독 취소</a></p></div>')
   :'';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f8;color:#17212f"><div style="display:none;font-size:1px;color:#f3f5f8;max-height:0;overflow:hidden">'+previewText+'</div>'+safeFrag+opt+'</body></html>';
 }
 const httpsPic=url(v.image);
 const localPic=preview ? (previewDataUrl || previewFileUrl) : '';
 const pic=preview ? (previewDataUrl || previewFileUrl || (el('loadRemoteImages').checked ? url(v.image) : '')) : url(v.image);
 const previewText=esc(v.preheader);
 const h='<h1 style="font-size:25px;margin:0 0 20px;line-height:1.3">'+esc(v.heading)+'</h1>';
 const blobAttr=(preview && localPic && previewFileUrl) ? ' data-local-blob="'+esc(previewFileUrl)+'"' : '';
 let img='';
 if(pic){
  img='<img src="'+esc(pic)+'"'+blobAttr+' alt="'+esc(v.alt)+'" width="560" style="display:block;max-width:100%;width:100%;height:auto;border-radius:8px;margin:0 0 24px">';
 }else if(preview && v.image){
  const msg=httpsPic
   ? '🔒 외부 HTTPS 이미지 미리보기 차단됨 (개인정보 보호 기본값 · 위 "외부 HTTPS 이미지 미리보기 로딩 허용" 체크 시 표시)'
   : '⚠️ 유효한 공개 https:// 이미지 URL이 필요합니다 (http:// 또는 로컬 경로 불가)';
  img='<div style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;padding:16px;border-radius:8px;margin:0 0 24px;font-size:12px;line-height:1.5;">'+esc(msg)+(v.alt?'<br><b>대체 텍스트(alt):</b> '+esc(v.alt):'')+'</div>';
 }
 const button=url(v.link)&&v.cta?'<p style="margin:26px 0"><a href="'+esc(url(v.link))+'" style="display:inline-block;background:#2056a0;color:#ffffff;padding:12px 20px;border-radius:5px;text-decoration:none">'+esc(v.cta)+'</a></p>':'';
 const manualUnsub=url(v.unsubscribe);
 const autoUnsubBase=(typeof autoUnsubBaseUrl==='string'&&autoUnsubBaseUrl)?autoUnsubBaseUrl:'https://vivpr.pro';
 const effectiveUnsub=manualUnsub||(autoUnsubBase.replace(/\/+$/,'')+'/unsubscribe/preview-sample-only');
 const opt=v.kind==='marketing'
  ?(manualUnsub
    ?'<p><a href="'+esc(manualUnsub)+'" style="color:#475569">구독 취소</a></p>'
    :'<p><a href="'+esc(effectiveUnsub)+'" style="color:#475569">구독 취소</a> <span style="color:#94a3b8">(미리보기용 예시 링크 — 실제 발송 시 수신자별 고유 HTTPS 토큰 자동 삽입)</span></p>')
  :'';
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;margin:0;background:#f3f5f8;color:#17212f"><div style="display:none;font-size:1px;color:#f3f5f8;max-height:0;overflow:hidden">'+previewText+'</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8"><tr><td align="center" style="padding:28px 12px"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;background:#fff"><tr><td style="padding:34px 28px"><div style="font-size:17px;font-weight:bold;margin-bottom:28px">'+esc(v.brand)+'</div>'+h+img+paragraphs(v.body)+button+'<hr style="border:0;border-top:1px solid #e2e8f0;margin:32px 0"><div style="font-size:12px;line-height:1.6;color:#64748b">'+esc(v.company)+(v.address?'<p>'+esc(v.address)+'</p>':'')+opt+'</div></td></tr></table></td></tr></table></body></html>';
}
function textFor(v){
 const manualUnsub=url(v.unsubscribe);
 const autoUnsubBase=(typeof autoUnsubBaseUrl==='string'&&autoUnsubBaseUrl)?autoUnsubBaseUrl:'https://vivpr.pro';
 const unsubLine=v.kind==='marketing'
  ?('구독 취소: '+(manualUnsub||(autoUnsubBase.replace(/\/+$/,'')+'/unsubscribe/preview-sample-only (발송 시 수신자별 고유 링크 자동 삽입)')))
  :'';
 return [v.brand,v.heading,v.body,v.cta&&url(v.link)?v.cta+': '+url(v.link):'',v.company,v.address,unsubLine].filter(Boolean).join('\n\n');
}
function audit(v){
 const out=[];
 const add=(good,msg,severity,suggestion)=>out.push({
  good,
  severity: severity || (good ? 'PASS' : 'WARN'),
  msg,
  suggestion: suggestion || ''
 });
 add(!!v.subject&&v.subject.length<=100,'제목은 명확하게 작성하고 지나치게 길지 않게 유지 (1~100자)',!!v.subject&&v.subject.length<=100?'PASS':'FAIL','제목을 80자 이내의 구체적인 안내 문구로 요약하세요.');
 add(!/^(?:\s*(?:re|fwd|fw|회신|전달)\s*:)/i.test(v.subject),'실제 회신/전달이 아니라면 Re:/Fwd: 말머리를 사용하지 않음',!/^(?:\s*(?:re|fwd|fw|회신|전달)\s*:)/i.test(v.subject)?'PASS':'FAIL','제안: 말머리(Re:/Fwd:)를 제거하고 실제 안내 주제를 바로 표기하세요.');
 add(!/([!?])\1{1,}/.test(v.subject+' '+v.body)&&!/[A-Z]{12,}/.test(v.subject),'과도한 느낌표/물음표 반복(!!/??) 및 대문자 남발 방지',!/([!?])\1{1,}/.test(v.subject+' '+v.body)&&!/[A-Z]{12,}/.test(v.subject)?'PASS':'WARN','제안: 연속된 느낌표/물음표를 마침표(.) 또는 단일 부호로 정리하세요.');
 const phr=/100%\s*(보장|확정|guarantee)|무조건\s*무료|확정\s*수익|당첨\s*보장|guaranteed\s*profit|free\s*money/i;
 add(!phr.test(v.subject+' '+v.body),'검증하기 어려운 확정·과장 표현 점검 (단어 자체가 금지되는 것은 아님)',!phr.test(v.subject+' '+v.body)?'PASS':'FAIL','제안: "100% 보장/무조건 무료/확정 수익" 대신 객관적 사실과 조건을 명시하세요.');
 const typoRe=/안\s+녕하세요|되요|할께요|뵙겠읍니다|[ \t]{3,}/;
 add(!typoRe.test(v.subject+' '+v.heading+' '+v.body),'한국어/영문 기본 맞춤법·띄어쓰기 점검 (되요→돼요, 할께요→할게요, 연속 공백)',!typoRe.test(v.subject+' '+v.heading+' '+v.body)?'PASS':'WARN','제안: "📝 규칙 기반 문구 교정 제안 보기"를 눌러 맞춤법/공백 제안을 확인하세요.');
 add(v.body.replace(/\s+/g,'').length>=80,'이미지에만 의존하지 않고 충분한 실제 HTML 텍스트 포함 (80자 이상)',v.body.replace(/\s+/g,'').length>=80?'PASS':'WARN','제안: 본문에 최소 2~3문단(80자 이상)의 안내 텍스트를 작성하세요.');
 add(!v.image||!!v.alt,'이미지 대체 텍스트(alt) 제공',!v.image||!!v.alt?'PASS':'WARN','제안: 이미지를 표시할 수 없는 수신 환경을 위해 대체 텍스트를 입력하세요.');
 add(!v.image||!!url(v.image),'발송용 이미지는 접근 가능한 HTTPS URL 사용',!v.image||!!url(v.image)?'PASS':'FAIL','제안: https:// 로 시작하는 공개 이미지 URL을 입력하세요.');
 add(!(v.link)&&!(v.cta)||!!url(v.link),'버튼 목적지는 정상 HTTPS URL',!(v.link)&&!(v.cta)||!!url(v.link)?'PASS':'FAIL','제안: 버튼 링크를 유효한 https:// 주소로 입력하세요.');
 add(!!v.company,'실제 발신자명(회사/사업자명) 명시',!!v.company?'PASS':'FAIL','제안: 발신자 회사/단체명을 정확히 입력하세요.');
 add(!!v.reply&&/@/.test(v.reply),'답장받을 수 있는 회신 이메일 주소 입력 (실제 운영 여부 확인 필요)',!!v.reply&&/@/.test(v.reply)?'PASS':'WARN','제안: 실제 수신 가능한 운영 이메일(예: support@vivpr.pro)을 입력하세요.');
 if(v.kind==='marketing'){
  add(true,'본문 구독 취소(수신 거부) 링크 자동 삽입 활성화','PASS','안내: 미리보기에는 안전한 예시 링크가 표시되며, 실제 발송 시 수신자별 고유 HTTPS 링크와 List-Unsubscribe-Post 헤더가 자동 생성됩니다.');
  add(!!v.address,'마케팅 발신자의 실제 우편주소 표기',!!v.address?'PASS':'FAIL','제안: 하단 푸터에 표기될 사업장 우편주소를 입력하세요.');
  add(autoUnsubConfigured,'발송 단계에서 RFC 8058 원클릭 구독 취소 헤더 및 공개 HTTPS 엔드포인트 준비',autoUnsubConfigured?'PASS':'WARN',autoUnsubConfigured?'확인됨: 공개 HTTPS 구독 취소 기본 URL이 설정되었습니다.':'안내: 시뮬레이터 테스트는 로컬 검증되며, 상용 발송 전 [공개 구독 취소 HTTPS 기본 URL] 설정이 필요합니다.');
  add(false,'수신 동의·suppression 명단·Resend AUP 검증 필요','WARN','안내: 수신자 관리 카드에서 동의 확인 및 수신거부 명단 대조가 필요합니다.');
 }
 add(false,'SPF · DKIM · DMARC · 발신 도메인/계정 평판은 콘텐츠 검사 밖에서 검증','WARN','안내: 하단 [운영 DNS · 발송 권한 확인 · 수신거부 · 웹훅 점검]에서 별도 확인하세요.');
 return out;
}
let autoUnsubConfigured = false;
let autoUnsubBaseUrl = '';
let currentAiCopyStatus = 'NOT_CONFIGURED';
let currentAiStatusLabel = 'AI 자동 교정: 연결 필요';
let currentProviderDomainStatus = 'BLOCKED_EXTERNAL_DNS';
function updateContentQaStatusLine(checks){
 const badgeEl=el('contentQaBadges');
 if(!badgeEl)return;
 const hasFail=Array.isArray(checks)&&checks.some(c=>c.severity==='FAIL');
 const ruleStatus=hasFail?'FAIL':'PASS';
 badgeEl.textContent=`RULE_BASED_CONTENT_CHECK: ${ruleStatus} · AI_COPY_EDIT: ${currentAiCopyStatus} · PROVIDER_DOMAIN_AUTH: ${currentProviderDomainStatus} · PRODUCTION_SEND: ${currentProviderDomainStatus === 'VERIFIED' ? 'UNLOCKED_OPT_IN_ONLY' : 'GATE_ACTIVE'}`;
 const aiBadge=el('aiCopyStatusBadge');
 if(aiBadge)aiBadge.textContent=currentAiStatusLabel||(currentAiCopyStatus==='READY'?'AI 자동 교정: Gemini 준비됨':(currentAiCopyStatus==='ERROR'?'AI 자동 교정: 연결 오류':'AI 자동 교정: 연결 필요'));
}
function updateImageDiagnostics(v){
 const locEl=el('localImageStatus');
 const thumb=el('localImageThumb');
 const remEl=el('remoteImageStatus');
 const box=el('imageStatusBox');
 if(locEl){
  if(previewFileMeta && (previewFileUrl || previewDataUrl)){
   locEl.textContent=`🖼️ 로컬 미리보기 전용 (Local preview only): ${previewFileMeta.name} (${Math.round(previewFileMeta.size/1024)}KB${previewFileMeta.dims ? ', ' + previewFileMeta.dims : ''}) — 실제 발송 HTML에는 미포함`;
  }else if(previewFileMeta && previewFileMeta.error){
   locEl.textContent=`❌ 로컬 이미지 오류: ${previewFileMeta.error}`;
  }else{
   locEl.textContent='🖼️ 로컬 미리보기 전용 (Local preview only): 선택된 파일 없음';
  }
 }
 if(thumb){
  if(previewFileUrl || previewDataUrl){
   thumb.src=previewFileUrl || previewDataUrl;
   thumb.style.display='block';
  }else{
   thumb.removeAttribute('src');
   thumb.style.display='none';
  }
 }
 const httpsPic=url(v.image);
 const allowRemote=Boolean(el('loadRemoteImages') && el('loadRemoteImages').checked);
 if(remEl){
  if(!v.image){
   remEl.textContent='📤 실제 발송 HTML 이미지 (Production email image): 공개 HTTPS 이미지 URL 미입력';
  }else if(!httpsPic){
   remEl.textContent='❌ 실제 발송 HTML 이미지 오류: https:// 로 시작하는 공개 URL만 허용됩니다 (http://, file:, 로컬 경로 차단)';
  }else if(!allowRemote){
   remEl.textContent=`🔒 실제 발송 HTML 이미지 준비됨 (${httpsPic}) — 개인정보 보호를 위해 미리보기 자동 로딩은 차단됨`;
  }else if(remoteProbeState.url===httpsPic && remoteProbeState.status==='OK'){
   remEl.textContent=`✅ 실제 발송 HTML 이미지 로딩 성공 (${httpsPic}${remoteProbeState.detail ? ' · ' + remoteProbeState.detail : ''})`;
  }else if(remoteProbeState.url===httpsPic && remoteProbeState.status==='ERROR'){
   remEl.textContent=`❌ 외부 HTTPS 이미지 로딩 실패 (${httpsPic}): ${remoteProbeState.detail || '네트워크/404/CORS/타임아웃'} — [다시 확인]을 누르거나 URL을 확인하세요.`;
  }else if(remoteProbeState.url===httpsPic && remoteProbeState.status==='LOADING'){
   remEl.textContent=`⏳ 외부 HTTPS 이미지 확인 중: ${httpsPic}...`;
  }else{
   remEl.textContent=`📤 실제 발송 HTML 이미지 (${httpsPic}) — 로딩 대기 중`;
  }
 }
 if(box){
  if((previewFileMeta && previewFileMeta.error) || (v.image && !httpsPic) || (allowRemote && httpsPic && remoteProbeState.url===httpsPic && remoteProbeState.status==='ERROR')){
   box.className='status-box status-error';
  }else if((previewFileUrl || previewDataUrl) || (httpsPic && (!allowRemote || remoteProbeState.status==='OK'))){
   box.className='status-box status-success';
  }else{
   box.className='status-box status-idle';
  }
 }
}
function probeRemotePreviewImage(){
 const httpsPic=url(val('image'));
 const allowRemote=Boolean(el('loadRemoteImages') && el('loadRemoteImages').checked);
 if(!allowRemote || !httpsPic){
  remoteProbeState={url:httpsPic,status:'IDLE',detail:''};
  return render();
 }
 if(remoteProbeTimer){clearTimeout(remoteProbeTimer);remoteProbeTimer=null;}
 remoteProbeState={url:httpsPic,status:'LOADING',detail:''};
 updateImageDiagnostics(values());
 const probe=new Image();
 let settled=false;
 remoteProbeTimer=setTimeout(()=>{
  if(settled)return;
  settled=true;
  remoteProbeState={url:httpsPic,status:'ERROR',detail:'응답 시간 초과 (Timeout 6s)'};
  updateImageDiagnostics(values());
 },6000);
 probe.onload=()=>{
  if(settled)return;
  settled=true;
  clearTimeout(remoteProbeTimer);
  remoteProbeState={url:httpsPic,status:'OK',detail:`${probe.naturalWidth}x${probe.naturalHeight}`};
  updateImageDiagnostics(values());
 };
 probe.onerror=()=>{
  if(settled)return;
  settled=true;
  clearTimeout(remoteProbeTimer);
  remoteProbeState={url:httpsPic,status:'ERROR',detail:'이미지 로드 실패 (404/네트워크/형식 오류 또는 CSP 차단)'};
  updateImageDiagnostics(values());
 };
 probe.src=httpsPic;
}
function render(){
 try{
  const v=values();
  if(el('preview'))el('preview').srcdoc=htmlFor(v,true);
  updateImageDiagnostics(v);
  const checks=audit(v);const list=el('checkList');
  if(list){
   list.replaceChildren();
   for(const item of checks){
    const li=document.createElement('li');
    li.className=item.good?'good':'warn';
    li.textContent=(item.good?'✓ [PASS] ':(`! [${item.severity||'WARN'}] `))+item.msg+(!item.good&&item.suggestion?` (${item.suggestion})`:'');
    list.append(li);
   }
  }
  const warnings=checks.filter(x=>!x.good).length;
  if(el('summary'))el('summary').textContent='검토 항목 '+checks.length+'개 중 주의 '+warnings+'개 · 기술적 인증, 발송 권한 및 실제 전달률은 여기서 검사하지 않습니다.';
  updateContentQaStatusLine(checks);
 }catch(_){}
}
function clearLocalPreviewImage(){
 if(previewFileUrl){try{URL.revokeObjectURL(previewFileUrl);}catch(_){}}
 previewFileUrl='';
 previewDataUrl='';
 previewFileMeta=null;
 if(el('imageFile'))el('imageFile').value='';
}
function download(name,type,content){const blob=new Blob([content],{type});const uri=URL.createObjectURL(blob);const a=document.createElement('a');a.href=uri;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(uri),500)}
if(el('imageFile'))el('imageFile').addEventListener('change',()=>{
 const input=el('imageFile');
 const f=input&&input.files?input.files[0]:null;
 if(previewFileUrl){try{URL.revokeObjectURL(previewFileUrl);}catch(_){}}
 previewFileUrl='';previewDataUrl='';previewFileMeta=null;
 if(!f)return render();
 const mimeOk=/^image\/(png|jpeg|webp|gif)$/i.test(f.type||'');
 const extOk=!f.type && /\.(png|jpe?g|webp|gif)$/i.test(f.name||'');
 if((!mimeOk && !extOk)||f.size>3*1024*1024){
  const errTxt='PNG/JPEG/WebP/GIF 3MB 이하 파일만 미리보기 가능합니다.';
  previewFileMeta={name:f.name,size:f.size,error:errTxt};
  alert(errTxt);
  if(input)input.value='';
  return render();
 }
 previewFileMeta={name:f.name,size:f.size,dims:''};
 previewFileUrl=URL.createObjectURL(f);
 try{
  const reader=new FileReader();
  reader.onload=()=>{
   if(typeof reader.result==='string'&&reader.result.startsWith('data:image/')){
    previewDataUrl=reader.result;
    const probe=new Image();
    probe.onload=()=>{
     if(previewFileMeta)previewFileMeta.dims=`${probe.naturalWidth}x${probe.naturalHeight}`;
     render();
    };
    probe.onerror=()=>render();
    probe.src=previewDataUrl;
    render();
   }
  };
  reader.onerror=()=>render();
  reader.readAsDataURL(f);
 }catch(_){}
 render();
});
if(el('btnClearLocalImage'))el('btnClearLocalImage').addEventListener('click',()=>{clearLocalPreviewImage();render();});
if(el('btnRetryRemoteImage'))el('btnRetryRemoteImage').addEventListener('click',probeRemotePreviewImage);
window.addEventListener('beforeunload',()=>{if(previewFileUrl){try{URL.revokeObjectURL(previewFileUrl);}catch(_){}}});
for(const id of ids){if(el(id))el(id).addEventListener('input',render);}
if(el('loadRemoteImages'))el('loadRemoteImages').addEventListener('change',render);
if(el('loadRemoteImages'))el('loadRemoteImages').addEventListener('change',probeRemotePreviewImage);

async function refreshImageHostStatus() {
  const badge = el('imageUploadHostBadge');
  if (!badge) return;
  const { sidecarPort, sidecarToken } = getSidecarConfig();
  const r = await callBg({ action: 'GET_IMAGE_HOST_STATUS', sidecarPort, sidecarToken });
  if (r && r.ok && r.data) {
    badge.textContent = r.data.configured ? `☁️ ${r.data.destinationLabel}` : '⚙️ CONFIG_REQUIRED (호스팅 설정 필요)';
  } else {
    badge.textContent = '⚠️ Sidecar 미연결 (호스팅 상태 미확인)';
  }
}

if (el('imgHostProvider')) {
  el('imgHostProvider').onchange = () => {
    const isGh = el('imgHostProvider').value === 'GITHUB_PUBLIC_REPO';
    if (el('imgHostGithubFields')) el('imgHostGithubFields').style.display = isGh ? 'flex' : 'none';
    if (el('imgHostCustomFields')) el('imgHostCustomFields').style.display = isGh ? 'none' : 'flex';
  };
}

if (el('btnSaveImageHostConfig')) {
  el('btnSaveImageHostConfig').onclick = async () => {
    const st = el('imageUploadStatus');
    const consent = el('imgHostConfigConsent');
    if (!consent || !consent.checked) {
      if (st) st.textContent = '⚠️ [USER_CONSENT_REQUIRED] 로컬 Sidecar NTFS 보안 파일 저장 동의 체크박스를 먼저 선택하세요.';
      return;
    }
    const provider = el('imgHostProvider') ? el('imgHostProvider').value : 'GITHUB_PUBLIC_REPO';
    const token = el('imgHostToken') ? String(el('imgHostToken').value || '').trim() : '';
    const payload = {
      provider,
      token,
      userConsentConfirmed: true,
      owner: el('imgHostOwner') ? el('imgHostOwner').value.trim() : '',
      repo: el('imgHostRepo') ? el('imgHostRepo').value.trim() : '',
      branch: el('imgHostBranch') ? el('imgHostBranch').value.trim() : 'main',
      pathPrefix: el('imgHostPathPrefix') ? el('imgHostPathPrefix').value.trim() : 'images',
      uploadEndpoint: el('imgHostUploadEndpoint') ? el('imgHostUploadEndpoint').value.trim() : '',
      publicBaseUrl: el('imgHostPublicBase') ? el('imgHostPublicBase').value.trim() : ''
    };
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    const r = await callBg({ action: 'SAVE_IMAGE_HOST_CONFIG', sidecarPort, sidecarToken, payload });
    if (el('imgHostToken')) el('imgHostToken').value = '';
    if (r && r.ok && r.data && r.data.ok) {
      if (st) st.textContent = `✅ ${r.data.message}`;
      refreshImageHostStatus();
    } else {
      const err = (r && r.data) || {};
      if (st) st.textContent = `❌ [${err.reason || r?.error || 'SAVE_HOST_CONFIG_FAILED'}] ${err.message || '호스팅 설정 저장 실패'}`;
    }
  };
}

if (el('btnCopyUploadedImageUrl')) {
  el('btnCopyUploadedImageUrl').onclick = async () => {
    const u = url(val('image'));
    const st = el('imageUploadStatus');
    if (!u) { if (st) st.textContent = '⚠️ 복사할 공개 HTTPS 이미지 URL이 없습니다.'; return; }
    try {
      await navigator.clipboard.writeText(u);
      if (st) st.textContent = `📋 복사됨: ${u}`;
    } catch (_) {
      if (st) st.textContent = `ℹ️ URL: ${u}`;
    }
  };
}

if (el('btnUploadAndInsertImage')) {
  let uploadInFlight = false;
  el('btnUploadAndInsertImage').onclick = async () => {
    if (uploadInFlight) return;
    const btn = el('btnUploadAndInsertImage');
    const st = el('imageUploadStatus');
    const consent = el('publicImageUploadConsent');
    if (!consent || !consent.checked) {
      if (st) st.textContent = '⚠️ [PUBLIC_UPLOAD_CONSENT_REQUIRED] 선택한 이미지를 공개 HTTPS URL로 업로드하려면 위 필수 동의 체크박스를 먼저 선택하세요.';
      return;
    }
    const f = el('imageFile') && el('imageFile').files ? el('imageFile').files[0] : null;
    if (!f && !previewDataUrl) {
      if (st) st.textContent = '⚠️ [NO_IMAGE_SELECTED] 먼저 [이미지 파일 선택]에서 PNG/JPG/WebP/GIF 파일을 선택하세요.';
      return;
    }
    uploadInFlight = true;
    if (btn) btn.disabled = true;
    try {
      let b64 = previewDataUrl;
      if (!b64 && f) {
        b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => reject(new Error('LOCAL_FILE_READ_FAILED'));
          r.readAsDataURL(f);
        });
      }
      if (st) st.textContent = '⏳ Sidecar를 통해 이미지 시그니처 검증, 공개 업로드 및 익명 GET 확인 중...';
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const resp = await callBg({
        action: 'UPLOAD_EMAIL_IMAGE',
        sidecarPort,
        sidecarToken,
        payload: {
          filename: f ? f.name : 'image.png',
          mimeType: f ? f.type : '',
          base64Data: b64,
          publicUploadConsentConfirmed: true
        }
      });
      const data = (resp && resp.data) || {};
      if (resp && resp.ok && data.ok && data.publicUrl) {
        el('image').value = data.publicUrl;
        if (el('loadRemoteImages')) el('loadRemoteImages').checked = true;
        clearLocalPreviewImage();
        render();
        probeRemotePreviewImage();
        if (typeof saveTemplateDraft === 'function') saveTemplateDraft();
        if (st) st.textContent = `✅ [REMOTE_READY] 업로드 및 익명 공개 GET 검증 완료 (${data.mimeType}, ${data.width}x${data.height}) → ${data.publicUrl}`;
        refreshImageHostStatus();
      } else {
        const reason = data.reason || resp?.error || 'UPLOAD_FAILED';
        if (st) st.textContent = `❌ [${reason}] ${data.message || '이미지 업로드 실패 (기존 이미지 URL 및 초안은 변경되지 않았습니다)'}`;
      }
    } catch (err) {
      if (st) st.textContent = `❌ [UPLOAD_EXCEPTION] ${err.message} (기존 URL/초안 유지됨)`;
    } finally {
      uploadInFlight = false;
      if (btn) btn.disabled = false;
    }
  };
}
async function refreshUnsubscribeStatus() {
  const badge = el('unsubscribeAutoBadge');
  if (!badge) return;
  const { sidecarPort, sidecarToken } = getSidecarConfig();
  const r = await callBg({ action: 'GET_UNSUBSCRIBE_STATUS', sidecarPort, sidecarToken });
  if (r && r.ok && r.data && r.data.ok) {
    autoUnsubConfigured = Boolean(r.data.configured);
    autoUnsubBaseUrl = r.data.publicBaseUrl || '';
    if (el('unsubscribePublicBaseUrl') && autoUnsubBaseUrl && !el('unsubscribePublicBaseUrl').value) {
      el('unsubscribePublicBaseUrl').value = autoUnsubBaseUrl;
    }
    badge.textContent = autoUnsubConfigured
      ? `✅ 구독 취소 자동 관리: 준비됨 (${autoUnsubBaseUrl}/unsubscribe/{토큰})`
      : '⚙️ 구독 취소 자동 관리: 설정 필요 (미리보기·시뮬레이터 자동 삽입 / 상용 발송 차단)';
  } else {
    autoUnsubConfigured = false;
    autoUnsubBaseUrl = '';
    badge.textContent = '⚠️ 구독 취소 자동 관리: 차단됨 (Sidecar 미연결)';
  }
  render();
}

if (el('btnSaveUnsubscribeConfig')) {
  el('btnSaveUnsubscribeConfig').onclick = async () => {
    const st = el('unsubscribeConfigStatus');
    const publicBaseUrl = el('unsubscribePublicBaseUrl') ? el('unsubscribePublicBaseUrl').value.trim() : '';
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    if (st) st.textContent = '⏳ 구독 취소 공개 HTTPS 기본 URL 저장 중...';
    const r = await callBg({ action: 'SAVE_UNSUBSCRIBE_CONFIG', sidecarPort, sidecarToken, payload: { publicBaseUrl } });
    if (r && r.ok && r.data && r.data.ok) {
      if (st) st.textContent = `✅ ${r.data.message || '저장 완료'}`;
      await refreshUnsubscribeStatus();
    } else {
      const err = (r && r.data) || {};
      if (st) st.textContent = `❌ [${err.reason || r?.error || 'SAVE_FAILED'}] ${err.message || '저장 실패'}`;
    }
  };
}

if (el('sidecarPort')) {
  el('sidecarPort').addEventListener('change', () => { try { refreshImageHostStatus(); refreshUnsubscribeStatus(); } catch (_) {} });
}
setTimeout(() => { try { refreshImageHostStatus(); refreshUnsubscribeStatus(); } catch (_) {} }, 50);
if(el('exportHtml'))el('exportHtml').onclick=()=>{const v=values();if(previewFileUrl&&!url(v.image))alert('로컬 이미지는 이메일에 포함되지 않습니다. 공개 HTTPS 이미지 URL을 먼저 입력하세요.');download('xpider-vivpr-template.html','text/html;charset=utf-8',htmlFor(v))};
if(el('exportText'))el('exportText').onclick=()=>download('xpider-vivpr-template.txt','text/plain;charset=utf-8',textFor(values()));
if(el('exportJson'))el('exportJson').onclick=()=>download('xpider-vivpr-template.json','application/json',JSON.stringify({version:1,template:values(),note:'No secrets, recipient list or API keys'},null,2));
if(el('desktop'))el('desktop').onclick=()=>{if(el('preview'))el('preview').style.width='100%'};
if(el('mobile'))el('mobile').onclick=()=>{if(el('preview'))el('preview').style.width='min(360px,100%)'};
render();

function callBg(msg) {
  return new Promise(res => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage(msg, r => {
          if (chrome.runtime.lastError) {
            res({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            res(r || { ok: false, error: 'NO_RESPONSE' });
          }
        });
      } else {
        res({ ok: false, error: 'CHROME_RUNTIME_NOT_AVAILABLE' });
      }
    } catch (err) {
      res({ ok: false, error: err.message });
    }
  });
}

function getSidecarConfig() {
  const rawPort = el('sidecarPort') ? Number(el('sidecarPort').value) : 18990;
  const sidecarPort = (Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535) ? rawPort : 18990;
  const sidecarToken = el('sidecarToken') ? el('sidecarToken').value.trim() : '';
  return { sidecarPort, sidecarToken };
}

async function checkCompanionStatus() {
  const box = el('testSendStatus');
  if (!box) return;
  const { sidecarPort, sidecarToken } = getSidecarConfig();
  box.className = 'status-box status-loading';
  box.textContent = `⏳ Sidecar (127.0.0.1:${sidecarPort}) 핸드셰이크 및 연결 상태 확인 중...`;
  const resp = await callBg({ action: 'GET_EMAIL_TEST_STATUS', sidecarPort, sidecarToken });
  if (resp && resp.ok && resp.data) {
    const d = resp.data;
    const hs = resp.handshake || {};
    const compBuild = hs.companionBuildId || d.companionBuildId || 'verified';
    const extBuild = hs.extensionBuildId || 'V7.0.0-OWNER-BETA-TEST-SEND-SIDECAR-20261116-LOCKED17';
    const pidLabel = hs.companionPid || d.pid || 'unknown';
    const capsLabel = Array.isArray(hs.apiCapabilities) ? hs.apiCapabilities.join(', ') : 'email-test-send';
    if (d.resendApiKeyConfigured) {
      box.className = 'status-box status-success';
      box.textContent = `✅ Email Test Sidecar 연결 및 핸드셰이크 성공 (127.0.0.1:${sidecarPort})\n• Extension Build: ${extBuild}\n• Sidecar Build: ${compBuild} (PID: ${pidLabel})\n• Capabilities: ${capsLabel}\n• Resend API Key 상태: ${d.keyStatus || 'FORMAT_VALID_KEY_PRESENT'} (로컬 형식 검증만 완료 · 공급자 인증은 테스트 발송 시 확인)\n• 시뮬레이터 수신자 대상 테스트 발송 준비 완료`;
    } else {
      box.className = 'status-box status-blocked';
      box.textContent = `⚠️ Email Test Sidecar 연결됨 — API 키 미설정 (127.0.0.1:${sidecarPort})\n• Extension Build: ${extBuild}\n• Sidecar Build: ${compBuild} (PID: ${pidLabel})\n• 사유: ${d.keyStatus || 'KEY_MISSING'} (RESEND_API_KEY_NOT_CONFIGURED)\n• 원클릭 조치: 위 "🔑 Resend API 키 설정" 입력란에 re_... 키를 입력하고 동의 체크 후 "🔑 NTFS 보안 저장 후 상태 확인"을 누르세요 (터미널/PowerShell 불필요).`;
    }
  } else if (resp && resp.reason === 'COMPANION_VERSION_MISMATCH') {
    box.className = 'status-box status-blocked';
    box.textContent = `⛔ [WRONG_COMPANION: COMPANION_VERSION_MISMATCH (포트 ${sidecarPort})]\n• 감지된 서비스: ${resp.companionBuildId || 'unknown'}\n• 필요한 기능: email-test-send\n• 조치 방법: 포트 ${sidecarPort}에는 구버전 서비스가 실행 중입니다. 포트 18990에서 START_EMAIL_TEST_SIDECAR.bat를 실행하세요.`;
  } else if (resp && (resp.reason === 'UNAUTHORIZED' || resp.reason === 'SIDECAR_TOKEN_REQUIRED' || resp.httpStatus === 401)) {
    box.className = 'status-box status-error';
    box.textContent = `❌ [인증 필요: UNAUTHORIZED (HTTP 401)]\n• ${resp.message || '로컬 페어링이 필요합니다.'}\n• 원클릭 조치: START_EMAIL_TEST_SIDECAR.bat 실행 후 위 "🔗 원클릭 자동 페어링" 버튼을 누르거나, "📁 토큰 파일로 연결"로 %LOCALAPPDATA%\\XPIDER\\Sidecar\\.email_sidecar_token 파일을 선택하세요 (콘솔 복사 불필요).`;
  } else if (resp && (resp.reason === 'FORBIDDEN_ORIGIN' || resp.httpStatus === 403)) {
    box.className = 'status-box status-error';
    box.textContent = `❌ [Origin 거부: FORBIDDEN_ORIGIN (HTTP 403)]\n• ${resp.message || '허용되지 않은 Origin 요청입니다.'}`;
  } else if (resp && (resp.reason === 'ENDPOINT_NOT_FOUND' || resp.httpStatus === 404)) {
    box.className = 'status-box status-error';
    box.textContent = `❌ [엔드포인트 없음: ENDPOINT_NOT_FOUND (HTTP 404)]\n• ${resp.message || 'Sidecar 버전이 일치하지 않습니다.'}`;
  } else {
    box.className = 'status-box status-error';
    box.textContent = `❌ [MISSING_COMPANION] Sidecar 미실행 또는 연결 실패 (127.0.0.1:${sidecarPort})\n• 상세: ${resp?.error || 'OFFLINE'}\n• 새 패키지의 START_EMAIL_TEST_SIDECAR.bat를 실행한 뒤 다시 확인하세요.`;
  }
}

let testSendCoolingDown = false;
async function triggerTestSend() {
  if (testSendCoolingDown) return;
  const box = el('testSendStatus');
  const btn = el('btnTestSend');
  const { sidecarPort, sidecarToken } = getSidecarConfig();
  const recipient = el('testRecipient') ? el('testRecipient').value.trim() : '';
  const allowed = ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev'];
  if (!allowed.includes(recipient)) {
    box.className = 'status-box status-error';
    box.textContent = '❌ 허용되지 않은 수신자입니다. Resend 공식 시뮬레이터 수신자만 선택 가능합니다.';
    return;
  }

  const v = values();
  const subject = v.subject || 'XPIDER Test Send';
  const html = htmlFor(v);
  const text = textFor(v);
  const idempotencyKey = 'xpider_sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);

  testSendCoolingDown = true;
  btn.disabled = true;
  box.className = 'status-box status-loading';
  box.textContent = `⏳ 시뮬레이터 테스트 발송 요청 중...\n• Sidecar: http://127.0.0.1:${sidecarPort}\n• 수신자: ${recipient}\n• 발신자: onboarding@resend.dev\n• Idempotency-Key: ${idempotencyKey}`;

  const resp = await callBg({
    action: 'EMAIL_TEST_SEND',
    sidecarPort,
    sidecarToken,
    to: recipient,
    subject,
    html,
    text,
    idempotencyKey
  });

  if (resp && resp.status === 'SUCCESS') {
    const resolvedRecipient = resp.to || resp.recipient || recipient;
    const resolvedFrom = resp.from || 'onboarding@resend.dev';
    box.className = 'status-box status-success';
    const up = resp.unsubscribePreview;
    const hdrLine = up && up.headers
      ? `\n• List-Unsubscribe: ${up.headers['List-Unsubscribe'] || '-'}\n• List-Unsubscribe-Post: ${up.headers['List-Unsubscribe-Post'] || '-'}`
      : '';
    box.textContent = `✅ [발송 접수 성공] Resend 이벤트 시뮬레이터가 정상 접수하였습니다 (실제 수신함 배달 아님).\n• Provider Message ID: ${resp.providerMessageId || 'OK'}\n• 수신자: ${resolvedRecipient}\n• 발신자: ${resolvedFrom}\n• 접수시각: ${resp.timestamp || new Date().toISOString()}${hdrLine}`;
    if (up && up.url) {
      const linkWrap = document.createElement('div');
      linkWrap.style.marginTop = '6px';
      const a = document.createElement('a');
      a.href = up.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `🔗 수신자별 구독 취소 URL 열기 (${resolvedRecipient})`;
      linkWrap.appendChild(a);
      box.appendChild(linkWrap);
    }
  } else if (resp && (resp.status === 'BLOCKED' || resp.status === 'AMBIGUOUS_NEEDS_RECONCILE')) {
    box.className = 'status-box status-blocked';
    box.textContent = `⛔ [발송 차단 (FAIL-CLOSED)]\n• 사유: ${resp.reason || (Array.isArray(resp.reasons) ? resp.reasons.join(', ') : 'POLICY_BLOCKED')}\n• 상세: ${resp.message || '인증 또는 자격 요건 미충족'}\n• 수신자: ${resp.recipient || recipient}`;
  } else if (resp && resp.status === 'PROVIDER_ERROR') {
    box.className = 'status-box status-error';
    box.textContent = `❌ [Resend 공급자 오류]\n• HTTP 상태: ${resp.httpStatus}\n• 오류: ${resp.error}\n• 상세: ${resp.message}`;
  } else {
    box.className = 'status-box status-error';
    box.textContent = `❌ [전송 실패]\n• 오류: ${resp?.message || resp?.error || '알 수 없는 전송 실패'}`;
  }

  let remainingSec = 5;
  btn.textContent = `⏳ 쿨다운 대기 (${remainingSec}s)`;
  const timer = setInterval(() => {
    remainingSec--;
    if (remainingSec <= 0) {
      clearInterval(timer);
      testSendCoolingDown = false;
      btn.disabled = false;
      btn.textContent = '▶ 시뮬레이터 테스트 발송 (Test Send)';
    } else {
      btn.textContent = `⏳ 쿨다운 대기 (${remainingSec}s)`;
    }
  }, 1000);
}

if (el('btnTestSend')) el('btnTestSend').onclick = triggerTestSend;
if (el('btnCheckCompanion')) el('btnCheckCompanion').onclick = checkCompanionStatus;

const DRAFT_FIELDS = ['kind', 'subject', 'preheader', 'brand', 'heading', 'body', 'image', 'alt', 'cta', 'link', 'reply', 'company', 'address', 'unsubscribe'];
let studioDirty = false;
let lastRealTestMsgId = null;

function setDraftStatus(cls, msg) {
  const ds = el('draftStatus');
  if (ds) {
    ds.className = `status-box ${cls}`;
    ds.textContent = msg;
  }
}

function collectStudioFieldValues() {
  const draft = {};
  for (const f of DRAFT_FIELDS) {
    if (el(f)) draft[f] = el(f).value;
  }
  if (importedHtmlLayout) draft.importedHtml = importedHtmlLayout;
  return draft;
}

function updateHtmlLayoutBanner() {
  const b = el('htmlLayoutBanner');
  if (b) b.style.display = importedHtmlLayout ? 'block' : 'none';
}

function applyStudioFieldValues(d) {
  for (const f of DRAFT_FIELDS) {
    if (el(f) && typeof d[f] === 'string') {
      el(f).value = d[f];
    }
  }
  importedHtmlLayout = typeof d.importedHtml === 'string' ? d.importedHtml : '';
  updateHtmlLayoutBanner();
  studioDirty = false;
  render();
}

for (const f of DRAFT_FIELDS) {
  if (el(f)) {
    el(f).addEventListener('input', () => { studioDirty = true; });
    el(f).addEventListener('change', () => { studioDirty = true; });
  }
}

async function refreshDraftAndTemplateSelectors() {
  const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
  if (!storeApi) return;
  const dRes = await storeApi.loadDraftsStore();
  const dSel = el('draftSelect');
  if (dSel) {
    dSel.innerHTML = '';
    const items = dRes.store?.items || [];
    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(저장된 초안 없음)';
      dSel.appendChild(opt);
    } else {
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `${item.name} (${(item.savedAt || '').slice(0, 16).replace('T', ' ')})`;
        if (item.id === dRes.store.activeId) opt.selected = true;
        dSel.appendChild(opt);
      }
    }
  }
  if (dRes.recovered) {
    setDraftStatus('status-blocked', `⚠️ 손상된 기존 초안 데이터를 복구했습니다 (${dRes.error || 'RECOVERED'}).`);
  }
  const tRes = await storeApi.loadTemplatesLibrary();
  const tSel = el('templateLibrarySelect');
  if (tSel) {
    tSel.innerHTML = '';
    const tItems = tRes.store?.items || [];
    if (tItems.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(저장된 템플릿 없음)';
      tSel.appendChild(opt);
    } else {
      for (const item of tItems) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `${item.name} (${(item.savedAt || '').slice(0, 16).replace('T', ' ')})`;
        if (item.id === tRes.store.activeId) opt.selected = true;
        tSel.appendChild(opt);
      }
    }
  }
}

async function saveTemplateDraft() {
  try {
    const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
    if (!storeApi) throw new Error('STUDIO_STORAGE_UNAVAILABLE');
    const data = collectStudioFieldValues();
    const dSel = el('draftSelect');
    const selectedId = dSel && dSel.value ? dSel.value : `draft_${Date.now()}`;
    const customName = el('draftNameInput') ? el('draftNameInput').value.trim() : '';
    const saved = await storeApi.saveDraft({
      id: selectedId,
      name: customName || data.subject || '이름 없는 초안',
      data
    });
    studioDirty = false;
    await refreshDraftAndTemplateSelectors();
    if (el('draftSelect')) el('draftSelect').value = saved.draft.id;
    setDraftStatus('status-success', `💾 초안 저장 및 읽기 검증 완료 [${saved.backend}]: "${saved.draft.name}" (${saved.draft.savedAt})`);
  } catch (e) {
    setDraftStatus('status-error', `❌ 초안 저장 실패: ${e.message}`);
  }
}

async function loadTemplateDraft() {
  try {
    const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
    if (!storeApi) throw new Error('STUDIO_STORAGE_UNAVAILABLE');
    if (studioDirty && typeof window.confirm === 'function') {
      if (!window.confirm('저장되지 않은 편집 내용이 있습니다. 선택한 초안을 불러와 덮어쓸까요?')) return;
    }
    const res = await storeApi.loadDraftsStore();
    const items = res.store?.items || [];
    if (items.length === 0) {
      setDraftStatus('status-blocked', 'ℹ️ 저장된 초안이 없습니다.');
      return;
    }
    const dSel = el('draftSelect');
    const targetId = (dSel && dSel.value) || res.store.activeId || items[0].id;
    const found = items.find(x => x.id === targetId) || items[0];
    applyStudioFieldValues(found.data);
    if (el('draftNameInput')) el('draftNameInput').value = found.name || '';
    setDraftStatus('status-success', `📂 초안 불러오기 완료 [${res.backend}]: "${found.name}" (${found.savedAt})`);
  } catch (e) {
    setDraftStatus('status-error', `❌ 초안 불러오기 실패: ${e.message}`);
  }
}

async function loadLedger() {
  const box = el('ledgerView');
  if (!box) return;
  const { sidecarPort, sidecarToken } = getSidecarConfig();
  box.className = 'status-box status-loading';
  box.textContent = '⏳ 시뮬레이터 발송 원장 조회 중...';
  const resp = await callBg({ action: 'GET_EMAIL_TEST_LEDGER', sidecarPort, sidecarToken });
  if (!resp || !resp.ok || !resp.data) {
    box.className = 'status-box status-error';
    box.textContent = `❌ 원장 조회 실패 (HTTP ${resp?.httpStatus || '-'}): ${resp?.error || 'Sidecar 연결/토큰 확인 필요'}`;
    return;
  }
  const entries = Array.isArray(resp.data.entries) ? resp.data.entries : [];
  if (entries.length === 0) {
    box.className = 'status-box status-idle';
    box.textContent = '📒 시뮬레이터 발송 원장 비어 있음 (아직 기록된 테스트 발송 없음).';
    return;
  }
  const lines = ['📒 시뮬레이터 발송 원장 (최근 ' + entries.length + '건 · ACCEPTED ≠ 실제 수신함 도착)'];
  for (const e of entries.slice(0, 10)) {
    lines.push(`• [${e.status}] ${e.recipient || '-'} | msgId=${e.providerMessageId || '-'} | key=${e.idempotencyKey || '-'} | err=${e.errorCode || '-'} | ${e.updatedAt || ''}`);
  }
  box.className = 'status-box status-success';
  box.textContent = lines.join('\n');
}

if (el('btnSaveDraft')) el('btnSaveDraft').onclick = saveTemplateDraft;
if (el('btnLoadDraft')) el('btnLoadDraft').onclick = loadTemplateDraft;
if (el('btnNewDraft')) {
  el('btnNewDraft').onclick = () => {
    if (studioDirty && typeof window.confirm === 'function') {
      if (!window.confirm('저장되지 않은 편집 내용이 있습니다. 새 초안을 시작할까요?')) return;
    }
    if (el('draftSelect')) el('draftSelect').value = '';
    if (el('draftNameInput')) el('draftNameInput').value = '';
    studioDirty = false;
    setDraftStatus('status-idle', '🆕 새 초안 ID가 준비되었습니다. 편집 후 [초안 저장]을 누르세요.');
  };
}
if (el('btnDeleteDraft')) {
  el('btnDeleteDraft').onclick = async () => {
    const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
    const id = el('draftSelect')?.value;
    if (!storeApi || !id) return setDraftStatus('status-blocked', 'ℹ️ 삭제할 초안을 먼저 선택하세요.');
    await storeApi.deleteDraft(id);
    await refreshDraftAndTemplateSelectors();
    setDraftStatus('status-success', '🗑️ 선택한 초안을 삭제했습니다.');
  };
}
if (el('btnImportTemplate') && el('importTemplateFile')) {
  el('btnImportTemplate').onclick = () => {
    el('importTemplateFile').value = '';
    el('importTemplateFile').click();
  };
  el('importTemplateFile').onchange = async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    try {
      const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
      if (!storeApi) throw new Error('STUDIO_STORAGE_UNAVAILABLE');
      if (file.size > 262144) throw new Error('TEMPLATE_FILE_TOO_LARGE');
      const rawText = await file.text();
      const validated = storeApi.validateAndSanitizeImportedTemplate(rawText);
      if (studioDirty && typeof window.confirm === 'function') {
        if (!window.confirm('저장되지 않은 편집 내용이 있습니다. 가져온 템플릿으로 덮어쓸까요?')) return;
      }
      applyStudioFieldValues(validated.template);
      setDraftStatus('status-success', `📂 템플릿 JSON 가져오기 완료: ${file.name} (v${validated.version})`);
    } catch (err) {
      setDraftStatus('status-error', `❌ 템플릿 가져오기 거부됨 (기존 초안 유지): ${err.message}`);
    }
  };
}
if (el('btnImportHtml') && el('importHtmlFile')) {
  el('btnImportHtml').onclick = () => {
    el('importHtmlFile').value = '';
    el('importHtmlFile').click();
  };
  el('importHtmlFile').onchange = async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    try {
      const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
      if (!storeApi || typeof storeApi.importHtmlEmailFile !== 'function') throw new Error('HTML_IMPORT_UNAVAILABLE');
      if (file.size > 524288) throw new Error('HTML_FILE_TOO_LARGE (최대 512KB)');
      const rawText = await file.text();
      const parsed = storeApi.importHtmlEmailFile(rawText);
      if (studioDirty && typeof window.confirm === 'function') {
        if (!window.confirm('저장되지 않은 편집 내용이 있습니다. 가져온 HTML 파일로 덮어쓸까요?')) return;
      }
      if (parsed.subject && el('subject')) el('subject').value = parsed.subject;
      if (parsed.heading && el('heading')) el('heading').value = parsed.heading;
      if (parsed.bodyText && el('body')) el('body').value = parsed.bodyText;
      if (parsed.firstHttpsImg && el('image')) el('image').value = parsed.firstHttpsImg;
      if (parsed.firstHttpsLink && el('link')) el('link').value = parsed.firstHttpsLink;
      importedHtmlLayout = parsed.importedHtml;
      updateHtmlLayoutBanner();
      studioDirty = false;
      render();
      const warnNote = parsed.warnings && parsed.warnings.length ? ` · 주의: ${parsed.warnings.join(' / ')}` : '';
      setDraftStatus('status-success', `🌐 HTML 불러오기 완료: ${file.name} (인라인 CSS·레이아웃 유지${warnNote})`);
    } catch (err) {
      setDraftStatus('status-error', `❌ HTML 불러오기 거부됨 (기존 초안 유지): ${err.message}`);
    }
  };
}
if (el('btnClearImportedHtml')) {
  el('btnClearImportedHtml').onclick = () => {
    importedHtmlLayout = '';
    updateHtmlLayoutBanner();
    render();
    setDraftStatus('status-idle', '📝 일반 텍스트 에디터 모드로 전환되었습니다.');
  };
}
if (el('btnSaveToTemplateLibrary')) {
  el('btnSaveToTemplateLibrary').onclick = async () => {
    try {
      const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
      if (!storeApi) throw new Error('STUDIO_STORAGE_UNAVAILABLE');
      const data = collectStudioFieldValues();
      const customName = el('draftNameInput')?.value.trim() || data.subject || '재사용 템플릿';
      const saved = await storeApi.saveTemplateToLibrary({ id: `tpl_${Date.now()}`, name: customName, data });
      await refreshDraftAndTemplateSelectors();
      setDraftStatus('status-success', `⭐ 템플릿 라이브러리에 저장됨 [${saved.backend}]: "${saved.template.name}"`);
    } catch (err) {
      setDraftStatus('status-error', `❌ 템플릿 라이브러리 저장 실패: ${err.message}`);
    }
  };
}
if (el('btnLoadFromTemplateLibrary')) {
  el('btnLoadFromTemplateLibrary').onclick = async () => {
    try {
      const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
      const id = el('templateLibrarySelect')?.value;
      if (!storeApi || !id) return setDraftStatus('status-blocked', 'ℹ️ 적용할 템플릿을 선택하세요.');
      if (studioDirty && typeof window.confirm === 'function') {
        if (!window.confirm('저장되지 않은 편집 내용이 있습니다. 선택한 템플릿을 적용할까요?')) return;
      }
      const res = await storeApi.loadTemplatesLibrary();
      const found = (res.store?.items || []).find(x => x.id === id);
      if (!found) return setDraftStatus('status-blocked', 'ℹ️ 선택한 템플릿을 찾을 수 없습니다.');
      applyStudioFieldValues(found.data);
      setDraftStatus('status-success', `📄 템플릿 적용 완료: "${found.name}"`);
    } catch (err) {
      setDraftStatus('status-error', `❌ 템플릿 적용 실패: ${err.message}`);
    }
  };
}
if (el('btnDeleteFromTemplateLibrary')) {
  el('btnDeleteFromTemplateLibrary').onclick = async () => {
    const storeApi = typeof window !== 'undefined' ? window.XpiderStudioStorage : null;
    const id = el('templateLibrarySelect')?.value;
    if (!storeApi || !id) return setDraftStatus('status-blocked', 'ℹ️ 삭제할 템플릿을 먼저 선택하세요.');
    await storeApi.deleteTemplateFromLibrary(id);
    await refreshDraftAndTemplateSelectors();
    setDraftStatus('status-success', '🗑️ 템플릿 라이브러리 항목을 삭제했습니다.');
  };
}
setTimeout(() => {
  try {
    refreshDraftAndTemplateSelectors();
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    callBg({ action: 'GET_EMAIL_PRODUCTION_PREFLIGHT', sidecarPort, sidecarToken }).then((r) => {
      if (r && r.ok && r.data) {
        const qs = r.data.queueSummary || {};
        const qReady = Number(qs.counts?.PENDING || 0);
        const consented = Number(qs.consentedRecordsOnDisk || 0);
        const hBadge = el('headerProdStateBadge');
        if (hBadge) {
          hBadge.textContent = (qReady > 0 && r.data.deliverabilityGate?.action !== 'BLOCK')
            ? `✅ 상용발송 잠금 해제 · 발송 가능 ${qReady}건`
            : `✅ 상용발송 잠금 해제 · 발송대상/자격 확인 필요 (발송 가능 ${qReady}건 / 권한기록 ${consented}건)`;
        }
        const qBadge = el('prodQueueBadge');
        if (qBadge) {
          qBadge.textContent = (qReady > 0 && r.data.deliverabilityGate?.action !== 'BLOCK')
            ? `🟢 QUEUE READY — ${qReady} VERIFIED OPT-IN`
            : `⏸️ QUEUE NOT READY — ${qReady} QUEUED / ${consented} DOCUMENTED OPT-IN`;
        }
      }
    }).catch(() => {});
  } catch (_) {}
}, 60);

if (el('btnRealTestSend')) {
  el('btnRealTestSend').onclick = async () => {
    const box = el('realTestStatus');
    const btn = el('btnRealTestSend');
    const rec = el('realTestRecipient')?.value.trim() || '';
    const consented = Boolean(el('realTestConsentCheck')?.checked);
    if (!rec || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec)) {
      if (box) { box.className = 'status-box status-blocked'; box.textContent = '⚠️ 유효한 테스트 수신자 이메일 주소를 입력하세요.'; }
      return;
    }
    if (!consented) {
      if (box) { box.className = 'status-box status-blocked'; box.textContent = '⚠️ 실제 테스트 메일 1통 수신 동의 체크박스를 선택해야 발송됩니다.'; }
      return;
    }
    const v = values();
    const subject = (v.subject || '').trim() || '[XPIDER] Real Test Verification';
    if (typeof window.confirm === 'function') {
      if (!window.confirm(`실제 수신함(${rec})으로 테스트 메일 1통을 발송할까요?\n제목: ${subject}`)) return;
    }
    const idempotencyKey = `xpider_realtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (btn) btn.disabled = true;
    if (box) { box.className = 'status-box status-loading'; box.textContent = `⏳ 실제 Resend API(vivpr.pro)로 테스트 메일 1통 발송 중... (${rec})`; }
    try {
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({
        action: 'SEND_REAL_TEST_EMAIL',
        sidecarPort,
        sidecarToken,
        payload: {
          recipient: rec,
          ownerTestConsentConfirmed: true,
          subject,
          html: htmlFor(v),
          text: textFor(v),
          idempotencyKey
        }
      });
      if (!r || !r.ok || !r.data?.ok) {
        if (box) { box.className = 'status-box status-error'; box.textContent = `❌ 실제 테스트 발송 실패 (HTTP ${r?.httpStatus || '-'}): ${r?.data?.reason || r?.error || 'UNKNOWN'}`; }
        return;
      }
      lastRealTestMsgId = r.data.providerMessageId;
      if (box) {
        box.className = 'status-box status-success';
        box.textContent = [
          `✅ 실제 테스트 발송 접수됨 (상태: ${r.data.deliveryState || 'ACCEPTED'})`,
          `• Provider Message ID: ${r.data.providerMessageId}`,
          `• 수신자: ${r.data.maskedRecipient} | Idempotency-Key: ${r.data.idempotencyKey}`,
          `• 안내: ${r.data.note}`
        ].join('\n');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}
if (el('btnCheckRealTestStatus')) {
  el('btnCheckRealTestStatus').onclick = async () => {
    const box = el('realTestStatus');
    if (!lastRealTestMsgId) {
      if (box) { box.className = 'status-box status-blocked'; box.textContent = 'ℹ️ 먼저 실제 테스트 이메일을 발송하세요.'; }
      return;
    }
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    const r = await callBg({ action: 'GET_REAL_EMAIL_STATUS', sidecarPort, sidecarToken, messageId: lastRealTestMsgId });
    if (!r || !r.ok || !r.data?.ok) {
      if (box) { box.className = 'status-box status-error'; box.textContent = `❌ 상태 조회 실패: ${r?.data?.reason || r?.error || '-'}`; }
      return;
    }
    if (box) {
      box.className = 'status-box status-success';
      box.textContent = `📬 Resend 실시간 발송 상태: id=${r.data.id} | last_event=${r.data.last_event} | created_at=${r.data.created_at || '-'}`;
    }
  };
}
async function handleConsentAttestChanged(sourceEl) {
  const checked = Boolean(sourceEl && sourceEl.checked);
  if (el('consentAttest') && el('consentAttest').checked !== checked) el('consentAttest').checked = checked;
  if (el('consentAttestProd') && el('consentAttestProd').checked !== checked) el('consentAttestProd').checked = checked;
  if (!recipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
    runRecipientImport('auto-on-consent-check', null);
  }
  if (recipients.length) {
    await syncSidecarRecipients();
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    const pre = await callBg({ action: 'GET_EMAIL_PRODUCTION_PREFLIGHT', sidecarPort, sidecarToken }).catch(() => null);
    if (pre && pre.ok && pre.data) {
      const qReady = Number(pre.data.queueSummary?.counts?.PENDING || 0);
      const consented = Number(pre.data.queueSummary?.consentedRecordsOnDisk || 0);
      const gateOk = pre.data.deliverabilityGate?.action !== 'BLOCK' && qReady > 0;
      if (el('prodQueueBadge')) {
        el('prodQueueBadge').textContent = gateOk
          ? `🟢 QUEUE READY — ${qReady} VERIFIED OPT-IN`
          : `⏸️ QUEUE NOT READY — ${qReady} QUEUED / ${consented} DOCUMENTED OPT-IN`;
      }
      if (el('headerProdStateBadge')) {
        el('headerProdStateBadge').textContent = gateOk
          ? `✅ 상용발송 잠금 해제 · 발송 가능 ${qReady}건`
          : `✅ 상용발송 잠금 해제 · 발송대상/자격 확인 필요 (발송 가능 ${qReady}건 / 권한기록 ${consented}건)`;
      }
    }
  }
}
if (el('consentAttest')) {
  el('consentAttest').addEventListener('change', () => handleConsentAttestChanged(el('consentAttest')));
}
if (el('consentAttestProd')) {
  el('consentAttestProd').addEventListener('change', () => handleConsentAttestChanged(el('consentAttestProd')));
}
if (el('btnLoadLedger')) el('btnLoadLedger').onclick = loadLedger;
if (el('btnSaveResendKey')) {
  el('btnSaveResendKey').onclick = async () => {
    const box = el('testSendStatus');
    const keyInput = el('resendApiKeyInput');
    const consentEl = el('resendKeyConsent');
    const apiKey = keyInput ? keyInput.value.trim() : '';
    const userConsentConfirmed = Boolean(consentEl && consentEl.checked);
    if (!userConsentConfirmed) {
      if (box) { box.className = 'status-box status-blocked'; box.textContent = '⚠️ 로컬 NTFS 보안 저장 동의 체크박스를 먼저 선택하세요.'; }
      return;
    }
    if (!apiKey) {
      if (box) { box.className = 'status-box status-blocked'; box.textContent = '⚠️ Resend API Key (re_...)를 입력하세요.'; }
      return;
    }
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    if (box) { box.className = 'status-box status-loading'; box.textContent = '🔑 NTFS 사용자 전용 경로에 API 키 보안 저장 중...'; }
    const res = await callBg({ action: 'SET_EMAIL_TEST_RESEND_KEY', sidecarPort, sidecarToken, apiKey, userConsentConfirmed: true });
    if (keyInput) keyInput.value = '';
    if (consentEl) consentEl.checked = false;
    if (res && res.ok) {
      await checkCompanionStatus();
      await loadLedger();
    } else if (box) {
      box.className = 'status-box status-error';
      box.textContent = `❌ [API 키 보안 저장 실패: ${res?.reason || 'KEY_PROVISION_FAILED'}]\n• ${res?.message || 'Sidecar 연결/페어링 상태 또는 키 형식(re_...)을 확인하세요.'}`;
    }
  };
}
if (el('btnPairSidecar')) {
  el('btnPairSidecar').onclick = async () => {
    const box = el('testSendStatus');
    if (box) {
      box.className = 'status-box status-loading';
      box.textContent = '🔗 로컬 Sidecar 원클릭 자동 페어링 시도 중...';
    }
    const pairResp = await callBg({ action: 'PAIR_EMAIL_TEST_SIDECAR' });
    if (pairResp && pairResp.ok) {
      if (el('sidecarToken')) el('sidecarToken').value = '';
      await checkCompanionStatus();
      await loadLedger();
    } else if (box) {
      box.className = 'status-box status-error';
      box.textContent = `❌ [원클릭 페어링 실패: ${pairResp?.error || 'PAIRING_FAILED'}]\n• ${pairResp?.message || 'START_EMAIL_TEST_SIDECAR.bat를 실행한 뒤 다시 시도하거나, "📁 토큰 파일로 연결"을 이용하세요.'}`;
    }
  };
}
if (el('btnPickTokenFile') && el('sidecarTokenFileInput')) {
  el('btnPickTokenFile').onclick = () => el('sidecarTokenFileInput').click();
  el('sidecarTokenFileInput').onchange = async (ev) => {
    const file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const txt = (await file.text()).trim();
      if (txt.length < 16) {
        const box = el('testSendStatus');
        if (box) { box.className = 'status-box status-error'; box.textContent = '❌ 선택한 파일이 유효한 16자 이상 Sidecar 토큰 파일이 아닙니다.'; }
        return;
      }
      if (el('sidecarToken')) el('sidecarToken').value = txt;
      await checkCompanionStatus();
      await loadLedger();
    } finally {
      ev.target.value = '';
    }
  };
}
setTimeout(checkCompanionStatus, 300);

function createBuiltinRecipientManager() {
  const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  const ROLE_LOCALS = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster']);
  const STATUS = Object.freeze({ PENDING: 'PENDING', SENDING: 'SENDING', ACCEPTED: 'ACCEPTED', FAILED: 'FAILED', SKIPPED_SUPPRESSED: 'SKIPPED_SUPPRESSED', SKIPPED_NO_CONSENT: 'SKIPPED_NO_CONSENT', DRY_RUN_READY: 'DRY_RUN_READY' });
  const normalizeEmail = raw => String(raw == null ? '' : raw).trim().replace(/^<|>$/g, '').toLowerCase();
  const validateEmail = email => {
    if (!email) return 'EMPTY';
    if (email.length > 254) return 'TOO_LONG';
    if (!EMAIL_RE.test(email)) return 'INVALID_FORMAT';
    if (ROLE_LOCALS.has(email.split('@')[0])) return 'ROLE_ADDRESS';
    return null;
  };
  const parseCsv = text => {
    const rows = []; let row = [], cur = '', inQ = false;
    const s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(v => v.trim() !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  };
  const importRecipients = (text, opts) => {
    const o = opts || {}; const rows = parseCsv(text);
    const result = { total: rows.length, valid: [], invalid: [], duplicates: [], headerDetected: false };
    if (!rows.length) return result;
    let emailIdx = 0, nameIdx = -1, start = 0;
    const head = rows[0].map(v => v.trim().toLowerCase());
    const hi = head.findIndex(h => ['email', 'e-mail', 'mail', '이메일', '메일'].includes(h));
    if (hi >= 0) { result.headerDetected = true; emailIdx = hi; start = 1; nameIdx = head.findIndex(h => ['name', '이름', 'company', '회사'].includes(h)); }
    else if (!rows[0].some(v => /@/.test(v))) { start = 1; result.headerDetected = true; }
    else { const found = rows[0].findIndex(v => /@/.test(v)); if (found >= 0) emailIdx = found; }
    const seen = new Set();
    for (let i = start; i < rows.length; i++) {
      const r = rows[i]; const email = normalizeEmail(r[emailIdx]); const err = validateEmail(email);
      if (err) { result.invalid.push({ line: i + 1, raw: String(r[emailIdx] || '').slice(0, 80), reason: err }); continue; }
      if (seen.has(email)) { result.duplicates.push({ line: i + 1, email }); continue; }
      seen.add(email);
      result.valid.push({ email, name: nameIdx >= 0 ? String(r[nameIdx] || '').trim().slice(0, 80) : '', source: o.source || 'csv-import' });
    }
    return result;
  };
  const parseSuppression = text => {
    const set = new Set();
    String(text || '').split(/[\s,;]+/).forEach(t => {
      const e = normalizeEmail(t);
      if (e && !validateEmail(e)) set.add(e);
      else if (e && /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) set.add(e);
    });
    return set;
  };
  const isSuppressed = (email, suppression) => Boolean(suppression && (suppression.has(email) || suppression.has('@' + email.split('@')[1])));
  const buildReview = (recipients, suppression, opts) => {
    const o = opts || {}; const entries = []; let ready = 0, suppressed = 0, noConsent = 0;
    for (const r of recipients) {
      let status = STATUS.PENDING, reason = null;
      if (isSuppressed(r.email, suppression)) { status = STATUS.SKIPPED_SUPPRESSED; reason = 'OPT_OUT_OR_SUPPRESSED'; suppressed++; }
      else if (o.messageKind === 'marketing' && !o.consentAttestation) { status = STATUS.SKIPPED_NO_CONSENT; reason = 'MARKETING_REQUIRES_CONSENT_ATTESTATION'; noConsent++; }
      else ready++;
      entries.push({ email: r.email, name: r.name || '', status, reason, attempts: 0, providerMessageId: null, error: null, updatedAt: null });
    }
    return { entries, summary: { total: recipients.length, ready, suppressed, noConsent } };
  };
  const createQueue = entries => ({ entries: entries.map(e => ({ ...e })), stopped: false, startedAt: null, finishedAt: null });
  const summarizeQueue = queue => {
    const s = { total: queue.entries.length };
    for (const k of Object.keys(STATUS)) s[k] = 0;
    for (const e of queue.entries) s[e.status] = (s[e.status] || 0) + 1;
    return s;
  };
  const runQueue = async (queue, sender, opts) => {
    const o = Object.assign({ maxAttempts: 2, delayMs: 0, now: () => new Date().toISOString() }, opts || {});
    queue.stopped = false; queue.startedAt = queue.startedAt || o.now();
    for (const e of queue.entries) {
      if (queue.stopped) break;
      if (e.status === STATUS.ACCEPTED || e.status === STATUS.DRY_RUN_READY || String(e.status).startsWith('SKIPPED')) continue;
      if (e.status === STATUS.FAILED && e.attempts >= o.maxAttempts) continue;
      e.status = STATUS.SENDING; e.attempts++; e.updatedAt = o.now();
      let res; try { res = await sender(e); } catch (err) { res = { ok: false, error: err && err.message ? err.message : 'SENDER_EXCEPTION' }; }
      e.updatedAt = o.now();
      if (res && res.ok) { e.status = res.dryRun ? STATUS.DRY_RUN_READY : STATUS.ACCEPTED; e.providerMessageId = res.providerMessageId || null; e.error = null; }
      else { e.status = STATUS.FAILED; e.error = (res && res.error) || 'UNKNOWN_ERROR'; }
    }
    return summarizeQueue(queue);
  };
  const stopQueue = queue => { queue.stopped = true; };
  const resumeNormalize = queue => { for (const e of queue.entries) if (e.status === STATUS.SENDING) e.status = STATUS.PENDING; queue.stopped = false; return queue; };
  const queueToCsv = queue => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['email,name,status,reason,attempts,providerMessageId,error,updatedAt'];
    for (const e of queue.entries) lines.push([e.email, e.name, e.status, e.reason, e.attempts, e.providerMessageId, e.error, e.updatedAt].map(q).join(','));
    return lines.join('\r\n');
  };
  const baseFallback = { STATUS, normalizeEmail, validateEmail, parseCsv, importRecipients, parseSuppression, isSuppressed, buildReview, createQueue, runQueue, stopQueue, resumeNormalize, summarizeQueue, queueToCsv, isBuiltinFallback: true };
  if (typeof RecipientManager !== 'undefined' && RecipientManager) {
    return Object.assign({}, RecipientManager, baseFallback, {
      filterAndCategorizeRecipients: RecipientManager.filterAndCategorizeRecipients,
      assignAbVariant: RecipientManager.assignAbVariant,
      summarizeAbQueue: RecipientManager.summarizeAbQueue,
      recipientsToCsv: RecipientManager.recipientsToCsv,
      classifyRecipient: RecipientManager.classifyRecipient,
      isBuiltinFallback: true
    });
  }
  return baseFallback;
}

// ===== Content QA & Safe Copy Suggestion (Original vs Proposed Diff / Approve / Reject) =====
(function initContentQaUi() {
  let pendingProposal = null;
  const qaBox = () => el('copyQaStatus');
  const diffPanel = () => el('copyDiffPanel');
  const diffContent = () => el('copyDiffContent');

  function cleanLocalText(str, isSubject) {
    let s = String(str || '');
    if (isSubject) s = s.replace(/^(?:\s*(?:re|fwd|fw|회신|전달)\s*:\s*)+/i, '');
    return s
      .replace(/!{2,}/g, '.')
      .replace(/\?{2,}/g, '?')
      .replace(/100%\s*(보장|확정)/gi, '안내')
      .replace(/무조건\s*무료/gi, '무료 안내')
      .replace(/확정\s*수익/gi, '서비스 안내')
      .replace(/당첨\s*보장/gi, '이벤트 안내')
      .replace(/guaranteed\s*profit/gi, 'service update')
      .replace(/안\s+녕하세요/g, '안녕하세요')
      .replace(/되요/g, '돼요')
      .replace(/할께요/g, '할게요')
      .replace(/뵙겠읍니다/g, '뵙겠습니다')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function computeLocalProposal(v) {
    const proposed = {
      subject: cleanLocalText(v.subject, true),
      preheader: cleanLocalText(v.preheader, false),
      heading: cleanLocalText(v.heading, false),
      body: String(v.body || '').split(/\n/).map(l => cleanLocalText(l, false)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    };
    const diffs = [];
    for (const [field, label] of [['subject', '제목'], ['preheader', '미리보기 문구'], ['heading', '본문 제목'], ['body', '본문']]) {
      if (String(v[field] || '') !== proposed[field]) {
        diffs.push({ field, label, before: String(v[field] || ''), after: proposed[field] });
      }
    }
    return { originalDraft: { subject: v.subject, preheader: v.preheader, heading: v.heading, body: v.body }, proposedDraft: proposed, diffs };
  }

  function showProposalDiff(modeLabel, proposal) {
    pendingProposal = proposal.proposedDraft;
    const qb = qaBox();
    const dp = diffPanel();
    const dc = diffContent();
    if (!proposal.diffs || proposal.diffs.length === 0) {
      if (dp) dp.style.display = 'none';
      if (qb) {
        qb.className = 'status-box status-success';
        qb.textContent = `✅ [${modeLabel}] 교정이 필요한 스팸 위험 문구·맞춤법 오류가 발견되지 않았습니다 (원문 유지).`;
      }
      return;
    }
    const lines = [`📋 [${modeLabel} — 원문 vs 교정 제안 비교 (${proposal.diffs.length}개 항목 · 수락 전까지 원문 미변경)]`];
    for (const d of proposal.diffs) {
      lines.push(`\n[${d.label}]\n  - 원문: ${d.before}\n  + 제안: ${d.after}`);
    }
    if (dc) dc.textContent = lines.join('\n');
    if (dp) dp.style.display = 'block';
    if (qb) {
      qb.className = 'status-box status-idle';
      qb.textContent = `ℹ️ [${modeLabel}] 아래 원문 vs 제안 비교를 확인한 뒤 [✅ 제안 수락] 또는 [❌ 제안 거절]을 선택하세요.`;
    }
  }

  if (el('btnRuleCopySuggest')) {
    el('btnRuleCopySuggest').onclick = async () => {
      try {
        const v = values();
        const localProp = computeLocalProposal(v);
        showProposalDiff('규칙 기반 문구 교정 제안', localProp);
      } catch (err) {
        if (qaBox()) { qaBox().className = 'status-box status-error'; qaBox().textContent = `❌ [ERR_COPY_QA] ${err.message}`; }
      }
    };
  }

  if (el('btnAiCopySuggest')) {
    el('btnAiCopySuggest').onclick = async () => {
      const qb = qaBox();
      const dp = diffPanel();
      if (dp) dp.style.display = 'none';
      if (!el('aiCopyOptIn') || !el('aiCopyOptIn').checked) {
        if (qb) {
          qb.className = 'status-box status-blocked';
          qb.textContent = '⚠️ [AI_OPT_IN_CONSENT_REQUIRED] AI 교정 제안을 요청하려면 동의 체크박스를 먼저 선택하세요 (수신자 명단은 전송되지 않습니다).';
        }
        return;
      }
      const v = values();
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      if (qb) {
        qb.className = 'status-box status-loading';
        qb.textContent = '⏳ Sidecar를 통해 AI 교정 제안 상태 확인 및 요청 중 (수신자 명단 제외)...';
      }
      const resp = await callBg({
        action: 'REQUEST_EMAIL_COPY_SUGGESTION',
        sidecarPort,
        sidecarToken,
        payload: {
          mode: 'AI',
          optInConsent: true,
          draft: { subject: v.subject, preheader: v.preheader, heading: v.heading, body: v.body }
        }
      });
      if (resp && resp.ok && resp.data && resp.data.ok) {
        currentAiCopyStatus = resp.data.aiCopyEditStatus || 'READY';
        currentAiStatusLabel = 'AI 자동 교정: Gemini 준비됨';
        render();
        showProposalDiff('Google Gemini 문구 교정 제안', resp.data);
      } else {
        const errData = (resp && resp.data) || {};
        const reason = errData.reason || resp?.error || 'AI_PROVIDER_NOT_CONFIGURED';
        if (reason === 'AI_PROVIDER_NOT_CONFIGURED' || reason === 'KEY_MISSING') {
          currentAiCopyStatus = 'NOT_CONFIGURED';
          currentAiStatusLabel = 'AI 자동 교정: 연결 필요';
        } else {
          currentAiCopyStatus = 'ERROR';
          currentAiStatusLabel = `AI 자동 교정: 연결 오류 (${reason})`;
        }
        render();
        if (qb) {
          qb.className = currentAiCopyStatus === 'NOT_CONFIGURED' ? 'status-box status-blocked' : 'status-box status-error';
          qb.textContent = `⚠️ [${reason}] ${errData.message || 'AI 자동 교정: 연결 필요 (Gemini API 키를 등록하고 연결 테스트를 실행하세요. 원문 템플릿은 그대로 보존되었으며, 규칙 기반 문구 교정 제안을 이용할 수 있습니다.)'}`;
        }
      }
    };
  }

  if (el('btnSaveGeminiKey')) {
    el('btnSaveGeminiKey').onclick = async () => {
      const gs = el('geminiSetupStatus');
      const keyInput = el('geminiApiKeyInput');
      const consent = el('geminiKeyConsent');
      if (!consent || !consent.checked) {
        if (gs) gs.textContent = '⚠️ [USER_CONSENT_REQUIRED] 로컬 Sidecar 보안 파일 저장 동의 체크박스를 먼저 선택하세요.';
        return;
      }
      const rawKey = keyInput ? String(keyInput.value || '').trim() : '';
      if (!rawKey) {
        if (gs) gs.textContent = '⚠️ [EMPTY_KEY] Google Gemini API 키를 입력하세요.';
        return;
      }
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      if (gs) gs.textContent = '⏳ 로컬 Sidecar NTFS 보안 파일에 Gemini API 키 저장 중...';
      const resp = await callBg({
        action: 'SAVE_GEMINI_COPY_API_KEY',
        sidecarPort,
        sidecarToken,
        payload: { apiKey: rawKey, userConsentConfirmed: true }
      });
      if (keyInput) keyInput.value = '';
      if (resp && resp.ok && resp.data && resp.data.ok) {
        currentAiCopyStatus = 'NOT_CONFIGURED';
        currentAiStatusLabel = 'AI 자동 교정: 연결 테스트 필요 (Gemini 키 저장됨)';
        render();
        if (gs) gs.textContent = `✅ ${resp.data.message || '키 저장 완료. [🔌 연결 테스트]를 클릭하세요.'}`;
      } else {
        const errData = (resp && resp.data) || {};
        const reason = errData.reason || resp?.error || 'SAVE_KEY_FAILED';
        if (gs) gs.textContent = `❌ [${reason}] ${errData.message || 'Gemini API 키 저장 실패 (Sidecar 실행 여부를 확인하세요)'}`;
      }
    };
  }

  if (el('btnTestGeminiConnection')) {
    el('btnTestGeminiConnection').onclick = async () => {
      const gs = el('geminiSetupStatus');
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      if (gs) gs.textContent = '⏳ Google Gemini 연결 테스트 중 (합성 문구만 전송, 수신자 명단 미포함)...';
      const resp = await callBg({
        action: 'TEST_GEMINI_COPY_CONNECTION',
        sidecarPort,
        sidecarToken,
        payload: {}
      });
      const data = (resp && resp.data) || {};
      if (resp && resp.ok && data.ok) {
        currentAiCopyStatus = 'READY';
        currentAiStatusLabel = `AI 자동 교정: Gemini 준비됨 (${data.model || 'gemini-2.5-flash'})`;
        render();
        if (gs) gs.textContent = `✅ [READY] ${data.message || 'Google Gemini 연결 확인 완료'}`;
      } else {
        const reason = data.reason || resp?.error || 'CONNECTION_TEST_FAILED';
        currentAiCopyStatus = (reason === 'KEY_MISSING' || reason === 'KEY_ACL_INVALID') ? 'NOT_CONFIGURED' : 'ERROR';
        currentAiStatusLabel = currentAiCopyStatus === 'NOT_CONFIGURED'
          ? 'AI 자동 교정: 연결 필요'
          : `AI 자동 교정: 연결 오류 (${reason})`;
        render();
        if (gs) gs.textContent = `❌ [${reason}] ${data.message || 'Gemini 연결 테스트 실패 — 규칙 기반 교정 기능은 계속 정상 동작합니다.'}`;
      }
    };
  }

  if (el('btnApproveCopySuggestion')) {
    el('btnApproveCopySuggestion').onclick = () => {
      if (!pendingProposal) return;
      for (const f of ['subject', 'preheader', 'heading', 'body']) {
        if (el(f) && typeof pendingProposal[f] === 'string') el(f).value = pendingProposal[f];
      }
      pendingProposal = null;
      if (diffPanel()) diffPanel().style.display = 'none';
      render();
      if (qaBox()) {
        qaBox().className = 'status-box status-success';
        qaBox().textContent = '✅ 교정 제안이 편집창에 반영되었습니다. 발송 전 미리보기와 내용을 다시 확인하세요.';
      }
    };
  }

  if (el('btnRejectCopySuggestion')) {
    el('btnRejectCopySuggestion').onclick = () => {
      pendingProposal = null;
      if (diffPanel()) diffPanel().style.display = 'none';
      if (qaBox()) {
        qaBox().className = 'status-box status-idle';
        qaBox().textContent = '↩️ 교정 제안을 거절하고 작성자의 원본 문구를 그대로 유지했습니다.';
      }
    };
  }
})();

// ===== Recipient manager / review / dry-run queue (fortified P0 CSV import + Work Center observability) =====
(function initRecipientUi() {
  const box = () => el('recipientStatus');
  const setRegion = (id, cls, txt) => {
    const node = el(id);
    if (node) {
      node.className = 'status-box ' + cls;
      node.textContent = txt;
      node.dataset.lastUpdated = String(Date.now());
    }
  };
  const say = (cls, txt) => setRegion('recipientStatus', cls, txt);
  const fallbackRM = createBuiltinRecipientManager();
  function getActiveRM() {
    if (typeof window !== 'undefined' && window.__XPIDER_FORCE_DISABLE_RM === true) {
      const err = new Error('수신자 관리 모듈(recipient-manager.js)이 비활성화되었거나 로드되지 않았습니다.');
      err.code = 'ERR_RM_UNAVAILABLE';
      throw err;
    }
    if (typeof RecipientManager !== 'undefined' && RecipientManager && typeof RecipientManager.importRecipients === 'function') {
      return RecipientManager;
    }
    return fallbackRM;
  }

  const KEY = 'xpider_email_studio_recipients_v1';
  const PAGE_SIZE = 20;
  let originalRawCsv = '';
  let rawRows = [];
  let importMeta = { validCount: 0, duplicateCount: 0, invalidCount: 0 };
  let allValidRecipients = [];
  let recipients = [];
  let manualOverrides = {};
  let lastFilterResult = { retained: [], excluded: [], review: [], categoryCounts: {}, reasonCounts: {} };
  let queue = null;
  let importClickSeq = 0;
  let opSeq = 0;
  let activityHistory = [];
  let workflowState = {
    import: { state: 'READY', detail: '' },
    dedupe: { state: 'READY', detail: '' },
    dns: { state: 'READY', detail: '' },
    filter: { state: 'READY', detail: '' },
    review: { state: 'READY', detail: '' },
    export: { state: 'READY', detail: '' }
  };
  let lastImportStatus = { cls: 'status-idle', txt: '🟢 [가져오기 대기] CSV를 붙여넣거나 파일을 선택한 뒤 "가져오기 · 중복 제거"를 클릭하세요.' };
  let lastDnsStatus = { cls: 'status-idle', txt: '🔍 [DNS 검사 대기] 동의 체크박스 선택 후 "🔍 유효성 검사 (DNS MX/A)"를 클릭하세요.' };
  let lastFilterStatus = { cls: 'status-idle', txt: '🎯 [필터 대기] CSV 가져오기 후 "🎯 대상 필터 적용 · 제외 사유 확인"을 클릭하세요.' };
  let filterStale = false;
  let activeTab = 'ORIGINAL';
  let searchQuery = '';
  let pageIndex = 0;
  const selectedEmails = new Set();

  function recordActivity(type, startedMs, processed, total, resultCode, sidecarSync, message) {
    opSeq++;
    const endedMs = Date.now();
    activityHistory.unshift({
      opId: `OP-${opSeq}`,
      type,
      startedAt: new Date(startedMs).toLocaleTimeString(),
      endedAt: new Date(endedMs).toLocaleTimeString(),
      durationMs: Math.max(0, endedMs - startedMs),
      processed,
      total,
      resultCode,
      sidecarSync,
      message
    });
    if (activityHistory.length > 40) activityHistory.length = 40;
    renderActivityLog();
  }

  function renderActivityLog() {
    const logEl = el('recipientActivityLog');
    if (!logEl) return;
    if (!activityHistory.length) {
      logEl.textContent = '기록된 작업 없음';
      return;
    }
    logEl.textContent = activityHistory.map(a =>
      `[${a.opId}] ${a.startedAt} (${a.durationMs}ms) ${a.type} · ${a.processed}/${a.total} · ${a.resultCode} · Sidecar:${a.sidecarSync} — ${a.message}`
    ).join('\n');
  }

  function renderPipeline() {
    const pEl = el('recipientWorkflowPipeline');
    if (!pEl) return;
    const labels = [
      ['1.가져오기', workflowState.import],
      ['2.중복제거', workflowState.dedupe],
      ['3.DNS(Opt-In)', workflowState.dns],
      ['4.SME필터', workflowState.filter],
      ['5.검토', workflowState.review],
      ['6.내보내기/드라이런', workflowState.export]
    ];
    pEl.textContent = labels.map(([name, st]) => `${name}:${st.state}${st.detail ? '(' + st.detail + ')' : ''}`).join(' · ');
  }

  function parseRawCsvPreviewRows(csvText, importRes, RM) {
    const parseFn = (RM && typeof RM.parseCsv === 'function')
      ? RM.parseCsv
      : (txt) => {
          const rows = []; let row = [], cur = '', inQ = false;
          const s = String(txt || '').replace(/^\uFEFF/, '');
          for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (inQ) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
            else if (c === '"') inQ = true;
            else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
            else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(v => v.trim() !== '')) rows.push(row); row = []; }
            else cur += c;
          }
          row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
          return rows;
        };
    const rows = parseFn(csvText);
    if (!rows.length) return [];
    const head = rows[0].map(c => String(c || '').trim().toLowerCase());
    const hi = head.findIndex(h => ['email', 'e-mail', 'mail', '이메일', '메일', '이메일주소', '이메일 주소', '대표이메일', '대표 이메일'].includes(h));
    const hasHeader = hi >= 0 || !rows[0].some(v => /@/.test(v));
    const emailIdx = hi >= 0 ? hi : Math.max(0, rows[0].findIndex(v => /@/.test(v)));
    const nameIdx = hasHeader ? head.findIndex(h => ['name', '이름', 'company', '회사', '회사명', '업체명', '상호', '상호명'].includes(h)) : 1;
    const dupMap = new Map((importRes.duplicates || []).map(d => [d.line, d]));
    const invMap = new Map((importRes.invalid || []).map(i => [i.line, i]));
    const validMap = new Map((importRes.valid || []).map(v => [v.email, v]));
    const out = [];
    for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
      const lineNo = i + 1;
      const cols = rows[i];
      const rawCell = cols.length > emailIdx ? String(cols[emailIdx] || '').trim() : '';
      const rawEmail = rawCell.toLowerCase();
      const rawName = nameIdx >= 0 && cols[nameIdx] !== undefined ? String(cols[nameIdx] || '').trim() : '';
      const inv = invMap.get(lineNo);
      const dup = dupMap.get(lineNo);
      const val = validMap.get(rawEmail);
      out.push({
        line: lineNo,
        email: rawEmail || `(빈 이메일 행 L${lineNo})`,
        name: rawName,
        domain: rawEmail.includes('@') ? rawEmail.split('@')[1].split(/[\s,;\/]+/)[0] : '',
        validityStatus: inv ? 'INVALID' : (dup ? 'DUPLICATE' : (val ? (val.validityStatus || 'VALID_FORMAT') : 'VALID_FORMAT')),
        category: inv ? 'INVALID' : (dup ? 'DUPLICATE' : (val ? val.category : 'ORIGINAL_RAW')),
        reasonCode: inv ? inv.reason : (dup ? 'DUPLICATE_EMAIL' : 'RAW_IMPORTED_ROW'),
        provenance: `CSV_ROW_${lineNo}`,
        immutableOriginal: true
      });
    }
    return out;
  }

  function getTabRows(tabName) {
    if (tabName === 'ORIGINAL') return rawRows;
    if (tabName === 'VALID') return allValidRecipients;
    if (tabName === 'RETAINED') return lastFilterResult.retained || [];
    if (tabName === 'EXCLUDED') return lastFilterResult.excluded || [];
    if (tabName === 'REVIEW') return lastFilterResult.review || [];
    return [];
  }

  function renderWorkCenter() {
    renderPipeline();
    renderActivityLog();
    if (el('cntOrig')) el('cntOrig').textContent = String(rawRows.length);
    if (el('cntValid')) el('cntValid').textContent = String(allValidRecipients.length);
    if (el('cntRetained')) el('cntRetained').textContent = String((lastFilterResult.retained || []).length);
    if (el('cntExcluded')) el('cntExcluded').textContent = String((lastFilterResult.excluded || []).length);
    if (el('cntReview')) el('cntReview').textContent = String((lastFilterResult.review || []).length);
    const recEl = el('recipientReconciledCounts');
    if (recEl) {
      recEl.textContent = `원본 ${rawRows.length} → 유효 ${allValidRecipients.length} (중복 ${importMeta.duplicateCount} · 무효 ${importMeta.invalidCount}) → 유지 ${(lastFilterResult.retained || []).length} / 제외 ${(lastFilterResult.excluded || []).length} / 검토 ${(lastFilterResult.review || []).length}${filterStale ? ' · ⚠️ 필터 재적용 필요(STALE)' : ''}`;
    }

    const tabsEl = el('recipientDataTabs');
    if (tabsEl) {
      for (const btn of tabsEl.querySelectorAll('button[data-rtab]')) {
        btn.className = (btn.dataset.rtab === activeTab) ? 'primary' : '';
      }
    }

    const tbody = el('recipientTableBody');
    if (!tbody) return;
    const sourceRows = getTabRows(activeTab);
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? sourceRows.filter(r =>
          String(r.email || '').toLowerCase().includes(q) ||
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.domain || '').toLowerCase().includes(q) ||
          String(r.category || '').toLowerCase().includes(q) ||
          String(r.reasonCode || '').toLowerCase().includes(q) ||
          String(r.validityStatus || '').toLowerCase().includes(q)
        )
      : sourceRows;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (pageIndex >= totalPages) pageIndex = totalPages - 1;
    if (pageIndex < 0) pageIndex = 0;
    if (el('tablePageInfo')) el('tablePageInfo').textContent = `${pageIndex + 1} / ${totalPages} (${filtered.length}건)`;

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const slice = filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
    if (!slice.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.style.padding = '8px';
      td.style.color = '#666';
      td.textContent = sourceRows.length ? '검색 조건과 일치하는 수신자가 없습니다.' : '표시할 수신자 데이터가 없습니다.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const r of slice) {
      const tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #eaeef2';

      const tdChk = document.createElement('td');
      tdChk.style.padding = '4px 6px';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = selectedEmails.has(r.email);
      chk.onchange = () => { if (chk.checked) selectedEmails.add(r.email); else selectedEmails.delete(r.email); };
      tdChk.appendChild(chk);

      const tdEmail = document.createElement('td');
      tdEmail.style.padding = '4px 6px';
      tdEmail.textContent = r.line ? `L${r.line}: ${r.email}` : r.email;

      const tdNameDom = document.createElement('td');
      tdNameDom.style.padding = '4px 6px';
      tdNameDom.textContent = `${r.name || '-'} · ${r.domain || (String(r.email || '').split('@')[1] || '-')}`;

      const tdVal = document.createElement('td');
      tdVal.style.padding = '4px 6px';
      tdVal.textContent = `${r.validityStatus || 'VALID_FORMAT'}${r.dnsProvenance ? ' (' + r.dnsProvenance + ')' : ''}`;

      const tdCat = document.createElement('td');
      tdCat.style.padding = '4px 6px';
      tdCat.textContent = `${r.category || '-'} / ${r.reasonCode || '-'}`;

      const tdProv = document.createElement('td');
      tdProv.style.padding = '4px 6px';
      tdProv.textContent = r.provenance || '-';

      const tdAct = document.createElement('td');
      tdAct.style.padding = '4px 6px';
      if (activeTab !== 'ORIGINAL' && r.email && r.email.includes('@')) {
        for (const [ovKey, ovLabel] of [['RETAIN_SME', '유지'], ['EXCLUDE', '제외'], ['REVIEW', '검토']]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = ovLabel;
          b.style.fontSize = '10px';
          b.style.padding = '2px 5px';
          b.style.marginRight = '3px';
          b.onclick = () => {
            manualOverrides[r.email] = ovKey;
            const RM = getActiveRM();
            renderSmeFilterSummary(RM);
            recipients = (el('filterSmeOnly') && el('filterSmeOnly').checked)
              ? lastFilterResult.retained
              : allValidRecipients.filter(item => item.validityStatus !== 'INVALID');
            persist();
            renderWorkCenter();
          };
          tdAct.appendChild(b);
        }
      } else {
        tdAct.textContent = '원본 보존';
      }

      tr.append(tdChk, tdEmail, tdNameDom, tdVal, tdCat, tdProv, tdAct);
      tbody.appendChild(tr);
    }
  }

  function getFilterOptions() {
    return {
      smeOnlyMode: Boolean(el('filterSmeOnly') && el('filterSmeOnly').checked),
      excludePersonalFree: el('filterExcludePersonal') ? el('filterExcludePersonal').checked : true,
      excludeGovPublic: el('filterExcludeGov') ? el('filterExcludeGov').checked : true,
      excludeEcommerce: el('filterExcludeEcommerce') ? el('filterExcludeEcommerce').checked : true,
      excludePortalPlatform: el('filterExcludePortal') ? el('filterExcludePortal').checked : true,
      excludeLargeEnterprise: el('filterExcludeLarge') ? el('filterExcludeLarge').checked : true,
      includeReviewInRetained: Boolean(el('filterIncludeReview') && el('filterIncludeReview').checked),
      customSmeIncludeDomains: el('customSmeDomains') ? el('customSmeDomains').value : '',
      customExcludeDomains: el('customExcludeDomains') ? el('customExcludeDomains').value : '',
      manualOverrides
    };
  }

  function getAbOptions() {
    const rawRatio = el('abSplitRatio') ? Number(el('abSplitRatio').value) : 50;
    return {
      abEnabled: Boolean(el('abEnabled') && el('abEnabled').checked),
      campaignId: (el('abCampaignId') && el('abCampaignId').value.trim()) || 'camp_sme_ab_v1',
      splitPercentA: Number.isFinite(rawRatio) ? Math.max(0, Math.min(100, rawRatio)) : 50
    };
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        originalRawCsv,
        rawRows,
        importMeta,
        allValidRecipients,
        recipients,
        manualOverrides,
        activityHistory,
        workflowState,
        lastImportStatus,
        lastDnsStatus,
        lastFilterStatus,
        filterStale,
        queue,
        optOut: el('optOutList') ? el('optOutList').value : '',
        savedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function renderSmeFilterSummary(RM) {
    const fBox = el('smeFilterStatus');
    if (!fBox || typeof RM.filterAndCategorizeRecipients !== 'function') return;
    const fOpts = getFilterOptions();
    lastFilterResult = RM.filterAndCategorizeRecipients(allValidRecipients, fOpts);
    const cc = lastFilterResult.categoryCounts || {};
    const sampleRetained = lastFilterResult.retained.slice(0, 4).map(r => `${r.email}[${r.reasonCode}]`).join(', ');
    const sampleExcluded = lastFilterResult.excluded.slice(0, 4).map(r => `${r.email}[${r.category}:${r.reasonCode}]`).join(', ');
    const sampleReview = lastFilterResult.review.slice(0, 4).map(r => `${r.email}[${r.reasonCode}]`).join(', ');

    fBox.textContent = [
      `🎯 [대상 필터 분석 결과 — 원본 유효 ${allValidRecipients.length}명 · ${fOpts.smeOnlyMode ? '중소기업만 선택 ON' : '선택적 카테고리 제외 모드'}]`,
      `• 중소기업 후보 유지(SMALL_PRIVATE_BUSINESS): ${lastFilterResult.retained.length}명${sampleRetained ? ' (' + sampleRetained + ')' : ''}`,
      `• 제외됨(EXCLUDED): ${lastFilterResult.excluded.length}명 — 개인/무료:${cc.PERSONAL_FREE_EMAIL || 0} · 정부/공공:${cc.GOV_PUBLIC_SECTOR || 0} · 쇼핑몰/이커머스:${cc.ECOMMERCE_MARKETPLACE || 0} · 포털/플랫폼:${cc.PORTAL_PLATFORM || 0} · 대기업:${cc.LARGE_ENTERPRISE || 0}${sampleExcluded ? '\n  예시: ' + sampleExcluded : ''}`,
      `• 확인 필요(UNKNOWN_REVIEW — 소규모 쇼핑몰·대기업 계열사·업종 미상 의심): ${lastFilterResult.review.length}명${sampleReview ? ' (' + sampleReview + ')' : ''}`,
      `※ 주의: 도메인 기반 분류는 휴리스틱/정책 추정이며 기업 규모(중소기업 여부)를 100% 확정하거나 마케팅 수신 동의를 대체하지 않습니다.`
    ].join('\n');
    renderWorkCenter();
  }

  function renderAbDashboard(RM) {
    const abBox = el('abDashboardStatus');
    if (!abBox || typeof RM.summarizeAbQueue !== 'function') return;
    const abOpts = getAbOptions();
    const targetQueue = queue || RM.createQueue(buildReview().entries);
    const abSum = RM.summarizeAbQueue(targetQueue, abOpts);
    const va = abSum.variants.A;
    const vb = abSum.variants.B;
    abBox.className = 'status-box status-success';
    abBox.textContent = [
      `⚖️ [A/B 테스트 비교 대시보드 — 캠페인 ID: ${abSum.campaignId} · 분할 비율 A:${abSum.splitPercentA}% / B:${100 - abSum.splitPercentA}% · 활성:${abOpts.abEnabled ? 'ON' : 'OFF(단일 A안)'}]`,
      `• 고유 수신자 수: ${abSum.uniqueRecipientsCount}명 | 중복 수신자 ID: ${abSum.duplicateRecipientIds}건 | 실제 발송: 0건 (DRY-RUN)`,
      `• [A안] 할당:${va.assigned}명 | 드라이런(DRY_RUN_READY):${va.DRY_RUN_READY} | 접수(ACCEPTED):${va.ACCEPTED} | 배달(DELIVERED):${va.DELIVERED} | 반송(BOUNCED):${va.BOUNCED} | 열람/클릭:미지원(추적 잠금)`,
      `• [B안] 할당:${vb.assigned}명 | 드라이런(DRY_RUN_READY):${vb.DRY_RUN_READY} | 접수(ACCEPTED):${vb.ACCEPTED} | 배달(DELIVERED):${vb.DELIVERED} | 반송(BOUNCED):${vb.BOUNCED} | 열람/클릭:미지원(추적 잠금)`,
      `※ ${abSum.metricsSupportNote}`
    ].join('\n');
  }

  function restore() {
    try {
      const RM = getActiveRM();
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        say('status-idle', '🟢 [수신자 관리 준비 완료 · LOCKED17] 수신자 목록 없음. CSV를 붙여넣거나 파일을 선택한 뒤 "가져오기 · 중복 제거"를 클릭하세요.');
        setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
        setRegion('dnsProgress', lastDnsStatus.cls, lastDnsStatus.txt);
        setRegion('filterProgress', lastFilterStatus.cls, lastFilterStatus.txt);
        renderWorkCenter();
        return;
      }
      const d = JSON.parse(raw);
      originalRawCsv = typeof d.originalRawCsv === 'string' ? d.originalRawCsv : '';
      rawRows = Array.isArray(d.rawRows) ? d.rawRows : [];
      importMeta = d.importMeta && typeof d.importMeta === 'object' ? d.importMeta : { validCount: 0, duplicateCount: 0, invalidCount: 0 };
      allValidRecipients = Array.isArray(d.allValidRecipients) ? d.allValidRecipients : (Array.isArray(d.recipients) ? d.recipients : []);
      recipients = Array.isArray(d.recipients) ? d.recipients : [];
      manualOverrides = d.manualOverrides && typeof d.manualOverrides === 'object' ? d.manualOverrides : {};
      activityHistory = Array.isArray(d.activityHistory) ? d.activityHistory : [];
      if (d.workflowState && typeof d.workflowState === 'object') workflowState = d.workflowState;
      if (d.lastImportStatus) lastImportStatus = d.lastImportStatus;
      if (d.lastDnsStatus) lastDnsStatus = d.lastDnsStatus;
      if (d.lastFilterStatus) lastFilterStatus = d.lastFilterStatus;
      filterStale = Boolean(d.filterStale);
      queue = d.queue && Array.isArray(d.queue.entries) ? RM.resumeNormalize(d.queue) : null;
      if (originalRawCsv && el('recipientCsv') && !el('recipientCsv').value) el('recipientCsv').value = originalRawCsv;
      if (typeof d.optOut === 'string' && el('optOutList')) el('optOutList').value = d.optOut;
      if (allValidRecipients.length) renderSmeFilterSummary(RM);
      setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
      setRegion('dnsProgress', lastDnsStatus.cls, lastDnsStatus.txt);
      setRegion('filterProgress', lastFilterStatus.cls, lastFilterStatus.txt);
      renderWorkCenter();
      if (recipients.length) {
        say('status-idle', `📂 저장된 수신자 ${recipients.length}명 복원 (원본 유효 ${allValidRecipients.length}명)${queue ? ' · 큐 ' + JSON.stringify(RM.summarizeQueue(queue)) : ''}`);
      } else {
        say('status-idle', '🟢 [수신자 관리 준비 완료 · LOCKED17] 수신자 목록 없음. CSV를 붙여넣거나 파일을 선택한 뒤 "가져오기 · 중복 제거"를 클릭하세요.');
      }
    } catch (err) {
      say('status-error', `❌ [${err.code || 'ERR_RM_RESTORE_FAILED'}] ${err.message}`);
    }
  }
  function suppression() { return getActiveRM().parseSuppression(el('optOutList') ? el('optOutList').value : ''); }
  function messageKind() { return el('kind') ? el('kind').value : 'service'; }
  function buildReview() {
    const abOpts = getAbOptions();
    return getActiveRM().buildReview(recipients, suppression(), {
      messageKind: messageKind(),
      consentAttestation: Boolean(el('consentAttest') && el('consentAttest').checked),
      abEnabled: abOpts.abEnabled,
      campaignId: abOpts.campaignId,
      splitPercentA: abOpts.splitPercentA
    });
  }
  async function syncSidecarRecipients() {
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    let syncCsv = '';
    try {
      const RM = getActiveRM();
      const targetList = recipients.length ? recipients : allValidRecipients;
      if (targetList.length && typeof RM.recipientsToCsv === 'function') {
        syncCsv = RM.recipientsToCsv(targetList);
      } else {
        syncCsv = el('recipientCsv') ? el('recipientCsv').value : '';
      }
    } catch (_) {
      syncCsv = el('recipientCsv') ? el('recipientCsv').value : '';
    }
    const payload = {
      csvText: syncCsv,
      optOutText: el('optOutList') ? el('optOutList').value : '',
      messageKind: messageKind(),
      consentAttested: Boolean(el('consentAttest') && el('consentAttest').checked),
      lawfulBasis: el('lawfulBasisSelect')?.value || 'EXPLICIT_OPT_IN',
      jurisdiction: el('jurisdictionSelect')?.value || 'GLOBAL',
      authorizationSource: el('authSourceInput')?.value.trim() || 'owner_csv_consent_attestation'
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await callBg({
          action: 'SYNC_EMAIL_PRODUCTION_RECIPIENTS',
          sidecarPort,
          sidecarToken,
          payload
        });
        if (r && r.ok) {
          return { synced: true, httpStatus: r.httpStatus, syncedCount: (r.data && r.data.summary && r.data.summary.counts && r.data.summary.counts.total) || null };
        }
        if (attempt === 1) {
          return { synced: false, httpStatus: r && r.httpStatus, error: (r && (r.error || (r.data && r.data.error))) || `HTTP_${(r && r.httpStatus) || 'ERR'}` };
        }
      } catch (err) {
        if (attempt === 1) return { synced: false, error: err.message };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return { synced: false, error: 'SYNC_RETRY_EXHAUSTED' };
  }

  function runRecipientImport(triggerSource, fileName) {
    importClickSeq++;
    const startedMs = Date.now();
    const btn = el('btnImportRecipients');
    if (btn) btn.disabled = true;
    try {
      if (typeof window !== 'undefined' && window.__XPIDER_FORCE_IMPORT_THROW === true) {
        const e = new Error('테스트 주입 예외: 가져오기 핸들러 내부 오류');
        e.code = 'ERR_CSV_IMPORT_EXCEPTION';
        throw e;
      }
      const RM = getActiveRM();
      const csvEl = el('recipientCsv');
      const rawCsv = csvEl ? String(csvEl.value || '') : '';
      if (!rawCsv.trim()) {
        originalRawCsv = '';
        rawRows = [];
        importMeta = { validCount: 0, duplicateCount: 0, invalidCount: 0 };
        allValidRecipients = [];
        recipients = [];
        queue = null;
        workflowState.import = { state: 'FAILED', detail: 'EMPTY' };
        workflowState.dedupe = { state: 'SKIPPED', detail: '' };
        lastImportStatus = { cls: 'status-blocked', txt: `⚠️ [CSV_EMPTY_INPUT · #${importClickSeq}] 수신자 CSV 입력란이 비어 있습니다. 이메일 목록(예: email,name)을 붙여넣거나 CSV 파일을 선택한 뒤 "가져오기 · 중복 제거"를 다시 클릭하세요.` };
        setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
        say(lastImportStatus.cls, lastImportStatus.txt);
        recordActivity('IMPORT', startedMs, 0, 0, 'CSV_EMPTY_INPUT', 'SKIPPED', '빈 CSV 입력');
        persist();
        renderWorkCenter();
        return;
      }
      const res = RM.importRecipients(rawCsv, { source: triggerSource || 'csv-import' });
      originalRawCsv = rawCsv;
      rawRows = parseRawCsvPreviewRows(rawCsv, res, RM);
      importMeta = {
        sourceRowCount: res.sourceRowCount || rawRows.length,
        discoveredEmailCount: res.discoveredEmailCount || (res.valid.length + res.duplicates.length + res.invalid.length),
        validCount: res.valid.length,
        duplicateCount: res.duplicates.length,
        invalidCount: res.invalid.length,
        emptyEmailCount: res.emptyEmailCount || 0,
        badEmailCount: res.badEmailCount || 0
      };
      allValidRecipients = res.valid;
      filterStale = false;
      renderSmeFilterSummary(RM);
      const fOpts = getFilterOptions();
      recipients = (fOpts.smeOnlyMode && lastFilterResult && Array.isArray(lastFilterResult.retained))
        ? lastFilterResult.retained
        : res.valid;
      queue = null;
      const inv = res.invalid.slice(0, 5).map(i => `L${i.line}:${i.reason}`).join(', ');
      const dupPreview = res.duplicates.slice(0, 5).map(d => `L${d.line}:${d.email}`).join(', ');
      const validPreview = recipients.slice(0, 6).map(r => r.name ? `${r.email}(${r.name})` : r.email).join(', ');
      const fbTag = RM.isBuiltinFallback ? ' · [RM_FALLBACK_ACTIVE]' : '';
      const srcTag = fileName ? `파일:${fileName}` : (triggerSource === 'button-click' ? '수동 클릭' : triggerSource);

      if (res.valid.length === 0) {
        workflowState.import = { state: 'SUCCESS', detail: `${rawRows.length}행` };
        workflowState.dedupe = { state: 'FAILED', detail: '유효 0명' };
        lastImportStatus = {
          cls: 'status-error',
          txt: `❌ [CSV_NO_VALID_RECIPIENTS · #${importClickSeq}${fbTag}] 유효 0명 · 중복 제거 ${res.duplicates.length} · 무효 ${res.invalid.length}${inv ? ' (' + inv + ')' : ''}\n• 올바른 이메일 주소(예: user@example.org)가 없습니다. CSV 형식을 확인한 뒤 다시 시도하세요.`
        };
        setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
        say(lastImportStatus.cls, lastImportStatus.txt);
        recordActivity('IMPORT', startedMs, 0, rawRows.length, 'CSV_NO_VALID_RECIPIENTS', 'SKIPPED', `유효 0명 / 무효 ${res.invalid.length}`);
        persist();
        renderWorkCenter();
        return;
      }

      workflowState.import = { state: 'SUCCESS', detail: `${rawRows.length}행` };
      workflowState.dedupe = { state: 'SUCCESS', detail: `유효 ${res.valid.length}` };
      workflowState.filter = { state: fOpts.smeOnlyMode ? 'SUCCESS' : 'READY', detail: fOpts.smeOnlyMode ? `유지 ${lastFilterResult.retained.length}` : '' };
      activeTab = 'VALID';
      pageIndex = 0;

      const localTxt = `✅ 유효 ${res.valid.length}명 · 중복 제거 ${res.duplicates.length} · 무효 ${res.invalid.length}${inv ? ' (' + inv + ')' : ''}\n• 집계 실행: #${importClickSeq} (${srcTag}${fbTag}) · 활성 대상: ${recipients.length}명 (중소기업 후보:${lastFilterResult.retained.length} · 제외:${lastFilterResult.excluded.length} · 확인필요:${lastFilterResult.review.length})\n• 수신 대상 미리보기: ${validPreview || '없음'}${dupPreview ? '\n• 중복 제외: ' + dupPreview : ''}`;
      lastImportStatus = { cls: 'status-success', txt: localTxt + '\n• 로컬 가져오기 완료 · Sidecar 동기화 확인 중...' };
      setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
      say('status-success', localTxt);
      recordActivity('IMPORT', startedMs, res.valid.length, rawRows.length, 'LOCAL_IMPORT_OK', 'PENDING', `유효 ${res.valid.length}명 (중복 ${res.duplicates.length}, 무효 ${res.invalid.length})`);
      persist();
      renderWorkCenter();

      syncSidecarRecipients().then(syncRes => {
        const syncMsg = syncRes.synced ? 'Sidecar 동기화 성공' : `Sidecar 동기화 실패 (${syncRes.error || '오프라인/미연결'} — 로컬 작업 목록은 정상 보존됨)`;
        lastImportStatus = { cls: 'status-success', txt: `${localTxt}\n• 로컬 가져오기 완료 / ${syncMsg}` };
        setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
        recordActivity('SIDECAR_SYNC', Date.now(), res.valid.length, res.valid.length, syncRes.synced ? 'SYNC_OK' : 'SYNC_FAILED', syncRes.synced ? 'OK' : 'OFFLINE', syncMsg);
        persist();
      });
    } catch (err) {
      workflowState.import = { state: 'FAILED', detail: err.code || 'ERROR' };
      lastImportStatus = {
        cls: 'status-error',
        txt: `❌ [${err.code || 'ERR_CSV_IMPORT_EXCEPTION'} · #${importClickSeq}] 가져오기 처리 중 오류가 발생했습니다: ${err.message}\n• 다시 시도 방법: CSV 입력값을 확인하거나 페이지를 새로고침한 뒤 "가져오기 · 중복 제거"를 다시 클릭하세요.`
      };
      setRegion('importProgress', lastImportStatus.cls, lastImportStatus.txt);
      say(lastImportStatus.cls, lastImportStatus.txt);
      recordActivity('IMPORT', startedMs, 0, 0, err.code || 'ERR_CSV_IMPORT_EXCEPTION', 'SKIPPED', err.message);
      persist();
      renderWorkCenter();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  if (el('btnImportRecipients')) {
    el('btnImportRecipients').dataset.rmBound = 'true';
    el('btnImportRecipients').onclick = () => runRecipientImport('button-click', null);
  }
  if (el('btnApplySmeFilter')) {
    el('btnApplySmeFilter').onclick = () => {
      const startedMs = Date.now();
      const btn = el('btnApplySmeFilter');
      if (btn) btn.disabled = true;
      try {
        const RM = getActiveRM();
        if (!allValidRecipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-filter', null);
        }
        if (!allValidRecipients.length) {
          workflowState.filter = { state: 'FAILED', detail: 'CSV 없음' };
          lastFilterStatus = { cls: 'status-blocked', txt: '⚠️ [NO_RECIPIENTS_FOR_FILTER] 먼저 CSV를 입력하고 "가져오기 · 중복 제거"를 실행하세요.' };
          setRegion('filterProgress', lastFilterStatus.cls, lastFilterStatus.txt);
          say(lastFilterStatus.cls, lastFilterStatus.txt);
          recordActivity('SME_FILTER', startedMs, 0, 0, 'NO_RECIPIENTS_FOR_FILTER', 'N/A', '수신자 없음');
          renderWorkCenter();
          return;
        }
        filterStale = false;
        renderSmeFilterSummary(RM);
        recipients = lastFilterResult.retained;
        queue = null;
        workflowState.filter = { state: 'SUCCESS', detail: `유지 ${lastFilterResult.retained.length}` };
        workflowState.review = { state: lastFilterResult.review.length ? 'PARTIAL' : 'SUCCESS', detail: `검토 ${lastFilterResult.review.length}` };
        activeTab = 'RETAINED';
        pageIndex = 0;
        const msg = `🎯 [대상 필터 적용 완료] 원본 유효 ${allValidRecipients.length}명 중 중소기업 후보 ${lastFilterResult.retained.length}명 선택됨 · 제외 ${lastFilterResult.excluded.length}명 · 확인 필요(UNKNOWN_REVIEW) ${lastFilterResult.review.length}명`;
        lastFilterStatus = { cls: recipients.length ? 'status-success' : 'status-blocked', txt: msg };
        setRegion('filterProgress', lastFilterStatus.cls, lastFilterStatus.txt);
        say(lastFilterStatus.cls, msg);
        recordActivity('SME_FILTER', startedMs, lastFilterResult.retained.length, allValidRecipients.length, 'FILTER_APPLIED', 'LOCAL', `유지 ${lastFilterResult.retained.length} / 제외 ${lastFilterResult.excluded.length} / 검토 ${lastFilterResult.review.length}`);
        persist();
        renderWorkCenter();
      } catch (err) {
        workflowState.filter = { state: 'FAILED', detail: 'ERROR' };
        lastFilterStatus = { cls: 'status-error', txt: `❌ [ERR_SME_FILTER] ${err.message}` };
        setRegion('filterProgress', lastFilterStatus.cls, lastFilterStatus.txt);
        say('status-error', lastFilterStatus.txt);
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }
  if (el('btnVerifyRecipientDns')) {
    el('btnVerifyRecipientDns').onclick = async () => {
      const startedMs = Date.now();
      const btn = el('btnVerifyRecipientDns');
      if (btn) btn.disabled = true;
      try {
        if (!el('dnsVerifyOptIn') || !el('dnsVerifyOptIn').checked) {
          workflowState.dns = { state: 'SKIPPED', detail: '미동의' };
          lastDnsStatus = { cls: 'status-blocked', txt: '⚠️ [DNS_VERIFY_OPT_IN_REQUIRED] 도메인 DNS(MX/A) 유효성 검사를 실행하려면 아래 동의 체크박스를 먼저 선택하세요.' };
          setRegion('dnsProgress', lastDnsStatus.cls, lastDnsStatus.txt);
          say(lastDnsStatus.cls, lastDnsStatus.txt);
          recordActivity('DNS_VERIFY', startedMs, 0, allValidRecipients.length, 'DNS_VERIFY_OPT_IN_REQUIRED', 'SKIPPED', 'DNS 동의 체크박스 미선택');
          renderWorkCenter();
          return;
        }
        if (!allValidRecipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-dns', null);
        }
        if (!allValidRecipients.length) {
          workflowState.dns = { state: 'FAILED', detail: 'CSV 없음' };
          lastDnsStatus = { cls: 'status-blocked', txt: '⚠️ [NO_RECIPIENTS_FOR_DNS] 먼저 수신자 CSV를 가져오세요.' };
          setRegion('dnsProgress', lastDnsStatus.cls, lastDnsStatus.txt);
          say(lastDnsStatus.cls, lastDnsStatus.txt);
          return;
        }
        const domains = [...new Set(allValidRecipients.map(r => r.email.split('@')[1]).filter(Boolean))];
        workflowState.dns = { state: 'RUNNING', detail: `0/${domains.length}` };
        renderPipeline();
        const loadingTxt = `⏳ 수신 도메인 ${domains.length}개에 대한 DNS(MX/A) 유효성 확인 중 (개별 사서함 탐색 없음)...`;
        setRegion('dnsProgress', 'status-loading', loadingTxt);
        say('status-loading', loadingTxt);

        const { sidecarPort, sidecarToken } = getSidecarConfig();
        const mergedMap = {};
        let transportFailed = false;
        let transportErrMsg = '';
        for (let i = 0; i < domains.length; i += 25) {
          const batch = domains.slice(i, i + 25);
          const resp = await callBg({
            action: 'VERIFY_RECIPIENT_DOMAINS_DNS',
            sidecarPort,
            sidecarToken,
            payload: { optInDnsCheck: true, domains: batch }
          });
          if (!resp || !resp.ok || !resp.data || !resp.data.results) {
            transportFailed = true;
            transportErrMsg = (resp && (resp.data?.message || resp.error)) || `Sidecar(127.0.0.1:${sidecarPort}) 연결 실패`;
            break;
          }
          Object.assign(mergedMap, resp.data.results);
          setRegion('dnsProgress', 'status-loading', `⏳ DNS(MX/A) 진행 중: ${Math.min(i + batch.length, domains.length)}/${domains.length} 도메인...`);
          await new Promise(r => setTimeout(r, 0));
        }

        let readyCnt = 0, invCnt = 0, unkCnt = 0;
        for (const r of allValidRecipients) {
          const dom = r.email.split('@')[1];
          const dInfo = !transportFailed ? mergedMap[dom] : null;
          if (dInfo) {
            r.validityStatus = dInfo.validityStatus || 'UNKNOWN';
            r.dnsProvenance = dInfo.dnsProvenance || 'DNS_QUERIED';
          } else {
            r.validityStatus = 'UNKNOWN';
            r.dnsProvenance = transportFailed ? 'SIDECAR_OFFLINE_UNVERIFIED' : 'DNS_TIMEOUT_OR_UNAVAILABLE';
          }
          if (r.validityStatus === 'DNS_MAIL_READY') readyCnt++;
          else if (r.validityStatus === 'INVALID') invCnt++;
          else unkCnt++;
        }

        const RM = getActiveRM();
        renderSmeFilterSummary(RM);
        recipients = (el('filterSmeOnly') && el('filterSmeOnly').checked) ? lastFilterResult.retained : allValidRecipients.filter(r => r.validityStatus !== 'INVALID');

        if (transportFailed) {
          workflowState.dns = { state: 'FAILED', detail: 'Sidecar 오프라인' };
          const failTxt = `❌ [SIDECAR_TRANSPORT_FAILED] Sidecar 연결 실패로 실제 DNS 조회를 수행하지 못했습니다 (${transportErrMsg}).\n• DNS_MAIL_READY: 0명 · INVALID: 0명 · UNKNOWN(응답지연/미확인): ${unkCnt}명 (허위 무효 처리 안 함)\n※ 주의: 도메인 MX/A 확인은 메일 서버 설정 여부만 뜻하며, 개별 사서함(Inbox) 실존을 보장하지 않습니다.`;
          lastDnsStatus = { cls: 'status-error', txt: failTxt };
          setRegion('dnsProgress', 'status-error', failTxt);
          say('status-error', failTxt);
          recordActivity('DNS_VERIFY', startedMs, 0, domains.length, 'SIDECAR_TRANSPORT_FAILED', 'FAILED', transportErrMsg);
        } else {
          workflowState.dns = { state: unkCnt > 0 && readyCnt === 0 ? 'PARTIAL' : 'SUCCESS', detail: `확인 ${readyCnt}` };
          const okTxt = `🔍 [도메인 DNS(MX/A) 유효성 검사 완료 — 총 ${allValidRecipients.length}명]\n• DNS_MAIL_READY(메일서버 확인): ${readyCnt}명 · INVALID(NXDOMAIN/NullMX): ${invCnt}명 · UNKNOWN(응답지연/미확인): ${unkCnt}명\n※ 주의: 도메인 MX/A 확인은 메일 서버 설정 여부만 뜻하며, 개별 사서함(Inbox) 실존을 보장하지 않습니다.`;
          lastDnsStatus = { cls: readyCnt > 0 ? 'status-success' : 'status-blocked', txt: okTxt };
          setRegion('dnsProgress', lastDnsStatus.cls, okTxt);
          say(lastDnsStatus.cls, okTxt);
          recordActivity('DNS_VERIFY', startedMs, domains.length, domains.length, 'DNS_CHECK_OK', 'OK', `READY:${readyCnt} INVALID:${invCnt} UNKNOWN:${unkCnt}`);
        }
        persist();
        renderWorkCenter();
      } catch (err) {
        workflowState.dns = { state: 'FAILED', detail: 'ERROR' };
        lastDnsStatus = { cls: 'status-error', txt: `❌ [ERR_DNS_VERIFY_FAILED] ${err.message}` };
        setRegion('dnsProgress', 'status-error', lastDnsStatus.txt);
        say('status-error', lastDnsStatus.txt);
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }
  function triggerCsvDownload(filename, content) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (el('btnExportRetainedCsv')) {
    el('btnExportRetainedCsv').onclick = () => {
      const RM = getActiveRM();
      if (!lastFilterResult.retained.length) return say('status-blocked', '⚠️ 저장할 중소기업(유지) 목록이 없습니다.');
      workflowState.export = { state: 'SUCCESS', detail: '유지 CSV' };
      triggerCsvDownload('xpider_sme_retained.csv', RM.recipientsToCsv(lastFilterResult.retained));
      renderWorkCenter();
    };
  }
  if (el('btnExportExcludedCsv')) {
    el('btnExportExcludedCsv').onclick = () => {
      const RM = getActiveRM();
      if (!lastFilterResult.excluded.length) return say('status-blocked', '⚠️ 저장할 제외 목록이 없습니다.');
      workflowState.export = { state: 'SUCCESS', detail: '제외 CSV' };
      triggerCsvDownload('xpider_excluded_recipients.csv', RM.recipientsToCsv(lastFilterResult.excluded));
      renderWorkCenter();
    };
  }
  if (el('btnExportReviewCsv')) {
    el('btnExportReviewCsv').onclick = () => {
      const RM = getActiveRM();
      if (!lastFilterResult.review.length) return say('status-blocked', '⚠️ 저장할 확인 필요(UNKNOWN_REVIEW) 목록이 없습니다.');
      workflowState.export = { state: 'SUCCESS', detail: '검토 CSV' };
      triggerCsvDownload('xpider_unknown_review_recipients.csv', RM.recipientsToCsv(lastFilterResult.review));
      renderWorkCenter();
    };
  }
  if (el('btnExportOriginalCsv')) {
    el('btnExportOriginalCsv').onclick = () => {
      if (!originalRawCsv) return say('status-blocked', '⚠️ 보존된 원본 CSV가 없습니다.');
      workflowState.export = { state: 'SUCCESS', detail: '원본 CSV' };
      triggerCsvDownload('xpider_original_imported.csv', originalRawCsv);
      renderWorkCenter();
    };
  }
  if (el('btnExportActiveTabCsv')) {
    el('btnExportActiveTabCsv').onclick = () => {
      if (activeTab === 'ORIGINAL') {
        if (!originalRawCsv) return setRegion('filterProgress', 'status-blocked', '⚠️ 내보낼 원본 CSV가 없습니다.');
        triggerCsvDownload('xpider_tab_original.csv', originalRawCsv);
        return;
      }
      const rows = getTabRows(activeTab);
      if (!rows.length) return setRegion('filterProgress', 'status-blocked', `⚠️ [${activeTab}] 탭에 내보낼 데이터가 없습니다.`);
      const RM = getActiveRM();
      triggerCsvDownload(`xpider_tab_${activeTab.toLowerCase()}.csv`, RM.recipientsToCsv(rows));
    };
  }
  if (el('recipientDataTabs')) {
    for (const btn of el('recipientDataTabs').querySelectorAll('button[data-rtab]')) {
      btn.onclick = () => { activeTab = btn.dataset.rtab; pageIndex = 0; renderWorkCenter(); };
    }
  }
  if (el('recipientTableSearch')) {
    el('recipientTableSearch').oninput = () => { searchQuery = el('recipientTableSearch').value || ''; pageIndex = 0; renderWorkCenter(); };
  }
  if (el('btnTablePrev')) el('btnTablePrev').onclick = () => { pageIndex = Math.max(0, pageIndex - 1); renderWorkCenter(); };
  if (el('btnTableNext')) el('btnTableNext').onclick = () => { pageIndex++; renderWorkCenter(); };
  if (el('chkSelectAllRows')) {
    el('chkSelectAllRows').onchange = () => {
      const checked = el('chkSelectAllRows').checked;
      for (const r of getTabRows(activeTab)) {
        if (r.email) { if (checked) selectedEmails.add(r.email); else selectedEmails.delete(r.email); }
      }
      renderWorkCenter();
    };
  }
  for (const fid of ['recipientCsv', 'filterSmeOnly', 'filterExcludePersonal', 'filterExcludeGov', 'filterExcludeEcommerce', 'filterExcludePortal', 'filterExcludeLarge', 'filterIncludeReview', 'customSmeDomains', 'customExcludeDomains']) {
    if (el(fid)) {
      el(fid).addEventListener('change', () => {
        if (allValidRecipients.length) {
          filterStale = true;
          setRegion('filterProgress', 'status-blocked', '⚠️ [FILTER_STALE] 입력 또는 필터 옵션이 변경되었습니다. "🎯 대상 필터 적용 · 제외 사유 확인"을 다시 클릭하세요.');
          renderWorkCenter();
        }
      });
    }
  }
  if (el('btnPreviewVariantA')) {
    el('btnPreviewVariantA').onclick = () => {
      render();
      if (el('abDashboardStatus')) el('abDashboardStatus').textContent = '👁️ 현재 미리보기 창에 [A안 (기본 편집창)]이 표시되고 있습니다.';
    };
  }
  if (el('btnPreviewVariantB')) {
    el('btnPreviewVariantB').onclick = () => {
      const v = values();
      v.subject = el('abSubjectB') ? el('abSubjectB').value.trim() : v.subject;
      v.preheader = el('abPreheaderB') ? el('abPreheaderB').value.trim() : v.preheader;
      v.body = el('abBodyB') ? el('abBodyB').value.trim() : v.body;
      if (el('preview')) el('preview').srcdoc = htmlFor(v, true);
      if (el('abDashboardStatus')) el('abDashboardStatus').textContent = `👁️ 현재 미리보기 창에 [B안: ${v.subject}]이 표시되고 있습니다.`;
    };
  }
  if (el('btnRunAbDryRun')) {
    el('btnRunAbDryRun').onclick = async () => {
      try {
        if (el('abEnabled')) el('abEnabled').checked = true;
        const RM = getActiveRM();
        if (!recipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-ab-dryrun', null);
        }
        if (!recipients.length) return say('status-blocked', '⚠️ [NO_RECIPIENTS_LOADED] 먼저 수신자 CSV를 가져오세요.');
        queue = RM.createQueue(buildReview().entries);
        const sum = await RM.runQueue(queue, async () => ({ ok: true, dryRun: true }), { delayMs: 0 });
        persist();
        renderAbDashboard(RM);
        say('status-success', `✅ A/B 분할 드라이런 완료 (실제 발송 0건)\n${JSON.stringify(sum)}`);
      } catch (err) {
        say('status-error', `❌ [ERR_AB_DRY_RUN] ${err.message}`);
      }
    };
  }
  if (el('recipientFile')) {
    el('recipientFile').onchange = async (ev) => {
      try {
        const f = ev.target && ev.target.files && ev.target.files[0];
        if (!f) return;
        const text = await f.text();
        if (el('recipientCsv')) el('recipientCsv').value = text;
        ev.target.value = '';
        runRecipientImport('file-picker', f.name || 'selected.csv');
      } catch (err) {
        say('status-error', `❌ [ERR_FILE_READ_FAILED] CSV 파일 읽기 실패: ${err.message}`);
      }
    };
  }
  if (el('btnBuildReview')) {
    el('btnBuildReview').onclick = () => {
      try {
        if (!recipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-review', null);
        }
        if (!recipients.length) return say('status-blocked', '⚠️ [NO_RECIPIENTS_LOADED] 먼저 수신자 CSV를 입력하고 "가져오기 · 중복 제거"를 클릭하세요.');
        const rv = buildReview();
        const s = rv.summary;
        syncSidecarRecipients();
        say(s.ready ? 'status-success' : 'status-blocked',
          `📋 발송 전 검토 (${messageKind()})\n• 전체 ${s.total} · 발송 가능 ${s.ready} · 수신거부 제외 ${s.suppressed} · 동의 미확인 제외 ${s.noConsent}\n• 상용 발송: ✅ 잠금 해제됨 (적법 수신 근거 + 동의 원장 확인된 수신자에게만 발송)\n• 드라이런은 실제 이메일을 전송하지 않습니다.`);
      } catch (err) {
        say('status-error', `❌ [${err.code || 'ERR_BUILD_REVIEW_FAILED'}] ${err.message}`);
      }
    };
  }
  if (el('btnCheckProdPreflight')) {
    el('btnCheckProdPreflight').onclick = async () => {
      const pBox = el('prodPreflightStatus');
      if (!pBox) return;
      pBox.className = 'status-box status-loading';
      pBox.textContent = '⏳ vivpr.pro 실시간 DNS 및 Sidecar 운영 준비 상태 점검 중...';
      await syncSidecarRecipients();
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({ action: 'GET_EMAIL_PRODUCTION_PREFLIGHT', sidecarPort, sidecarToken });
      if (!r || !r.ok || !r.data) {
        pBox.className = 'status-box status-error';
        pBox.textContent = `❌ 운영 점검 실패 (HTTP ${r?.httpStatus || '-'}): Sidecar 연결/페어링을 먼저 확인하세요.`;
        return;
      }
      const d = r.data;
      const dns = d.dns || {};
      const rdc = d.resendDomainConfig || {};
      const qs = d.queueSummary || {};
      const todo = Array.isArray(d.minimalAuthorizationNeededForSingleLiveSend) ? d.minimalAuthorizationNeededForSingleLiveSend : [];
      currentProviderDomainStatus = d.externalDnsStatus || 'BLOCKED_EXTERNAL_DNS';
      render();
      const gateAction = d.deliverabilityGate?.action || 'BLOCK';
      const gateReasons = Array.isArray(d.deliverabilityGate?.reasons) ? d.deliverabilityGate.reasons : [];
      const consentedCount = Number(qs.consentedRecordsOnDisk || 0);
      const qReadyCount = Number(qs.counts?.PENDING || 0);
      const qBadge = el('prodQueueBadge');
      if (qBadge) {
        qBadge.textContent = (qReadyCount > 0 && consentedCount > 0 && gateAction !== 'BLOCK')
          ? `🟢 QUEUE READY — ${qReadyCount} VERIFIED OPT-IN`
          : `⏸️ QUEUE NOT READY — ${qReadyCount > 0 ? qReadyCount : 0} QUEUED / ${consentedCount} DOCUMENTED OPT-IN`;
      }
      pBox.className = (d.externalDnsStatus === 'VERIFIED' && gateAction !== 'BLOCK') ? 'status-box status-success' : 'status-box status-blocked';
      pBox.textContent = [
        `🔍 [운영 발송 점검 — PRODUCTION UNLOCKED · 큐 상태: ${(qReadyCount > 0 && gateAction !== 'BLOCK') ? 'QUEUE READY' : 'QUEUE NOT READY — 0 ELIGIBLE QUEUED OPT-IN RECIPIENTS'}]`,
        `• 도메인/DNS (${d.domain || 'vivpr.pro'}): ${d.externalDnsStatus || 'BLOCKED_EXTERNAL_DNS'} (Resend=${rdc.registered ? rdc.status : 'UNREGISTERED'}, SPF=${dns.spf?.pass ? 'PASS' : 'FAIL'}, DKIM=${dns.dkim?.pass ? 'PASS' : 'FAIL'}, DMARC=${dns.dmarc?.pass ? 'PASS' : 'FAIL'})`,
        `• NTFS 동의 원장: ${consentedCount}건 | 활성 큐 대기: ${qReadyCount}건 | 수신거부/반송 원장: ${qs.suppressedRecordsOnDisk || 0}건`,
        `• 공개 HTTPS 수신거부 & Svix 웹훅: ${d.publicUnsubscribeHttpsStatus || 'UNKNOWN'} / ${d.webhookEndpoint || 'WORKING'}`,
        ...(gateReasons.length ? [`• 현재 큐 차단 사유: ${gateReasons.join(', ')} (수집 CSV는 동의로 간주되지 않으며, 동의 확인 체크 + 가져오기 필요)`] : ['• 모든 기술·동의 게이트 통과 — 동의된 수신자에게 발송 가능']),
        ...(todo.length ? [`• 추가 필요 조치 (${todo.length}건):`, ...todo.map(x => `  - ${x}`)] : [])
      ].join('\n');
    };
  }
  if (el('btnProdSend')) {
    el('btnProdSend').onclick = async () => {
      const pBox = el('prodPreflightStatus');
      if (!pBox) return;
      if (!recipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
        runRecipientImport('auto-before-prod-send', null);
      }
      if (!recipients.length) {
        pBox.className = 'status-box status-blocked';
        pBox.textContent = '⚠️ [NO_RECIPIENTS_LOADED] 먼저 수신자 CSV를 입력하고 수신 동의 확인 체크 후 "가져오기 · 중복 제거"를 클릭하세요.';
        return;
      }
      const v = values();
      const subjectVal = (v.subject || '').trim();
      if (!subjectVal) {
        pBox.className = 'status-box status-blocked';
        pBox.textContent = '⚠️ [SUBJECT_REQUIRED] 이메일 제목을 입력하세요.';
        return;
      }
      pBox.className = 'status-box status-loading';
      pBox.textContent = '⏳ 동의 원장 · 원격 수신거부 · 도메인 게이트 검증 및 운영 발송 진행 중...';
      const syncResult = await syncSidecarRecipients();
      if (syncResult && syncResult.synced === false && recipients.length > 0) {
        pBox.className = 'status-box status-error';
        pBox.textContent = `❌ [Sidecar 수신자 동기화 실패 — 발송 차단] HTTP ${syncResult.httpStatus || '-'}: ${syncResult.error || 'SYNC_FAILED'}`;
        return;
      }
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const pre = await callBg({ action: 'GET_EMAIL_PRODUCTION_PREFLIGHT', sidecarPort, sidecarToken });
      const counts = pre?.data?.queueSummary?.counts || {};
      const eligibleCount = Number(counts.PENDING || 0);
      const consentedOnDisk = Number(pre?.data?.queueSummary?.consentedRecordsOnDisk || 0);
      const gateOkNow = Boolean(pre?.ok && pre?.data?.deliverabilityGate?.action !== 'BLOCK' && eligibleCount > 0);
      if (el('prodQueueBadge')) {
        el('prodQueueBadge').textContent = gateOkNow
          ? `🟢 QUEUE READY — ${eligibleCount} VERIFIED OPT-IN`
          : `⏸️ QUEUE NOT READY — ${eligibleCount} QUEUED / ${consentedOnDisk} DOCUMENTED OPT-IN`;
      }
      if (el('headerProdStateBadge')) {
        el('headerProdStateBadge').textContent = gateOkNow
          ? `✅ 상용발송 잠금 해제 · 발송 가능 ${eligibleCount}건`
          : `✅ 상용발송 잠금 해제 · 발송대상/자격 확인 필요 (발송 가능 ${eligibleCount}건 / 권한기록 ${consentedOnDisk}건)`;
      }
      if (!gateOkNow) {
        pBox.className = 'status-box status-blocked';
        pBox.textContent = `🛑 [발송 차단 — 적격 발송 대기 ${eligibleCount}건 / 기존 발송권한 기록 ${consentedOnDisk}건 / 미동의·미확인 제외 ${counts.SKIPPED_NO_CONSENT || 0}건 / 수신거부 제외 ${counts.SKIPPED_SUPPRESSED || 0}건 / 기발송 ${counts.ACCEPTED || 0}건]\n• 사유: ${(pre?.data?.deliverabilityGate?.reasons || ['RECIPIENT_AUTHORIZATION_UNKNOWN']).join(', ')}\n• 안내: 위 "이 수신리스트에 대한 적법한 발송 권한을 확인했습니다" 체크박스를 선택했는지 확인하세요 (수집/스크래핑 목록은 제외됨).`;
        return;
      }
      pBox.className = 'status-box status-loading';
      pBox.textContent = `⏳ 적격 발송 대기 ${eligibleCount}건에 대해 Resend 운영 발송 진행 중... (ACCEPTED ≠ DELIVERED)`;
      if (!livePollTimer) {
        livePollTimer = setInterval(refreshCampaignProgress, 3000);
        if (el('btnToggleLivePoll')) el('btnToggleLivePoll').textContent = '⏸️ 자동 폴링 중지';
      }
      const r = await callBg({
        action: 'RUN_EMAIL_PRODUCTION_QUEUE',
        sidecarPort,
        sidecarToken,
        payload: {
          mode: 'LIVE_PRODUCTION',
          subject: subjectVal,
          html: htmlFor(v),
          text: textFor(v)
        }
      });
      if (!r || !r.data) {
        pBox.className = 'status-box status-error';
        pBox.textContent = `❌ 운영 발송 요청 실패 (HTTP ${r?.httpStatus || '-'}): Sidecar 연결을 확인하세요.`;
        return;
      }
      const out = r.data;
      if (!r.ok || out.status === 'BLOCKED') {
        pBox.className = 'status-box status-blocked';
        pBox.textContent = `🛑 [운영 발송 차단 — Fail-Closed] 사유: ${out.reason || 'BLOCKED'}\n• 세부 사유: ${(out.blockingReasons || []).join(', ') || '-'}`;
        return;
      }
      const c = out.summary?.counts || {};
      pBox.className = 'status-box status-success';
      pBox.textContent = [
        `✅ [운영 발송 완료 — 상태: ${out.status}]`,
        `• 이번 실행 실제 발송: ${out.sentInThisRun || 0}건 | ACCEPTED: ${c.ACCEPTED || 0}건 | FAILED: ${c.FAILED || 0}건`,
        `• 제외(미동의): ${(c.SKIPPED_NO_CONSENT || 0) + (c.BLOCKED_CONSENT_UNVERIFIED || 0)}건 | 제외(수신거부): ${c.SKIPPED_SUPPRESSED || 0}건`
      ].join('\n');
    };
  }
  if (el('btnProdStop')) {
    el('btnProdStop').onclick = async () => {
      const pBox = el('prodPreflightStatus');
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({ action: 'STOP_EMAIL_PRODUCTION_QUEUE', sidecarPort, sidecarToken, payload: {} });
      if (pBox) {
        pBox.className = r?.ok ? 'status-box status-blocked' : 'status-box status-error';
        pBox.textContent = r?.ok ? '⏹️ 운영 발송 큐가 안전하게 중지되었습니다.' : `❌ 큐 중지 요청 실패: ${r?.error || '-'}`;
      }
      refreshCampaignProgress();
    };
  }

  let livePollTimer = null;
  let lastSyncDisplay = '-';
  async function refreshCampaignProgress() {
    const sumBox = el('campaignMonitorSummary');
    const syncBadge = el('monitorSyncBadge');
    const { sidecarPort, sidecarToken } = getSidecarConfig();
    const r = await callBg({ action: 'GET_CAMPAIGN_PROGRESS', sidecarPort, sidecarToken, campaignId: 'default' });
    if (!r || !r.ok || !r.data) {
      if (syncBadge) syncBadge.textContent = `연결 끊김 / 마지막 동기화: ${lastSyncDisplay}`;
      if (sumBox) sumBox.className = 'status-box status-blocked';
      return;
    }
    const d = r.data;
    lastSyncDisplay = d.lastSyncAt || d.updatedAt || new Date().toISOString();
    if (syncBadge) syncBadge.textContent = `동기화: ${d.syncStatus || 'OK'} (${lastSyncDisplay.slice(11, 19)}Z)`;
    if (el('progAcceptedBar')) el('progAcceptedBar').value = Math.min(100, Math.max(0, Number(d.acceptedPct || 0)));
    if (el('progAcceptedText')) el('progAcceptedText').textContent = `${d.apiAccepted || 0} / ${d.target || 0} (${d.acceptedPct || 0}%)`;
    if (el('progDeliveredBar')) el('progDeliveredBar').value = Math.min(100, Math.max(0, Number(d.deliveredPct || 0)));
    if (el('progDeliveredText')) el('progDeliveredText').textContent = `${d.delivered || 0} / ${d.target || 0} (${d.deliveredPct || 0}%)`;
    if (sumBox) {
      const errKeys = Object.entries(d.errorsSummary || {}).map(([k, v]) => `${k}: ${v}건`).join(', ');
      sumBox.className = (d.failed > 0 || d.bounced > 0 || d.complained > 0) ? 'status-box status-blocked' : 'status-box status-success';
      sumBox.textContent = [
        `📌 캠페인: ${d.campaignId} | 배치: ${d.batchId} | 상태: ${d.stopped ? 'STOPPED/PAUSED' : (d.finishedAt ? 'FINISHED' : 'ACTIVE')}`,
        `• 대상(Target): ${d.target} | 미제출(Remaining): ${d.remainingToSubmit} | 발송중(In-Flight): ${d.inFlight}`,
        `• API 접수(ACCEPTED): ${d.apiAccepted} | 전달 대기(Pending): ${d.deliveryPending} | 전달 확인(DELIVERED): ${d.delivered}`,
        `• 오픈(Unique): ${d.openedUnique} | 클릭(Unique): ${d.clickedUnique} | 반송(Bounce): ${d.bounced} (Hard=${d.bouncedHard}, Soft=${d.bouncedSoft}) | 스팸신고: ${d.complained}`,
        `• 실패(FAILED): ${d.failed} | 제외/수신거부: ${d.suppressed} (Unsub=${d.unsubscribed})`,
        ...(errKeys ? [`• 실패 사유: ${errKeys}`] : [])
      ].join('\n');
    }
  }
  if (el('btnRefreshCampaignProgress')) el('btnRefreshCampaignProgress').onclick = refreshCampaignProgress;
  if (el('btnReconcileResendHistory')) {
    el('btnReconcileResendHistory').onclick = async () => {
      const sumBox = el('campaignMonitorSummary');
      if (sumBox) { sumBox.className = 'status-box status-loading'; sumBox.textContent = '⏳ Resend API 이력 대조 중 (최대 25건)...'; }
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      await callBg({ action: 'RECONCILE_CAMPAIGN_RESEND', sidecarPort, sidecarToken, payload: { campaignId: 'default', limit: 25 } });
      await refreshCampaignProgress();
    };
  }
  if (el('btnToggleLivePoll')) {
    el('btnToggleLivePoll').onclick = () => {
      if (livePollTimer) {
        clearInterval(livePollTimer);
        livePollTimer = null;
        el('btnToggleLivePoll').textContent = '⏱️ 자동 폴링 켜기 (3초)';
      } else {
        refreshCampaignProgress();
        livePollTimer = setInterval(refreshCampaignProgress, 3000);
        el('btnToggleLivePoll').textContent = '⏸️ 자동 폴링 중지';
      }
    };
  }
  if (el('btnPreviewSecondWave')) {
    el('btnPreviewSecondWave').onclick = async () => {
      const box = el('secondWaveStatus');
      const cutoffHours = Number(el('secondWaveCutoffHours')?.value ?? 24);
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const [segR, prevR] = await Promise.all([
        callBg({ action: 'GET_CAMPAIGN_SEGMENTS', sidecarPort, sidecarToken, campaignId: 'default', cutoffHours }),
        callBg({ action: 'PREVIEW_SECOND_WAVE', sidecarPort, sidecarToken, payload: { parentCampaignId: 'default', cutoffHours } })
      ]);
      if (!prevR?.ok || !prevR.data) {
        if (box) { box.className = 'status-box status-error'; box.textContent = `❌ 2차 발송 미리보기 실패: ${prevR?.error || '-'}`; }
        return;
      }
      const p = prevR.data;
      const s = segR?.data || {};
      if (box) {
        box.className = p.eligibleCount > 0 ? 'status-box status-success' : 'status-box status-blocked';
        box.textContent = [
          `🔍 [세그먼트 및 2차 발송 미리보기 — 기준: ${p.cutoffHours}시간 경과]`,
          `• 확인된 오픈(Opened): ${s.openedCount || 0}명 | 미오픈 적격 후보(Not Confirmed Opened): ${p.eligibleCount}명`,
          `• 전달 미확인/대기: ${s.acceptedPendingDeliveryCount || 0}명 | 제외(반송·신고·수신거부·기발송): ${p.excludedCount}명`,
          `• 대상 웨이브 ID: ${p.waveCampaignId} | 주의: ${p.caveat}`
        ].join('\n');
      }
    };
  }
  if (el('btnStartSecondWave')) {
    el('btnStartSecondWave').onclick = async () => {
      const box = el('secondWaveStatus');
      const cutoffHours = Number(el('secondWaveCutoffHours')?.value ?? 24);
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const prevR = await callBg({ action: 'PREVIEW_SECOND_WAVE', sidecarPort, sidecarToken, payload: { parentCampaignId: 'default', cutoffHours } });
      const p = prevR?.data;
      if (!prevR?.ok || !p || p.eligibleCount <= 0) {
        if (box) { box.className = 'status-box status-blocked'; box.textContent = `🛑 2차 발송 불가: 적격 미오픈 수신자가 0명입니다 (반송/수신거부/전달미확인 제외됨).`; }
        return;
      }
      const v = values();
      const subject = (v.subject || '').trim();
      if (!subject) {
        if (box) { box.className = 'status-box status-blocked'; box.textContent = '⚠️ 2차 발송 제목을 먼저 입력하세요.'; }
        return;
      }
      if (typeof window.confirm === 'function') {
        if (!window.confirm(`미오픈 적격 수신자 ${p.eligibleCount}명에게 2차 발송(${p.waveCampaignId})을 시작할까요?\n(반송·스팸신고·수신거부 대상은 이미 제외되었습니다.)`)) return;
      }
      const r = await callBg({
        action: 'START_SECOND_WAVE',
        sidecarPort,
        sidecarToken,
        payload: {
          parentCampaignId: 'default',
          waveCampaignId: p.waveCampaignId,
          cutoffHours,
          subject,
          html: htmlFor(v),
          text: textFor(v),
          messageKind: messageKind(),
          ownerConfirmed: true
        }
      });
      if (box) {
        box.className = r?.ok ? 'status-box status-success' : 'status-box status-error';
        box.textContent = r?.ok
          ? `✅ 2차 발송 완료 (${r.data.waveCampaignId}): 이번 발송 ${r.data.sentInThisRun || 0}건`
          : `❌ 2차 발송 차단/실패: ${r?.data?.reason || r?.error || '-'}`;
      }
      refreshCampaignProgress();
    };
  }
  if (el('btnRefreshMasterList')) {
    el('btnRefreshMasterList').onclick = async () => {
      const box = el('masterListStatus');
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({ action: 'GET_MASTER_LIST_SUMMARY', sidecarPort, sidecarToken });
      if (!r?.ok || !r.data) {
        if (box) { box.className = 'status-box status-error'; box.textContent = `❌ 마스터 목록 조회 실패: ${r?.error || '-'}`; }
        return;
      }
      const m = r.data;
      if (box) {
        box.className = 'status-box status-success';
        box.textContent = `👥 마스터 수신자 목록: 전체 ${m.total}명 | 발송 가능 ${m.activeEligible}명 | 수신거부/반송 제외 ${m.suppressedCount}명 | 전달 확인 ${m.deliveredCount}명 | 오픈 확인 ${m.openedCount}명 (${m.updatedAt || ''})`;
      }
    };
  }
  if (el('btnExportMasterListCsv')) {
    el('btnExportMasterListCsv').onclick = async () => {
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({ action: 'EXPORT_MASTER_LIST_CSV', sidecarPort, sidecarToken });
      if (r?.ok && r.data?.csvText) {
        download('xpider_master_recipient_list.csv', 'text/csv;charset=utf-8', '\uFEFF' + r.data.csvText);
      }
    };
  }
  setTimeout(() => { try { refreshCampaignProgress(); } catch (_) {} }, 120);
  if (el('btnDryRun')) {
    el('btnDryRun').onclick = async () => {
      try {
        const RM = getActiveRM();
        if (!recipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-dryrun', null);
        }
        if (!recipients.length) return say('status-blocked', '⚠️ [NO_RECIPIENTS_LOADED] 먼저 수신자 CSV를 입력하고 "가져오기 · 중복 제거"를 클릭하세요.');
        if (!queue) queue = RM.createQueue(buildReview().entries);
        say('status-loading', '⏳ 드라이런 진행 중 (발송 없음)...');
        const sum = await RM.runQueue(queue, async () => ({ ok: true, dryRun: true }), { delayMs: 0 });
        persist();
        renderAbDashboard(RM);
        say('status-success', `✅ 드라이런 완료 (실제 발송 0건)\n${JSON.stringify(sum)}`);
      } catch (err) {
        say('status-error', `❌ [${err.code || 'ERR_DRY_RUN_FAILED'}] ${err.message}`);
      }
    };
  }
  if (el('btnQueueStop')) {
    el('btnQueueStop').onclick = () => {
      try {
        const RM = getActiveRM();
        if (queue) { RM.stopQueue(queue); persist(); say('status-blocked', '⏸️ 중지됨. "이어서"로 재개하세요.'); }
        else say('status-blocked', '⚠️ 중지할 실행 중인 큐가 없습니다.');
      } catch (err) { say('status-error', `❌ ${err.message}`); }
    };
  }
  if (el('btnQueueResume')) {
    el('btnQueueResume').onclick = () => {
      try {
        const RM = getActiveRM();
        if (queue) { RM.resumeNormalize(queue); el('btnDryRun').click(); }
        else say('status-blocked', '⚠️ 재개할 큐가 없습니다.');
      } catch (err) { say('status-error', `❌ ${err.message}`); }
    };
  }
  if (el('btnQueueCsv')) {
    el('btnQueueCsv').onclick = () => {
      try {
        const RM = getActiveRM();
        if (!queue) return say('status-blocked', '⚠️ 저장할 결과가 없습니다. 먼저 드라이런을 실행하세요.');
        const blob = new Blob(['\uFEFF' + RM.queueToCsv(queue)], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'xpider_recipient_status.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (err) { say('status-error', `❌ ${err.message}`); }
    };
  }
  restore();
})();
