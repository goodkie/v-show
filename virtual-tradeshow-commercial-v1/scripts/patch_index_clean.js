const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 1. Hero 폼 HTML 교체
const heroRegex = /<div class="upload-cta-frame">[\s\S]*?<\/form>\s*<div class="frame-footer">[\s\S]*?<\/div>\s*<\/div>/m;

const newHeroForm = `<div class="upload-cta-frame">
      <div class="frame-title">Create Your Free Photo Immersive Booth</div>
      <div class="frame-subtitle">No credit card required • Instant interactive preview • 3 product slots included</div>

      <form id="free-booth-form" onsubmit="handleFreeBoothSubmit(event)">
        <!-- Initial Inputs View -->
        <div id="form-initial-view">
          <div class="form-group">
            <label class="form-label" for="business-name-input">Business Name *</label>
            <input type="text" id="business-name-input" class="form-input" placeholder="e.g. Apex Robotics Dynamics" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="work-email-input">Work Email *</label>
            <input type="email" id="work-email-input" class="form-input" placeholder="e.g. name@company.com" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirm-email-input">Confirm Email *</label>
            <input type="email" id="confirm-email-input" class="form-input" placeholder="Confirm your work email" required>
          </div>

          <div class="form-group">
            <label class="form-label">Booth Photo *</label>
            <div class="drop-zone" id="booth-drop-zone" onclick="document.getElementById('booth-file-input').click()">
              <div class="drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
              <div class="drop-title" id="drop-title-txt">Drag and drop your booth photo here</div>
              <div class="drop-hint" id="drop-filename-txt">or click to browse files (JPEG, PNG, WebP)</div>
              <input type="file" id="booth-file-input" accept="image/*" style="display: none;" onchange="handleFileSelected(this)">
            </div>
          </div>

          <!-- Compact Inline Error -->
          <div id="form-inline-error" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; font-weight: 600;">
            <i class="fa-solid fa-circle-exclamation"></i> <span id="form-error-txt"></span>
          </div>

          <button type="submit" class="btn-create-free" id="btn-submit-free">
            <i class="fa-solid fa-wand-magic-sparkles"></i> CREATE MY FREE PHOTO IMMERSIVE BOOTH
          </button>
        </div>

        <!-- Clean Inline Email Verification Panel -->
        <div id="inline-verify-panel" style="display: none; text-align: center; padding: 10px 0;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(56, 189, 248, 0.15); color: #38bdf8; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 14px; border: 1px solid rgba(56, 189, 248, 0.3);">
            <i class="fa-solid fa-envelope-open-text"></i>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.5px;">CHECK YOUR EMAIL</div>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px;">
            We sent a 6-digit confirmation code to:<br>
            <span id="verify-target-email" style="color: #38bdf8; font-weight: 700; font-size: 14px;"></span>
          </p>

          <!-- 6-Digit OTP Inputs -->
          <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 16px;">
            <input type="text" maxlength="1" class="otp-digit" data-index="0" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
            <input type="text" maxlength="1" class="otp-digit" data-index="1" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
            <input type="text" maxlength="1" class="otp-digit" data-index="2" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
            <input type="text" maxlength="1" class="otp-digit" data-index="3" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
            <input type="text" maxlength="1" class="otp-digit" data-index="4" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
            <input type="text" maxlength="1" class="otp-digit" data-index="5" inputmode="numeric" pattern="[0-9]*" style="width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 800; font-family: monospace; background: #070e1b; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 10px; color: #38bdf8; outline: none;">
          </div>

          <!-- OTP Inline Error -->
          <div id="otp-inline-error" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; font-weight: 600;">
            <i class="fa-solid fa-circle-exclamation"></i> <span id="otp-error-txt">Invalid confirmation code.</span>
          </div>

          <button type="button" class="btn-create-free" id="btn-verify-otp" onclick="handleVerifyOtpClick()">
            VERIFY &amp; CREATE MY BOOTH
          </button>

          <div style="margin-top: 14px; font-size: 12px; color: var(--text-muted);">
            <i class="fa-regular fa-clock" style="color: #38bdf8;"></i> Code expires in <span id="otp-countdown" style="font-weight: 700; color: #fff;">10:00</span>
          </div>

          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <button type="button" id="btn-resend-otp" onclick="handleResendOtp()" style="background: none; border: none; color: #38bdf8; font-weight: 700; cursor: pointer; padding: 4px 8px; border-radius: 6px;">
              <i class="fa-solid fa-rotate-right"></i> RESEND CODE
            </button>
            <button type="button" onclick="handleChangeEmail()" style="background: none; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer; padding: 4px 8px;">
              <i class="fa-solid fa-pen-to-square"></i> CHANGE EMAIL
            </button>
          </div>
        </div>
      </form>

      <div class="frame-footer">
        <i class="fa-solid fa-shield-halved" style="color: #38bdf8;"></i> No credit card required. One free booth preview per business and verified email.
      </div>
    </div>`;

