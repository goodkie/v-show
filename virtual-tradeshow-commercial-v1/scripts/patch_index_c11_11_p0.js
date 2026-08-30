const fs = require('fs');
const path = require('path');

const filePath = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html');
let html = fs.readFileSync(filePath, 'utf8');

console.log('Original index.html length:', html.length);

// 1. Update Title & Meta
html = html.replace(/<title>.*?<\/title>/i, '<title>³DNa — Turn One Booth Photo Into an Interactive 3D Booth Free</title>');
html = html.replace(/<meta name="description" content=".*?"/i, '<meta name="description" content="Upload your exhibition booth photo and business name. ³DNa generates your interactive 3D virtual booth preview with 3 product slots in seconds."');
html = html.replace(/<meta property="og:title" content=".*?"/i, '<meta property="og:title" content="³DNa — Turn One Booth Photo Into an Interactive 3D Booth Free"');

// 2. Update Hero & Frame Headings
html = html.replace(
  /<h1 class="hero-title">[\s\S]*?<\/h1>/i,
  `<h1 class="hero-title">
      Turn One Booth Photo Into an<br>
      <span>Interactive 3D Virtual Booth</span>
    </h1>`
);

html = html.replace(
  /<p class="hero-desc">[\s\S]*?<\/p>/i,
  `<p class="hero-desc">
      Upload your exhibition booth photo and business name. ³DNa generates your interactive 3D virtual booth preview with interactive product pinpoints in seconds.
    </p>`
);

html = html.replace(
  /<div class="frame-title">.*?<\/div>/i,
  '<div class="frame-title">Create Your Free 3D Booth</div>'
);

html = html.replace(
  /<div class="frame-subtitle">.*?<\/div>/i,
  '<div class="frame-subtitle">Instant interactive 3D preview • 3 product slots included</div>'
);

// 3. Update Primary CTA Button
html = html.replace(
  /<button type="submit" class="btn-create-free" id="btn-submit-free">[\s\S]*?<\/button>/i,
  `<button type="submit" class="btn-create-free" id="btn-submit-free">
            <i class="fa-solid fa-wand-magic-sparkles"></i> CREATE 3D BOOTH
          </button>`
);

// 4. Overhaul #inline-verify-panel HTML
const cleanVerifyPanelHtml = `<div id="inline-verify-panel" style="display: none; text-align: center; padding: 10px 0;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(56, 189, 248, 0.15); color: #38bdf8; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 14px; border: 1px solid rgba(56, 189, 248, 0.3);">
            <i class="fa-solid fa-envelope-open-text"></i>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.5px;">CHECK YOUR EMAIL</div>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px;">
            We sent a 6-digit confirmation code &amp; 1-click link to:<br>
            <span id="verify-target-email" style="color: #38bdf8; font-weight: 700; font-size: 14px;"></span>
          </p>

          <div id="otp-loading-status" style="display: none; color: #38bdf8; font-size: 13px; font-weight: 700; margin-bottom: 12px;">
            <i class="fa-solid fa-spinner fa-spin"></i> Verifying code &amp; creating 3D booth...
          </div>

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

          <!-- OTP Status Msg -->
          <div id="otp-status-msg" style="display: none; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; font-weight: 600;">
            <i class="fa-solid fa-circle-info"></i> <span id="otp-status-txt"></span>
          </div>

          <button type="button" class="btn-create-free" id="btn-verify-otp" onclick="handleVerifyOtpClick()" style="width: 100%; margin-bottom: 10px;">
            <i class="fa-solid fa-check"></i> VERIFY &amp; CREATE MY 3D BOOTH
          </button>

          <button type="button" class="btn-hero btn-hero-secondary" id="btn-check-verify-status" onclick="handleCheckVerificationStatus()" style="width: 100%; justify-content: center; padding: 11px 14px; font-size: 13px; margin-bottom: 14px; border: 1px solid rgba(56,189,248,0.3); background: rgba(56,189,248,0.06); color: #38bdf8;">
            <i class="fa-solid fa-arrows-rotate"></i> I'VE VERIFIED MY EMAIL / CHECK STATUS
          </button>

          <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
            <i class="fa-regular fa-clock" style="color: #38bdf8;"></i> Code expires in <span id="otp-countdown" style="font-weight: 700; color: #fff;">10:00</span>
          </div>

          <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <button type="button" id="btn-resend-otp" onclick="handleResendOtp()" style="background: none; border: none; color: #38bdf8; font-weight: 700; cursor: pointer; padding: 4px 8px; border-radius: 6px;">
              <i class="fa-solid fa-rotate-right"></i> RESEND CODE
            </button>
            <button type="button" onclick="handleChangeEmail()" style="background: none; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer; padding: 4px 8px;">
              <i class="fa-solid fa-pen-to-square"></i> CHANGE EMAIL
            </button>
          </div>
        </div>`;

