
'use strict';
const ids=['kind','subject','preheader','brand','heading','body','image','alt','cta','link','reply','company','address','unsubscribe'];
const el=id=>document.getElementById(id);
const val=id=>el(id).value.trim();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}};
let previewFileUrl='';
const paragraphs=s=>s.split(/\n\s*\n/).filter(x=>x.trim()).map(x=>'<p style="margin:0 0 18px;line-height:1.65">'+esc(x.trim()).replace(/\n/g,'<br>')+'</p>').join('');
function values(){return Object.fromEntries(ids.map(i=>[i,val(i)]))}
function htmlFor(v,preview=false){
 const pic=preview ? (previewFileUrl || (el('loadRemoteImages').checked ? url(v.image) : '')) : url(v.image);
 const previewText=esc(v.preheader);
 const h='<h1 style="font-size:25px;margin:0 0 20px;line-height:1.3">'+esc(v.heading)+'</h1>';
 const img=pic?'<img src="'+esc(pic)+'" alt="'+esc(v.alt)+'" width="560" style="display:block;max-width:100%;width:100%;height:auto;border-radius:8px;margin:0 0 24px">':'';
 const button=url(v.link)&&v.cta?'<p style="margin:26px 0"><a href="'+esc(url(v.link))+'" style="display:inline-block;background:#2056a0;color:#ffffff;padding:12px 20px;border-radius:5px;text-decoration:none">'+esc(v.cta)+'</a></p>':'';
 const opt=v.kind==='marketing'&&url(v.unsubscribe)?'<p><a href="'+esc(url(v.unsubscribe))+'" style="color:#475569">구독 취소</a></p>':'';
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;margin:0;background:#f3f5f8;color:#17212f"><div style="display:none;font-size:1px;color:#f3f5f8;max-height:0;overflow:hidden">'+previewText+'</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8"><tr><td align="center" style="padding:28px 12px"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;background:#fff"><tr><td style="padding:34px 28px"><div style="font-size:17px;font-weight:bold;margin-bottom:28px">'+esc(v.brand)+'</div>'+h+img+paragraphs(v.body)+button+'<hr style="border:0;border-top:1px solid #e2e8f0;margin:32px 0"><div style="font-size:12px;line-height:1.6;color:#64748b">'+esc(v.company)+(v.address?'<p>'+esc(v.address)+'</p>':'')+opt+'</div></td></tr></table></td></tr></table></body></html>';
}
function textFor(v){return [v.brand,v.heading,v.body,v.cta&&url(v.link)?v.cta+': '+url(v.link):'',v.company,v.address,v.kind==='marketing'?'구독 취소: '+(url(v.unsubscribe)||'[수신거부 URL 필요]'):''].filter(Boolean).join('\n\n')}
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
  add(!!url(v.unsubscribe),'본문의 실제 작동하는 수신 거부 HTTPS 링크 필요',!!url(v.unsubscribe)?'PASS':'FAIL','제안: https://vivpr.pro/unsubscribe/{token} 형식의 수신거부 URL을 입력하세요.');
  add(!!v.address,'마케팅 발신자의 실제 우편주소 표기',!!v.address?'PASS':'FAIL','제안: 하단 푸터에 표기될 사업장 우편주소를 입력하세요.');
  add(false,'발송 단계에서 RFC 8058 원클릭 구독 취소 헤더 및 POST 작동 검증 필요','WARN','안내: 발송 엔진에서 List-Unsubscribe-Post 헤더가 함께 검증되어야 합니다.');
  add(false,'수신 동의·suppression 명단·Resend AUP 검증 필요','WARN','안내: 수신자 관리 카드에서 동의 확인 및 수신거부 명단 대조가 필요합니다.');
 }
 add(false,'SPF · DKIM · DMARC · 발신 도메인/계정 평판은 콘텐츠 검사 밖에서 검증','WARN','안내: 하단 [운영 DNS · 동의원장 · 수신거부 · 웹훅 점검]에서 별도 확인하세요.');
 return out;
}
let currentAiCopyStatus = 'NOT_CONFIGURED';
let currentAiStatusLabel = 'AI 자동 교정: 연결 필요';
let currentProviderDomainStatus = 'BLOCKED_EXTERNAL_DNS';
function updateContentQaStatusLine(checks){
 const badgeEl=el('contentQaBadges');
 if(!badgeEl)return;
 const hasFail=Array.isArray(checks)&&checks.some(c=>c.severity==='FAIL');
 const ruleStatus=hasFail?'FAIL':'PASS';
 badgeEl.textContent=`RULE_BASED_CONTENT_CHECK: ${ruleStatus} · AI_COPY_EDIT: ${currentAiCopyStatus} · PROVIDER_DOMAIN_AUTH: ${currentProviderDomainStatus} · SEND_BLOCKED: STRICT_HOLD`;
 const aiBadge=el('aiCopyStatusBadge');
 if(aiBadge)aiBadge.textContent=currentAiStatusLabel||(currentAiCopyStatus==='READY'?'AI 자동 교정: Gemini 준비됨':(currentAiCopyStatus==='ERROR'?'AI 자동 교정: 연결 오류':'AI 자동 교정: 연결 필요'));
}
function render(){
 try{
  const v=values();
  if(el('preview'))el('preview').srcdoc=htmlFor(v,true);
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
function download(name,type,content){const blob=new Blob([content],{type});const uri=URL.createObjectURL(blob);const a=document.createElement('a');a.href=uri;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(uri),500)}
if(el('imageFile'))el('imageFile').addEventListener('change',()=>{
 if(previewFileUrl)URL.revokeObjectURL(previewFileUrl);previewFileUrl='';
 const f=el('imageFile').files?.[0];if(!f)return render();
 if(!/^image\/(png|jpeg|webp|gif)$/.test(f.type)||f.size>3*1024*1024){alert('PNG/JPEG/WebP/GIF 3MB 이하 파일만 미리보기 가능합니다.');el('imageFile').value='';return render()}
 previewFileUrl=URL.createObjectURL(f);render();
});
for(const id of ids){if(el(id))el(id).addEventListener('input',render);}
if(el('loadRemoteImages'))el('loadRemoteImages').addEventListener('change',render);
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
    const extBuild = hs.extensionBuildId || 'V7.0.0-OWNER-BETA-TEST-SEND-SIDECAR-20261116-LOCKED16';
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
    box.className = 'status-box status-success';
    box.textContent = `✅ [발송 접수 성공] Resend 이벤트 시뮬레이터가 정상 접수하였습니다.\n• Provider Message ID: ${resp.providerMessageId || 'OK'}\n• 수신자: ${resp.to}\n• 발신자: ${resp.from}\n• 접수시각: ${resp.timestamp || new Date().toISOString()}`;
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

const DRAFT_STORAGE_KEY = 'xpider_email_studio_draft_v1';
const DRAFT_FIELDS = ['kind', 'subject', 'preheader', 'brand', 'heading', 'body', 'image', 'alt', 'cta', 'link', 'reply', 'company', 'address', 'unsubscribe'];

function saveTemplateDraft() {
  try {
    const draft = {};
    for (const f of DRAFT_FIELDS) {
      if (el(f)) draft[f] = el(f).value;
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), draft }));
    const box = el('testSendStatus');
    if (box) {
      box.className = 'status-box status-success';
      box.textContent = '💾 템플릿 초안이 브라우저 로컬에 저장되었습니다 (비밀키/토큰 제외).';
    }
  } catch (e) {
    const box = el('testSendStatus');
    if (box) { box.className = 'status-box status-error'; box.textContent = '❌ 초안 저장 실패: ' + e.message; }
  }
}

function loadTemplateDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      const box = el('testSendStatus');
      if (box) { box.className = 'status-box status-blocked'; box.textContent = 'ℹ️ 저장된 템플릿 초안이 없습니다.'; }
      return;
    }
    const parsed = JSON.parse(raw);
    const d = parsed && parsed.draft ? parsed.draft : {};
    for (const f of DRAFT_FIELDS) {
      if (el(f) && typeof d[f] === 'string') el(f).value = d[f];
    }
    render();
    const box = el('testSendStatus');
    if (box) {
      box.className = 'status-box status-success';
      box.textContent = `📂 저장된 템플릿 초안을 불러왔습니다 (${parsed.savedAt || ''}).`;
    }
  } catch (e) {
    const box = el('testSendStatus');
    if (box) { box.className = 'status-box status-error'; box.textContent = '❌ 초안 불러오기 실패: ' + e.message; }
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

// ===== Recipient manager / review / dry-run queue (fortified P0 CSV import fix, zero silent no-op) =====
(function initRecipientUi() {
  const box = () => el('recipientStatus');
  const say = (cls, txt) => {
    const b = box();
    if (b) {
      b.className = 'status-box ' + cls;
      b.textContent = txt;
      b.dataset.lastUpdated = String(Date.now());
    }
  };
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
  let originalRawCsv = '';
  let allValidRecipients = [];
  let recipients = [];
  let lastFilterResult = { retained: [], excluded: [], review: [], categoryCounts: {}, reasonCounts: {} };
  let queue = null;
  let importClickSeq = 0;

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
      customExcludeDomains: el('customExcludeDomains') ? el('customExcludeDomains').value : ''
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
        allValidRecipients,
        recipients,
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
      `※ 주의: 도메인 기반 분류는 휴리스틱 추정이며 기업 규모(중소기업 여부)를 100% 확정하거나 마케팅 수신 동의를 대체하지 않습니다.`
    ].join('\n');
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
        say('status-idle', '🟢 [수신자 관리 준비 완료 · LOCKED16] 수신자 목록 없음. CSV를 붙여넣거나 파일을 선택한 뒤 "가져오기 · 중복 제거"를 클릭하세요.');
        return;
      }
      const d = JSON.parse(raw);
      originalRawCsv = typeof d.originalRawCsv === 'string' ? d.originalRawCsv : '';
      allValidRecipients = Array.isArray(d.allValidRecipients) ? d.allValidRecipients : (Array.isArray(d.recipients) ? d.recipients : []);
      recipients = Array.isArray(d.recipients) ? d.recipients : [];
      queue = d.queue && Array.isArray(d.queue.entries) ? RM.resumeNormalize(d.queue) : null;
      if (typeof d.optOut === 'string' && el('optOutList')) el('optOutList').value = d.optOut;
      if (allValidRecipients.length) renderSmeFilterSummary(RM);
      if (recipients.length) {
        say('status-idle', `📂 저장된 수신자 ${recipients.length}명 복원 (원본 유효 ${allValidRecipients.length}명)${queue ? ' · 큐 ' + JSON.stringify(RM.summarizeQueue(queue)) : ''}`);
      } else {
        say('status-idle', '🟢 [수신자 관리 준비 완료 · LOCKED16] 수신자 목록 없음. CSV를 붙여넣거나 파일을 선택한 뒤 "가져오기 · 중복 제거"를 클릭하세요.');
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
    try {
      const { sidecarPort, sidecarToken } = getSidecarConfig();
      const r = await callBg({
        action: 'SYNC_EMAIL_PRODUCTION_RECIPIENTS',
        sidecarPort,
        sidecarToken,
        payload: {
          csvText: el('recipientCsv') ? el('recipientCsv').value : '',
          optOutText: el('optOutList') ? el('optOutList').value : '',
          messageKind: messageKind(),
          consentAttested: Boolean(el('consentAttest') && el('consentAttest').checked)
        }
      });
      return { synced: Boolean(r && r.ok) };
    } catch (_) {
      return { synced: false };
    }
  }

  function runRecipientImport(triggerSource, fileName) {
    importClickSeq++;
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
        allValidRecipients = [];
        recipients = [];
        queue = null;
        persist();
        say('status-blocked', `⚠️ [CSV_EMPTY_INPUT · #${importClickSeq}] 수신자 CSV 입력란이 비어 있습니다. 이메일 목록(예: email,name)을 붙여넣거나 CSV 파일을 선택한 뒤 "가져오기 · 중복 제거"를 다시 클릭하세요.`);
        return;
      }
      const res = RM.importRecipients(rawCsv, { source: triggerSource || 'csv-import' });
      originalRawCsv = rawCsv;
      allValidRecipients = res.valid;
      renderSmeFilterSummary(RM);
      const fOpts = getFilterOptions();
      recipients = (fOpts.smeOnlyMode && lastFilterResult && Array.isArray(lastFilterResult.retained))
        ? lastFilterResult.retained
        : res.valid;
      queue = null;
      persist();
      syncSidecarRecipients();
      const inv = res.invalid.slice(0, 5).map(i => `L${i.line}:${i.reason}`).join(', ');
      const dupPreview = res.duplicates.slice(0, 5).map(d => `L${d.line}:${d.email}`).join(', ');
      const validPreview = recipients.slice(0, 6).map(r => r.name ? `${r.email}(${r.name})` : r.email).join(', ');
      const fbTag = RM.isBuiltinFallback ? ' · [RM_FALLBACK_ACTIVE]' : '';
      const srcTag = fileName ? `파일:${fileName}` : (triggerSource === 'button-click' ? '수동 클릭' : triggerSource);

      if (res.valid.length === 0) {
        say('status-error',
          `❌ [CSV_NO_VALID_RECIPIENTS · #${importClickSeq}${fbTag}] 유효 0명 · 중복 제거 ${res.duplicates.length} · 무효 ${res.invalid.length}${inv ? ' (' + inv + ')' : ''}\n• 올바른 이메일 주소(예: user@example.org)가 없습니다. CSV 형식을 확인한 뒤 다시 시도하세요.`);
        return;
      }
      say('status-success',
        `✅ 유효 ${res.valid.length}명 · 중복 제거 ${res.duplicates.length} · 무효 ${res.invalid.length}${inv ? ' (' + inv + ')' : ''}\n• 집계 실행: #${importClickSeq} (${srcTag}${fbTag}) · 활성 대상: ${recipients.length}명 (중소기업 후보:${lastFilterResult.retained.length} · 제외:${lastFilterResult.excluded.length} · 확인필요:${lastFilterResult.review.length})\n• 수신 대상 미리보기: ${validPreview || '없음'}${dupPreview ? '\n• 중복 제외: ' + dupPreview : ''}`);
    } catch (err) {
      say('status-error', `❌ [${err.code || 'ERR_CSV_IMPORT_EXCEPTION'} · #${importClickSeq}] 가져오기 처리 중 오류가 발생했습니다: ${err.message}\n• 다시 시도 방법: CSV 입력값을 확인하거나 페이지를 새로고침한 뒤 "가져오기 · 중복 제거"를 다시 클릭하세요.`);
    }
  }

  if (el('btnImportRecipients')) {
    el('btnImportRecipients').dataset.rmBound = 'true';
    el('btnImportRecipients').onclick = () => runRecipientImport('button-click', null);
  }
  if (el('btnApplySmeFilter')) {
    el('btnApplySmeFilter').onclick = () => {
      try {
        const RM = getActiveRM();
        if (!allValidRecipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-filter', null);
        }
        if (!allValidRecipients.length) {
          say('status-blocked', '⚠️ [NO_RECIPIENTS_FOR_FILTER] 먼저 CSV를 입력하고 "가져오기 · 중복 제거"를 실행하세요.');
          return;
        }
        renderSmeFilterSummary(RM);
        recipients = lastFilterResult.retained;
        queue = null;
        persist();
        say(recipients.length ? 'status-success' : 'status-blocked',
          `🎯 [대상 필터 적용 완료] 원본 유효 ${allValidRecipients.length}명 중 중소기업 후보 ${lastFilterResult.retained.length}명 선택됨 · 제외 ${lastFilterResult.excluded.length}명 · 확인 필요(UNKNOWN_REVIEW) ${lastFilterResult.review.length}명`);
      } catch (err) {
        say('status-error', `❌ [ERR_SME_FILTER] ${err.message}`);
      }
    };
  }
  if (el('btnVerifyRecipientDns')) {
    el('btnVerifyRecipientDns').onclick = async () => {
      try {
        if (!el('dnsVerifyOptIn') || !el('dnsVerifyOptIn').checked) {
          say('status-blocked', '⚠️ [DNS_VERIFY_OPT_IN_REQUIRED] 도메인 DNS(MX/A) 유효성 검사를 실행하려면 아래 동의 체크박스를 먼저 선택하세요.');
          return;
        }
        if (!allValidRecipients.length && el('recipientCsv') && el('recipientCsv').value.trim()) {
          runRecipientImport('auto-before-dns', null);
        }
        if (!allValidRecipients.length) {
          say('status-blocked', '⚠️ [NO_RECIPIENTS_FOR_DNS] 먼저 수신자 CSV를 가져오세요.');
          return;
        }
        const domains = [...new Set(allValidRecipients.map(r => r.email.split('@')[1]).filter(Boolean))];
        say('status-loading', `⏳ 수신 도메인 ${domains.length}개에 대한 DNS(MX/A) 유효성 확인 중 (개별 사서함 탐색 없음)...`);
        const { sidecarPort, sidecarToken } = getSidecarConfig();
        const resp = await callBg({
          action: 'VERIFY_RECIPIENT_DOMAINS_DNS',
          sidecarPort,
          sidecarToken,
          payload: { optInDnsCheck: true, domains }
        });
        const map = (resp && resp.ok && resp.data && resp.data.results) ? resp.data.results : null;
        let readyCnt = 0, invCnt = 0, unkCnt = 0;
        for (const r of allValidRecipients) {
          const dom = r.email.split('@')[1];
          const dInfo = map && map[dom];
          if (dInfo) {
            r.validityStatus = dInfo.validityStatus || 'UNKNOWN';
            r.dnsProvenance = dInfo.dnsProvenance || 'DNS_QUERIED';
          } else {
            r.validityStatus = 'UNKNOWN';
            r.dnsProvenance = 'SIDECAR_OR_DNS_UNAVAILABLE';
          }
          if (r.validityStatus === 'DNS_MAIL_READY') readyCnt++;
          else if (r.validityStatus === 'INVALID') invCnt++;
          else unkCnt++;
        }
        const RM = getActiveRM();
        renderSmeFilterSummary(RM);
        recipients = (el('filterSmeOnly') && el('filterSmeOnly').checked) ? lastFilterResult.retained : allValidRecipients.filter(r => r.validityStatus !== 'INVALID');
        persist();
        say('status-success',
          `🔍 [도메인 DNS(MX/A) 유효성 검사 완료 — 총 ${allValidRecipients.length}명]\n• DNS_MAIL_READY(메일서버 확인): ${readyCnt}명 · INVALID(NXDOMAIN/NullMX): ${invCnt}명 · UNKNOWN(응답지연/미확인): ${unkCnt}명\n※ 주의: 도메인 MX/A 확인은 메일 서버 설정 여부만 뜻하며, 개별 사서함(Inbox) 실존을 보장하지 않습니다.`);
      } catch (err) {
        say('status-error', `❌ [ERR_DNS_VERIFY_FAILED] ${err.message}`);
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
      triggerCsvDownload('xpider_sme_retained.csv', RM.recipientsToCsv(lastFilterResult.retained));
    };
  }
  if (el('btnExportExcludedCsv')) {
    el('btnExportExcludedCsv').onclick = () => {
      const RM = getActiveRM();
      if (!lastFilterResult.excluded.length) return say('status-blocked', '⚠️ 저장할 제외 목록이 없습니다.');
      triggerCsvDownload('xpider_excluded_recipients.csv', RM.recipientsToCsv(lastFilterResult.excluded));
    };
  }
  if (el('btnExportReviewCsv')) {
    el('btnExportReviewCsv').onclick = () => {
      const RM = getActiveRM();
      if (!lastFilterResult.review.length) return say('status-blocked', '⚠️ 저장할 확인 필요(UNKNOWN_REVIEW) 목록이 없습니다.');
      triggerCsvDownload('xpider_unknown_review_recipients.csv', RM.recipientsToCsv(lastFilterResult.review));
    };
  }
  if (el('btnExportOriginalCsv')) {
    el('btnExportOriginalCsv').onclick = () => {
      if (!originalRawCsv) return say('status-blocked', '⚠️ 보존된 원본 CSV가 없습니다.');
      triggerCsvDownload('xpider_original_imported.csv', originalRawCsv);
    };
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
          `📋 발송 전 검토 (${messageKind()})\n• 전체 ${s.total} · 발송 가능 ${s.ready} · 수신거부 제외 ${s.suppressed} · 동의 미확인 제외 ${s.noConsent}\n• 상용 발송: 🔒 STRICT HOLD (SPF/DKIM/DMARC·수신거부 엔드포인트·Webhook 증거 및 Owner 승인 필요)\n• 드라이런은 실제 이메일을 전송하지 않습니다.`);
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
      pBox.className = (d.externalDnsStatus === 'VERIFIED') ? 'status-box status-success' : 'status-box status-blocked';
      pBox.textContent = [
        `🔍 [운영 발송 점검 결과 — 도메인: ${d.domain || 'vivpr.pro'} · 상태: ${d.externalDnsStatus || 'BLOCKED_EXTERNAL_DNS'}]`,
        `• Resend 도메인 등록 상태: ${rdc.registered ? `✅ 등록됨 (${rdc.status})` : `❌ 미등록 (${rdc.status || 'NOT_REGISTERED_IN_RESEND'})`}`,
        `• DNS SPF (send.vivpr.pro): ${dns.spf?.pass ? '✅ PASS' : `❌ 미설정 (root=${dns.spf?.rootRecord || 'none'}, send=${dns.spf?.sendError || 'none'})`}`,
        `• DNS DKIM (${dns.dkim?.host || 'resend._domainkey.vivpr.pro'}): ${dns.dkim?.pass ? '✅ PASS' : `❌ 미설정 (${dns.dkim?.error || 'ENOTFOUND'})`}`,
        `• DNS DMARC (_dmarc.vivpr.pro): ${dns.dmarc?.pass ? '✅ PASS' : `❌ 미설정 (${dns.dmarc?.error || 'ENOTFOUND'})`}`,
        `• NTFS 동의 원장: ${qs.consentedRecordsOnDisk || 0}건 | 수신거부/반송 원장: ${qs.suppressedRecordsOnDisk || 0}건`,
        `• 로컬 RFC 8058 수신거부 & Svix 웹훅: ${d.localUnsubscribeEndpoint || 'WORKING'} / ${d.webhookEndpoint || 'WORKING'}`,
        `• 단일 실발송을 위해 필요한 최소 승인/조치 (${todo.length}건):`,
        ...todo.map(x => `  - ${x}`)
      ].join('\n');
    };
  }
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