html = html.replace(heroRegex, newHeroForm);
console.log('✅ Hero form replaced with clean Confirm Email & 6-digit OTP inline panel');

// 2. Also remove Email Verification Modal markup (since we use clean inline panel)
html = html.replace(/<!-- Email Verification Modal \(1-Click Magic Link & 6-Digit Code\) -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m, '');
console.log('✅ Redundant Email Verification Modal markup removed');

// 3. Replace the Script block
const scriptRegex = /let isDeveloperBypass = false;[\s\S]*?async function executeBoothGeneration\(\) \{/m;

const newScriptSection = `// ══════════════════════════════════════════════════════════════
    // C10-R3 CLEAN EMAIL & 6-DIGIT OTP VERIFICATION ENGINE
    // ══════════════════════════════════════════════════════════════
    let verifiedEmailToken = null;
    let verifiedEmailAddress = null;
    let currentPendingEmail = null;
    let existingDuplicateProjectId = null;
    let otpTimerInterval = null;
    let resendCooldownInterval = null;

    document.addEventListener('DOMContentLoaded', () => {
      setupOtpInputHandlers();
    });

    function setupOtpInputHandlers() {
      const inputs = document.querySelectorAll('.otp-digit');
      inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          const val = e.target.value.replace(/[^0-9]/g, '');
          e.target.value = val ? val[0] : '';
          
          if (val && index < inputs.length - 1) {
            inputs[index + 1].focus();
          }

          const code = getEnteredOtp();
          if (code.length === 6) {
            handleVerifyOtpClick();
          }
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && index > 0) {
            inputs[index - 1].focus();
          }
        });

        input.addEventListener('paste', (e) => {
          e.preventDefault();
          const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
          if (paste) {
            inputs.forEach((inp, idx) => {
              inp.value = paste[idx] || '';
            });
            const nextIdx = Math.min(paste.length, inputs.length - 1);
            inputs[nextIdx].focus();
            if (paste.length >= 6) {
              handleVerifyOtpClick();
            }
          }
        });
      });
    }

    function getEnteredOtp() {
      const inputs = document.querySelectorAll('.otp-digit');
      let code = '';
      inputs.forEach(i => code += (i.value || '').trim());
      return code;
    }

    function clearOtpInputs() {
      const inputs = document.querySelectorAll('.otp-digit');
      inputs.forEach(i => i.value = '');
      if (inputs[0]) inputs[0].focus();
    }

    function showFormInlineError(msg) {
      const errBox = document.getElementById('form-inline-error');
      const errTxt = document.getElementById('form-error-txt');
      if (errBox && errTxt) {
        errTxt.textContent = msg;
        errBox.style.display = 'block';
      }
    }

    function hideFormInlineError() {
      const errBox = document.getElementById('form-inline-error');
      if (errBox) errBox.style.display = 'none';
    }

    function showOtpInlineError(msg) {
      const errBox = document.getElementById('otp-inline-error');
      const errTxt = document.getElementById('otp-error-txt');
      if (errBox && errTxt) {
        errTxt.textContent = msg;
        errBox.style.display = 'block';
      }
    }

    function hideOtpInlineError() {
      const errBox = document.getElementById('otp-inline-error');
      if (errBox) errBox.style.display = 'none';
    }

    async function handleFreeBoothSubmit(e) {
      e.preventDefault();
      hideFormInlineError();

      const bizName = document.getElementById('business-name-input').value.trim();
      const workEmail = document.getElementById('work-email-input').value.trim();
      const confirmEmail = document.getElementById('confirm-email-input').value.trim();

      if (!bizName) return showFormInlineError('Please enter your business name.');
      if (!workEmail) return showFormInlineError('Please enter your work email address.');
      if (!confirmEmail) return showFormInlineError('Please confirm your work email address.');

      // Validate email matching
      if (workEmail.toLowerCase() !== confirmEmail.toLowerCase()) {
        return showFormInlineError('The email addresses do not match.');
      }

      if (!selectedFile) {
        return showFormInlineError('Please select or drop your exhibition booth photo.');
      }

      // If already verified for this exact email
      if (verifiedEmailToken && verifiedEmailAddress === workEmail.toLowerCase()) {
        return executeBoothGeneration();
      }

      // Initiate Clean Email Verification
      await initiateCleanEmailVerification(workEmail, bizName);
    }

    async function initiateCleanEmailVerification(email, businessName) {
      const btnSubmit = document.getElementById('btn-submit-free');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SENDING CONFIRMATION CODE...';
      }

      try {
        const res = await fetch('/api/free-funnel/email/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, businessName })
        });

        const data = await res.json();
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> CREATE MY FREE PHOTO IMMERSIVE BOOTH';
        }

        // Server-Side Developer Bypass Match (Completely silent to public user)
        if (data.developerBypass) {
          verifiedEmailToken = 'internal_dev_pass';
          verifiedEmailAddress = email.toLowerCase();
          return executeBoothGeneration();
        }

        if (!res.ok) {
          return showFormInlineError(data.message || "WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
        }

        // Switch to Clean Inline Verification Panel
        currentPendingEmail = email;
        document.getElementById('form-initial-view').style.display = 'none';
        const panel = document.getElementById('inline-verify-panel');
        panel.style.display = 'block';
        document.getElementById('verify-target-email').textContent = data.maskedEmail || email;

        clearOtpInputs();
        hideOtpInlineError();
        startOtpCountdown(data.expiresInSeconds || 600);
        startResendCooldown(60);

      } catch (err) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> CREATE MY FREE PHOTO IMMERSIVE BOOTH';
        }
        showFormInlineError("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
      }
    }

    function startOtpCountdown(seconds) {
      if (otpTimerInterval) clearInterval(otpTimerInterval);
      let remain = seconds;
      const el = document.getElementById('otp-countdown');
      
      function update() {
        const m = Math.floor(remain / 60);
        const s = remain % 60;
        if (el) el.textContent = \`\${m}:\${s < 10 ? '0' : ''}\${s}\`;
        if (remain <= 0) {
          clearInterval(otpTimerInterval);
          showOtpInlineError('Confirmation code has expired. Please request a new code.');
        }
        remain--;
      }
      update();
      otpTimerInterval = setInterval(update, 1000);
    }

    function startResendCooldown(seconds) {
      if (resendCooldownInterval) clearInterval(resendCooldownInterval);
      let remain = seconds;
      const btn = document.getElementById('btn-resend-otp');
      btn.disabled = true;

      function update() {
        if (remain > 0) {
          btn.innerHTML = \`<i class="fa-solid fa-rotate-right"></i> RESEND CODE (\${remain}s)\`;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
        } else {
          clearInterval(resendCooldownInterval);
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> RESEND CODE';
          btn.style.opacity = '1.0';
          btn.style.cursor = 'pointer';
        }
        remain--;
      }
      update();
      resendCooldownInterval = setInterval(update, 1000);
    }

    async function handleResendOtp() {
      if (!currentPendingEmail) return;
      const bizName = document.getElementById('business-name-input').value.trim() || 'My Business';
      const btn = document.getElementById('btn-resend-otp');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> RESENDING...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/free-funnel/email/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentPendingEmail, businessName: bizName })
        });
        const data = await res.json();
        if (!res.ok) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> RESEND CODE';
          return showOtpInlineError(data.message || "WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
        }

        clearOtpInputs();
        hideOtpInlineError();
        startOtpCountdown(data.expiresInSeconds || 600);
        startResendCooldown(60);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> RESEND CODE';
        showOtpInlineError("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
      }
    }

    function handleChangeEmail() {
      if (otpTimerInterval) clearInterval(otpTimerInterval);
      if (resendCooldownInterval) clearInterval(resendCooldownInterval);
      document.getElementById('inline-verify-panel').style.display = 'none';
      document.getElementById('form-initial-view').style.display = 'block';
      hideFormInlineError();
    }

    async function handleVerifyOtpClick() {
      const code = getEnteredOtp();
      if (code.length < 6) {
        return showOtpInlineError('Please enter all 6 digits of your confirmation code.');
      }

      const btn = document.getElementById('btn-verify-otp');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> VERIFYING...';

      try {
        const res = await fetch('/api/free-funnel/email/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentPendingEmail, code })
        });

        const data = await res.json();
        btn.disabled = false;
        btn.textContent = 'VERIFY & CREATE MY BOOTH';

        if (!res.ok || !data.verified) {
          return showOtpInlineError(data.message || 'Invalid or expired confirmation code. Please try again.');
        }

        verifiedEmailToken = data.verificationToken;
        verifiedEmailAddress = currentPendingEmail.toLowerCase();

        executeBoothGeneration();

      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'VERIFY & CREATE MY BOOTH';
        showOtpInlineError('Network error verifying code. Please try again.');
      }
    }

    async function executeBoothGeneration() {`;

html = html.replace(scriptRegex, newScriptSection);
console.log('✅ Script block updated with clean OTP and email verification logic');

// 4. executeBoothGeneration 내부에서 confirmEmail, verificationToken 정확히 전달 보장
html = html.replace(
  /formData\.append\('email', workEmail\);/g,
  "formData.append('email', workEmail);\n      const confirmEmail = document.getElementById('confirm-email-input').value.trim();\n      if (confirmEmail) formData.append('confirmEmail', confirmEmail);\n      if (verifiedEmailToken) formData.append('verificationToken', verifiedEmailToken);"
);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('Saved index.html');
