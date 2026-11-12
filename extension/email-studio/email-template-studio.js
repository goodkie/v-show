
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
 const out=[];const add=(good,msg)=>out.push({good,msg});
 add(!!v.subject&&v.subject.length<=100,'제목은 명확하게 작성하고 지나치게 길지 않게 유지');
 add(!/^(re|fwd):/i.test(v.subject),'실제 회신/전달이 아니라면 Re:/Fwd:를 사용하지 않음');
 add(!/([!?])\1{2,}/.test(v.subject)&&!/[A-Z]{12,}/.test(v.subject),'과도한 느낌표·대문자 반복 방지');
 const phr=/100%\s*(보장|guarantee)|무조건\s*무료|확정\s*수익|당첨\s*보장|guaranteed\s*profit/i;
 add(!phr.test(v.subject+' '+v.body),'검증하기 어려운 확정·과장 표현 점검 (단어 자체가 금지되는 것은 아님)');
 add(v.body.replace(/\s+/g,'').length>=80,'이미지에만 의존하지 않고 충분한 실제 HTML 텍스트 포함');
 add(!v.image||!!v.alt,'이미지 대체 텍스트(alt) 제공');
 add(!v.image||!!url(v.image),'발송용 이미지는 접근 가능한 HTTPS URL 사용');
 add(!(v.link)&&!(v.cta)||!!url(v.link),'버튼 목적지는 정상 HTTPS URL');
 add(!!v.company,'실제 발신자명 명시');
 add(!!v.reply,'답장받을 수 있는 이메일 주소 입력 (실제 운영 여부 확인 필요)');
 if(v.kind==='marketing'){
  add(!!url(v.unsubscribe),'본문의 실제 작동하는 수신 거부 링크 필요');
  add(!!v.address,'마케팅 발신자의 실제 우편주소 표기');
  add(false,'발송 단계에서 RFC 8058 원클릭 구독 취소 헤더 및 POST 작동 검증 필요');
  add(false,'수신 동의·suppression 명단·Resend AUP 검증 필요');
 }
 add(false,'SPF · DKIM · DMARC · 발신 도메인/계정 평판은 콘텐츠 검사 밖에서 검증');
 return out;
}
function render(){
 const v=values();el('preview').srcdoc=htmlFor(v,true);
 const checks=audit(v);const list=el('checkList');list.replaceChildren();
 for(const item of checks){const li=document.createElement('li');li.className=item.good?'good':'warn';li.textContent=(item.good?'✓ ':'! ')+item.msg;list.append(li)}
 const warnings=checks.filter(x=>!x.good).length;el('summary').textContent='검토 항목 '+checks.length+'개 중 주의 '+warnings+'개 · 기술적 인증, 발송 권한 및 실제 전달률은 여기서 검사하지 않습니다.';
}
function download(name,type,content){const blob=new Blob([content],{type});const uri=URL.createObjectURL(blob);const a=document.createElement('a');a.href=uri;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(uri),500)}
el('imageFile').addEventListener('change',()=>{
 if(previewFileUrl)URL.revokeObjectURL(previewFileUrl);previewFileUrl='';
 const f=el('imageFile').files?.[0];if(!f)return render();
 if(!/^image\/(png|jpeg|webp|gif)$/.test(f.type)||f.size>3*1024*1024){alert('PNG/JPEG/WebP/GIF 3MB 이하 파일만 미리보기 가능합니다.');el('imageFile').value='';return render()}
 previewFileUrl=URL.createObjectURL(f);render();
});
for(const id of ids)el(id).addEventListener('input',render);
el('loadRemoteImages').addEventListener('change',render);
el('exportHtml').onclick=()=>{const v=values();if(previewFileUrl&&!url(v.image))alert('로컬 이미지는 이메일에 포함되지 않습니다. 공개 HTTPS 이미지 URL을 먼저 입력하세요.');download('xpider-vivpr-template.html','text/html;charset=utf-8',htmlFor(v))};
el('exportText').onclick=()=>download('xpider-vivpr-template.txt','text/plain;charset=utf-8',textFor(values()));
el('exportJson').onclick=()=>download('xpider-vivpr-template.json','application/json',JSON.stringify({version:1,template:values(),note:'No secrets, recipient list or API keys'},null,2));
el('desktop').onclick=()=>el('preview').style.width='100%';
el('mobile').onclick=()=>el('preview').style.width='min(360px,100%)';
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

async function checkCompanionStatus() {
  const box = el('testSendStatus');
  if (!box) return;
  box.className = 'status-box status-loading';
  box.textContent = '⏳ 컴패니언 (127.0.0.1:18989) 연결 상태 확인 중...';
  const resp = await callBg({ action: 'GET_EMAIL_TEST_STATUS' });
  if (resp && resp.ok && resp.data) {
    const d = resp.data;
    if (d.resendApiKeyConfigured) {
      box.className = 'status-box status-success';
      box.textContent = '✅ 컴패니언 연결 성공 (127.0.0.1:18989)\n• Resend API Key 설정됨 (서버사이드 안전 보관)\n• 시뮬레이터 수신자 대상 테스트 발송 준비 완료';
    } else {
      box.className = 'status-box status-blocked';
      box.textContent = '⚠️ 컴패니언 연결 성공 (127.0.0.1:18989)\n• Resend API Key 미설정 (RESEND_API_KEY 환경변수 필요)\n• 시뮬레이터 발송 요청 시 차단 안내(RESEND_API_KEY_NOT_CONFIGURED)가 반환됩니다.';
    }
  } else {
    box.className = 'status-box status-error';
    box.textContent = '❌ 컴패니언 연결 실패 (127.0.0.1:18989)\n• 상태: 오프라인 또는 포트 미응답\n• 컴패니언 서비스 실행 시 자동 연결됩니다.';
  }
}

let testSendCoolingDown = false;
async function triggerTestSend() {
  if (testSendCoolingDown) return;
  const box = el('testSendStatus');
  const btn = el('btnTestSend');
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
  box.textContent = `⏳ 시뮬레이터 테스트 발송 요청 중...\n• 수신자: ${recipient}\n• 발신자: onboarding@resend.dev\n• Idempotency-Key: ${idempotencyKey}\n• 백엔드(127.0.0.1:18989) 경유 전송 중...`;

  const resp = await callBg({
    action: 'EMAIL_TEST_SEND',
    to: recipient,
    subject,
    html,
    text,
    idempotencyKey
  });

  if (resp && resp.status === 'SUCCESS') {
    box.className = 'status-box status-success';
    box.textContent = `✅ [발송 접수 성공] Resend 이벤트 시뮬레이터가 정상 접수하였습니다.\n• Provider Message ID: ${resp.providerMessageId || 'OK'}\n• 수신자: ${resp.to}\n• 발신자: ${resp.from}\n• 접수시각: ${resp.timestamp || new Date().toISOString()}`;
  } else if (resp && resp.status === 'BLOCKED') {
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
setTimeout(checkCompanionStatus, 300);