html = html.replace(/<div id="inline-verify-panel"[\s\S]*?<\/div>\s*<\/form>/i, cleanVerifyPanelHtml + '\n      </form>');

// 5. Update Success Banner Headings
html = html.replace(
  /YOUR FREE PHOTO IMMERSIVE 360° BOOTH IS READY/g,
  'YOUR FREE 3D BOOTH IS READY'
);
html = html.replace(
  /Experience your photo as an interactive 3D studio\./g,
  'Experience your photo as an interactive 3D virtual booth.'
);

// 6. Overhaul JS verification & generation engine
const newJsBlock = `
    // ══════════════════════════════════════════════════════════════
    // C11.11-P0 COMPLETE FUNCTIONAL FREE 3D BOOTH FUNNEL ENGINE
    // ══════════════════════════════════════════════════════════════
    let verifiedEmailToken = null;
    let verifiedEmailAddress = null;
    let currentPendingEmail = null;
    let existingDuplicateProjectId = null;
    let otpTimerInterval = null;
    let resendCooldownInterval = null;
    let statusPollInterval = null;

    document.addEventListener('DOMContentLoaded', () => {
      setupOtpInputHandlers();
      recoverExistingBoothSession();
    });

    function recoverExistingBoothSession() {
      try {
        const saved = localStorage.getItem('dna_free_booth_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.project && parsed.project.id) {
            console.log('Recovered existing 3D booth session:', parsed.project.id);
          }
        }
      } catch(e) {}
    }

    function handleFileSelected(input) {
      if (input.files && input.files[0]) {
        selectedFile = input.files[0];
        const sz = Math.round(selectedFile.size / 1024);
        const name = selectedFile.name;
        document.getElementById('drop-filename-txt').textContent = 'Selected: ' + name + ' (' + sz + ' KB)';
        document.getElementById('drop-title-txt').innerHTML = '<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> Photo Ready!';
        hideFormInlineError();
      }
    }

    const dropZone = document.getElementById('booth-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          selectedFile = e.dataTransfer.files[0];
          const sz = Math.round(selectedFile.size / 1024);
          const name = selectedFile.name;
          document.getElementById('drop-filename-txt').textContent = 'Selected: ' + name + ' (' + sz + ' KB)';
          document.getElementById('drop-title-txt').innerHTML = '<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> Photo Ready!';
          hideFormInlineError();
        }
      });
    }

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
          if (e.key === 'Enter') {
            e.preventDefault();
            handleVerifyOtpClick();
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
      const statBox = document.getElementById('otp-status-msg');
      if (statBox) statBox.style.display = 'none';
    }

    function hideOtpInlineError() {
      const errBox = document.getElementById('otp-inline-error');
      if (errBox) errBox.style.display = 'none';
    }

    function showOtpStatusMsg(msg) {
      const statBox = document.getElementById('otp-status-msg');
      const statTxt = document.getElementById('otp-status-txt');
      if (statBox && statTxt) {
        statTxt.textContent = msg;
        statBox.style.display = 'block';
      }
      hideOtpInlineError();
    }

    async function handleFreeBoothSubmit(e) {
      e.preventDefault();
      hideFormInlineError();

      const bizInput = document.getElementById('business-name-input');
      const emailInput = document.getElementById('work-email-input');

      const bizName = bizInput ? bizInput.value.trim() : '';
      const workEmail = emailInput ? emailInput.value.trim() : '';

      if (!bizName) {
        if (bizInput) bizInput.focus();
        return showFormInlineError('Please enter your business name.');
      }

      if (!workEmail || !workEmail.includes('@') || !workEmail.includes('.')) {
        if (emailInput) emailInput.focus();
        return showFormInlineError('Please enter a valid work email address.');
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
          btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> CREATE 3D BOOTH';
        }

        // Server-Side Developer Bypass Match
        if (data.developerBypass) {
          verifiedEmailToken = 'internal_dev_pass';
          verifiedEmailAddress = email.toLowerCase();
          return executeBoothGeneration();
        }

        if (!res.ok) {
          return showFormInlineError(data.message || "We couldn't send your confirmation email. Please try again.");
        }

        // Switch to Clean Inline Verification Panel
        currentPendingEmail = email;
        document.getElementById('form-initial-view').style.display = 'none';
        const panel = document.getElementById('inline-verify-panel');
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('verify-target-email').textContent = data.maskedEmail || email;

        clearOtpInputs();
        hideOtpInlineError();
        startOtpCountdown(data.expiresInSeconds || 600);
        startResendCooldown(60);
        startVerificationStatusPolling(email);

      } catch (err) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> CREATE 3D BOOTH';
        }
        showFormInlineError("We couldn't send your confirmation email. Please check your connection and try again.");
      }
    }

    function startVerificationStatusPolling(email) {
      if (statusPollInterval) clearInterval(statusPollInterval);
      statusPollInterval = setInterval(async () => {
        if (!currentPendingEmail || currentPendingEmail.toLowerCase() !== email.toLowerCase()) {
          return clearInterval(statusPollInterval);
        }
        try {
          const res = await fetch('/api/free-funnel/email/poll-status?email=' + encodeURIComponent(email));
          if (res.ok) {
            const data = await res.json();
            if (data && data.verified && data.verificationToken) {
              clearInterval(statusPollInterval);
              if (otpTimerInterval) clearInterval(otpTimerInterval);
              if (resendCooldownInterval) clearInterval(resendCooldownInterval);
              verifiedEmailToken = data.verificationToken;
              verifiedEmailAddress = email.toLowerCase();
              showOtpStatusMsg('Email verified successfully! Creating your 3D booth...');
              setTimeout(() => {
                executeBoothGeneration();
              }, 400);
            }
          }
        } catch(e) {}
      }, 3000);
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
      if (!btn) return;
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
      const bizInput = document.getElementById('business-name-input');
      const bizName = bizInput ? bizInput.value.trim() : 'My Business';
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
          return showOtpInlineError(data.message || "We couldn't resend your confirmation email. Please try again.");
        }

        clearOtpInputs();
        hideOtpInlineError();
        showOtpStatusMsg('New confirmation code sent to your email.');
        startOtpCountdown(data.expiresInSeconds || 600);
        startResendCooldown(60);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> RESEND CODE';
        showOtpInlineError("Network error resending email. Please check your connection.");
      }
    }

    async function handleCheckVerificationStatus() {
      if (!currentPendingEmail) return;
      const btn = document.getElementById('btn-check-verify-status');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CHECKING STATUS...';
      }

      try {
        const res = await fetch('/api/free-funnel/email/poll-status?email=' + encodeURIComponent(currentPendingEmail));
        const data = await res.json();
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }

        if (data && data.verified && data.verificationToken) {
          if (statusPollInterval) clearInterval(statusPollInterval);
          if (otpTimerInterval) clearInterval(otpTimerInterval);
          verifiedEmailToken = data.verificationToken;
          verifiedEmailAddress = currentPendingEmail.toLowerCase();
          showOtpStatusMsg('Email verified! Creating your 3D booth now...');
          setTimeout(() => {
            executeBoothGeneration();
          }, 300);
        } else {
          showOtpStatusMsg('Verification pending. Please enter the 6-digit code or click the link in your email.');
        }
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
        showOtpInlineError('Could not connect to server. Please try again.');
      }
    }

    function handleChangeEmail() {
      if (otpTimerInterval) clearInterval(otpTimerInterval);
      if (resendCooldownInterval) clearInterval(resendCooldownInterval);
      if (statusPollInterval) clearInterval(statusPollInterval);
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
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> VERIFYING...';
      }

      try {
        const res = await fetch('/api/free-funnel/email/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentPendingEmail, code })
        });

        const data = await res.json();
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> VERIFY &amp; CREATE MY 3D BOOTH';
        }

        if (!res.ok || !data.verified) {
          return showOtpInlineError(data.message || 'Invalid or expired confirmation code. Please try again.');
        }

        if (statusPollInterval) clearInterval(statusPollInterval);
        if (otpTimerInterval) clearInterval(otpTimerInterval);

        verifiedEmailToken = data.verificationToken;
        verifiedEmailAddress = currentPendingEmail.toLowerCase();

        executeBoothGeneration();

      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> VERIFY &amp; CREATE MY 3D BOOTH';
        }
        showOtpInlineError('Network error verifying code. Please check your connection.');
      }
    }

    async function executeBoothGeneration() {
      const bizName = (document.getElementById('business-name-input')?.value || '').trim();
      const workEmail = (document.getElementById('work-email-input')?.value || '').trim();

      showProgress();
      logAnalyticsEvent('free_booth_started', { businessName: bizName });

      const formData = new FormData();
      formData.append('businessName', bizName);
      formData.append('email', workEmail);
      if (verifiedEmailToken) {
        formData.append('verificationToken', verifiedEmailToken);
      }
      formData.append('photo', selectedFile);

      // Start realistic stage progress animation
      let currentPercent = 10;
      updateProgressDisplay(currentPercent, 'UPLOADING PHOTO', 'Transferring Booth Photography', 'Transferring high-resolution photo to image canvas engine...');

      const progressInterval = setInterval(() => {
        if (currentPercent < 88) {
          currentPercent += Math.floor(Math.random() * 6) + 3;
          if (currentPercent > 88) currentPercent = 88;

          if (currentPercent < 28) {
            updateProgressDisplay(currentPercent, 'SECURING ORIGINAL (R2)', 'Protecting Master Asset', 'Backing up Tier 0 master image to Cloudflare R2 offsite storage...');
          } else if (currentPercent < 60) {
            updateProgressDisplay(currentPercent, 'AI IMAGE MASTERING', 'Super-Resolution Engine', 'Executing ONNX neural super-resolution & visual clarity filtering...');
          } else if (currentPercent < 80) {
            updateProgressDisplay(currentPercent, 'GENERATING 3D BOOTH', 'Creating Virtual Showroom', 'Synthesizing interactive 3D spatial viewport and 3 product slots...');
          } else {
            updateProgressDisplay(currentPercent, 'FINALIZING PREVIEW', 'Connecting Buyer Tools', 'Configuring 1-click RFQ, Sample Request, and Meeting scheduler...');
          }
        }
      }, 160);

      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await fetch('/api/free-funnel/preview', {
          method: 'POST',
          headers,
          body: formData
        });

        const data = await res.json();
        clearInterval(progressInterval);

        if (!res.ok) {
          hideProgress();
          if (res.status === 409) {
            openDuplicateModal(
              data.error === 'BUSINESS_ALREADY_EXISTS' ? 'Business Free 3D Booth Already Created' : 'Email Already Used',
              data.message || 'Your free 3D virtual booth preview has already been created.',
              data.existingProjectId
            );
            return;
          }
          return alert(data.message || 'Booth generation failed. Please try again.');
        }

        // Final transition to 100%
        updateProgressDisplay(95, 'FINALIZING 3D BOOTH', 'Connecting Tools', 'Activating 1-click RFQ, Sample Request, and Meeting scheduler...');
        
        setTimeout(() => {
          updateProgressDisplay(100, 'YOUR 3D BOOTH IS READY', '3D Virtual Booth Ready!', '3 Product Pinpoint Slots Initialized!');
          
          setTimeout(() => {
            hideProgress();
            activeProjectId = data.projectId;
            activeProjectData = data.project;
            try {
              localStorage.setItem('dna_free_booth_session', JSON.stringify({
                projectId: activeProjectId,
                project: activeProjectData,
                savedAt: new Date().toISOString()
              }));
            } catch(e) {}
            logAnalyticsEvent('free_booth_created', { projectId: activeProjectId });
            renderStudioBooth(data.project);
          }, 350);
        }, 250);

      } catch (err) {
        clearInterval(progressInterval);
        hideProgress();
        alert('Network error while creating 3D booth: ' + err.message);
      }
    }
`;

// Replace old JS block from "C10-R3 CLEAN EMAIL" to the end of executeBoothGeneration
const jsStartIdx = html.indexOf('// C10-R3 CLEAN EMAIL & 6-DIGIT OTP VERIFICATION ENGINE');
const jsEndIdx = html.indexOf('function showProgress()', jsStartIdx);

if (jsStartIdx !== -1 && jsEndIdx !== -1) {
  html = html.substring(0, jsStartIdx) + newJsBlock.trim() + '\n\n    ' + html.substring(jsEndIdx);
  console.log('Successfully replaced JS free funnel engine block.');
} else {
  console.error('Failed to locate JS block markers:', jsStartIdx, jsEndIdx);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully wrote updated index.html! New length:', html.length);