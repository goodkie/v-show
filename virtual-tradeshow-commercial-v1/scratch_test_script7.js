
    let selectedFile = null;
    let activeProjectId = null;
    let activeProjectData = null;
    let currentSlotSetting = 1;
    let pendingCoords = { u: 0.50, v: 0.50 };

    // Pan & Zoom state
    let panZoom = {
      scale: 1.0,
      x: 0,
      y: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };

    function logAnalyticsEvent(eventName, metadata = {}) {
      if (!activeProjectId) return;
      fetch('/api/free-funnel/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, eventName, metadata })
      }).catch(e => console.warn('Analytics event error:', e));
    }

    function handleFileSelected(input) {
      if (input.files && input.files[0]) {
        selectedFile = input.files[0];
        document.getElementById('drop-filename-txt').textContent = `Selected: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`;
        document.getElementById('drop-title-txt').textContent = 'Photo Ready!';
      }
    }

    // ══════════════════════════════════════════════════════════════
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

    let currentViewerAccount = null;
    let isProjectOwner = false;
    window.VIEWER_MODE = 'PUBLIC_VIEWER';
    window.NAV_ACCOUNT_ACTION_LABEL = 'Sign In';
    window.PIN_EDIT_MODE = false;
    window.currentEditingPinSlot = 1;
    window.savedViewpoints = [];
    window.activeViewpointId = null;

    async function checkViewerAuth() {
      const token = localStorage.getItem('3d2_customer_token');
      const navBtn = document.getElementById('navAccountBtn');
      const navBtnText = document.getElementById('navAccountBtnText');
      const navBtnIcon = document.getElementById('navAccountBtnIcon');

      if (!token) {
        window.NAV_ACCOUNT_ACTION_LABEL = 'Sign In';
        if (navBtnText) navBtnText.textContent = 'Sign In';
        if (navBtnIcon) navBtnIcon.className = 'fa-solid fa-arrow-right-to-bracket';
        if (navBtn) navBtn.href = '/portal';
        window.VIEWER_MODE = 'PUBLIC_VIEWER';
        applyViewerModeUI();
        return { authenticated: false };
      }

      try {
        const res = await fetch('/api/customer/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.account) {
            currentViewerAccount = data.account;
            window.NAV_ACCOUNT_ACTION_LABEL = 'My Booths';
            if (navBtnText) navBtnText.textContent = 'My Booths';
            if (navBtnIcon) navBtnIcon.className = 'fa-solid fa-store';
            if (navBtn) navBtn.href = '/portal';
            
            checkProjectOwnership();
            applyViewerModeUI();
            return { authenticated: true, account: data.account };
          }
        }
      } catch (e) {
        console.warn('[Viewer Auth Check Warn]', e.message);
      }

      window.NAV_ACCOUNT_ACTION_LABEL = 'Sign In';
      if (navBtnText) navBtnText.textContent = 'Sign In';
      if (navBtnIcon) navBtnIcon.className = 'fa-solid fa-arrow-right-to-bracket';
      if (navBtn) navBtn.href = '/portal';
      window.VIEWER_MODE = 'PUBLIC_VIEWER';
      applyViewerModeUI();
      return { authenticated: false };
    }

    function checkProjectOwnership() {
      if (!currentViewerAccount) {
        isProjectOwner = false;
        window.VIEWER_MODE = 'PUBLIC_VIEWER';
        return;
      }
      if (!activeProjectData) {
        isProjectOwner = true;
        window.VIEWER_MODE = 'OWNER_EDITOR';
        return;
      }

      const accId = currentViewerAccount.id;
      const accEmail = (currentViewerAccount.emailNormalized || currentViewerAccount.email || '').toLowerCase();
      const pAccId = activeProjectData.accountId;
      const pEmail = (activeProjectData.contactEmail || activeProjectData.customerEmail || activeProjectData.email || '').toLowerCase();
      const isTestProject = Boolean(activeProjectData.isTest || activeProjectData.environment === 'INTERNAL_DEV');

      if (accId && pAccId && accId === pAccId) {
        isProjectOwner = true;
      } else if (accEmail && pEmail && accEmail === pEmail) {
        isProjectOwner = true;
      } else if (isInternalDevAccount(currentViewerAccount) && isTestProject) {
        isProjectOwner = true;
      } else {
        isProjectOwner = false;
      }

      window.VIEWER_MODE = isProjectOwner ? 'OWNER_EDITOR' : 'PUBLIC_VIEWER';
    }

    function applyViewerModeUI() {
      const isDev = isInternalDevAccount(currentViewerAccount);
      const isOwner = (window.VIEWER_MODE === 'OWNER_EDITOR');
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = isDev ? 'INTERNAL_FULL_ACCESS' : (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot && !isDev;

      const ownerStudioToolbar = document.getElementById('ownerStudioToolbar');
      if (ownerStudioToolbar) ownerStudioToolbar.style.display = isOwner ? 'flex' : 'none';

      const btnTogglePin = document.getElementById('btnTogglePinEdit');
      if (btnTogglePin) btnTogglePin.style.display = isOwner ? 'inline-flex' : 'none';
      
      const radarOwnerCtrls = document.getElementById('radarOwnerControls');
      if (radarOwnerCtrls) radarOwnerCtrls.style.display = isOwner ? 'flex' : 'none';

      const btnSideEditPin = document.getElementById('btnSideEditPin');
      if (btnSideEditPin) btnSideEditPin.style.display = isOwner ? 'inline-flex' : 'none';

      const btnEditBooth = document.getElementById('btnBannerEditBooth');
      const btnDash = document.getElementById('btnBannerDashboard');
      const btnPub = document.getElementById('btnBannerPublish');
      if (btnEditBooth) btnEditBooth.style.display = isOwner ? 'inline-flex' : 'none';
      if (btnDash) btnDash.style.display = isOwner ? 'inline-flex' : 'none';
      if (btnPub) btnPub.style.display = isOwner ? 'inline-flex' : 'none';

      const btnSidebarUp = document.getElementById('btnSidebarUpgrade');
      if (btnSidebarUp) {
        btnSidebarUp.style.display = isFree ? 'inline-flex' : 'none';
      }
    }

    function handleOwnerAction(action) {
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot;

      if (isFree) {
        openPlanModal('gated_' + action);
        return;
      }

      if (action === 'edit_booth' || action === 'company') {
        openBoothEditor('company');
      } else if (action === 'dashboard') {
        openBoothEditor('dashboard');
      } else if (action === 'publish') {
        openBoothEditor('publish');
      }
    }

        async function initAppBoot() {
      setupOtpInputHandlers();
      await checkViewerAuth();
      
      // 1. Check URL parameters for direct projectId handoff (e.g. from magic link or session)
      const urlParams = new URLSearchParams(window.location.search);
      const urlProjectId = urlParams.get('projectId');
      if (urlProjectId) {
        try {
          const res = await fetch(`/api/free-funnel/projects/${urlProjectId}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.project) {
              activeProjectId = data.project.id;
              activeProjectData = data.project;
              window.activeProjectId = data.project.id;
              window.activeProjectData = data.project;
              checkProjectOwnership();
              renderStudioBooth(data.project);
              return;
            }
          }
        } catch(e) {
          console.warn('[Direct Booth Restore Warn]', e.message);
        }
      }

      // 2. Recover local storage session
      recoverExistingBoothSession();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAppBoot);
    } else {
      initAppBoot();
    }

    function recoverExistingBoothSession() {
      try {
        const saved = localStorage.getItem('dna_free_booth_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.project && parsed.project.id && !activeProjectId) {
            console.log('Recovered existing 3D booth session:', parsed.project.id);
            const banner = document.createElement('div');
            banner.id = 'resume-booth-banner';
            banner.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; background:#0b1526; border:1px solid #38bdf8; border-radius:12px; padding:14px 20px; box-shadow:0 10px 30px rgba(0,0,0,0.8); display:flex; align-items:center; gap:12px; color:#fff; font-family:"Plus Jakarta Sans",sans-serif;';
            banner.innerHTML = `
              <i class="fa-solid fa-cube" style="color:#38bdf8; font-size:18px;"></i>
              <div style="font-size:13px;">
                <span style="font-weight:700;">Resume Your 3D Booth:</span> ${parsed.project.businessName || 'Exhibitor Booth'}
              </div>
              <button class="btn-ui upgrade" style="padding:6px 14px; font-size:12px; margin-left:8px; cursor:pointer;" onclick="renderStudioBooth(JSON.parse(localStorage.getItem('dna_free_booth_session')).project)">Open Studio →</button>
              <button style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:0 4px;" onclick="document.getElementById('resume-booth-banner').remove()">×</button>
            `;
            document.body.appendChild(banner);
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

            // Check Developer Bypass up-front for instant 0-second testing without waiting for confirmation code
      const devBypassEmails = ['goodkie.com@gmail.com', 'lead-dev@internal.vshow.com', 'architect@dn-a.com'];
      if (devBypassEmails.includes(workEmail.toLowerCase())) {
        verifiedEmailToken = 'dev_bypass_token_' + Date.now();
        verifiedEmailAddress = workEmail.toLowerCase();
        return executeBoothGeneration();
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
        const formData = new FormData();
        formData.append('email', email);
        formData.append('businessName', businessName);
        if (selectedFile) {
          formData.append('photo', selectedFile);
        }

        const res = await fetch('/api/free-funnel/email/send-verification', {
          method: 'POST',
          body: formData
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

    function onVerificationSuccess(data) {
      if (statusPollInterval) clearInterval(statusPollInterval);
      if (otpTimerInterval) clearInterval(otpTimerInterval);
      if (resendCooldownInterval) clearInterval(resendCooldownInterval);
      if (data.verificationToken) verifiedEmailToken = data.verificationToken;
      if (currentPendingEmail) verifiedEmailAddress = currentPendingEmail.toLowerCase();

      if (data.project) {
        showProgress();
        updateProgressDisplay(30, 'SECURING ORIGINAL (R2)', 'Protecting Master Asset', 'Tier 0 master backed up...');
        setTimeout(() => {
          updateProgressDisplay(70, 'GENERATING 3D BOOTH', 'Creating Virtual Showroom', 'Synthesizing 3D spatial viewport...');
          setTimeout(() => {
            updateProgressDisplay(100, 'YOUR 3D BOOTH IS READY', '3D Virtual Booth Ready!', 'Product Pinpoint Hotspots Initialized!');
            setTimeout(() => {
              hideProgress();
              activeProjectId = data.projectId || data.project.id;
              activeProjectData = data.project;
              if (data.customerToken) {
                try { localStorage.setItem('3d2_customer_token', data.customerToken); } catch(e) {}
              }
              try {
                localStorage.setItem('dna_free_booth_session', JSON.stringify({
                  projectId: activeProjectId,
                  project: data.project,
                  savedAt: new Date().toISOString()
                }));
              } catch(e) {}
              renderStudioBooth(data.project);
            }, 350);
          }, 250);
        }, 250);
      } else {
        executeBoothGeneration();
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
            if (data && data.verified && (data.verificationToken || data.project)) {
              onVerificationSuccess(data);
            }
          }
        } catch(e) {}
      }, 2500);
    }

    function startOtpCountdown(seconds) {
      if (otpTimerInterval) clearInterval(otpTimerInterval);
      let remain = seconds;
      const el = document.getElementById('otp-countdown');
      
      function update() {
        const m = Math.floor(remain / 60);
        const s = remain % 60;
        if (el) el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
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
          btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> RESEND CODE (${remain}s)`;
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
        const formData = new FormData();
        formData.append('email', currentPendingEmail);
        formData.append('businessName', bizName);
        if (selectedFile) formData.append('photo', selectedFile);

        const res = await fetch('/api/free-funnel/email/send-verification', {
          method: 'POST',
          body: formData
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

        if (data && data.verified && (data.verificationToken || data.project)) {
          onVerificationSuccess(data);
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

        onVerificationSuccess(data);

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
      if (selectedFile) {
        formData.append('photo', selectedFile);
      }

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
            updateProgressDisplay(currentPercent, 'GENERATING 3D BOOTH', 'Creating Virtual Showroom', 'Synthesizing interactive 3D spatial showroom...');
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
              const safeProject = {
                id: activeProjectData?.id || activeProjectId,
                businessName: activeProjectData?.businessName || '',
                sourceAsset: activeProjectData?.sourceAsset || { previewUrl: data.previewUrl },
                products: activeProjectData?.products || [],
                pinpoints: activeProjectData?.pinpoints || [],
                experienceType: activeProjectData?.experienceType || 'PHOTO_IMMERSIVE'
              };
              localStorage.setItem('dna_free_booth_session', JSON.stringify({
                projectId: activeProjectId,
                project: safeProject,
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

    function showProgress() {
      document.getElementById('progressOverlay').style.display = 'flex';
      updateProgressDisplay(0, 'STARTING PIPELINE', 'Initializing Engine', 'Establishing secure trade show booth creation session...');
    }

    function updateProgressDisplay(pct, stage, title, detail) {
      const fillEl = document.getElementById('progressBarFill');
      const numEl = document.getElementById('progressPctNumber');
      const stageEl = document.getElementById('progressStageTxt');
      const titleEl = document.getElementById('progressTitleTxt');
      const detailEl = document.getElementById('progressDetailTxt');

      if (fillEl) fillEl.style.width = `${pct}%`;
      if (numEl) numEl.textContent = Math.round(pct);
      if (stageEl && stage) stageEl.innerHTML = `<i class="fa-solid fa-bolt" style="color:#00f2fe;"></i> ${stage}`;
      if (titleEl && title) titleEl.textContent = title;
      if (detailEl && detail) detailEl.textContent = detail;
    }

    function hideProgress() {
      document.getElementById('progressOverlay').style.display = 'none';
    }

    // ═══════════════════════════════════════════════════════════
    // THREE.JS WEBGL PHOTO IMMERSIVE 360° MASTER STUDIO ENGINE
    // ═══════════════════════════════════════════════════════════
    let scene, camera, renderer, controls;
        let photoSphere, photoMaterial, textureLoader;
    let currentSelectedProdIdx = 0;
    let isThreeInitialized = false;
    let studioProducts = [];
    let drawer3dScene, drawer3dCamera, drawer3dRenderer, drawer3dControls;
    let drawer3dModelGroup = null;
    let drawer3dAutoRotate = true;
    let drawer3dWireframe = false;
    let currentMediaMode = 'photo'; // 'photo' | '3d'

    function renderStudioBooth(projectData) {
      document.getElementById('hero-funnel').style.display = 'none';
      const studio = document.getElementById('freeStudioSection');
      studio.style.display = 'block';
      studio.scrollIntoView({ behavior: 'smooth' });

      // Determine Entitlement & Plan Badge
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || projectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || projectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot;

      const titleEl = document.getElementById('studioBannerTitleText');
      const badgeEl = document.getElementById('studioBannerPlanBadge');
      const bizNameEl = document.getElementById('studioBannerBizName');

      // Canonical Business Name (e.g. studio berry)
      const canonicalBiz = currentViewerAccount?.businessName || (projectData.businessName && projectData.businessName !== 'www' ? projectData.businessName : 'studio berry');
      window.VIEWER_BUSINESS_NAME = canonicalBiz;
      window.VIEWER_BUSINESS_NAME_SOURCE = currentViewerAccount?.businessName ? 'ACCOUNT_METADATA' : 'PROJECT_METADATA';

      if (isFree) {
        if (titleEl) titleEl.textContent = 'YOUR FREE 3D BOOTH IS READY';
        if (badgeEl) badgeEl.style.display = 'none';
      } else {
        const badgeText = isPilot ? 'BUSINESS — PILOT' : (currentViewerAccount?.entitlement || 'BUSINESS');
        if (titleEl) titleEl.textContent = 'YOUR ³D₂ BOOTH';
        if (badgeEl) {
          badgeEl.textContent = badgeText;
          badgeEl.style.display = 'inline-block';
        }
      }

      if (bizNameEl) {
        bizNameEl.textContent = `${canonicalBiz} — Experience your photo as an interactive 3D virtual booth. Drag to look around in 360°, or click pins to inspect products.`;
      }

      checkProjectOwnership();
      applyViewerModeUI();

      const photoUrl = projectData.sourceAsset?.previewUrl || projectData.sourceAsset?.originalUrl || '';

      // Initialize Three.js WebGL Studio Engine
      initPhotoImmersiveThree(photoUrl, projectData);
      renderProductCardsTray(projectData.products || []);
      renderProductCards(projectData.products || []);
      updateNextStepCTA();
      loadProjectViewpoints();
      initPinInteractionListeners();
      logAnalyticsEvent('immersive_view_started', { projectId: projectData.id });
    }

    function initPhotoImmersiveThree(photoUrl, projectData) {
      const container = document.getElementById('viewer-container');
      const canvas = document.getElementById('three-canvas');
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 900;
      const height = rect.height || container.clientHeight || 500;

      if (!isThreeInitialized) {
        scene = new THREE.Scene();
        textureLoader = new THREE.TextureLoader();

        // 65° Immersive Field of View
        camera = new THREE.PerspectiveCamera(65, width / height, 0.01, 2000);
        camera.position.set(0, 0, 0.01);

        // High-DPR WebGL Renderer with ACES Filmic Tone Mapping
        renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          powerPreference: 'high-performance',
          precision: 'highp'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.18;

        // OrbitControls for interior 360° lookaround
        controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enableZoom = true;
        controls.minDistance = 0.005;
        controls.maxDistance = 0.05;
        controls.enablePan = false;
        controls.target.set(0, 0, 0);
        controls.maxPolarAngle = Math.PI * 0.88;
        controls.minPolarAngle = Math.PI * 0.12;
        controls.rotateSpeed = -0.42;

        // 360° Interior Equirectangular Sphere Mesh
        const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
        sphereGeo.scale(-1, 1, 1);

        photoMaterial = new THREE.MeshBasicMaterial({
          side: THREE.FrontSide,
          transparent: true,
          opacity: 1.0,
          depthWrite: false
        });
        photoSphere = new THREE.Mesh(sphereGeo, photoMaterial);
        photoSphere.rotation.y = -0.45;
        photoSphere.position.set(0, 0, 0);
        photoSphere.renderOrder = -1;
        scene.add(photoSphere);

        window.addEventListener('resize', onStudioResize);

        // Pin Placement Capture Listener (C11.16-P3.10)
        function handleBoothPlacementPointer(e) {
          if (!window.isPlacingProductPin && window.pinAuthoringState !== 'PLACING') return;
          e.preventDefault();
          e.stopPropagation();

          const rect = container.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );

          const raycaster = new THREE.Raycaster();
          if (camera) raycaster.setFromCamera(mouse, camera);

          let hitPoint = null;
          let u = 0.5, v = 0.5;

          if (photoSphere && camera) {
            const intersects = raycaster.intersectObject(photoSphere);
            if (intersects.length > 0) {
              hitPoint = intersects[0].point.clone();
              const normal = hitPoint.clone().normalize();
              u = (Math.atan2(normal.z, -normal.x) + Math.PI + 0.45) / (2 * Math.PI) % 1;
              if (u < 0) u += 1;
              v = 1 - (Math.acos(Math.max(-1, Math.min(1, normal.y))) / Math.PI);
            }
          }

          if (!hitPoint) {
            u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            const phi = (1 - v) * Math.PI;
            const theta = (u * 2 * Math.PI) - Math.PI - 0.45;
            const r = 450;
            hitPoint = new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
          }

          createInstantBlankPin({ u, v, hitPoint });
        }

        container.addEventListener('pointerdown', handleBoothPlacementPointer, true);
        container.addEventListener('click', handleBoothPlacementPointer, true);
  

        // Pin Placement Canvas Raycaster (C11.16-P3.10)
        canvas.addEventListener('pointerdown', (e) => {
          if (!window.isPlacingProductPin && window.pinAuthoringState !== 'PLACING') return;
          e.preventDefault();
          e.stopPropagation();

          const rect = canvas.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );

          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, camera);

          let hitPoint = null;
          let u = 0.5, v = 0.5;

          if (photoSphere) {
            const intersects = raycaster.intersectObject(photoSphere);
            if (intersects.length > 0) {
              hitPoint = intersects[0].point.clone();
              const normal = hitPoint.clone().normalize();
              u = (Math.atan2(normal.z, -normal.x) + Math.PI + 0.45) / (2 * Math.PI) % 1;
              if (u < 0) u += 1;
              v = 1 - (Math.acos(Math.max(-1, Math.min(1, normal.y))) / Math.PI);
            }
          }

          if (!hitPoint) {
            u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            const phi = (1 - v) * Math.PI;
            const theta = (u * 2 * Math.PI) - Math.PI - 0.45;
            const r = 450;
            hitPoint = new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
          }

          createInstantBlankPin({ u, v, hitPoint });
        });
  
        initDrawer3D();
        isThreeInitialized = true;
        requestAnimationFrame(studioAnimate);
      } else {
        if (renderer) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      }

      // Load booth photo into 360° texture
      if (photoUrl && textureLoader) {
        textureLoader.load(photoUrl, (tex) => {
          tex.encoding = THREE.sRGBEncoding;
          tex.minFilter = THREE.LinearMipMapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
          tex.needsUpdate = true;
          photoMaterial.map = tex;
          photoMaterial.needsUpdate = true;
          recalculatePinpointPositions(projectData);
        });
      }

      setupStudioProducts(projectData);
    }

        function openMultiAngleUpgradeModal() {
      const modal = document.getElementById('multiAngleUpgradeModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeMultiAngleUpgradeModal() {
      const modal = document.getElementById('multiAngleUpgradeModal');
      if (modal) modal.style.display = 'none';
    }

    let selectedMultiFiles = [];

        function handleMultiPhotosSelected(input) {
      if (input.files && input.files.length > 0) {
        selectedMultiFiles = Array.from(input.files);
        const statusEl = document.getElementById('multi-photos-selected-status');
        const gridEl = document.getElementById('multi-photos-preview-grid');

        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${selectedMultiFiles.length} multi-angle photo(s) selected for 3D Gaussian Splatting reconstruction.`;
        }

        if (gridEl) {
          gridEl.innerHTML = '';
          selectedMultiFiles.slice(0, 10).forEach(file => {
            const thumb = document.createElement('div');
            thumb.style.width = '54px';
            thumb.style.height = '54px';
            thumb.style.borderRadius = '8px';
            thumb.style.overflow = 'hidden';
            thumb.style.border = '1px solid rgba(56, 189, 248, 0.4)';
            thumb.style.background = '#000';
            const img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.src = URL.createObjectURL(file);
            thumb.appendChild(img);
            gridEl.appendChild(thumb);
          });
        }
      }
    }

    function submitMultiAngleUpgrade() {
      if (selectedMultiFiles.length < 2) {
        if (selectedMultiFiles.length === 0) {
          const fileInput = document.getElementById('multi-booth-files');
          if (fileInput) {
            fileInput.click();
            return;
          }
        }
      }
      closeMultiAngleUpgradeModal();
      openPlanModal('multi_angle_upgrade');
    }

    // ============================================================
    // 3D PIN & HOTSPOT ARCHITECTURE (PRODUCT_PIN & CATALOG_PIN)
    // ============================================================
    let studioHotspotsList = [];
    window.studioHotspotsList = studioHotspotsList;
    let isDraggingPin = false;
    window.isDraggingPin = false;

    function recalculatePinpointPositions(projectData) {
      const rawPinpoints = projectData?.pinpoints || [];
      const defaultUVs = [
        { u: 0.28, v: 0.62 },
        { u: 0.50, v: 0.55 },
        { u: 0.72, v: 0.60 }
      ];

      studioHotspotsList.forEach((spot, idx) => {
        let pin = rawPinpoints.find(p => p.id === spot.id || p.pinId === spot.id || p.targetId === spot.targetId || p.slotIndex === spot.slotIndex);
        const fallbackUV = defaultUVs[idx % defaultUVs.length] || { u: 0.5, v: 0.5 };
        const u = typeof pin?.u === 'number' ? pin.u : (typeof spot.u === 'number' ? spot.u : fallbackUV.u);
        const v = typeof pin?.v === 'number' ? pin.v : (typeof spot.v === 'number' ? spot.v : fallbackUV.v);

        const phi = (1 - v) * Math.PI;
        const theta = (u * 2 * Math.PI) - Math.PI - 0.45;
        const r = 450;

        const x = -r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);

        spot.worldPos = new THREE.Vector3(x, y, z);
      });
    }

    function onStudioResize() {
      const container = document.getElementById('viewer-container');
      if (!container || !renderer || !camera) return;
      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth;
      const height = rect.height || container.clientHeight;
      if (width && height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    }

    
    // ============================================================
    // VISUAL PRODUCT PIN & MULTI-PRODUCT PIN ENGINE (C11.16-P3.8)
    // ============================================================
    window.isPlacingProductPin = false;
    window.currentEditingPin = null;
    window.pinSelectorSelectedProductIds = [];
    window.lastPlacedPinCoords = null;

    
    // ============================================================
    // CANONICAL INSTANT BLANK PIN & PRODUCT ACCUMULATION (C11.16-P3.10)
    // ============================================================
    window.isPlacingProductPin = false;
    window.pinAuthoringState = 'IDLE'; // IDLE | PLACING | BLANK_PIN | ADDING_PRODUCTS | ACTIVE_PIN
    window.currentEditingPin = null;
    window.currentBlankPinId = null;
    window.pendingPinAttachment = null;
    window.pinSelectorSelectedProductIds = [];
    window.lastPlacedPinCoords = null;

    function startPlaceProductPinMode() {
      window.pinAuthoringState = 'PLACING';
      window.isPlacingProductPin = true;
      if (typeof controls !== 'undefined' && controls) controls.enabled = false;
      const banner = document.getElementById('placePinBanner');
      if (banner) banner.style.display = 'flex';
      const container = document.getElementById('viewer-container');
      if (container) container.classList.add('placing-pin-cursor');
    }

    function cancelPlaceProductPinMode() {
      window.pinAuthoringState = 'IDLE';
      window.isPlacingProductPin = false;
      if (typeof controls !== 'undefined' && controls) controls.enabled = true;
      const banner = document.getElementById('placePinBanner');
      if (banner) banner.style.display = 'none';
      const container = document.getElementById('viewer-container');
      if (container) container.classList.remove('placing-pin-cursor');
    }

    // Escape listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (window.isPlacingProductPin || window.pinAuthoringState === 'PLACING')) {
        cancelPlaceProductPinMode();
      }
    });

    // ── Instant Blank Pin Creator ─────────────────────────────────
    function createInstantBlankPin(coords) {
      cancelPlaceProductPinMode();
      window.pinAuthoringState = 'BLANK_PIN';

      const draftId = 'pin-blank-' + Date.now().toString(36);
      window.currentBlankPinId = draftId;

      const blankPin = {
        id: draftId,
        pinType: 'PRODUCT_PIN',
        isDraft: true,
        status: 'DRAFT',
        publicVisible: false,
        productIds: [],
        productId: null,
        targetId: null,
        u: coords.u,
        v: coords.v,
        worldPos: coords.hitPoint,
        createdAt: new Date().toISOString()
      };

      if (!window.activeProjectData) window.activeProjectData = {};
      if (!window.activeProjectData.pinpoints) window.activeProjectData.pinpoints = [];
      window.activeProjectData.pinpoints.push(blankPin);

      // Add to studioHotspotsList
      studioHotspotsList.push({
        id: draftId,
        pinType: 'BLANK_PIN',
        isDraft: true,
        targetId: draftId,
        name: 'Empty Product Pin',
        category: 'PRODUCT PIN',
        worldPos: coords.hitPoint,
        u: coords.u,
        v: coords.v,
        pinData: blankPin
      });

      window.studioHotspotsList = studioHotspotsList;
      window.activeProjectData = activeProjectData;
      window.studioHotspotsList = studioHotspotsList;
      buildHotspotsDOM();
      updateFocusSpecForBlankPin(blankPin);

      // Async server persistence
      persistDraftPinToServer(blankPin);

      if (window.showToast) window.showToast('📍 Blank pin placed! Click "+ Add Product" to attach items.', 'info');
      return blankPin;
    }

    async function persistDraftPinToServer(blankPin) {
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      if (!pid) return;

      try {
        const res = await fetch(`/api/projects/${pid}/pins`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          },
          body: JSON.stringify({
            id: blankPin.id,
            pinType: 'PRODUCT_PIN',
            status: 'DRAFT',
            publicVisible: false,
            productIds: [],
            u: blankPin.u,
            v: blankPin.v
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pin?.id && data.pin.id !== blankPin.id) {
            blankPin.id = data.pin.id;
          }
        }
      } catch (err) {
        console.warn('[Draft Pin Persistence Warn]', err.message);
      }
    }

    async function removeBlankPin(pinId) {
      if (!confirm('Remove this product pin?')) return;

      // Local teardown
      if (window.activeProjectData?.pinpoints) {
        window.activeProjectData.pinpoints = window.activeProjectData.pinpoints.filter(p => p.id !== pinId && p.pinId !== pinId);
      }
      studioHotspotsList = studioHotspotsList.filter(s => s.id !== pinId);
      buildHotspotsDOM();

      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      if (pid && pinId) {
        try {
          await fetch(`/api/projects/${pid}/pins/${pinId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token }
          });
        } catch(e) {}
      }
      if (window.showToast) window.showToast('Pin removed.', 'info');
    }

    function updateFocusSpecForBlankPin(pin) {
      const titleEl = document.getElementById('focus-prod-title');
      const catEl = document.getElementById('focus-prod-cat');
      const descEl = document.getElementById('focus-prod-desc');
      const actionBtn = document.getElementById('focus-prod-action');
      const removeBtn = document.getElementById('focus-prod-remove-pin');

      if (titleEl) titleEl.textContent = 'Empty Product Pin';
      if (catEl) catEl.textContent = 'PRODUCT PIN (NO PRODUCTS)';
      if (descEl) descEl.textContent = 'This pin has no products attached yet. Click "+ Add Product" to link a product or create a new one.';
      if (actionBtn) {
        actionBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Product';
        actionBtn.onclick = () => openPinChooserModal(pin.id);
        actionBtn.style.display = 'inline-flex';
      }
    }

    // ── Pin Chooser Modal Actions ─────────────────────────────────
    function openPinChooserModal(pinId) {
      window.currentEditingPinId = pinId;
      const modal = document.getElementById('pinChooserModal');
      if (modal) modal.style.display = 'flex';
    }

    function closePinChooserModal() {
      const modal = document.getElementById('pinChooserModal');
      if (modal) modal.style.display = 'none';
    }

    function pinChooserActionAddNew() {
      const pinId = window.currentEditingPinId;
      closePinChooserModal();
      
      const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
      window.pendingPinAttachment = {
        pinId: pinId,
        coords: pin ? { u: pin.u, v: pin.v } : (window.lastPlacedPinCoords || { u: 0.5, v: 0.5 })
      };

      // Determine next product slot index
      const prods = window.activeProjectData?.products || [];
      const nextSlot = prods.length + 1;
      openOwnerProductEditor(nextSlot);
    }

    function pinChooserActionSelectExisting() {
      const pinId = window.currentEditingPinId;
      closePinChooserModal();
      const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
      openProductPinSelectorModal(pin || { id: pinId, ...(window.lastPlacedPinCoords || { u: 0.5, v: 0.5 }) });
    }

    // ── 3D Tab Direct Source Image Handlers ────────────────────────
    function handleP3dTabSourceUpload(event) {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        
        // Update 3D tab preview
        const previewImg = document.getElementById('p3dTabSourceImgPreview');
        const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
        const filledBox = document.getElementById('p3dTabSourceFilledBox');
        if (previewImg) previewImg.src = dataUrl;
        if (emptyBox) emptyBox.style.display = 'none';
        if (filledBox) filledBox.style.display = 'flex';

        // Synchronize canonical Product Image
        const opeImgPreview = document.getElementById('opeImagePreview');
        const opeRemoveBtn = document.getElementById('opeBtnRemoveImg');
        if (opeImgPreview) {
          opeImgPreview.src = dataUrl;
          opeImgPreview.style.display = 'block';
        }
        if (opeRemoveBtn) opeRemoveBtn.style.display = 'inline-flex';

        // Transfer file to opeImageInput for multipart upload
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          const opeInput = document.getElementById('opeImageInput');
          if (opeInput) opeInput.files = dt.files;
        } catch(err) {}

        // Enable Generate CTA
        const ctaBtn = document.getElementById('p3dMainCtaBtn');
        const ctaText = document.getElementById('p3dMainCtaText');
        if (ctaBtn) ctaBtn.disabled = false;
        if (ctaText) ctaText.textContent = 'Generate 3D Model';
      };
      reader.readAsDataURL(file);
    }

    
    
    // ============================================================
    // PRODUCT PIN CONTENT EDITOR (C11.16-P3.11)
    // ============================================================
    window.currentEditingContentPin = null;

    function openProductPinContentEditorModal(pinIdOrTarget) {
      if (!pinIdOrTarget) return;

      const rawPinpoints = window.activeProjectData?.pinpoints || [];
      const spots = window.studioHotspotsList || [];

      // Find pin data
      let pin = rawPinpoints.find(p => p.id === pinIdOrTarget || p.pinId === pinIdOrTarget || String(p.slotIndex) === String(pinIdOrTarget));
      if (!pin) {
        const spot = spots.find(s => s.id === pinIdOrTarget || s.targetId === pinIdOrTarget || String(s.slotIndex) === String(pinIdOrTarget));
        if (spot && spot.pinData) pin = spot.pinData;
      }

      if (!pin) {
        pin = {
          id: pinIdOrTarget,
          pinType: 'BLANK_PIN',
          isDraft: true,
          productIds: [],
          title: '',
          description: '',
          u: 0.5,
          v: 0.5
        };
      }

      window.currentEditingContentPin = pin;
      window.currentEditingPinId = pin.id || pin.pinId;

      renderProductPinContentEditor(pin);

      const modal = document.getElementById('productPinContentEditorModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeProductPinContentEditorModal() {
      const modal = document.getElementById('productPinContentEditorModal');
      if (modal) modal.style.display = 'none';
      window.currentEditingContentPin = null;
    }

    function renderProductPinContentEditor(pin) {
      if (!pin) return;

      const rawProducts = window.activeProjectData?.products || [];
      const productIds = Array.isArray(pin.productIds) ? pin.productIds : (pin.productId || pin.targetId ? [pin.productId || pin.targetId] : []);
      
      const attachedProducts = productIds.map(pid => {
        return rawProducts.find(p => String(p.id) === String(pid) || String(p.slotIndex) === String(pid));
      }).filter(Boolean);

      const isBlank = attachedProducts.length === 0;
      const isSingle = attachedProducts.length === 1;
      const isGroup = attachedProducts.length >= 2;

      // Update Type Badge
      const typeBadge = document.getElementById('ppcePinTypeBadge');
      if (typeBadge) {
        if (isBlank) {
          typeBadge.textContent = 'BLANK PRODUCT PIN';
          typeBadge.style.color = '#94a3b8';
        } else if (isSingle) {
          typeBadge.textContent = 'SINGLE PRODUCT PIN';
          typeBadge.style.color = '#38bdf8';
        } else {
          typeBadge.textContent = 'PRODUCT COLLECTION (' + attachedProducts.length + ')';
          typeBadge.style.color = '#c084fc';
        }
      }

      // Update Count Badge
      const countBadge = document.getElementById('ppceProductCountBadge');
      if (countBadge) {
        countBadge.textContent = attachedProducts.length + ' Product' + (attachedProducts.length === 1 ? '' : 's');
      }

      // Pin Title
      const titleInput = document.getElementById('ppceTitleInput');
      if (titleInput) {
        let defaultTitle = pin.title || pin.label || '';
        if (!defaultTitle) {
          if (isSingle) defaultTitle = attachedProducts[0]?.name || '';
          else if (isGroup) defaultTitle = 'Featured Products';
        }
        titleInput.value = defaultTitle;
      }

      // Pin Description
      const descInput = document.getElementById('ppceDescriptionInput');
      if (descInput) {
        descInput.value = pin.description || pin.note || '';
      }

      // Render Attached Products
      const listContainer = document.getElementById('ppceAttachedProductsList');
      if (listContainer) {
        if (attachedProducts.length === 0) {
          listContainer.innerHTML = `
            <div style="text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px; color: #94a3b8; font-size: 12px;">
              <i class="fa-solid fa-map-pin" style="font-size: 24px; color: #64748b; margin-bottom: 8px; display: block;"></i>
              No products attached to this pin yet. Click <strong>+ Add Product</strong> below to attach items.
            </div>
          `;
        } else {
          listContainer.innerHTML = attachedProducts.map((prod, idx) => {
            const p3d = prod.product3d;
            const has3d = (p3d?.status === 'READY' || p3d?.status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
            const img = prod.imageUrl || '/assets/product-placeholder.jpg';
            const slotIdx = prod.slotIndex || (idx + 1);

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                  <div style="width: 52px; height: 52px; border-radius: 8px; background: #000; border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                    <img src="${img}" alt="${prod.name || 'Product'}" style="max-width: 100%; max-height: 100%; object-fit: contain !important; object-position: center;">
                  </div>
                  <div style="min-width: 0;">
                    <div style="font-size: 13px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${prod.name || ('Product Slot ' + slotIdx)}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                      <span>${prod.category || 'Product'}</span>
                      ${has3d ? '<span style="font-size: 9.5px; font-weight: 800; background: rgba(56,189,248,0.2); color: #38bdf8; padding: 1px 6px; border-radius: 4px;"><i class="fa-solid fa-cube"></i> 3D Ready</span>' : ''}
                    </div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                  ${has3d ? `
                    <button type="button" onclick="closeProductPinContentEditorModal(); product3dOpenViewer('${p3d.glbUrl}', '${prod.name || 'Product'}')" style="padding: 5px 9px; font-size: 11px; font-weight: 700; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="View 3D Model">
                      <i class="fa-solid fa-cube"></i> View 3D
                    </button>
                  ` : ''}
                  <button type="button" onclick="closeProductPinContentEditorModal(); openOwnerProductEditor(${slotIdx})" style="padding: 5px 10px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                  <button type="button" onclick="ppceRemoveProductFromPin('${prod.id || prod.slotIndex}')" style="padding: 5px 8px; font-size: 11px; background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); border-radius: 6px; cursor: pointer;" title="Remove from this Pin (keeps in catalog)">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

        async function saveProductPinContentEditorChanges() {
      const pin = window.currentEditingContentPin;
      if (!pin) {
        closeProductPinContentEditorModal();
        return;
      }

      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      const pinId = pin.id || pin.pinId;

      const title = document.getElementById('ppceTitleInput')?.value || '';
      const description = document.getElementById('ppceDescriptionInput')?.value || '';
      const productIds = Array.isArray(pin.productIds) ? pin.productIds : (pin.productId || pin.targetId ? [pin.productId || pin.targetId] : []);

      const isGroup = productIds.length >= 2;
      const isBlank = productIds.length === 0;
      const pinType = isBlank ? 'BLANK_PIN' : (isGroup ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN');

      const payload = {
        id: pinId,
        pinId: pinId,
        projectId: pid,
        pinType,
        title,
        label: title,
        description,
        note: description,
        productIds,
        productId: productIds[0] || null,
        targetId: productIds[0] || null,
        u: typeof pin.u === 'number' ? pin.u : 0.5,
        v: typeof pin.v === 'number' ? pin.v : 0.5,
        status: isBlank ? 'DRAFT' : 'ACTIVE',
        isDraft: isBlank,
        publicVisible: !isBlank
      };

      const saveBtn = document.getElementById('ppceBtnSaveChanges');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        let res = await fetch(`/api/projects/${pid}/pins/${pinId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          },
          body: JSON.stringify(payload)
        });

        if (res.status === 404 || !res.ok) {
          res = await fetch(`/api/projects/${pid}/pins`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'x-booth-edit-token': token
            },
            body: JSON.stringify(payload)
          });
        }

        const data = await res.json();
        if (res.ok && data.success) {
          if (data.pins) window.activeProjectData.pinpoints = data.pins;
          else if (data.pin) {
            if (!window.activeProjectData.pinpoints) window.activeProjectData.pinpoints = [];
            const idx = window.activeProjectData.pinpoints.findIndex(p => p.id === pinId || p.pinId === pinId);
            if (idx >= 0) window.activeProjectData.pinpoints[idx] = data.pin;
            else window.activeProjectData.pinpoints.push(data.pin);
          }

          if (typeof setupStudioProducts === 'function') setupStudioProducts(window.activeProjectData);
          if (window.showToast) window.showToast('✅ Pin changes saved!', 'success');
          closeProductPinContentEditorModal();
        } else {
          alert('Could not save your changes: ' + (data.error || 'Server error'));
        }
      } catch(err) {
        console.error('[Pin Save Error]', err);
        alert('Network error while saving pin: ' + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    }

    async function ppceRemoveProductFromPin(productId) {
      const pin = window.currentEditingContentPin;
      if (!pin) return;

      let productIds = Array.isArray(pin.productIds) ? [...pin.productIds] : (pin.productId || pin.targetId ? [pin.productId || pin.targetId] : []);
      productIds = productIds.filter(pid => String(pid) !== String(productId));

      pin.productIds = productIds;
      pin.productId = productIds[0] || null;
      pin.targetId = productIds[0] || null;
      pin.pinType = productIds.length === 0 ? 'BLANK_PIN' : (productIds.length >= 2 ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN');

      renderProductPinContentEditor(pin);
      if (window.showToast) window.showToast('Product removed from pin.', 'info');
    }

    async function ppceRemoveCurrentPin() {
      const pin = window.currentEditingContentPin;
      if (!pin) return;
      if (!confirm('Remove this product pin from booth?')) return;

      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      const pinId = pin.id || pin.pinId;

      try {
        await fetch(`/api/projects/${pid}/pins/${pinId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          }
        });
      } catch(e) {}

      if (window.activeProjectData?.pinpoints) {
        window.activeProjectData.pinpoints = window.activeProjectData.pinpoints.filter(p => p.id !== pinId && p.pinId !== pinId);
      }
      if (typeof setupStudioProducts === 'function') setupStudioProducts(window.activeProjectData);
      closeProductPinContentEditorModal();
      if (window.showToast) window.showToast('Pin removed.', 'info');
    }

    function ppceOpenPositionEditor() {
      const pin = window.currentEditingContentPin;
      closeProductPinContentEditorModal();
      if (pin) {
        window.currentEditingPinTarget = {
            type: spot.pinType || 'PRODUCT_PIN',
            id: spot.id || spot.targetId || (spot.slotIndex ? String(spot.slotIndex) : String(spot.pinData?.id || '1')),
            pinData: spot.pinData || spot
          };

          const pin = getOrCreateActivePin();
          preDragCoords = { u: pin.u, v: pin.v };

          try { el.setPointerCapture(e.pointerId); } catch(err) {}
          if (controls) controls.enabled = false;

          el.classList.add('pin-dragging');
          highlightActiveEditingHotspot();
          syncActivePinInputs();
        });

        el.addEventListener('pointermove', (e) => {
          if (!isDraggingPin || activeDragPinElement !== el) return;
          e.stopPropagation();

          if (pointerDownStartPos) {
            const dist = Math.hypot(e.clientX - pointerDownStartPos.x, e.clientY - pointerDownStartPos.y);
            if (dist >= 5) hasDraggedPinMoved = true;
          }

          handlePinDirectDrag(e.clientX, e.clientY);
        });

        el.addEventListener('pointerup', async (e) => {
          const owner = (window.VIEWER_MODE === 'OWNER_EDITOR');
          if (!isDraggingPin && !owner) {
            // Public click
            e.stopPropagation();
            if (spot.pinType === 'CATALOG_PIN') {
              openCatalogProductList(spot.targetId || spot.catalogId);
            } else {
              onProductSlotClicked(spot.productIdx !== undefined ? spot.productIdx : (spot.slotIndex - 1));
            }
            return;
          }

          if (isDraggingPin && activeDragPinElement === el) {
            e.stopPropagation();
            isDraggingPin = false;
            el.classList.remove('pin-dragging');
            try { el.releasePointerCapture(e.pointerId); } catch(err) {}
            activeDragPinElement = null;
            if (controls) controls.enabled = true;

            if (hasDraggedPinMoved) {
              // Direct drag completed -> Auto-save coordinates!
              await saveActivePinPosition();
            } else {
              // Simple click on pin in Owner mode -> PRIMARY ACTION: Open Product Pin Content Editor!
              if (spot.pinType === 'CATALOG_PIN') {
                if (typeof openCatalogManager === 'function') openCatalogManager();
              } else {
                openProductPinContentEditorModal(spot.id || spot.targetId || spot.pinData?.id);
              }
            }
          }
        });

        el.addEventListener('pointercancel', (e) => {
          if (isDraggingPin && activeDragPinElement === el) {
            isDraggingPin = false;
            el.classList.remove('pin-dragging');
            try { el.releasePointerCapture(e.pointerId); } catch(err) {}
            activeDragPinElement = null;
            if (controls) controls.enabled = true;
          }
        });

        // Click handler fallback for public viewer
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const owner = (window.VIEWER_MODE === 'OWNER_EDITOR');
          if (!owner) {
            if (spot.pinType === 'CATALOG_PIN') {
              openCatalogProductList(spot.targetId || spot.catalogId);
            } else {
              onProductSlotClicked(spot.productIdx !== undefined ? spot.productIdx : (spot.slotIndex - 1));
            }
          }
        });

        layer.appendChild(el);
        spot.domElement = el;
      });
    }

    function updateHotspots() {
      if (!camera) return;
      const container = document.getElementById('viewer-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cWidth = rect.width;
      const cHeight = rect.height;

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      studioHotspotsList.forEach(spot => {
        if (!spot.domElement || !spot.worldPos) return;
        const dot = spot.worldPos.dot(camDir);
        if (dot <= 0) {
          spot.domElement.style.display = 'none';
          return;
        }
        const wp = spot.worldPos.clone();
        wp.project(camera);
        if (wp.z > 1.0) {
          spot.domElement.style.display = 'none';
          return;
        }
        spot.domElement.style.display = 'flex';
        spot.domElement.style.left = ((wp.x * 0.5 + 0.5) * cWidth) + 'px';
        spot.domElement.style.top  = ((-(wp.y * 0.5) + 0.5) * cHeight) + 'px';
      });
    }

    function renderProductCardsTray(products) {
      const tray = document.getElementById('product-cards-tray');
      if (!tray) return;
      tray.innerHTML = '';

      const isOwner = (window.VIEWER_MODE === 'OWNER_EDITOR');

      studioProducts.forEach((prod, idx) => {
        const card = document.createElement('div');
        card.className = `prod-quick-card ${idx === currentSelectedProdIdx ? 'active' : ''}`;
        card.id = `pcard-${idx}`;
        card.onclick = () => onProductSlotClicked(idx);
        
        if (prod.isConfigured) {
          card.innerHTML = `
            <div class="prod-card-thumb">
              <img src="${prod.imageUrl}" alt="${prod.name}">
            </div>
            <div class="prod-card-body">
              <div class="prod-card-cat">${prod.category}</div>
              <div class="prod-card-title">${prod.name}</div>
              <div class="prod-card-spec">${prod.desc}</div>
              <div class="prod-card-btn">${isOwner ? 'Edit Product ✏️' : 'Inspect Specs →'}</div>
            </div>
          `;
        } else {
          card.innerHTML = `
            <div class="prod-card-thumb" style="background: rgba(56,189,248,0.08); display: flex; align-items: center; justify-content: center; color: #38bdf8; font-size: 18px;">
              <i class="fa-solid ${isOwner ? 'fa-plus' : 'fa-box-open'}"></i>
            </div>
            <div class="prod-card-body">
              <div class="prod-card-cat" style="color: #64748b;">SLOT 0${prod.slotIndex} AVAILABLE</div>
              <div class="prod-card-title" style="color: ${isOwner ? '#38bdf8' : '#94a3b8'};">${isOwner ? '+ Add Product' : 'Product Slot ' + prod.slotIndex}</div>
              <div class="prod-card-spec" style="color: #64748b;">${isOwner ? 'Click to upload image & enter specs' : 'Slot available for exhibition'}</div>
              <div class="prod-card-btn" style="color: #38bdf8;">${isOwner ? '+ Add Product' : 'Inspect Slot'}</div>
            </div>
          `;
        }
        tray.appendChild(card);
      });
    }

    function onProductSlotClicked(idx) {
      focusProduct(idx);
      const p = studioProducts[idx];
      if (!p) return;

      const isOwner = (window.VIEWER_MODE === 'OWNER_EDITOR');
      if (isOwner) {
        openOwnerProductEditor(p.slotIndex);
      } else {
        openPublicProductDetail(idx);
      }
    }

    function focusProduct(idx) {
      currentSelectedProdIdx = idx;
      const p = studioProducts[idx];
      if (!p) return;

      document.querySelectorAll('.prod-quick-card').forEach((c, i) => c.classList.toggle('active', i === idx));
      updateFocusSpec(idx);
    }

    function updateFocusSpec(idx) {
      currentSelectedProdIdx = idx;
      const p = studioProducts[idx];
      if (!p) return;

      const titleEl = document.getElementById('side-spec-title');
      const descEl = document.getElementById('side-spec-desc');
      const listEl = document.getElementById('side-spec-list');

      if (titleEl) titleEl.textContent = p.name;
      if (descEl) descEl.textContent = p.desc;
      if (listEl) {
        listEl.innerHTML = p.specs.map(([k,v]) =>
          `<div class="spec-item"><div class="spec-k">${k}</div><div class="spec-v">${v}</div></div>`
        ).join('');
      }
      document.querySelectorAll('.prod-quick-card').forEach((c, i) => c.classList.toggle('active', i === idx));
    }

    // ============================================================
    // 1. OWNER PRODUCT EDITOR WORKFLOW (Viewport-Safe & Canonical)
    // ============================================================
    function isInternalDevAccount(account) {
      if (!account) return false;
      const email = (account.emailNormalized || account.email || '').toLowerCase();
      return email === 'goodkie.com@gmail.com' || account.entitlement === 'INTERNAL_FULL_ACCESS' || account.environment === 'INTERNAL_DEV';
    }

    
    // ============================================================
    // ─── P3.12: LIVE CAMERA CAPTURE ENGINE ──────────────────────
    // ============================================================
    let activeCameraStream = null;
      window.activeCameraStream = null;
    window.activeCameraStream = null;
    let currentCameraCaptureTarget = null; // { type: 'PRODUCT' | 'BOOTH', slotIndex, viewLabel }
    let lastCapturedDataUrl = null;

    async function openCameraCaptureModal(target = { type: 'PRODUCT', slotIndex: 1, viewLabel: 'Front View' }) {
      currentCameraCaptureTarget = target;
      const modal = document.getElementById('cameraCaptureModal');
      const angleText = document.getElementById('cameraTargetAngleText');
      const titleText = document.getElementById('cameraModalTitle');
      const errorEl = document.getElementById('cameraErrorMsg');

      if (titleText) titleText.textContent = target.type === 'BOOTH' ? 'Booth 3D Live Camera Capture' : 'Product 3D Live Camera Capture';
      if (angleText) angleText.textContent = target.viewLabel || 'Front View';
      if (errorEl) errorEl.style.display = 'none';

      // Reset preview controls
      document.getElementById('cameraLiveControls').style.display = 'flex';
      document.getElementById('cameraPreviewControls').style.display = 'none';
      document.getElementById('cameraCaptureVideo').style.display = 'block';
      document.getElementById('cameraCapturedPreviewImg').style.display = 'none';

      if (modal) modal.style.display = 'flex';

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API not supported in this browser. Please use photo upload.');
        }

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        };

        activeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        window.activeCameraStream = activeCameraStream;
        const videoEl = document.getElementById('cameraCaptureVideo');
        if (videoEl) {
          videoEl.srcObject = activeCameraStream;
          videoEl.play();
        }
      } catch (err) {
        console.error('[Camera Access Error]', err);
        if (errorEl) {
          errorEl.style.display = 'block';
          errorEl.textContent = 'Camera unavailable or permission denied (' + err.message + '). Please use file upload.';
        }
      }
    }

    function closeCameraCaptureModal() {
      // Immediate track shutdown for privacy and battery
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(t => t.stop());
        activeCameraStream = null;
      }
      const modal = document.getElementById('cameraCaptureModal');
      if (modal) modal.style.display = 'none';
      currentCameraCaptureTarget = null;
      lastCapturedDataUrl = null;
    }

    function takeCameraSnapshot() {
      const videoEl = document.getElementById('cameraCaptureVideo');
      const canvasEl = document.getElementById('cameraCaptureCanvas');
      const previewImg = document.getElementById('cameraCapturedPreviewImg');
      if (!videoEl || !canvasEl) return;

      canvasEl.width = videoEl.videoWidth || 1280;
      canvasEl.height = videoEl.videoHeight || 720;
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

      lastCapturedDataUrl = canvasEl.toDataURL('image/jpeg', 0.92);

      if (previewImg) {
        previewImg.src = lastCapturedDataUrl;
        previewImg.style.display = 'block';
      }
      videoEl.style.display = 'none';

      document.getElementById('cameraLiveControls').style.display = 'none';
      document.getElementById('cameraPreviewControls').style.display = 'flex';
    }

    function retakeCameraSnapshot() {
      lastCapturedDataUrl = null;
      const videoEl = document.getElementById('cameraCaptureVideo');
      const previewImg = document.getElementById('cameraCapturedPreviewImg');
      if (previewImg) previewImg.style.display = 'none';
      if (videoEl) videoEl.style.display = 'block';

      document.getElementById('cameraLiveControls').style.display = 'flex';
      document.getElementById('cameraPreviewControls').style.display = 'none';
    }

    async function acceptCapturedPhoto() {
      if (!lastCapturedDataUrl || !currentCameraCaptureTarget) {
        closeCameraCaptureModal();
        return;
      }

      const token = p3dGetAuthToken();
      const pid = activeProjectId || window.activeProjectData?.id;
      const target = currentCameraCaptureTarget;

      try {
        if (target.type === 'BOOTH') {
          const res = await fetch(`/api/projects/${pid}/booth-3d/sources`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'x-booth-edit-token': token
            },
            body: JSON.stringify({
              dataUrl: lastCapturedDataUrl,
              viewLabel: target.viewLabel || 'Camera View',
              sourceType: 'CAMERA_CAPTURE',
              capturedAt: new Date().toISOString()
            })
          });
          const data = await res.json();
          if (data.success) {
            renderBoothSourceGrid(data.allSources || []);
            if (window.showToast) window.showToast('✅ Camera photo added to Booth sources!', 'success');
          }
        } else if (target.type === 'PRODUCT') {
          const slot = target.slotIndex || 1;
          const res = await fetch(`/api/projects/${pid}/products/${slot}/sources`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'x-booth-edit-token': token
            },
            body: JSON.stringify({
              dataUrl: lastCapturedDataUrl,
              viewLabel: target.viewLabel || 'Camera View',
              sourceType: 'CAMERA_CAPTURE',
              capturedAt: new Date().toISOString()
            })
          });
          const data = await res.json();
          if (data.success && data.product) {
            // Update UI preview
            const filledBox = document.getElementById('p3dTabSourceFilledBox');
            const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
            const imgPreview = document.getElementById('p3dTabSourceImgPreview');
            if (imgPreview) imgPreview.src = data.source.url;
            if (filledBox) filledBox.style.display = 'flex';
            if (emptyBox) emptyBox.style.display = 'none';
            if (window.showToast) window.showToast('✅ Camera photo set as product source!', 'success');
          }
        }
      } catch (e) {
        console.error('[Capture Save Error]', e);
        alert('Could not save captured photo: ' + e.message);
      } finally {
        closeCameraCaptureModal();
      }
    }

    // ============================================================
    // ─── P3.12: BOOTH 3D REGENERATION ENGINE ────────────────────
    // ============================================================
    let currentSelectedBoothQuality = 'BOOTH_HIGH';
    let currentBoothSourcesList = [];
    let currentActiveBoothJobId = null;
    let boothJobPollInterval = null;

    async function openBooth3dRegenerationModal() {
      const modal = document.getElementById('booth3dRegenerationModal');
      if (modal) modal.style.display = 'flex';

      // Load policy & current sources
      const pid = activeProjectId || window.activeProjectData?.id;
      try {
        const res = await fetch(`/api/projects/${pid}/booth-3d/sources`);
        const data = await res.json();
        if (data.success) {
          currentBoothSourcesList = data.sources || [];
          renderBoothSourceGrid(currentBoothSourcesList);
        }
      } catch (e) {
        console.warn('Error fetching booth sources:', e.message);
      }
      selectBoothQualityTier('BOOTH_HIGH');
    }

    function closeBooth3dRegenerationModal() {
      const modal = document.getElementById('booth3dRegenerationModal');
      if (modal) modal.style.display = 'none';
      if (boothJobPollInterval) {
        clearInterval(boothJobPollInterval);
        boothJobPollInterval = null;
      }
    }

    function selectBoothQualityTier(tier) {
      currentSelectedBoothQuality = tier;
      const cards = ['bqcStandard', 'bqcHigh', 'bqcUltra'];
      cards.forEach(c => {
        const el = document.getElementById(c);
        if (el) {
          el.style.border = '1.5px solid rgba(255,255,255,0.12)';
          el.style.background = 'rgba(15,23,42,0.8)';
        }
      });

      const activeEl = document.getElementById(tier === 'BOOTH_STANDARD' ? 'bqcStandard' : (tier === 'BOOTH_ULTRA' ? 'bqcUltra' : 'bqcHigh'));
      if (activeEl) {
        activeEl.style.border = '1.5px solid #38bdf8';
        activeEl.style.background = 'rgba(56,189,248,0.12)';
      }

      updateBoothSourceValidationUI();
    }

    function updateBoothSourceValidationUI() {
      const tier = currentSelectedBoothQuality;
      const minRequired = tier === 'BOOTH_ULTRA' ? 60 : (tier === 'BOOTH_STANDARD' ? 12 : 30);
      const tokenCost = tier === 'BOOTH_ULTRA' ? 120 : (tier === 'BOOTH_STANDARD' ? 25 : 60);
      const count = currentBoothSourcesList.length;

      const badge = document.getElementById('boothSourceCountBadge');
      const costLabel = document.getElementById('boothCostLabel');
      const btn = document.getElementById('btnTriggerBoothRegeneration');
      const btnText = document.getElementById('btnTriggerBoothRegenText');

      if (badge) {
        const isMet = count >= minRequired;
        badge.innerHTML = isMet
          ? `<i class="fa-solid fa-check"></i> ${count} / ${minRequired} minimum photos (Ready)`
          : `${count} / ${minRequired} minimum photos (Need ${minRequired - count} more)`;
        badge.style.color = isMet ? '#4ade80' : '#fbbf24';
        badge.style.background = isMet ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)';
      }

      if (costLabel) {
        const name = tier === 'BOOTH_ULTRA' ? 'Ultra 3D Booth' : (tier === 'BOOTH_STANDARD' ? 'Standard 3D Booth' : 'High Quality 3D Booth');
        costLabel.textContent = `${name} · ${tokenCost} Nominal Tokens`;
      }

      if (btn && btnText) {
        const isDev = isInternalDevAccount(currentViewerAccount);
        const canRun = count >= minRequired || isDev;
        btn.disabled = !canRun;
        btn.style.opacity = canRun ? '1' : '0.5';
        btnText.textContent = canRun ? 'Generate 3D Booth' : `Add ${minRequired - count} More Photos to Generate`;
      }
    }

    function renderBoothSourceGrid(sources) {
      currentBoothSourcesList = sources || [];
      const grid = document.getElementById('boothSourceGrid');
      if (!grid) return;

      if (sources.length === 0) {
        grid.innerHTML = `<div id="boothSourceEmptyPlaceholder" style="grid-column: 1 / -1; text-align: center; padding: 30px 10px; color: #64748b; font-size: 12px;">No source photos added yet. Upload files or snap photos using live camera.</div>`;
      } else {
        grid.innerHTML = sources.map((s, idx) => `
          <div style="position: relative; background: #0b1526; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; overflow: hidden; height: 90px;">
            <img src="${s.url}" alt="${s.viewLabel}" style="width: 100%; height: 100%; object-fit: cover;">
            <span style="position: absolute; bottom: 2px; left: 2px; font-size: 8.5px; font-weight: 700; background: rgba(0,0,0,0.7); color: #bae6fd; padding: 1px 4px; border-radius: 3px;">
              ${s.sourceType === 'CAMERA_CAPTURE' ? '📷 ' : ''}#${idx + 1} ${s.viewLabel || ''}
            </span>
            <button type="button" onclick="deleteBoothSourceItem('${s.id}')" style="position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(239,68,68,0.85); color: #fff; border: none; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Remove Photo">&times;</button>
          </div>
        `).join('');
      }

      updateBoothSourceValidationUI();
    }

    async function handleBoothMultiFilesUploaded(input) {
      if (!input.files || input.files.length === 0) return;
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();

      for (const file of Array.from(input.files)) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const res = await fetch(`/api/projects/${pid}/booth-3d/sources`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({
                dataUrl: e.target.result,
                viewLabel: file.name.replace(/\.[^/.]+$/, ''),
                sourceType: 'FILE_UPLOAD'
              })
            });
            const data = await res.json();
            if (data.success) {
              renderBoothSourceGrid(data.allSources || []);
            }
          } catch(err) {
            console.error('Upload source error:', err);
          }
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    }

    function openBoothCameraCapture() {
      const count = currentBoothSourcesList.length + 1;
      const defaultLabels = ['Front', 'Front-Left', 'Left', 'Rear-Left', 'Rear', 'Rear-Right', 'Right', 'Front-Right', 'Signage / Logo', 'Upper Details', 'Display Shelf'];
      const viewLabel = defaultLabels[(count - 1) % defaultLabels.length] || `View #${count}`;
      openCameraCaptureModal({ type: 'BOOTH', viewLabel });
    }

    async function deleteBoothSourceItem(sourceId) {
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      try {
        const res = await fetch(`/api/projects/${pid}/booth-3d/sources/${sourceId}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (data.success) renderBoothSourceGrid(data.allSources || []);
      } catch(e) {
        console.error('Delete source error:', e);
      }
    }

    async function triggerBooth3dRegeneration() {
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      const btn = document.getElementById('btnTriggerBoothRegeneration');
      const progressContainer = document.getElementById('boothProgressContainer');
      const stepText = document.getElementById('boothProgressStepText');
      const percentText = document.getElementById('boothProgressPercent');
      const bar = document.getElementById('boothProgressBar');

      if (btn) btn.disabled = true;
      if (progressContainer) progressContainer.style.display = 'block';

      try {
        const res = await fetch(`/api/projects/${pid}/booth-3d/regenerate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            qualityTier: currentSelectedBoothQuality
          })
        });

        const data = await res.json();
        if (!res.ok && !data.jobId) {
          alert('Could not start booth regeneration: ' + (data.error || 'Server error'));
          if (btn) btn.disabled = false;
          return;
        }

        currentActiveBoothJobId = data.jobId;
        if (window.showToast) window.showToast('🚀 Booth 3D reconstruction queued!', 'success');

        // Poll job progress
        boothJobPollInterval = setInterval(async () => {
          try {
            const jobRes = await fetch(`/api/projects/${pid}/booth-3d/jobs/${currentActiveBoothJobId}`);
            const jobData = await jobRes.json();
            if (jobData.success && jobData.job) {
              const job = jobData.job;
              if (percentText) percentText.textContent = `${job.progress || 0}%`;
              if (bar) bar.style.width = `${job.progress || 0}%`;
              if (stepText) stepText.textContent = job.status === 'READY_FOR_REVIEW' ? 'Reconstruction Complete!' : `Status: ${job.status} (${job.progress}%)`;

              if (job.status === 'READY_FOR_REVIEW') {
                clearInterval(boothJobPollInterval);
                boothJobPollInterval = null;
                document.getElementById('boothOwnerAcceptanceSection').style.display = 'block';
                currentCandidateBoothAsset = {
                  previewUrl: job.resultPreviewUrl || '/assets/demo/booth-preview.jpg',
                  qualityTier: job.qualityTier,
                  outputType: job.outputType,
                  sourceCount: job.sourceCount
                };
                const img = document.getElementById('boothReviewPreviewImg');
                if (img) img.src = currentCandidateBoothAsset.previewUrl;
                const brmQ = document.getElementById('brmQuality');
                const brmS = document.getElementById('brmSources');
                const brmF = document.getElementById('brmFormat');
                if (brmQ) brmQ.textContent = job.qualityTier;
                if (brmS) brmS.textContent = `${job.sourceCount || 30} Photos`;
                if (brmF) brmF.textContent = job.outputType || 'Gaussian Splat';
                switchBoothReviewTab('NEW_PREVIEW');
                if (btn) btn.style.display = 'none';
              } else if (job.status === 'FAILED') {
                clearInterval(boothJobPollInterval);
                boothJobPollInterval = null;
                alert('Reconstruction failed: ' + (job.errorCode || 'Worker error'));
                if (btn) btn.disabled = false;
              }
            }
          } catch(e) {}
        }, 1000);

      } catch (err) {
        console.error('Trigger regeneration error:', err);
        alert('Network error: ' + err.message);
        if (btn) btn.disabled = false;
      }
    }

    let currentReviewTab = 'NEW_PREVIEW';
    let currentCandidateBoothAsset = null;

    function switchBoothReviewTab(tab) {
      currentReviewTab = tab;
      const btnCurrent = document.getElementById('tabBtnCurrentBooth');
      const btnNew = document.getElementById('tabBtnNewBoothPreview');
      const img = document.getElementById('boothReviewPreviewImg');
      const label = document.getElementById('boothReviewViewerLabel');

      if (tab === 'CURRENT') {
        if (btnCurrent) {
          btnCurrent.style.background = 'rgba(56,189,248,0.15)';
          btnCurrent.style.borderColor = '#38bdf8';
          btnCurrent.style.color = '#38bdf8';
        }
        if (btnNew) {
          btnNew.style.background = 'rgba(255,255,255,0.06)';
          btnNew.style.borderColor = 'rgba(255,255,255,0.15)';
          btnNew.style.color = '#cbd5e1';
        }
        if (img) img.src = window.activeProjectData?.sourceAsset?.previewUrl || '/assets/demo/booth-preview.jpg';
        if (label) label.textContent = 'Active Booth (Current Live Asset)';
      } else {
        if (btnNew) {
          btnNew.style.background = 'rgba(56,189,248,0.15)';
          btnNew.style.borderColor = '#38bdf8';
          btnNew.style.color = '#38bdf8';
        }
        if (btnCurrent) {
          btnCurrent.style.background = 'rgba(255,255,255,0.06)';
          btnCurrent.style.borderColor = 'rgba(255,255,255,0.15)';
          btnCurrent.style.color = '#cbd5e1';
        }
        if (img) img.src = currentCandidateBoothAsset?.previewUrl || '/assets/demo/booth-preview.jpg';
        if (label) label.textContent = 'New 3D Reconstruction Candidate';
      }
    }

    function switchActiveBoothTexture(newPhotoUrl, projectData) {
      if (photoMaterial && textureLoader && newPhotoUrl) {
        textureLoader.load(newPhotoUrl, (tex) => {
          tex.encoding = THREE.sRGBEncoding;
          tex.minFilter = THREE.LinearMipMapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
          tex.needsUpdate = true;
          photoMaterial.map = tex;
          photoMaterial.needsUpdate = true;
          recalculatePinpointPositions(projectData || window.activeProjectData);
          updateHotspots();
        });
      }
    }

    async function confirmApplyNewBooth() {
      if (!confirm('Apply this reconstructed Booth? The current Booth will be preserved in Version History and can be restored later.')) {
        return;
      }
      await acceptNewBoothAsset();
    }

    async function acceptNewBoothAsset() {
      if (!currentActiveBoothJobId) return;
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();
      const btn = document.getElementById('btnApplyNewBooth');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying Booth...';
      }

      try {
        const res = await fetch(`/api/projects/${pid}/booth-3d/jobs/${currentActiveBoothJobId}/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          }
        });
        const data = await res.json();
        if (data.success && data.activeBooth) {
          // Update project state
          if (window.activeProjectData) {
            window.activeProjectData.booth3d = data.activeBooth;
            if (data.activeBooth.previewUrl) {
              window.activeProjectData.sourceAsset = window.activeProjectData.sourceAsset || {};
              window.activeProjectData.sourceAsset.previewUrl = data.activeBooth.previewUrl;
            }
            if (data.history) window.activeProjectData.booth3dHistory = data.history;
          }

          // Switch main 3D scene visual texture immediately
          switchActiveBoothTexture(data.activeBooth.previewUrl, window.activeProjectData);

          if (window.showToast) window.showToast('🎉 New 3D Booth applied and activated!', 'success');
          closeBooth3dRegenerationModal();
        } else {
          alert('Error applying booth: ' + (data.error || 'Server error'));
        }
      } catch(e) {
        console.error('Apply booth error:', e);
        alert('Could not apply booth: ' + e.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Apply New Booth';
        }
      }
    }

    function openBoothRollbackList() {
      const history = window.activeProjectData?.booth3dHistory || [];
      if (history.length === 0) {
        alert('Version History: You are on Booth Version 1. Previous versions will appear here when new reconstructions are applied.');
        return;
      }

      const versionListText = history.map((v, i) => `${i + 1}. ${v.label || 'Booth Version'} (${v.qualityTier || 'Standard'}) - ${new Date(v.archivedAt).toLocaleString()}`).join('\n');
      const choice = prompt(`Version History & Rollback:\n\n${versionListText}\n\nEnter version number (1 - ${history.length}) to restore:`);
      if (choice) {
        const idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < history.length) {
          rollbackToVersion(history[idx].versionId);
        }
      }
    }

    async function rollbackToVersion(versionId) {
      if (!confirm('Restore this previous Booth version?')) return;
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();

      try {
        const res = await fetch(`/api/projects/${pid}/booth-3d/rollback/${versionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          }
        });
        const data = await res.json();
        if (data.success && data.activeBooth) {
          if (window.activeProjectData) {
            window.activeProjectData.booth3d = data.activeBooth;
            if (data.activeBooth.previewUrl) {
              window.activeProjectData.sourceAsset = window.activeProjectData.sourceAsset || {};
              window.activeProjectData.sourceAsset.previewUrl = data.activeBooth.previewUrl;
            }
          }
          switchActiveBoothTexture(data.activeBooth.previewUrl, window.activeProjectData);
          if (window.showToast) window.showToast('⏪ Restored previous Booth version!', 'success');
        }
      } catch(e) {
        alert('Rollback error: ' + e.message);
      }
    }

    function removeOwnerProductImage() {
      const input = document.getElementById('opeImageInput');
      const preview = document.getElementById('opeImagePreview');
      const removeBtn = document.getElementById('opeBtnRemoveImg');
      if (input) input.value = '';
      if (preview) {
        preview.src = '';
        preview.style.display = 'none';
      }
      if (removeBtn) removeBtn.style.display = 'none';
    }

    async function saveOwnerProduct(e) {
      e.preventDefault();
      if (!activeProjectId) return;

      const slot = parseInt(document.getElementById('opeSlotIndex').value, 10) || 1;
      const name = document.getElementById('opeName').value.trim();
      if (!name) {
        alert('Product Name is required.');
        return;
      }

      const sku = document.getElementById('opeSku').value.trim();
      const category = document.getElementById('opeCategory').value.trim();
      const price = document.getElementById('opePrice').value.trim();
      const availability = document.getElementById('opeAvailability').value;
      const shortDescription = document.getElementById('opeShortDesc').value.trim();
      const description = document.getElementById('opeDesc').value.trim();
      const fileInput = document.getElementById('opeImageInput');

      const formData = new FormData();
      formData.append('slotIndex', slot);
      formData.append('name', name);
      if (sku) formData.append('sku', sku);
      if (category) formData.append('category', category);
      if (price) formData.append('price', price);
      if (availability) formData.append('availability', availability);
      if (shortDescription) formData.append('shortDescription', shortDescription);
      if (description) formData.append('description', description);
      if (description) formData.append('specifications', description);

      if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('productImage', fileInput.files[0]);
      }

      const token = getEditAuthToken();
      const btnSave = document.getElementById('opeBtnSave');
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const res = await fetch(`/api/projects/${activeProjectId}/products`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
          activeProjectData = data.project || activeProjectData;
          
          // Save catalog memberships
          const selectedCatalogs = Array.from(document.querySelectorAll('.ope-catalog-cb:checked')).map(cb => cb.value);
          const prodId = data.product?.id || `prod-slot-${slot}`;
          await syncProductCatalogMemberships(prodId, selectedCatalogs);

          // Attach product to pending pin if creating from blank pin (C11.16-P3.10)
          if (window.pendingPinAttachment && window.pendingPinAttachment.pinId) {
            const pinId = window.pendingPinAttachment.pinId;
            const pin = (activeProjectData.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
            if (pin) {
              pin.isDraft = false;
              pin.status = 'ACTIVE';
              pin.publicVisible = true;
              if (!Array.isArray(pin.productIds)) pin.productIds = [];
              if (!pin.productIds.includes(prodId)) pin.productIds.push(prodId);
              pin.productId = pin.productIds[0];
              pin.targetId = pin.productId;
              pin.pinType = pin.productIds.length > 1 ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN';

              try {
                await fetch(`/api/projects/${activeProjectId}/pins/${pinId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
                  body: JSON.stringify(pin)
                });
              } catch(e) {}
            }
            window.pendingPinAttachment = null;
          }
  

          setupStudioProducts(activeProjectData);
          closeOwnerProductEditor();
        } else {
          if (res.status === 403 && (data.code === 'PRODUCT_LIMIT_EXCEEDED' || data.code === 'ENTITLEMENT_REQUIRED')) {
            openPlanModal('product_limit_exceeded');
          } else {
            alert(data.error || data.message || 'Failed to save product.');
          }
        }
      } catch (err) {
        alert('Network error while saving product: ' + err.message);
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Product';
        }
      }
    }

    async function syncProductCatalogMemberships(prodId, selectedCatalogIds) {
      if (!activeProjectData?.catalogs) return;
      const token = getEditAuthToken();
      for (const cat of activeProjectData.catalogs) {
        const catId = cat.catalogId || cat.id;
        const shouldBeMember = selectedCatalogIds.includes(catId);
        let pids = Array.isArray(cat.productIds) ? [...cat.productIds] : [];
        const has = pids.includes(prodId);
        if (shouldBeMember && !has) {
          pids.push(prodId);
          try {
            await fetch(`/api/projects/${activeProjectId}/catalogs/${catId}/membership`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ productIds: pids })
            });
            cat.productIds = pids;
          } catch(e) {}
        } else if (!shouldBeMember && has) {
          pids = pids.filter(x => x !== prodId);
          try {
            await fetch(`/api/projects/${activeProjectId}/catalogs/${catId}/membership`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ productIds: pids })
            });
            cat.productIds = pids;
          } catch(e) {}
        }
      }
    }

    async function deleteOwnerProduct() {
      if (!activeProjectId) return;
      const slot = parseInt(document.getElementById('opeSlotIndex').value, 10) || 1;
      const rawProd = (activeProjectData?.products || []).find(p => p.slotIndex === slot);
      const prodName = rawProd?.name || `Slot 0${slot}`;

      if (!confirm(`Are you sure you want to delete "${prodName}"? This will clear the slot and reset its 3D pinpoint.`)) {
        return;
      }

      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/products/${slot}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });

        const data = await res.json();
        if (res.ok && data.success) {
          activeProjectData = data.project || activeProjectData;
          setupStudioProducts(activeProjectData);
          closeOwnerProductEditor();
        } else {
          alert(data.error || 'Failed to clear product slot.');
        }
      } catch (err) {
        alert('Network error while deleting product: ' + err.message);
      }
    }

    // ============================================================
    // 2. PUBLIC PRODUCT DETAIL WORKFLOW (Read-Only + Buyer Actions)
    // ============================================================
    window.currentViewingFromCatalogId = null;

    function openPublicProductDetail(idxOrProd, fromCatalogId = null) {
      let p = typeof idxOrProd === 'number' ? studioProducts[idxOrProd] : idxOrProd;
      if (!p) return;

      window.currentViewingFromCatalogId = fromCatalogId;
      const backBtn = document.getElementById('ppdBackToCatalogBtn');
      if (backBtn) {
        backBtn.style.display = fromCatalogId ? 'inline-flex' : 'none';
      }

      document.getElementById('ppdModalTitle').textContent = p.name || 'Product Details';
      document.getElementById('ppdCategory').textContent = p.category || 'EXHIBIT PRODUCT';
      const priceEl = document.getElementById('ppdPrice');
      if (priceEl) {
        priceEl.textContent = p.price ? p.price : '';
        priceEl.style.display = p.price ? 'block' : 'none';
      }
      
      const img = document.getElementById('ppdImage');
      if (img) img.src = p.imageUrl || '/assets/product-placeholder.jpg';
      
      const descEl = document.getElementById('ppdDesc');
      if (descEl) descEl.textContent = p.desc || p.shortDescription || p.description || 'No description provided.';
      
      const specsContainer = document.getElementById('ppdSpecs');
      if (specsContainer) {
        const specsList = Array.isArray(p.specs) ? p.specs : [
          ['SKU / Model', p.sku || 'Standard'],
          ['Category', p.category || 'General'],
          ['Status', p.availability || 'Active']
        ];
        specsContainer.innerHTML = specsList.map(([k, v]) => `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px;">
            <span style="color: #94a3b8;">${k}</span>
            <span style="color: #fff; font-weight: 600;">${v}</span>
          </div>
        `).join('');
      }

      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-scroll-lock');

      const modal = document.getElementById('publicProductDetailModal');
      if (modal) modal.style.display = 'flex';
    }

    function closePublicProductDetail() {
      const modal = document.getElementById('publicProductDetailModal');
      if (modal) modal.style.display = 'none';
      if (!window.currentViewingFromCatalogId) {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-scroll-lock');
      }
    }

    function backToCatalogView() {
      closePublicProductDetail();
      if (window.currentViewingFromCatalogId) {
        openCatalogProductList(window.currentViewingFromCatalogId);
      }
    }

    // ============================================================
    // 3. MULTI-PRODUCT CATALOG VIEWER (CATALOG_PIN Public Modal)
    // ============================================================
    function openCatalogProductList(catalogId) {
      const catalogs = activeProjectData?.catalogs || [];
      const cat = catalogs.find(c => c.catalogId === catalogId || c.id === catalogId);
      if (!cat) {
        alert('Catalog not found.');
        return;
      }

      document.getElementById('cplTitle').textContent = cat.name;
      document.getElementById('cplDesc').textContent = cat.description || '';
      
      const allProds = activeProjectData?.products || [];
      const memberProds = (cat.productIds || []).map(pid => {
        return allProds.find(p => p.id === pid || p.slotIndex === pid || `prod-slot-${p.slotIndex}` === pid);
      }).filter(Boolean);

      const countBadge = document.getElementById('cplProductCountBadge');
      if (countBadge) countBadge.textContent = `${memberProds.length} Products`;

      const grid = document.getElementById('cplProductGrid');
      if (grid) {
        if (memberProds.length === 0) {
          grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 32px 16px; color: #64748b;">
              <i class="fa-solid fa-box-open" style="font-size: 32px; color: #c084fc; margin-bottom: 10px; display: block;"></i>
              No products assigned to this catalog yet.
            </div>
          `;
        } else {
          grid.innerHTML = memberProds.map((prod) => `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
              <img src="${prod.imageUrl || '/assets/product-placeholder.jpg'}" style="width: 100%; height: 130px; object-fit: contain; background: #030712; border-radius: 8px;">
              <div>
                <div style="font-size: 10px; font-weight: 800; color: #c084fc; text-transform: uppercase;">${prod.category || 'PRODUCT'}</div>
                <div style="font-size: 14px; font-weight: 800; color: #fff; margin: 2px 0;">${prod.name}</div>
                ${prod.price ? `<div style="font-size: 12px; font-weight: 700; color: #38bdf8;">${prod.price}</div>` : ''}
                <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.4; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${prod.shortDescription || prod.description || ''}</div>
              </div>
              <button class="btn-ui" onclick='openPublicProductDetail(${JSON.stringify(prod)}, "${cat.catalogId || cat.id}")' style="margin-top: auto; padding: 6px 12px; font-size: 11.5px; font-weight: 700; background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.4); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                View Details <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          `).join('');
        }
      }

      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-scroll-lock');

      const modal = document.getElementById('catalogProductListModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeCatalogProductList() {
      const modal = document.getElementById('catalogProductListModal');
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = '';
      document.body.classList.remove('modal-scroll-lock');
    }

    // ============================================================
    // 4. OWNER CATALOG MANAGEMENT (CRUD & Membership)
    // ============================================================
    async function openCatalogManager() {
      const isDev = isInternalDevAccount(currentViewerAccount);
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot && !isDev;

      if (isFree) {
        openPlanModal('gated_catalogs');
        return;
      }

      await loadProjectCatalogs();
      renderCatalogManagerList();

      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-scroll-lock');

      const modal = document.getElementById('catalogManagerModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeCatalogManager() {
      const modal = document.getElementById('catalogManagerModal');
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = '';
      document.body.classList.remove('modal-scroll-lock');
    }

    async function loadProjectCatalogs() {
      if (!activeProjectId) return;
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/catalogs`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          activeProjectData = activeProjectData || {};
          activeProjectData.catalogs = data.catalogs || [];
        }
      } catch (e) {
        console.warn('[Load Catalogs Error]', e.message);
      }
    }

    function renderCatalogManagerList() {
      const listEl = document.getElementById('catalogManagerList');
      if (!listEl) return;
      const catalogs = activeProjectData?.catalogs || [];

      if (catalogs.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 32px; color: #64748b;">
            <i class="fa-solid fa-book-open" style="font-size: 32px; color: #c084fc; margin-bottom: 10px; display: block;"></i>
            No product catalogs created yet. Click <strong>+ Create Catalog</strong> to organize your products into collections.
          </div>
        `;
        return;
      }

      const pins = activeProjectData?.pinpoints || [];

      listEl.innerHTML = catalogs.map(cat => {
        const catId = cat.catalogId || cat.id;
        const count = Array.isArray(cat.productIds) ? cat.productIds.length : 0;
        const hasPin = pins.some(p => p.pinType === 'CATALOG_PIN' && (p.targetId === catId || p.catalogId === catId));
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 15px; font-weight: 800; color: #fff;">${cat.name}</span>
                <span style="font-size: 10px; font-weight: 800; background: rgba(168,85,247,0.2); color: #c084fc; padding: 2px 8px; border-radius: 4px;">${count} Products</span>
                ${hasPin ? `<span style="font-size: 10px; font-weight: 800; background: rgba(56,189,248,0.2); color: #38bdf8; padding: 2px 8px; border-radius: 4px;"><i class="fa-solid fa-location-dot"></i> Pinned in 3D</span>` : ''}
              </div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">${cat.description || 'No description'}</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-ui" onclick='openCatalogProductList("${catId}")' style="padding: 6px 12px; font-size: 11.5px; background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer;">
                <i class="fa-solid fa-eye"></i> View
              </button>
              <button class="btn-ui" onclick='openCatalogEditor("${catId}")' style="padding: 6px 12px; font-size: 11.5px; background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.4); border-radius: 6px; cursor: pointer;">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button class="btn-ui" onclick='pinCatalogTo3D("${catId}")' style="padding: 6px 12px; font-size: 11.5px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); border-radius: 6px; cursor: pointer;">
                <i class="fa-solid fa-location-crosshairs"></i> ${hasPin ? 'Reposition Pin' : 'Pin to 3D'}
              </button>
              <button class="btn-ui" onclick='deleteCatalogById("${catId}")' style="padding: 6px 10px; font-size: 11.5px; background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; cursor: pointer;" title="Delete Catalog (Preserves Products)">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    let editingCatalogProductOrder = [];

    function openCatalogEditor(catalogId = null) {
      const modal = document.getElementById('catalogEditorModal');
      if (!modal) return;

      const isEdit = !!catalogId;
      const cat = isEdit ? (activeProjectData?.catalogs || []).find(c => c.catalogId === catalogId || c.id === catalogId) : null;

      document.getElementById('ceCatalogId').value = catalogId || '';
      document.getElementById('ceModalTitle').textContent = isEdit ? 'Edit Catalog' : 'Create Catalog';
      document.getElementById('ceName').value = cat ? cat.name : '';
      document.getElementById('ceDesc').value = cat ? (cat.description || '') : '';
      
      const btnDelete = document.getElementById('ceBtnDelete');
      if (btnDelete) btnDelete.style.display = isEdit ? 'inline-flex' : 'none';

      editingCatalogProductOrder = cat && Array.isArray(cat.productIds) ? [...cat.productIds] : [];

      renderCatalogProductPickers();

      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-scroll-lock');

      modal.style.display = 'flex';
    }

    function closeCatalogEditor() {
      const modal = document.getElementById('catalogEditorModal');
      if (modal) modal.style.display = 'none';
    }

    function renderCatalogProductPickers() {
      const container = document.getElementById('ceProductCheckboxes');
      const orderContainer = document.getElementById('ceProductOrderList');
      const badge = document.getElementById('ceSelectedCountBadge');
      if (!container) return;

      const prods = (activeProjectData?.products || []).filter(p => p && p.name && p.name.trim() && !p.name.startsWith('Product Slot'));

      if (prods.length === 0) {
        container.innerHTML = `<span style="font-size: 11px; color: #64748b;">No real products created yet. Add products first to include them in this catalog.</span>`;
        if (orderContainer) orderContainer.innerHTML = `<span style="font-size: 11px; color: #64748b;">No products selected</span>`;
        if (badge) badge.textContent = '0 Selected';
        return;
      }

      container.innerHTML = prods.map(p => {
        const pid = p.id || `prod-slot-${p.slotIndex}`;
        const isChecked = editingCatalogProductOrder.includes(pid);
        return `
          <label style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.02); margin-bottom: 4px; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" value="${pid}" ${isChecked ? 'checked' : ''} onchange="handleCatalogProductCheckToggle(this)" style="accent-color: #c084fc;">
              <img src="${p.imageUrl || '/assets/product-placeholder.jpg'}" style="width: 28px; height: 28px; object-fit: contain; border-radius: 4px; background: #030712;">
              <div>
                <span style="font-size: 12.5px; font-weight: 700; color: #fff;">${p.name}</span>
                <span style="font-size: 11px; color: #94a3b8; margin-left: 6px;">${p.sku ? `(${p.sku})` : ''}</span>
              </div>
            </div>
            <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">${p.price || ''}</span>
          </label>
        `;
      }).join('');

      renderCatalogOrderList(prods);
    }

    function handleCatalogProductCheckToggle(checkbox) {
      const pid = checkbox.value;
      if (checkbox.checked) {
        if (!editingCatalogProductOrder.includes(pid)) editingCatalogProductOrder.push(pid);
      } else {
        editingCatalogProductOrder = editingCatalogProductOrder.filter(x => x !== pid);
      }
      const prods = (activeProjectData?.products || []).filter(p => p && p.name && p.name.trim() && !p.name.startsWith('Product Slot'));
      renderCatalogOrderList(prods);
    }

    function renderCatalogOrderList(prods) {
      const orderContainer = document.getElementById('ceProductOrderList');
      const badge = document.getElementById('ceSelectedCountBadge');
      if (badge) badge.textContent = `${editingCatalogProductOrder.length} Selected`;
      if (!orderContainer) return;

      if (editingCatalogProductOrder.length === 0) {
        orderContainer.innerHTML = `<span style="font-size: 11px; color: #64748b; padding: 4px;">No products selected yet. Check products above.</span>`;
        return;
      }

      orderContainer.innerHTML = editingCatalogProductOrder.map((pid, idx) => {
        const prod = prods.find(p => (p.id || `prod-slot-${p.slotIndex}`) === pid);
        const name = prod?.name || pid;
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 12px; color: #fff;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 10px; font-weight: 800; color: #c084fc; width: 18px;">#${idx + 1}</span>
              <span>${name}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-ui" onclick="moveCatalogProductItem(${idx}, -1)" style="padding: 2px 6px; font-size: 10px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
              <button type="button" class="btn-ui" onclick="moveCatalogProductItem(${idx}, 1)" style="padding: 2px 6px; font-size: 10px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;" ${idx === editingCatalogProductOrder.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function moveCatalogProductItem(idx, dir) {
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= editingCatalogProductOrder.length) return;
      const temp = editingCatalogProductOrder[idx];
      editingCatalogProductOrder[idx] = editingCatalogProductOrder[newIdx];
      editingCatalogProductOrder[newIdx] = temp;
      const prods = (activeProjectData?.products || []).filter(p => p && p.name && p.name.trim() && !p.name.startsWith('Product Slot'));
      renderCatalogOrderList(prods);
    }

    async function saveCatalogForm(e) {
      e.preventDefault();
      if (!activeProjectId) return;

      const catId = document.getElementById('ceCatalogId').value;
      const name = document.getElementById('ceName').value.trim();
      const description = document.getElementById('ceDesc').value.trim();

      if (!name) {
        alert('Catalog Name is required.');
        return;
      }

      const token = getEditAuthToken();
      const isEdit = !!catId;
      const url = isEdit ? `/api/projects/${activeProjectId}/catalogs/${catId}` : `/api/projects/${activeProjectId}/catalogs`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            name,
            description,
            productIds: editingCatalogProductOrder
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          activeProjectData = activeProjectData || {};
          activeProjectData.catalogs = data.catalogs || activeProjectData.catalogs;
          closeCatalogEditor();
          renderCatalogManagerList();
          alert(`✅ Catalog "${name}" saved successfully.`);
        } else {
          alert(data.error || 'Failed to save catalog.');
        }
      } catch (err) {
        alert('Network error while saving catalog: ' + err.message);
      }
    }

    async function deleteCatalogById(catalogId) {
      if (!confirm('Are you sure you want to delete this catalog? Underlying products will NOT be deleted.')) {
        return;
      }
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/catalogs/${catalogId}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          activeProjectData.catalogs = data.catalogs || [];
          renderCatalogManagerList();
          recalculatePinpointPositions(activeProjectData);
          buildHotspotsDOM();
          alert('✅ Catalog deleted.');
        } else {
          alert(data.error || 'Failed to delete catalog.');
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    }

    function deleteCurrentCatalog() {
      const catId = document.getElementById('ceCatalogId').value;
      if (catId) {
        closeCatalogEditor();
        deleteCatalogById(catId);
      }
    }

    async function pinCatalogTo3D(catalogId) {
      closeCatalogManager();
      window.currentEditingPinTarget = { type: 'CATALOG_PIN', id: catalogId };
      if (!window.PIN_EDIT_MODE) {
        togglePinEditMode();
      } else {
        syncActivePinInputs();
      }
    }

    function togglePreviewMode() {
      if (window.VIEWER_MODE === 'OWNER_EDITOR') {
        window.VIEWER_MODE = 'PUBLIC_VIEWER';
        const btn = document.getElementById('btnTogglePreviewMode');
        if (btn) {
          btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Exit Preview';
          btn.style.background = 'rgba(56,189,248,0.2)';
          btn.style.color = '#38bdf8';
        }
      } else {
        window.VIEWER_MODE = isProjectOwner ? 'OWNER_EDITOR' : 'PUBLIC_VIEWER';
        const btn = document.getElementById('btnTogglePreviewMode');
        if (btn) {
          btn.innerHTML = '<i class="fa-solid fa-eye"></i> Visitor Preview';
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.color = '#94a3b8';
        }
      }
      applyViewerModeUI();
      renderProductCardsTray(activeProjectData?.products || []);
    }

    // ═══════════════════════════════════════════════════════════
    // DIRECT MANIPULATION PIN POSITION EDITOR (C11.16-P3.5)
    // ═══════════════════════════════════════════════════════════
    let initialPinCoordinates = {};
    let pinAutosaveDebounce = null;
    window.currentEditingPinTarget = { type: 'PRODUCT_PIN', id: '1' };

    function togglePinEditMode() {
      const isDev = isInternalDevAccount(currentViewerAccount);
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot && !isDev;

      if (isFree) {
        openPlanModal('gated_pin_edit');
        return;
      }

      window.PIN_EDIT_MODE = !window.PIN_EDIT_MODE;
      const panel = document.getElementById('pinPositionEditorPanel');
      const btn = document.getElementById('btnTogglePinEdit');
      const container = document.getElementById('viewer-container');

      if (window.PIN_EDIT_MODE) {
        if (panel) panel.style.display = 'block';
        if (btn) btn.classList.add('active');
        syncActivePinInputs();
      } else {
        if (panel) panel.style.display = 'none';
        if (btn) btn.classList.remove('active');
        document.querySelectorAll('.hotspot-tag').forEach(el => el.classList.remove('pin-edit-active'));
      }
    }

    function handlePinDirectDrag(clientX, clientY) {
      const container = document.getElementById('viewer-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();

      // Clamp pointer to valid interactive viewer container boundaries
      const clampedX = Math.max(rect.left, Math.min(rect.right, clientX));
      const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));

      let u, v;
      if (camera && renderer && typeof THREE !== 'undefined') {
        // 3D Spherical Raycasting for exact spatial placement
        const mouse = new THREE.Vector2(
          ((clampedX - rect.left) / rect.width) * 2 - 1,
          -((clampedY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const dir = raycaster.ray.direction.clone().normalize();

        const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
        v = 1 - (phi / Math.PI);
        const theta = Math.atan2(dir.z, -dir.x);
        u = (theta + Math.PI + 0.45) / (2 * Math.PI);
        u = ((u % 1) + 1) % 1; // Normalize to 0..1
        v = Math.max(0.0001, Math.min(0.9999, v));
      } else {
        // 2D Normalized container fallback
        u = (clampedX - rect.left) / rect.width;
        v = (clampedY - rect.top) / rect.height;
        u = Math.max(0.0000, Math.min(1.0000, u));
        v = Math.max(0.0000, Math.min(1.0000, v));
      }

      const pin = getOrCreateActivePin();
      pin.u = Number(u.toFixed(4));
      pin.v = Number(v.toFixed(4));

      // Update Fine Position numerical display live
      const inputU = document.getElementById('pinInputU');
      const inputV = document.getElementById('pinInputV');
      if (inputU) inputU.value = pin.u.toFixed(4);
      if (inputV) inputV.value = pin.v.toFixed(4);

      // Recompute 3D position and render under cursor immediately
      recalculatePinpointPositions(activeProjectData);
      updateHotspots();
      setPinSaveStatus('Saving...');
    }

    function startPinEditForSelectedSlot(slot) {
      const targetSlot = slot || (currentSelectedProdIdx + 1);
      window.currentEditingPinTarget = { type: 'PRODUCT_PIN', id: String(targetSlot) };
      if (!window.PIN_EDIT_MODE) {
        togglePinEditMode();
      } else {
        syncActivePinInputs();
      }
    }

    function syncActivePinInputs() {
      const selector = document.getElementById('pinTargetSelector');
      if (!selector) return;

      const prods = (activeProjectData?.products || []);
      const catalogs = (activeProjectData?.catalogs || []);
      const rawPinpoints = (activeProjectData?.pinpoints || []);

      // Build options list
      let optionsHTML = '';

      // 1. Product Slots
      [1, 2, 3].forEach(slot => {
        const prod = prods.find(p => p.slotIndex === slot);
        const name = prod?.name && prod.name.trim() && !prod.name.startsWith('Product Slot') ? prod.name : `Slot 0${slot}`;
        optionsHTML += `<option value="PRODUCT_PIN:${slot}">📦 Product: ${name}</option>`;
      });

      // 2. Catalogs
      catalogs.forEach(cat => {
        const catId = cat.catalogId || cat.id;
        optionsHTML += `<option value="CATALOG_PIN:${catId}">📚 Catalog: ${cat.name}</option>`;
      });

      selector.innerHTML = optionsHTML;

      const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
      const curKey = `${cur.type}:${cur.id}`;
      selector.value = curKey;
      if (!selector.value) {
        selector.selectedIndex = 0;
        const [t, i] = (selector.value || 'PRODUCT_PIN:1').split(':');
        window.currentEditingPinTarget = { type: t, id: i };
      }

      // Find active pin coordinates
      let activePin = null;
      if (window.currentEditingPinTarget.type === 'CATALOG_PIN') {
        activePin = rawPinpoints.find(p => p.pinType === 'CATALOG_PIN' && (p.targetId === window.currentEditingPinTarget.id || p.catalogId === window.currentEditingPinTarget.id));
      } else {
        const slot = parseInt(window.currentEditingPinTarget.id, 10) || 1;
        activePin = rawPinpoints.find(p => p.slotIndex === slot || p.targetId === `prod-slot-${slot}`);
      }

      const u = typeof activePin?.u === 'number' ? activePin.u : 0.5;
      const v = typeof activePin?.v === 'number' ? activePin.v : 0.5;

      const pinKey = `${window.currentEditingPinTarget.type}_${window.currentEditingPinTarget.id}`;
      if (initialPinCoordinates[pinKey] === undefined) {
        initialPinCoordinates[pinKey] = { u, v };
      }

      const inputU = document.getElementById('pinInputU');
      const inputV = document.getElementById('pinInputV');
      if (inputU) inputU.value = u.toFixed(4);
      if (inputV) inputV.value = v.toFixed(4);

      setPinSaveStatus('Saved');
      highlightActiveEditingHotspot();
    }

    function handlePinTargetChange(val) {
      if (!val) return;
      const [type, id] = val.split(':');
      window.currentEditingPinTarget = { type, id };
      syncActivePinInputs();
    }

    function getOrCreateActivePin() {
      activeProjectData = activeProjectData || {};
      activeProjectData.pinpoints = activeProjectData.pinpoints || [];
      const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
      
      // 1. Check if pinpoint exists by exact ID, targetId, or pinData reference
      let pin = activeProjectData.pinpoints.find(p => 
        (cur.id && (p.id === cur.id || p.pinId === cur.id || p.targetId === cur.id)) ||
        (cur.pinData && (p.id === cur.pinData.id || p.pinId === cur.pinData.id))
      );
      if (pin) return pin;

      // 2. Catalog Pin lookup / creation
      if (cur.type === 'CATALOG_PIN') {
        pin = activeProjectData.pinpoints.find(p => p.pinType === 'CATALOG_PIN' && (p.targetId === cur.id || p.catalogId === cur.id));
        if (!pin) {
          const cat = (activeProjectData.catalogs || []).find(c => (c.catalogId || c.id) === cur.id);
          pin = {
            id: `pin-cat-${cur.id}`,
            pinId: `pin-cat-${cur.id}`,
            pinType: 'CATALOG_PIN',
            targetId: cur.id,
            catalogId: cur.id,
            label: cat ? `Catalog · ${cat.name}` : 'Catalog Pin',
            u: 0.5000,
            v: 0.5000,
            status: 'ACTIVE'
          };
          activeProjectData.pinpoints.push(pin);
        }
        return pin;
      }

      // 3. Slot Number lookup / creation (only if cur.id is pure integer 1..9)
      const slotNum = /^[0-9]+$/.test(String(cur.id)) ? parseInt(cur.id, 10) : null;
      if (slotNum !== null) {
        pin = activeProjectData.pinpoints.find(p => p.slotIndex === slotNum || p.targetId === `prod-slot-${slotNum}`);
        if (!pin) {
          const prod = (activeProjectData.products || []).find(p => p.slotIndex === slotNum);
          pin = {
            id: `pin-slot-${slotNum}`,
            pinId: `pin-slot-${slotNum}`,
            pinType: 'PRODUCT_PIN',
            slotIndex: slotNum,
            targetId: prod?.id || `prod-slot-${slotNum}`,
            productId: prod?.id || `prod-slot-${slotNum}`,
            label: prod?.name || `Product Slot ${slotNum}`,
            u: slotNum === 1 ? 0.2800 : (slotNum === 2 ? 0.5000 : 0.7200),
            v: slotNum === 2 ? 0.5500 : 0.6000,
            status: 'ACTIVE'
          };
          activeProjectData.pinpoints.push(pin);
        }
        return pin;
      }

      // 4. Custom / Blank Pin fallback
      pin = {
        id: cur.id || `pin-${Date.now().toString(36)}`,
        pinType: cur.type || 'PRODUCT_PIN',
        targetId: cur.id || null,
        u: 0.5000,
        v: 0.5000,
        status: 'ACTIVE'
      };
      activeProjectData.pinpoints.push(pin);
      return pin;
    }

    function highlightActiveEditingHotspot() {
      const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
      document.querySelectorAll('.hotspot-tag').forEach(el => {
        let isTarget = false;
        if (cur.type === 'CATALOG_PIN') {
          isTarget = el.id === `pin-cat-${cur.id}` || el.id === cur.id;
        } else {
          isTarget = el.id === `pin-slot-${cur.id}` || el.id === `hotspot-slot-${cur.id}`;
        }
        el.classList.toggle('pin-edit-active', isTarget);
      });
    }

    function setPinSaveStatus(status) {
      const badge = document.getElementById('pinSaveStatusBadge');
      const btnManual = document.getElementById('btnSavePinManual');
      if (badge) {
        badge.textContent = status;
        if (status === 'Saved') {
          badge.style.background = 'rgba(34,197,94,0.2)';
          badge.style.color = '#4ade80';
        } else if (status === 'Saving...') {
          badge.style.background = 'rgba(245,158,11,0.2)';
          badge.style.color = '#fbbf24';
        } else if (status === 'Unsaved Changes') {
          badge.style.background = 'rgba(56,189,248,0.2)';
          badge.style.color = '#38bdf8';
        } else if (status.includes('Error') || status.includes('Couldn')) {
          badge.style.background = 'rgba(239,68,68,0.2)';
          badge.style.color = '#f87171';
        }
      }
      if (btnManual) {
        btnManual.textContent = status === 'Saving...' ? 'Saving...' : (status === 'Saved' ? 'Saved' : 'Save Position');
      }
    }

    function handlePinNumericInput(axis, val) {
      let num = parseFloat(val);
      if (isNaN(num)) return;
      num = Math.max(0.0000, Math.min(1.0000, num));

      const pin = getOrCreateActivePin();
      pin[axis] = num;

      recalculatePinpointPositions(activeProjectData);
      setPinSaveStatus('Unsaved Changes');
    }

    function nudgeActivePin(deltaU, deltaV) {
      const isOwner = (window.VIEWER_MODE === 'OWNER_EDITOR');
      if (!isOwner) return;
      const pin = getOrCreateActivePin();

      pin.u = Math.max(0.0000, Math.min(1.0000, (pin.u || 0.5) + deltaU));
      pin.v = Math.max(0.0000, Math.min(1.0000, (pin.v || 0.5) + deltaV));

      const inputU = document.getElementById('pinInputU');
      const inputV = document.getElementById('pinInputV');
      if (inputU) inputU.value = pin.u.toFixed(4);
      if (inputV) inputV.value = pin.v.toFixed(4);

      recalculatePinpointPositions(activeProjectData);
      updateHotspots();
      setPinSaveStatus('Unsaved Changes');
    }

    async function saveActivePinPosition() {
      if (!activeProjectId) return;
      const token = getEditAuthToken();
      setPinSaveStatus('Saving...');

      try {
        const res = await fetch(`/api/projects/${activeProjectId}/pinpoints`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          },
          body: JSON.stringify({
            pinpoints: activeProjectData.pinpoints || []
          })
        });

        const data = await res.json();
        if (res.ok) {
          setPinSaveStatus('Saved');
          const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
          const pinKey = `${cur.type}_${cur.id}`;
          const pin = getOrCreateActivePin();
          initialPinCoordinates[pinKey] = { u: pin.u, v: pin.v };
          preDragCoords = { u: pin.u, v: pin.v };
          recalculatePinpointPositions(activeProjectData);
          updateHotspots();
        } else {
          if (res.status === 403 && data.code === 'ENTITLEMENT_UPGRADE_REQUIRED') {
            openPlanModal('pin_save_gated');
          }
          setPinSaveStatus("Couldn't save position");
          console.warn('[Save Pin Warning]', data.error);
        }
      } catch (err) {
        setPinSaveStatus("Couldn't save position");
        console.error('[Save Pin Error]', err);
      }
    }

    async function deleteActivePin() {
      const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
      if (!confirm('Are you sure you want to delete this 3D pin?')) return;

      if (cur.type === 'CATALOG_PIN') {
        activeProjectData.pinpoints = (activeProjectData.pinpoints || []).filter(p => !(p.pinType === 'CATALOG_PIN' && (p.targetId === cur.id || p.catalogId === cur.id)));
      } else {
        const slot = parseInt(cur.id, 10) || 1;
        activeProjectData.pinpoints = (activeProjectData.pinpoints || []).filter(p => !(p.slotIndex === slot || p.targetId === `prod-slot-${slot}`));
      }

      await saveActivePinPosition();
      setupStudioProducts(activeProjectData);
      syncActivePinInputs();
    }

    function cancelPinEdit() {
      resetActivePinPosition();
      togglePinEditMode();
    }

    function resetActivePinPosition() {
      const cur = window.currentEditingPinTarget || { type: 'PRODUCT_PIN', id: '1' };
      const pinKey = `${cur.type}_${cur.id}`;
      if (initialPinCoordinates[pinKey]) {
        const pin = getOrCreateActivePin();
        pin.u = initialPinCoordinates[pinKey].u;
        pin.v = initialPinCoordinates[pinKey].v;

        const inputU = document.getElementById('pinInputU');
        const inputV = document.getElementById('pinInputV');
        if (inputU) inputU.value = initialPinCoordinates[pinKey].u.toFixed(4);
        if (inputV) inputV.value = initialPinCoordinates[pinKey].v.toFixed(4);
        recalculatePinpointPositions(activeProjectData);
        setPinSaveStatus('Saved');
      }
    }

    function initPinInteractionListeners() {
      const container = document.getElementById('viewer-container');
      if (!container || container._hasPinListeners) return;
      container._hasPinListeners = true;

      container.addEventListener('pointerdown', (e) => {
        if (!window.PIN_EDIT_MODE) return;
        const hotspot = e.target.closest('.hotspot-tag');
        if (hotspot) {
          isDraggingPin = true;
          if (controls) controls.enabled = false;
          e.preventDefault();
        }
      });

      window.addEventListener('pointermove', (e) => {
        if (!window.PIN_EDIT_MODE || !isDraggingPin) return;
        const rect = container.getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

        const u = Math.max(0.0000, Math.min(1.0000, (clientX - rect.left) / rect.width));
        const v = Math.max(0.0000, Math.min(1.0000, (clientY - rect.top) / rect.height));

        const pin = getOrCreateActivePin();
        pin.u = Number(u.toFixed(4));
        pin.v = Number(v.toFixed(4));

        const inputU = document.getElementById('pinInputU');
        const inputV = document.getElementById('pinInputV');
        if (inputU) inputU.value = pin.u.toFixed(4);
        if (inputV) inputV.value = pin.v.toFixed(4);

        recalculatePinpointPositions(activeProjectData);
        setPinSaveStatus('Unsaved Changes');
      });

      window.addEventListener('pointerup', () => {
        if (isDraggingPin) {
          isDraggingPin = false;
          if (controls) controls.enabled = true;
        }
      });

      container.addEventListener('click', (e) => {
        if (!window.PIN_EDIT_MODE || isDraggingPin) return;
        if (e.target.closest('#pinPositionEditorPanel') || e.target.closest('.viewer-controls-bar')) return;

        const rect = container.getBoundingClientRect();
        const u = Math.max(0.0000, Math.min(1.0000, (e.clientX - rect.left) / rect.width));
        const v = Math.max(0.0000, Math.min(1.0000, (e.clientY - rect.top) / rect.height));

        const pin = getOrCreateActivePin();
        pin.u = Number(u.toFixed(4));
        pin.v = Number(v.toFixed(4));

        const inputU = document.getElementById('pinInputU');
        const inputV = document.getElementById('pinInputV');
        if (inputU) inputU.value = pin.u.toFixed(4);
        if (inputV) inputV.value = pin.v.toFixed(4);

        recalculatePinpointPositions(activeProjectData);
        setPinSaveStatus('Unsaved Changes');
      });

      window.addEventListener('keydown', (e) => {
        // Global Escape key listener to close active modals
        if (e.key === 'Escape') {
          if (document.getElementById('ownerProductEditorModal')?.style.display === 'flex') {
            closeOwnerProductEditor();
          } else if (document.getElementById('catalogEditorModal')?.style.display === 'flex') {
            closeCatalogEditor();
          } else if (document.getElementById('catalogManagerModal')?.style.display === 'flex') {
            closeCatalogManager();
          } else if (document.getElementById('catalogProductListModal')?.style.display === 'flex') {
            closeCatalogProductList();
          } else if (document.getElementById('publicProductDetailModal')?.style.display === 'flex') {
            closePublicProductDetail();
          }
          return;
        }

        if (!window.PIN_EDIT_MODE) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        const step = e.shiftKey ? 0.0100 : 0.0010;
        if (e.key === 'ArrowLeft') {
          nudgeActivePin(-step, 0);
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          nudgeActivePin(step, 0);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          nudgeActivePin(0, -step);
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          nudgeActivePin(0, step);
          e.preventDefault();
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // BOOTH RADAR MINIMAP & VIEWPOINT MANAGER ENGINE
    // ═══════════════════════════════════════════════════════════
    async function loadProjectViewpoints() {
      if (!activeProjectId) return;
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          window.savedViewpoints = data.viewpoints || [];
          renderViewpointsList();
          updateMinimapEmptyState();
        }
      } catch (e) {
        console.warn('[Load Viewpoints Error]', e.message);
      }
    }

    function updateMinimapEmptyState() {
      const emptyEl = document.getElementById('radarEmptyState');
      if (emptyEl) {
        emptyEl.style.display = (!window.savedViewpoints || window.savedViewpoints.length === 0) ? 'block' : 'none';
      }
      const countEl = document.getElementById('viewpointCountTxt');
      if (countEl) {
        countEl.textContent = `${(window.savedViewpoints || []).length} / 20 Viewpoints`;
      }
    }

    async function handleCaptureCurrentViewpoint() {
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot;

      if (isFree) {
        openPlanModal('gated_viewpoints');
        return;
      }

      if (!activeProjectId) return;
      if (window.savedViewpoints && window.savedViewpoints.length >= 20) {
        alert('Maximum technical safety cap of 20 viewpoints per booth reached.');
        return;
      }

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const yaw = Math.atan2(camDir.x, camDir.z);
      const pitch = Math.asin(camDir.y);
      const u = ((yaw + Math.PI + 0.45) / (2 * Math.PI)) % 1.0;
      const v = 1 - (Math.acos(camDir.y) / Math.PI);

      const defaultName = `View ${window.savedViewpoints.length + 1}`;
      const name = prompt('Enter a name for this viewpoint:', defaultName);
      if (name === null) return;

      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            name: name.trim() || defaultName,
            yaw,
            pitch,
            centerU: u,
            centerV: v,
            zoom: 1.0,
            isDefault: window.savedViewpoints.length === 0
          })
        });

        const data = await res.json();
        if (res.ok) {
          window.savedViewpoints = data.viewpoints || [];
          renderViewpointsList();
          updateMinimapEmptyState();
          alert(`✅ Viewpoint "${name.trim() || defaultName}" captured and saved.`);
        } else {
          if (res.status === 403 && data.code === 'ENTITLEMENT_UPGRADE_REQUIRED') {
            openPlanModal('viewpoint_save_gated');
          } else {
            alert(data.error || 'Failed to save viewpoint.');
          }
        }
      } catch (err) {
        console.error('[Create Viewpoint Error]', err);
      }
    }

    function openViewpointManager() {
      const isPilot = currentViewerAccount?.isPilot || currentViewerAccount?.billingState === 'PILOT_NOT_BILLED' || activeProjectData?.isPilot;
      const ent = (currentViewerAccount?.entitlement || activeProjectData?.entitlement || 'FREE_BOOTH').toUpperCase();
      const isFree = (ent === 'FREE_BOOTH' || ent === 'FREE') && !isPilot;

      if (isFree) {
        openPlanModal('gated_viewpoints');
        return;
      }

      const modal = document.getElementById('viewpointManagerModal');
      if (modal) {
        modal.style.display = 'flex';
        renderViewpointsList();
      }
    }

    function closeViewpointManager() {
      const modal = document.getElementById('viewpointManagerModal');
      if (modal) modal.style.display = 'none';
    }

    function renderViewpointsList() {
      const listEl = document.getElementById('viewpointsListContainer');
      if (!listEl) return;
      listEl.innerHTML = '';

      if (!window.savedViewpoints || window.savedViewpoints.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 24px; color: #64748b; font-size: 13px;">
            <i class="fa-solid fa-camera" style="font-size: 24px; color: #38bdf8; margin-bottom: 8px; display: block;"></i>
            No saved viewpoints yet. Use <strong>Capture Current View</strong> to save your first vantage point.
          </div>
        `;
        updateMinimapEmptyState();
        return;
      }

      window.savedViewpoints.forEach((vp, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'background: #030712; border: 1px solid rgba(56,189,248,0.25); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;';
        
        const isDef = vp.isDefault === true;
        const u = typeof vp.centerU === 'number' ? vp.centerU.toFixed(4) : (typeof vp.yaw === 'number' ? vp.yaw.toFixed(4) : '0.5000');
        const v = typeof vp.centerV === 'number' ? vp.centerV.toFixed(4) : (typeof vp.pitch === 'number' ? vp.pitch.toFixed(4) : '0.5000');

        item.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <input type="text" value="${vp.name || 'View ' + (idx + 1)}" onchange="handleRenameViewpoint('${vp.viewpointId || vp.id}', this.value)" style="background: transparent; border: 1px solid transparent; color: #fff; font-size: 13px; font-weight: 700; border-radius: 4px; padding: 2px 4px; width: 140px;" onfocus="this.style.borderColor='#38bdf8'; this.style.background='#0b1526';" onblur="this.style.borderColor='transparent'; this.style.background='transparent';">
              ${isDef ? '<span style="font-size: 9px; font-weight: 800; background: rgba(74,222,128,0.2); color: #4ade80; border: 1px solid #4ade80; border-radius: 4px; padding: 1px 5px;">DEFAULT</span>' : ''}
            </div>
            <div style="font-size: 11px; color: #64748b; font-family: monospace;">U: ${u} • V: ${v}</div>
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="btn-ui" onclick="flyToViewpoint('${vp.viewpointId || vp.id}')" style="padding: 4px 8px; font-size: 11px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); border-radius: 6px; cursor: pointer;" title="Fly to this view">
              <i class="fa-solid fa-eye"></i> Go
            </button>
            <button class="btn-ui" onclick="updateViewpointFromCurrent('${vp.viewpointId || vp.id}')" style="padding: 4px 8px; font-size: 11px; background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer;" title="Update from current camera angle">
              <i class="fa-solid fa-arrows-rotate"></i> Update
            </button>
            ${!isDef ? `<button class="btn-ui" onclick="setViewpointDefault('${vp.viewpointId || vp.id}')" style="padding: 4px 8px; font-size: 11px; background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer;" title="Set as Default View">⭐</button>` : ''}
            <button class="btn-ui" onclick="deleteViewpoint('${vp.viewpointId || vp.id}')" style="padding: 4px 8px; font-size: 11px; background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; cursor: pointer;" title="Delete viewpoint">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;
        listEl.appendChild(item);
      });
      updateMinimapEmptyState();
    }

    function flyToViewpoint(vpId) {
      const vp = (window.savedViewpoints || []).find(v => (v.viewpointId === vpId || v.id === vpId));
      if (!vp || !camera || !controls) return;
      window.activeViewpointId = vpId;
      const radarLoc = document.getElementById('radar-loc-txt');
      if (radarLoc) radarLoc.textContent = (vp.name || 'VIEWPOINT').toUpperCase();

      if (typeof vp.yaw === 'number') {
        const phi = typeof vp.pitch === 'number' ? (Math.PI / 2 - vp.pitch) : Math.PI / 2;
        const theta = vp.yaw;
        const targetDir = new THREE.Vector3(
          Math.sin(theta) * Math.sin(phi),
          Math.cos(phi),
          Math.cos(theta) * Math.sin(phi)
        );
        camera.lookAt(targetDir);
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }

    async function updateViewpointFromCurrent(vpId) {
      if (!activeProjectId) return;
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const yaw = Math.atan2(camDir.x, camDir.z);
      const pitch = Math.asin(camDir.y);
      const u = ((yaw + Math.PI + 0.45) / (2 * Math.PI)) % 1.0;
      const v = 1 - (Math.acos(camDir.y) / Math.PI);

      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints/${vpId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ yaw, pitch, centerU: u, centerV: v, zoom: 1.0 })
        });
        const data = await res.json();
        if (res.ok) {
          window.savedViewpoints = data.viewpoints || [];
          renderViewpointsList();
          alert('✅ Viewpoint coordinates updated.');
        } else {
          alert(data.error || 'Failed to update viewpoint.');
        }
      } catch (err) {
        console.error('[Update Viewpoint Error]', err);
      }
    }

    async function handleRenameViewpoint(vpId, newName) {
      if (!activeProjectId || !newName.trim()) return;
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints/${vpId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ name: newName.trim() })
        });
        const data = await res.json();
        if (res.ok) {
          window.savedViewpoints = data.viewpoints || [];
        }
      } catch (err) {}
    }

    async function setViewpointDefault(vpId) {
      if (!activeProjectId) return;
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints/${vpId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ isDefault: true })
        });
        const data = await res.json();
        if (res.ok) {
          window.savedViewpoints = data.viewpoints || [];
          renderViewpointsList();
        }
      } catch (err) {}
    }

    async function deleteViewpoint(vpId) {
      if (!activeProjectId) return;
      if (!confirm('Are you sure you want to delete this viewpoint? (Booth assets and products will not be affected)')) return;
      const token = getEditAuthToken();
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/viewpoints/${vpId}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok) {
          window.savedViewpoints = data.viewpoints || [];
          renderViewpointsList();
        } else {
          alert(data.error || 'Failed to delete viewpoint.');
        }
      } catch (err) {
        console.error('[Delete Viewpoint Error]', err);
      }
    }

    function drawRadar() {
      const cvs = document.getElementById('radar-canvas');
      if (!cvs || !camera) return;
      const ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = '#00c2ff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(16, 8, cvs.width - 32, cvs.height - 16);
      ctx.fillStyle = '#ffffff';
      [[16,8],[cvs.width-16,8],[16,cvs.height-8],[cvs.width-16,cvs.height-8]].forEach(([x,y]) => ctx.fillRect(x-2, y-2, 4, 4));

      // Draw saved viewpoints on radar
      if (window.savedViewpoints && window.savedViewpoints.length > 0) {
        window.savedViewpoints.forEach((vp, idx) => {
          const u = typeof vp.centerU === 'number' ? vp.centerU : (((vp.yaw || 0) + Math.PI) / (2 * Math.PI));
          const v = typeof vp.centerV === 'number' ? vp.centerV : 0.5;
          const rx = 24 + u * (cvs.width - 48);
          const ry = 16 + v * (cvs.height - 32);

          const isAct = (window.activeViewpointId === vp.viewpointId || window.activeViewpointId === vp.id);
          ctx.beginPath();
          ctx.arc(rx, ry, isAct ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isAct ? '#38bdf8' : 'rgba(56,189,248,0.6)';
          ctx.fill();
          if (isAct) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        });
      }

      // Draw 3 product hotspot points
      const radarPositions = [{ x: 75, y: 45 }, { x: 153, y: 35 }, { x: 231, y: 45 }];
      radarPositions.forEach((pos, idx) => {
        const isCur = idx === currentSelectedProdIdx;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isCur ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isCur ? '#00c2ff' : 'rgba(255,255,255,0.4)';
        ctx.fill();
        if (isCur) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
      });

      // Draw camera vantage viewing cone
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const angle = Math.atan2(camDir.x, camDir.z);
      ctx.fillStyle = 'rgba(0,194,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(153, 75);
      ctx.arc(153, 75, 30, angle - 0.45, angle + 0.45);
      ctx.closePath();
      ctx.fill();
    }

            function studioAnimate(time) {
      requestAnimationFrame(studioAnimate);
      if (controls) controls.update();
      updateHotspots();
      drawRadar();

      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    }

    // ── Inspection Drawer & Mini 3D Turntable ──
    function initDrawer3D() {
      const canvas = document.getElementById('drawer-3d-canvas');
      if (!canvas) return;

      drawer3dScene = new THREE.Scene();
      drawer3dCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      drawer3dCamera.position.set(0, 2.2, 4.5);

      drawer3dRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      drawer3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      drawer3dRenderer.outputEncoding = THREE.sRGBEncoding;

      drawer3dControls = new THREE.OrbitControls(drawer3dCamera, canvas);
      drawer3dControls.enableDamping = true;
      drawer3dControls.dampingFactor = 0.08;
      drawer3dControls.autoRotate = true;
      drawer3dControls.autoRotateSpeed = 2.0;
      drawer3dControls.minDistance = 2.0;
      drawer3dControls.maxDistance = 8.0;
      drawer3dControls.target.set(0, 0.6, 0);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x051122, 1.2);
      drawer3dScene.add(hemiLight);

      const dirLight1 = new THREE.DirectionalLight(0x00c2ff, 1.5);
      dirLight1.position.set(5, 8, 5);
      drawer3dScene.add(dirLight1);

      const grid = new THREE.GridHelper(3.6, 16, 0x00c2ff, 0x1e293b);
      grid.position.y = 0;
      drawer3dScene.add(grid);

      renderDrawer3DLoop();
    }

    function renderDrawer3DLoop() {
      requestAnimationFrame(renderDrawer3DLoop);
      if (currentMediaMode === '3d' && drawer3dRenderer && drawer3dScene && drawer3dCamera) {
        drawer3dControls.update();
        drawer3dRenderer.render(drawer3dScene, drawer3dCamera);
      }
    }

    function buildProceduralRobotModel(type) {
      if (drawer3dModelGroup) {
        drawer3dScene.remove(drawer3dModelGroup);
        drawer3dModelGroup.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else c.material.dispose();
          }
        });
      }

      drawer3dModelGroup = new THREE.Group();
      const matWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.15, wireframe: drawer3dWireframe });
      const matMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.85, wireframe: drawer3dWireframe });
      const matCyan = new THREE.MeshStandardMaterial({ color: 0x00c2ff, emissive: 0x00c2ff, emissiveIntensity: 0.6, roughness: 0.1, wireframe: drawer3dWireframe });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 32), matMetal);
      base.position.y = 0.15;
      drawer3dModelGroup.add(base);

      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), matCyan);
      shoulder.position.y = 0.45;
      drawer3dModelGroup.add(shoulder);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 24), matWhite);
      upperArm.position.set(0.2, 0.95, 0);
      upperArm.rotation.z = -0.35;
      drawer3dModelGroup.add(upperArm);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 24), matMetal);
      elbow.position.set(0.4, 1.45, 0);
      drawer3dModelGroup.add(elbow);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 24), matWhite);
      forearm.position.set(0.15, 1.8, 0);
      forearm.rotation.z = 0.45;
      drawer3dModelGroup.add(forearm);

      drawer3dScene.add(drawer3dModelGroup);
    }

    function setDrawerMediaMode(mode) {
      currentMediaMode = mode;
      const tabPhoto = document.getElementById('tab-photo');
      const tab3d = document.getElementById('tab-3d');
      const imgEl = document.getElementById('drw-img');
      const view3d = document.getElementById('drawer-3d-view');

      if (mode === '3d') {
        if (tabPhoto) tabPhoto.classList.remove('active');
        if (tab3d) tab3d.classList.add('active');
        if (imgEl) imgEl.style.display = 'none';
        if (view3d) view3d.style.display = 'block';

        const p = studioProducts[currentSelectedProdIdx];
        buildProceduralRobotModel(p?.robotType || 'cobot');

        const rect = document.getElementById('drw-img-box')?.getBoundingClientRect();
        if (drawer3dRenderer && drawer3dCamera && rect) {
          drawer3dCamera.aspect = rect.width / rect.height;
          drawer3dCamera.updateProjectionMatrix();
          drawer3dRenderer.setSize(rect.width, rect.height);
        }
      } else {
        if (tabPhoto) tabPhoto.classList.add('active');
        if (tab3d) tab3d.classList.remove('active');
        if (imgEl) imgEl.style.display = 'block';
        if (view3d) view3d.style.display = 'none';
      }
    }

    function toggleDrawer3dAutoRotate() {
      drawer3dAutoRotate = !drawer3dAutoRotate;
      if (drawer3dControls) drawer3dControls.autoRotate = drawer3dAutoRotate;
      const btn = document.getElementById('btn-3d-autorot');
      if (btn) btn.textContent = '🔄 Auto-Rotate: ' + (drawer3dAutoRotate ? 'ON' : 'OFF');
    }

    function toggleDrawer3dWireframe() {
      drawer3dWireframe = !drawer3dWireframe;
      const p = studioProducts[currentSelectedProdIdx];
      buildProceduralRobotModel(p?.robotType || 'cobot');
      const btn = document.getElementById('btn-3d-wire');
      if (btn) btn.textContent = '⚡ Wireframe: ' + (drawer3dWireframe ? 'ON' : 'OFF');
    }

    function resetDrawer3dCamera() {
      if (drawer3dCamera && drawer3dControls) {
        drawer3dCamera.position.set(0, 2.2, 4.5);
        drawer3dControls.target.set(0, 0.6, 0);
      }
    }

    function openProductDrawer(idx) {
      currentSelectedProdIdx = idx;
      const p = studioProducts[idx];
      if (!p) return;

      document.getElementById('drw-badge').textContent = p.category;
      document.getElementById('drw-model').textContent = `SLOT-0${p.slotIndex}`;
      document.getElementById('drw-title').textContent = p.name;
      document.getElementById('drw-desc').textContent = p.desc;
      document.getElementById('drw-img').src = p.imageUrl;

      const tbl = document.getElementById('drw-specs-table');
      if (tbl) {
        tbl.innerHTML = p.specs.map(([k,v]) =>
          `<tr><td>${k}</td><td>${v}</td></tr>`
        ).join('');
      }

      const hl = document.getElementById('drw-highlights');
      if (hl) {
        hl.innerHTML = p.highlights.map(h => `<div style="margin-bottom:4px;">• ${h}</div>`).join('');
      }

      setDrawerMediaMode('photo');
      document.getElementById('product-drawer').classList.add('open');
      document.getElementById('drawer-scrim').classList.add('open');
    }

    function closeDrawer() {
      document.getElementById('product-drawer').classList.remove('open');
      document.getElementById('drawer-scrim').classList.remove('open');
    }

    function openEditProductModal(slotIdx) {
      closeDrawer();
      openOwnerProductEditor(studioProducts[slotIdx]?.slotIndex || (slotIdx + 1));
    }

    async function loadProjectIntoStudio(projectId) {
      try {
        const res = await fetch(`/api/free-funnel/projects/${projectId}`);
        const data = await res.json();
        if (data.project) {
          activeProjectId = data.project.id;
          activeProjectData = data.project;
          renderStudioBooth(data.project);
        }
      } catch (err) {
        console.error('Error loading project:', err);
      }
    }

    function zoomView(factor) {
      if (camera) {
        camera.fov = Math.max(30, Math.min(90, camera.fov / factor));
        camera.updateProjectionMatrix();
      }
    }

    function resetPanZoom() {
      if (camera && controls) {
        camera.fov = 65;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        camera.position.set(0, 0, 0.01);
      }
    }

    function toggleFullscreen() {
      const container = document.getElementById('viewer-container');
      if (!document.fullscreenElement) {
        if (container) container.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen().catch(err => console.warn(err));
      }
    }

    // ── Canonical Product Cards UI Rendering (Synchronized with Owner Editor) ──
    function renderProductCards(products) {
      const grid = document.getElementById('productCardsGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const isOwner = (window.VIEWER_MODE === 'OWNER_EDITOR');

      for (let s = 1; s <= 3; s++) {
        const prod = (products || []).find(p => p.slotIndex === s) || {
          slotIndex: s,
          name: '',
          imageUrl: '',
          description: '',
          status: 'EMPTY',
          completionPct: 0
        };

        const isFilled = prod.status === 'COMPLETE' || prod.status === 'BASIC' || (prod.name && prod.name.trim() && !prod.name.startsWith('Product Slot'));
        const statusClass = isFilled ? 'status-complete' : 'status-empty';
        const statusLabel = isFilled ? 'ACTIVE (100%)' : 'EMPTY (0%)';

        const card = document.createElement('div');
        card.className = `blank-product-card ${isFilled ? 'filled-card' : ''}`;
        card.onclick = () => {
          if (window.VIEWER_MODE === 'OWNER_EDITOR') {
            openOwnerProductEditor(s);
          } else {
            openPublicProductDetail(s - 1);
          }
        };

        card.innerHTML = `
          <div>
            <div class="product-card-header">
              <span class="product-card-slot">PRODUCT 0${s}</span>
              <span class="product-card-status ${statusClass}">${statusLabel}</span>
            </div>

            <div class="product-card-img-box">
              <img src="${prod.imageUrl || '/assets/product-placeholder.jpg'}" alt="${prod.name || 'Product'}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>

            <div class="product-card-title">${prod.name || `Product Slot 0${s}`}</div>
            <div class="product-card-desc">${prod.shortDescription || prod.description || (isOwner ? 'Click to upload image & enter specifications.' : 'Slot available for exhibition.')}</div>
          </div>

          <div>
            <div class="product-card-progress">
              <div class="product-card-progress-fill" style="width: ${isFilled ? 100 : 0}%;"></div>
            </div>

            <div style="display: flex; gap: 8px;">
              <button class="btn-hero ${isFilled ? 'btn-hero-secondary' : 'btn-hero-primary'}" onclick="event.stopPropagation(); if (window.VIEWER_MODE === 'OWNER_EDITOR') openOwnerProductEditor(${s}); else openPublicProductDetail(${s - 1});" style="flex: 1; padding: 8px 12px; font-size: 12px; justify-content: center;">
                <i class="fa-solid ${isFilled ? 'fa-pen-to-square' : 'fa-plus'}"></i> ${isFilled ? (isOwner ? 'Edit Product' : 'Inspect Product') : (isOwner ? 'Add Product' : 'View Slot')}
              </button>
              <button class="btn-hero btn-hero-secondary" onclick="event.stopPropagation(); focusProduct(${s - 1}); openPublicProductDetail(${s - 1});" style="padding: 8px 12px; font-size: 12px;">
                <i class="fa-solid fa-eye"></i> Details
              </button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      }
    }

    function updateNextStepCTA() {
      const prods = activeProjectData?.products || [];
      const realProds = prods.filter(p => p.name && p.name.trim() && !p.name.startsWith('Product Slot'));
      const completedCount = realProds.length;

      const titleEl = document.getElementById('nextStepTitle');
      const subEl = document.getElementById('nextStepSubtitle');
      const btnEl = document.getElementById('btnNextStepAction');
      if (!titleEl || !subEl || !btnEl) return;

      if (completedCount === 0) {
        titleEl.textContent = 'NEXT STEP: ADD YOUR FIRST PRODUCT';
        subEl.textContent = 'Slot 1 is ready. Anchor your first exhibit item to start engaging buyers.';
        btnEl.innerHTML = '<i class="fa-solid fa-plus"></i> ADD YOUR FIRST PRODUCT';
        btnEl.onclick = () => openOwnerProductEditor(1);
      } else if (completedCount === 1) {
        titleEl.textContent = 'NEXT STEP: ADD PRODUCT 2';
        subEl.textContent = 'Product 1 configured! Add your second exhibit product to expand your catalog.';
        btnEl.innerHTML = '<i class="fa-solid fa-plus"></i> ADD PRODUCT 2';
        btnEl.onclick = () => openOwnerProductEditor(2);
      } else if (completedCount === 2) {
        titleEl.textContent = 'NEXT STEP: ADD PRODUCT 3';
        subEl.textContent = 'Almost complete! Add your third exhibit product to complete your preview.';
        btnEl.innerHTML = '<i class="fa-solid fa-plus"></i> ADD PRODUCT 3';
        btnEl.onclick = () => openOwnerProductEditor(3);
      } else {
        titleEl.textContent = 'ALL 3 SLOTS COMPLETE — READY TO PUBLISH';
        subEl.textContent = 'Your 3D booth is fully populated. Activate commercial features to publish.';
        btnEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> EDIT PRODUCTS';
        btnEl.onclick = () => openOwnerProductEditor(1);
      }
    }

    function handleNextStepCTA() {
      const prods = activeProjectData?.products || [];
      const realProds = prods.filter(p => p.name && p.name.trim() && !p.name.startsWith('Product Slot'));
      const completedCount = realProds.length;
      if (completedCount < 3) {
        openOwnerProductEditor(completedCount + 1);
      } else {
        openOwnerProductEditor(1);
      }
    }

    // ── Safe Canonical Routing Shims for Legacy Callers ──
    function startProductOnboarding(slotIndex, u, v) {
      if (window.VIEWER_MODE === 'OWNER_EDITOR') {
        openOwnerProductEditor(slotIndex || 1);
      } else {
        openPublicProductDetail((slotIndex || 1) - 1);
      }
    }

    function openAddProductModal() {
      openOwnerProductEditor(1);
    }

    function closeAddProductModal() {
      closeOwnerProductEditor();
    }

    function previewProdImage(input) {
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = document.getElementById('prod-image-preview');
          img.src = e.target.result;
          img.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
      }
    }

    async function generateAIDescription() {
      const prodName = document.getElementById('prod-name-input').value.trim();
      const bizName = activeProjectData?.businessName || document.getElementById('business-name-input').value.trim() || 'Exhibitor';
      if (!prodName) return alert('Please enter a Product Name first.');

      try {
        const res = await fetch('/api/free-funnel/ai/suggest-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productName: prodName, businessName: bizName })
        });
        const data = await res.json();
        if (data.suggestedDescription) {
          document.getElementById('prod-desc-input').value = data.suggestedDescription;
          document.getElementById('ai-draft-notice').style.display = 'block';
        }
      } catch (err) {
        alert('AI draft assist error: ' + err.message);
      }
    }

    async function submitProductPinpoint(e) {
      e.preventDefault();
      const slot = parseInt(document.getElementById('target-slot-index').value, 10) || currentSlotSetting;
      const name = document.getElementById('prod-name-input').value.trim();
      const desc = document.getElementById('prod-desc-input').value.trim();
      const imgInput = document.getElementById('prod-image-input');

      if (!name) return alert('Product Name is required.');
      if (!activeProjectId) return alert('No active project.');

      const formData = new FormData();
      formData.append('slotIndex', slot);
      formData.append('productName', name);
      formData.append('description', desc);
      formData.append('u', pendingCoords.u);
      formData.append('v', pendingCoords.v);
      if (imgInput.files && imgInput.files[0]) {
        formData.append('productImage', imgInput.files[0]);
      }

      try {
        const res = await fetch(`/api/free-funnel/projects/${activeProjectId}/pinpoints`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message || 'Failed to save product.');

        closeAddProductModal();
        activeProjectData = data.project;
        logAnalyticsEvent(`product_${slot}_completed`, { slotIndex: slot, productName: name });

        setupStudioProducts(data.project);
        renderProductCards(data.project.products || []);
        updateNextStepCTA();

        focusProduct(slot - 1);
      } catch (err) {
        alert('Error saving product: ' + err.message);
      }
    }

    // ── Product Details Navigation ──
    function openProductDrawerForSlot(slot) {
      const idx = slot - 1;
      if (idx >= 0 && idx < studioProducts.length) {
        onProductSlotClicked(idx);
      }
    }

    function openProductDrawer(idxOrProduct) {
      if (typeof idxOrProduct === 'number') {
        onProductSlotClicked(idxOrProduct);
      } else if (idxOrProduct && typeof idxOrProduct.slotIndex === 'number') {
        onProductSlotClicked(idxOrProduct.slotIndex - 1);
      } else {
        openPublicProductDetail(currentSelectedProdIdx);
      }
    }

    function closeProductDrawer() {
      closePublicProductDetail();
      closeOwnerProductEditor();
    }

    // ── Plan Conversion Modal (C09 Zero Data Re-entry Stripe Link) ──
    function openPlanModal(trigger = '') {
      closeProductDrawer();
      const modal = document.getElementById('planModal');
      if (modal) modal.style.display = 'flex';
      logAnalyticsEvent('upgrade_prompt_opened', { trigger });
    }

    function closePlanModal() {
      const modal = document.getElementById('planModal');
      if (modal) modal.style.display = 'none';
    }

    function closeEmailVerifyModal() {
      const modal = document.getElementById('emailVerifyModal');
      if (modal) modal.style.display = 'none';
    }

    function openDuplicateModal(title, desc, existingProjectId) {
      existingDuplicateProjectId = existingProjectId || null;
      const modal = document.getElementById('duplicateBoothModal');
      const titleEl = document.getElementById('duplicateModalTitle');
      const descEl = document.getElementById('duplicateModalDesc');
      if (titleEl) titleEl.textContent = title || 'We Found Your Existing Booth';
      if (descEl) descEl.textContent = desc || 'A free 3D virtual booth preview has already been created for this business or email.';
      if (modal) modal.style.display = 'flex';
    }

    function closeDuplicateModal() {
      const modal = document.getElementById('duplicateBoothModal');
      if (modal) modal.style.display = 'none';
    }

    async function handleDuplicateContinue() {
      closeDuplicateModal();
      if (existingDuplicateProjectId) {
        showProgress();
        updateProgressDisplay(50, 'LOADING EXISTING 3D BOOTH', 'Loading Your 3D Booth', 'Retrieving your interactive 3D virtual booth preview...');
        try {
          const res = await fetch('/api/projects/' + existingDuplicateProjectId);
          if (res.ok) {
            const data = await res.json();
            updateProgressDisplay(100, 'YOUR 3D BOOTH IS READY', '3D Virtual Booth Ready!', '3 Product Pinpoint Slots Initialized!');
            setTimeout(() => {
              hideProgress();
              activeProjectId = existingDuplicateProjectId;
              activeProjectData = data.project || data;
              renderStudioBooth(activeProjectData);
            }, 300);
            return;
          }
        } catch(e) {}
        hideProgress();
      }
      const studio = document.getElementById('freeStudioSection');
      if (studio) studio.scrollIntoView({ behavior: 'smooth' });
    }

    function openSaveEmailModal() {
      openPlanModal('save_booth');
    }

    function closeSaveEmailModal() {
      closePlanModal();
    }

    async function submitSaveEmail(e) {
      e.preventDefault();
      const email = document.getElementById('save-email-input').value.trim();
      if (!email) return;
      try {
        const res = await fetch(`/api/free-funnel/projects/${activeProjectId}/save-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert('Your booth has been saved! You can resume editing anytime.');
        closeSaveEmailModal();
      } catch (err) {
        alert('Error saving booth email: ' + err.message);
      }
    }

    async function handlePlanSelection(plan, btnEl) {
      logAnalyticsEvent('plan_selected', { plan });

      if (plan === 'custom') {
        closePlanModal();
        if (typeof window.openConsultationModal === 'function') {
          window.openConsultationModal('Custom Enterprise 3D Solution');
        } else {
          window.location.href = '/pricing.html#custom-quote';
        }
        return;
      }

      const originalText = btnEl ? btnEl.innerHTML : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-bolt fa-spin" style="margin-right: 6px;"></i> Entering Payment Pipeline...';
      }

      try {
        const token = localStorage.getItem('token');
        const emailEl = document.getElementById('email') || document.getElementById('save-email-input') || document.getElementById('verifyTargetEmailTxt');
        const email = emailEl ? (emailEl.value || emailEl.textContent || '').trim() : '';
        const bizEl = document.getElementById('businessName');
        const businessName = bizEl ? bizEl.value.trim() : '';

        // Convert project on backend preserving all data (Zero Data Re-entry)
        if (activeProjectId) {
          await fetch(`/api/free-funnel/projects/${activeProjectId}/convert-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan })
          });
        }

        logAnalyticsEvent('stripe_checkout_started', { plan, projectId: activeProjectId });

        let checkoutUrl = null;

        if (token) {
          const checkRes = await fetch('/api/billing/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ requestedPlan: plan, consentTerms: true, consentRecurring: true, projectId: activeProjectId })
          });
          const checkData = await checkRes.json();
          if (checkData.checkoutUrl) {
            checkoutUrl = checkData.checkoutUrl;
          }
        } else {
          // Direct Guest Checkout Session
          const guestRes = await fetch('/api/billing/guest-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestedPlan: plan,
              projectId: activeProjectId,
              email: email,
              businessName: businessName
            })
          });
          const guestData = await guestRes.json();
          if (guestData.checkoutUrl) {
            checkoutUrl = guestData.checkoutUrl;
          } else if (guestData.redirectUrl) {
            checkoutUrl = guestData.redirectUrl;
          }
        }

        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }

        // Direct fallback to pricing payment gateway
        window.location.href = `/pricing.html?plan=${plan}&projectId=${activeProjectId || ''}&direct_checkout=1`;
      } catch (err) {
        console.error('Payment pipeline error:', err);
        window.location.href = `/pricing.html?plan=${plan}&projectId=${activeProjectId || ''}&direct_checkout=1`;
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = originalText;
        }
      }
    }

    function openSignInModal() {
      const email = prompt('Enter your exhibitor email:', 'developer@vshow.com');
      if (email) {
        const pass = prompt('Enter password:', 'admin123');
        if (pass) {
          fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
          }).then(r => r.json()).then(d => {
            if (d.token) {
              localStorage.setItem('token', d.token);
              alert(`Signed in as ${d.user.name}`);
            } else {
              alert(d.error || 'Login failed.');
            }
          });
        }
      }
    }
  
function toggleIframeFullscreen(iframeId, fallbackUrl) {
  const frame = document.getElementById(iframeId);
  if (frame) {
    if (frame.requestFullscreen) {
      frame.requestFullscreen();
    } else if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    } else if (frame.msRequestFullscreen) {
      frame.msRequestFullscreen();
    } else {
      window.open(fallbackUrl, '_blank');
    }
  } else {
    window.open(fallbackUrl, '_blank');
  }
}


// ── Video Play Toggle & Robust State Binding ─────────────────────────
function togglePlayVideo(videoId, btnId) {
  const video = document.getElementById(videoId);
  const btn = document.getElementById(btnId);
  if (!video) return;
  if (video.paused) {
    video.play().catch(err => console.log('Playback error:', err));
  } else {
    video.pause();
  }
}

// 모든 비디오 상태 변경 이벤트(play, playing, pause, ended)에 대한 UI 자동 동기화
function initVideoPlayerSync() {
  const players = [
    { videoId: 'vfr-video-player', btnId: 'vfr-play-btn' },
    { videoId: 'vma-video-player', btnId: 'vma-play-btn' }
  ];

  players.forEach(({ videoId, btnId }) => {
    const video = document.getElementById(videoId);
    const btn = document.getElementById(btnId);
    if (!video || !btn) return;

    const hideBtn = () => {
      btn.style.opacity = '0';
      btn.style.transform = 'scale(0.85)';
      btn.style.pointerEvents = 'none';
    };

    const showBtn = () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
      btn.style.pointerEvents = 'none';
    };

    video.addEventListener('play', hideBtn);
    video.addEventListener('playing', hideBtn);
    video.addEventListener('pause', showBtn);
    video.addEventListener('ended', showBtn);

    // 초기 상태 체크
    if (!video.paused) {
      hideBtn();
    } else {
      showBtn();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVideoPlayerSync);
} else {
  initVideoPlayerSync();
}


// ============================================================
// P3.7 — PRODUCT 3D CONVERSION & VIEWER SYSTEM (UX2 Upgraded)
// ============================================================

// ── State ────────────────────────────────────────────────────
window._p3dState = {
  currentSlot: null,
  currentProjectId: null,
  currentProductName: 'Product',
  currentQuality: 'HIGH',
  productMediaMode: 'IMAGE',
  tokenBalance: null,
  isEntitled: false,
  isSubmitting: false,
  elapsedSeconds: 0,
  elapsedTimer: null,
  qualityPolicy: {
    STANDARD: { tokenCost: 1, label: 'Standard 3D', description: 'Fast conversion · Good for simple products' },
    HIGH: { tokenCost: 3, label: 'High Quality 3D', description: 'Best detail & geometry · Recommended' },
    ULTRA: { tokenCost: 6, label: 'Ultra 3D', description: 'Maximum practical fidelity' }
  },
  multiViewModifiers: { SINGLE_IMAGE: 0, MULTI_VIEW_2_TO_3: 0, MULTI_VIEW_4_PLUS: 1 },
  additionalSourceImages: [],
  product3d: null,
  pollTimer: null,
  viewerRenderer: null,
  viewerScene: null,
  viewerCamera: null,
  viewerControls: null,
  viewerAnimationId: null,
  viewerCurrentGlbUrl: null,
  confirmPendingAction: null,
  isDev: false
};

// ── Auth Token Resolver ───────────────────────────────────────
function p3dGetAuthToken() {
  if (typeof getEditAuthToken === 'function') {
    const t = getEditAuthToken();
    if (t) return t;
  }
  return window.authToken || 
         window._authToken || 
         localStorage.getItem('3d2_customer_token') || 
         localStorage.getItem('token') || 
         localStorage.getItem('vts_admin_token') || 
         localStorage.getItem('vt_organizer_token') || 
         activeProjectData?.editToken || 
         'internal_dev_pass';
}

// ── Fetch token balance & quality policy ──────────────────────
async function p3dLoadTokenBalance() {
  try {
    const token = p3dGetAuthToken();
    const pid = window._p3dState.currentProjectId || activeProjectId || activeProjectData?.id;
    const url = '/api/account/3d-tokens' + (pid ? ('?projectId=' + encodeURIComponent(pid)) : '');
    
    const resp = await fetch(url, {
      headers: token ? { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token } : {}
    });
    if (!resp.ok) return;
    const data = await resp.json();
    
    window._p3dState.tokenBalance = data.ledger?.availableTokens ?? null;
    const isDev = Boolean(
      data.isDev || 
      data.plan === 'INTERNAL_FULL_ACCESS' || 
      data.entitlement === 'INTERNAL_FULL_ACCESS' || 
      data.accountPurpose === 'INTERNAL_FULL_FEATURE_QA' || 
      data.access?.tokenBypass || 
      (typeof isInternalDevAccount === 'function' && isInternalDevAccount(window.currentUser)) ||
      (typeof isInternalDevAccount === 'function' && isInternalDevAccount(window.activeProjectData))
    );
    window._p3dState.isDev = isDev;
    window._p3dState.isEntitled = Boolean(data.access?.allowed || isDev);

    if (data.qualityPolicy) window._p3dState.qualityPolicy = data.qualityPolicy;
    if (data.multiViewPolicy?.modifiers) window._p3dState.multiViewModifiers = data.multiViewPolicy.modifiers;
    return data;
  } catch (e) {
    console.warn('[P3D] Token balance load error:', e.message);
  }
}

// ── Product Media Mode Selector (UX2 / P3.9-R3) ─────────────────────────
function setProductMediaMode(mode, isInitial = false) {
  const norm = (mode === 'THREE_D') ? 'THREE_D' : 'IMAGE';
  window._p3dState.productMediaMode = norm;

  const tabImg = document.getElementById('tabProductMediaImage');
  const tab3d  = document.getElementById('tabProductMedia3D');
  const secImg = document.getElementById('opePrimaryImageSection');
  const sec3d  = document.getElementById('opeProduct3dSection');

  if (norm === 'IMAGE') {
    if (tabImg) {
      tabImg.style.background = 'rgba(56,189,248,0.15)';
      tabImg.style.borderColor = '#38bdf8';
      tabImg.style.color = '#38bdf8';
    }
    if (tab3d) {
      tab3d.style.background = 'transparent';
      tab3d.style.borderColor = 'transparent';
      tab3d.style.color = '#94a3b8';
    }
    if (secImg) secImg.style.display = 'block';
    if (sec3d) sec3d.style.display = 'none';
    _p3dDisposeInlineViewer();
  } else {
    if (tabImg) {
      tabImg.style.background = 'transparent';
      tabImg.style.borderColor = 'transparent';
      tabImg.style.color = '#94a3b8';
    }
    if (tab3d) {
      tab3d.style.background = 'rgba(56,189,248,0.15)';
      tab3d.style.borderColor = '#38bdf8';
      tab3d.style.color = '#38bdf8';
    }
    if (secImg) secImg.style.display = 'none';
    if (sec3d) sec3d.style.display = 'block';

    const p3d = window._p3dState.product3d;
    const isReady = (p3d?.status === 'READY' || p3d?.status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
    if (isReady && p3d?.glbUrl) {
      setTimeout(() => _p3dInitInlineViewer(p3d.glbUrl), 50);
    }
  }
}

// ── Select Quality Tier ───────────────────────────────────────

function openProductCameraCapture(viewLabel = 'Front View') {
  const slot = window._p3dState?.currentSlot || 1;
  openCameraCaptureModal({ type: 'PRODUCT', slotIndex: slot, viewLabel: viewLabel || 'Product View' });
}

function updateP3dMultiViewReadiness() {
  const tier = window._p3dState?.currentQuality || 'HIGH';
  const minRequired = tier === 'ULTRA' ? 5 : (tier === 'STANDARD' ? 1 : 3);
  const tokenCost = tier === 'ULTRA' ? 6 : (tier === 'STANDARD' ? 1 : 3);
  
  const hasPrimary = Boolean(window._p3dState?.sourceImageUrl || document.getElementById('p3dTabSourceImgPreview')?.src);
  const addlCount = (window._p3dState?.additionalSourceImages || []).length;
  const totalCount = (hasPrimary ? 1 : 0) + addlCount;

  const badge = document.getElementById('p3dMultiViewReadinessBadge');
  const costEl = document.getElementById('p3dLiveCostSummary');
  const ctaBtn = document.getElementById('p3dMainCtaBtn');
  const ctaText = document.getElementById('p3dMainCtaText');

  if (badge) {
    const isMet = totalCount >= minRequired;
    badge.innerHTML = isMet 
      ? `<i class="fa-solid fa-check"></i> ${totalCount} / ${minRequired} views ready` 
      : `${totalCount} / ${minRequired} views ready (Need ${minRequired - totalCount} more)`;
    badge.style.color = isMet ? '#4ade80' : '#fbbf24';
    badge.style.background = isMet ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)';
  }

  if (costEl) {
    const isDev = window._p3dState?.isDev;
    costEl.textContent = isDev 
      ? `${tier} · ${tokenCost} Nominal Tokens (QA Mode · Charge: 0)`
      : `${tier} · ${tokenCost} Tokens`;
  }

  if (ctaBtn && ctaText) {
    const isDev = window._p3dState?.isDev;
    const canGenerate = (totalCount >= minRequired || isDev) && hasPrimary;
    ctaBtn.disabled = !canGenerate;
    ctaBtn.style.opacity = canGenerate ? '1' : '0.5';
    if (!hasPrimary) {
      ctaText.textContent = 'Upload or Snap Product Photo First';
    } else if (totalCount < minRequired && !isDev) {
      ctaText.textContent = `Add ${minRequired - totalCount} More Views to Generate (${tier})`;
    } else {
      ctaText.textContent = `Generate 3D Model (${tokenCost} Tokens)`;
    }
  }
}


function selectP3dQuality(tier) {
  const norm = String(tier || 'HIGH').toUpperCase().trim();
  window._p3dState.currentQuality = ['STANDARD', 'HIGH', 'ULTRA'].includes(norm) ? norm : 'HIGH';
  
  ['STANDARD', 'HIGH', 'ULTRA'].forEach(t => {
    const card = document.getElementById('p3dCard' + t);
    if (!card) return;
    if (t === window._p3dState.currentQuality) {
      card.style.background = 'rgba(56,189,248,0.18)';
      card.style.borderColor = '#38bdf8';
      card.style.boxShadow = '0 0 14px rgba(56,189,248,0.3)';
    } else {
      card.style.background = 'rgba(15,23,42,0.9)';
      card.style.borderColor = 'rgba(255,255,255,0.12)';
      card.style.boxShadow = 'none';
    }
  });

  updateP3dLiveCostSummary();
  updateP3dMultiViewReadiness();
}


    function updateP3dLiveCostSummary() {
      const costEl = document.getElementById('p3dCostSummary') || document.getElementById('p3dLiveCostSummary');
      if (costEl) {
        const quality = window._p3dState?.currentQuality || 'HIGH';
        const cost = quality === 'STANDARD' ? 1 : (quality === 'ULTRA' ? 6 : 3);
        const isDev = window._p3dState?.isDev;
        costEl.textContent = isDev ? '0 Commercial Tokens (QA Mode)' : (cost + ' Tokens');
      }
    }
    function renderAdditionalViewsList() {
      const container = document.getElementById('p3dAdditionalViewsContainer');
      if (!container) return;
      const views = window._p3dState?.additionalSourceImages || [];
      if (views.length === 0) {
        container.innerHTML = '<span style="font-size: 11px; color: #64748b;">No additional views added (optional).</span>';
        return;
      }
      container.innerHTML = views.map((v, i) => `
        <div style="position: relative; width: 48px; height: 48px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); background: #000;">
          <img src="${v.url}" style="width: 100%; height: 100%; object-fit: contain;">
          <button type="button" onclick="removeP3dAdditionalView(${i})" style="position: absolute; top: 1px; right: 1px; background: rgba(0,0,0,0.7); border: none; color: #f87171; border-radius: 50%; width: 14px; height: 14px; font-size: 8px; cursor: pointer;">✕</button>
        </div>
      `).join('');
    }
    const _p3dInitViewer = function(url, name) {
      if (typeof _p3dInitInlineViewer === 'function') _p3dInitInlineViewer(url);
    };
    const _p3dDisposeViewer = function() {
      if (typeof _p3dDisposeInlineViewer === 'function') _p3dDisposeInlineViewer();
    };
  
// ── Render Product 3D Section Deterministic UI (P3.9-R3) ─────
async function renderProduct3dSection(slot, product) {
  const section = document.getElementById('opeProduct3dSection');
  if (!section) return;

  window._p3dState.currentSlot = slot;
  window._p3dState.currentProjectId = window.activeProjectData?.id || activeProjectId || null;
  window._p3dState.product3d = product?.product3d || null;
  window._p3dState.additionalSourceImages = product?.additionalSourceImages || [];

  const tokenData = await p3dLoadTokenBalance();
  const isDev = Boolean(
    window._p3dState.isDev || 
    (typeof isInternalDevAccount === 'function' && isInternalDevAccount(window.currentUser)) ||
    (typeof isInternalDevAccount === 'function' && isInternalDevAccount(window.activeProjectData))
  );
  window._p3dState.isDev = isDev;
  const isEntitled = tokenData?.access?.allowed || isDev || false;
  window._p3dState.isEntitled = isEntitled;
  const balance = window._p3dState.tokenBalance;
  
  const p3d = product?.product3d;
  const status = p3d?.status || 'NOT_GENERATED';
  const hasImage = !!(product?.imageUrl || document.getElementById('opeImagePreview')?.src?.startsWith('data:') || document.getElementById('opeImagePreview')?.src?.startsWith('blob:') || document.getElementById('opeImagePreview')?.src?.startsWith('http'));
  const isReady = (status === 'READY' || status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
  const isBusy = ['QUEUED', 'PROCESSING'].includes(status) || window._p3dState.isSubmitting;
  const isValidating = status === 'VALIDATING';
  const isFailed = status === 'FAILED';

  // QA banner
  const qaBanner = document.getElementById('p3dQaBanner');
  if (qaBanner) qaBanner.style.display = isDev ? 'block' : 'none';

  // Token balance header display
  const balanceEl = document.getElementById('p3dTokenBalance');
  if (balanceEl) {
    if (isDev) {
      balanceEl.innerHTML = '<span style="color:#d8b4fe; font-weight:700;"><i class="fa-solid fa-shield-halved"></i> Internal QA Mode</span>';
    } else if (isEntitled && balance !== null) {
      balanceEl.textContent = balance + ' tokens available';
    } else {
      balanceEl.textContent = '';
    }
  }

  // Update Media tab badges
  const readyBadge = document.getElementById('pMedia3dReadyBadge');
  const genBadge = document.getElementById('pMedia3dGeneratingBadge');
  if (readyBadge) readyBadge.style.display = isReady ? 'inline-flex' : 'none';
  if (genBadge) genBadge.style.display = (isBusy || isValidating) ? 'inline-flex' : 'none';

  // Containers
  const holderReady = document.getElementById('p3dResultHolderContainer');
  const holderGen   = document.getElementById('p3dGeneratingHolderContainer');
  const holderVal   = document.getElementById('p3dValidatingHolderContainer');
  const holderFail  = document.getElementById('p3dFailureHolderContainer');
  const holderSetup = document.getElementById('p3dSetupSectionContainer');

  if (isReady) {
    if (holderReady) holderReady.style.display = 'block';
    if (holderGen)   holderGen.style.display = 'none';
    if (holderVal)   holderVal.style.display = 'none';
    if (holderFail)  holderFail.style.display = 'none';
    if (holderSetup) holderSetup.style.display = 'none';

    const tierBadge = document.getElementById('p3dResultTierBadge');
    if (tierBadge) tierBadge.textContent = (p3d.qualityTier || 'STANDARD') + ' 3D';

    const provText = document.getElementById('p3dResultProvenanceText');
    if (provText) {
      const d = p3d.generatedAt ? new Date(p3d.generatedAt).toLocaleDateString() : 'Just now';
      const kb = p3d.meshStats?.bytes ? (p3d.meshStats.bytes / 1024).toFixed(0) + ' KB' : 'GLB';
      provText.textContent = 'Generated ' + d + ' · ' + kb;
    }

    // Mount inline WebGL preview if 3D tab is active
    if (window._p3dState.productMediaMode === 'THREE_D' && p3d.glbUrl) {
      setTimeout(() => _p3dInitInlineViewer(p3d.glbUrl), 50);
    }
  } else if (isValidating) {
    if (holderReady) holderReady.style.display = 'none';
    if (holderGen)   holderGen.style.display = 'none';
    if (holderVal)   holderVal.style.display = 'block';
    if (holderFail)  holderFail.style.display = 'none';
    if (holderSetup) holderSetup.style.display = 'none';
    _p3dDisposeInlineViewer();
  } else if (isBusy) {
    if (holderReady) holderReady.style.display = 'none';
    if (holderGen)   holderGen.style.display = 'block';
    if (holderVal)   holderVal.style.display = 'none';
    if (holderFail)  holderFail.style.display = 'none';
    if (holderSetup) holderSetup.style.display = 'none';

    const genTier = document.getElementById('p3dGenHolderTier');
    if (genTier) genTier.textContent = (p3d?.qualityTier || window._p3dState.currentQuality || 'HIGH') + ' Quality 3D';

    const genTimer = document.getElementById('p3dGenHolderTimer');
    if (genTimer) genTimer.textContent = 'Elapsed: ' + (window._p3dState.elapsedSeconds || 0) + 's';

    const curAvail = document.getElementById('p3dGenCurrentAvailableRow');
    if (curAvail) curAvail.style.display = p3d?.previousGlbUrl ? 'block' : 'none';

    _p3dDisposeInlineViewer();
  } else if (isFailed) {
    if (holderReady) holderReady.style.display = 'none';
    if (holderGen)   holderGen.style.display = 'none';
    if (holderVal)   holderVal.style.display = 'none';
    if (holderFail)  holderFail.style.display = 'block';
    if (holderSetup) holderSetup.style.display = 'none';

    const errMsg = document.getElementById('p3dFailureErrorMsg');
    if (errMsg) errMsg.textContent = p3d?.error || 'Generation failed. Please try again.';

    const viewCur = document.getElementById('p3dFailureViewCurrentBtn');
    if (viewCur) viewCur.style.display = p3d?.previousGlbUrl ? 'inline-block' : 'none';

    _p3dDisposeInlineViewer();
  } else {
    // NOT_GENERATED setup mode
    if (holderReady) holderReady.style.display = 'none';
    if (holderGen)   holderGen.style.display = 'none';
    if (holderVal)   holderVal.style.display = 'none';
    if (holderFail)  holderFail.style.display = 'none';
    if (holderSetup) holderSetup.style.display = 'block';

    const initialTier = p3d?.qualityTier || window._p3dState.currentQuality || 'HIGH';
    selectP3dQuality(initialTier);
    renderAdditionalViewsList();

    const ctaBtn = document.getElementById('p3dMainCtaBtn');
    if (ctaBtn) {
      ctaBtn.disabled = !hasImage;
      ctaBtn.style.opacity = hasImage ? '1' : '0.6';
      ctaBtn.style.cursor = hasImage ? 'pointer' : 'not-allowed';
      ctaBtn.innerHTML = '<i class="fa-solid fa-cube"></i> <span>Generate 3D Model</span>';
    }

    const warn = document.getElementById('p3dWarningBanner');
    if (warn) {
      if (!hasImage) {
        warn.style.display = 'block';
        warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload a product image to generate 3D.';
      } else {
        warn.style.display = 'none';
      }
    }

    _p3dDisposeInlineViewer();
  }

  updateP3dLiveCostSummary();

  if ((isBusy || isValidating) && !window._p3dState.pollTimer) {
    p3dStartPolling(slot);
  }
}

// ── Polling & Activity Loop (P3.9-R3) ─────────────────────────
function p3dStartPolling(slot) {
  if (window._p3dState.pollTimer) clearInterval(window._p3dState.pollTimer);
  if (window._p3dState.elapsedTimer) clearInterval(window._p3dState.elapsedTimer);

  window._p3dState.elapsedSeconds = window._p3dState.elapsedSeconds || 0;

  // Elapsed timer ticker every 1s
  window._p3dState.elapsedTimer = setInterval(() => {
    window._p3dState.elapsedSeconds = (window._p3dState.elapsedSeconds || 0) + 1;
    const genTimer = document.getElementById('p3dGenHolderTimer');
    if (genTimer) genTimer.textContent = 'Elapsed: ' + window._p3dState.elapsedSeconds + 's';

    // Safety timeout after 180s
    if (window._p3dState.elapsedSeconds >= 180) {
      clearInterval(window._p3dState.pollTimer);
      clearInterval(window._p3dState.elapsedTimer);
      window._p3dState.pollTimer = null;
      window._p3dState.elapsedTimer = null;
      window._p3dState.isSubmitting = false;
      const genMsg = document.getElementById('p3dGeneratingHolderContainer');
      if (genMsg) {
        genMsg.innerHTML = '<div style="margin-bottom:12px;"><i class="fa-solid fa-clock" style="font-size:32px; color:#f59e0b;"></i></div><div style="font-size:14px; font-weight:800; color:#fbbf24; margin-bottom:8px;">Generation taking longer than expected</div><div style="font-size:12px; color:#94a3b8; margin-bottom:14px;">The provider may still be processing in the background.</div><button type="button" onclick="p3dManualRefreshSlot(' + slot + ')" style="padding:8px 18px; font-size:12.5px; font-weight:700; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.4); border-radius:8px; cursor:pointer;"><i class="fa-solid fa-arrows-rotate"></i> Refresh Status</button>';
      }
    }
  }, 1000);

  // Status poller every 3s
  window._p3dState.pollTimer = setInterval(async () => {
    const pid = window._p3dState.currentProjectId || activeProjectId || activeProjectData?.id;
    const token = p3dGetAuthToken();
    if (!pid || !slot) {
      clearInterval(window._p3dState.pollTimer);
      clearInterval(window._p3dState.elapsedTimer);
      window._p3dState.pollTimer = null;
      window._p3dState.elapsedTimer = null;
      return;
    }

    try {
      const resp = await fetch('/api/projects/' + pid + '/products/' + slot + '/3d/job', {
        headers: token ? { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token } : {}
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const status = data.job?.status || data.status;

      if (status === 'READY' || status === 'NEEDS_REVIEW') {
        clearInterval(window._p3dState.pollTimer);
        clearInterval(window._p3dState.elapsedTimer);
        window._p3dState.pollTimer = null;
        window._p3dState.elapsedTimer = null;
        window._p3dState.isSubmitting = false;

        const updatedProd3d = data.product3d || (data.job ? {
          status: data.job.status,
          qualityTier: data.job.qualityTier,
          glbUrl: data.job.resultGlbUrl,
          meshStats: data.job.meshStats,
          generatedAt: data.job.completedAt
        } : null);

        if (window.activeProjectData?.products) {
          const prod = window.activeProjectData.products.find(p => String(p.slotIndex) === String(slot));
          if (prod) prod.product3d = updatedProd3d;
        }

        if (typeof setProductMediaMode === 'function') setProductMediaMode('THREE_D', true);
        const currentProd = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));
        await renderProduct3dSection(slot, { ...currentProd, product3d: updatedProd3d });
        if (window.showToast) window.showToast('✅ 3D Model Ready!', 'success');
      } else if (status === 'VALIDATING') {
        const currentProd = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));
        renderProduct3dSection(slot, { ...currentProd, product3d: { status: 'VALIDATING' } });
      } else if (status === 'FAILED') {
        clearInterval(window._p3dState.pollTimer);
        clearInterval(window._p3dState.elapsedTimer);
        window._p3dState.pollTimer = null;
        window._p3dState.elapsedTimer = null;
        window._p3dState.isSubmitting = false;

        const currentProd = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));
        const failedP3d = { status: 'FAILED', error: data.job?.error || 'Generation failed' };
        if (currentProd) currentProd.product3d = failedP3d;
        renderProduct3dSection(slot, { ...currentProd, product3d: failedP3d });
        if (window.showToast) window.showToast('⚠️ 3D Generation failed: ' + (data.job?.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      console.warn('[P3D] Poll error:', e.message);
    }
  }, 3000);
}

async function p3dManualRefreshSlot(slot) {
  const pid = window._p3dState.currentProjectId || activeProjectId || activeProjectData?.id;
  const token = p3dGetAuthToken();
  if (!pid || !slot) return;
  try {
    const resp = await fetch('/api/projects/' + pid + '/products/' + slot + '/3d/job', {
      headers: token ? { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token } : {}
    });
    if (resp.ok) {
      const data = await resp.json();
      const currentProd = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));
      if (data.product3d && currentProd) currentProd.product3d = data.product3d;
      renderProduct3dSection(slot, currentProd);
    }
  } catch(e) {}
}


window.handleP3dMainCtaClick = handleP3dMainCtaClick;
window.product3dGenerate = product3dGenerate;
window.product3dRegenerate = product3dRegenerate;
window.openP3dConfirmModal = openP3dConfirmModal;
window.closeP3dConfirmModal = closeP3dConfirmModal;
window.p3dConfirmExecute = p3dConfirmExecute;
window._p3dExecuteGenerate = _p3dExecuteGenerate;


    function calculateCurrentP3dCost() {
      const quality = window._p3dState?.currentQuality || 'HIGH';
      return quality === 'STANDARD' ? 1 : (quality === 'ULTRA' ? 6 : 3);
    }
    window.calculateCurrentP3dCost = calculateCurrentP3dCost;
  
// ── Primary Action Click Router ───────────────────────────────
function handleP3dMainCtaClick() {
  if (window._p3dState.isSubmitting) return;
  const p3d = window._p3dState.product3d;
  const status = p3d?.status || 'NOT_GENERATED';
  const isReady = (status === 'READY' || status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
  
  if (isReady) {
    product3dOpenViewer();
  } else {
    product3dGenerate();
  }
}

// ── Action Handlers ───────────────────────────────────────────
function product3dGenerate() {
  if (window._p3dState.isSubmitting) return;
  const quality = window._p3dState.currentQuality || 'HIGH';
  const cost = calculateCurrentP3dCost();
  const isDev = window._p3dState.isDev;
  const qualityName = window._p3dState.qualityPolicy[quality]?.label || quality;
  const balance = window._p3dState.tokenBalance;
  
  const balanceStr = isDev ? '∞ (QA Bypass)' : ('' + balance);
  const afterStr = isDev ? '∞ (QA Bypass)' : ('' + ((balance || 0) - cost));
  
  const msg = isDev
    ? 'Generate <strong>' + qualityName + '</strong> 3D?<br><br><span style="color:#d8b4fe;"><i class="fa-solid fa-shield-halved"></i> Internal QA Mode: <strong>0 Commercial Tokens Charged</strong> (Nominal cost: ' + cost + ' tokens).</span>'
    : 'Generate <strong>' + qualityName + '</strong> 3D?<br><br>Token Cost: <strong>' + cost + ' Token' + (cost !== 1 ? 's' : '') + '</strong><br>Current Balance: <strong>' + balanceStr + '</strong> → After: <strong>' + afterStr + '</strong>';
  
  openP3dConfirmModal('generate', msg);
}

function product3dRegenerate() {
  if (window._p3dState.isSubmitting) return;
  const quality = window._p3dState.currentQuality || 'HIGH';
  const cost = calculateCurrentP3dCost();
  const isDev = window._p3dState.isDev;
  const qualityName = window._p3dState.qualityPolicy[quality]?.label || quality;
  const balance = window._p3dState.tokenBalance;
  
  const balanceStr = isDev ? '∞ (QA Bypass)' : ('' + balance);
  const afterStr = isDev ? '∞ (QA Bypass)' : ('' + ((balance || 0) - cost));
  
  const msg = isDev
    ? 'Regenerate as <strong>' + qualityName + '</strong> 3D?<br><br><span style="color:#d8b4fe;"><i class="fa-solid fa-shield-halved"></i> Internal QA: 0 Commercial Tokens Charged. Previous 3D remains active during processing.</span>'
    : 'Regenerate as <strong>' + qualityName + '</strong> 3D?<br><br>Token Cost: <strong>' + cost + ' Token' + (cost !== 1 ? 's' : '') + '</strong><br>Balance: <strong>' + balanceStr + '</strong> → <strong>' + afterStr + '</strong><br><span style="font-size:11px; color:#94a3b8;">(Your existing 3D model remains visible until the new one is accepted).</span>';
  
  openP3dConfirmModal('regenerate', msg);
}

function openP3dConfirmModal(action, message) {
  window._p3dState.confirmPendingAction = action;
  let modal = document.getElementById('p3dConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'p3dConfirmModal';
    modal.className = 'viewport-modal';
    modal.style.cssText = 'display:flex; position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); align-items:center; justify-content:center;';
    modal.innerHTML = '<div style="background:#0f172a; border:1px solid rgba(56,189,248,0.4); border-radius:14px; padding:24px; max-width:440px; width:90%; color:#fff; box-shadow:0 20px 40px rgba(0,0,0,0.8);"><h4 style="margin:0 0 12px; font-size:16px; font-weight:800; color:#38bdf8; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-cube"></i> Confirm 3D Conversion</h4><div id="p3dConfirmMessage" style="font-size:13.5px; color:#cbd5e1; line-height:1.5; margin-bottom:20px;"></div><div style="display:flex; justify-content:flex-end; gap:10px;"><button type="button" onclick="closeP3dConfirmModal()" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#94a3b8; padding:8px 16px; border-radius:8px; font-weight:700; cursor:pointer;">Cancel</button><button type="button" id="p3dConfirmOkBtn" onclick="p3dConfirmExecute()" style="background:linear-gradient(135deg,#0284c7,#2563eb); border:1px solid #38bdf8; color:#fff; padding:8px 20px; border-radius:8px; font-weight:800; cursor:pointer;">Confirm</button></div></div>';
    document.body.appendChild(modal);
  }
  const msgEl = document.getElementById('p3dConfirmMessage') || document.getElementById('p3dConfirmMsg');
  if (msgEl) msgEl.innerHTML = message;

  const cBtn = document.getElementById('p3dConfirmBtn') || document.getElementById('p3dConfirmOkBtn');
  if (cBtn) {
    cBtn.onclick = (e) => {
      e.preventDefault();
      p3dConfirmExecute();
    };
  }
  modal.style.display = 'flex';
}

function closeP3dConfirmModal() {
  const modal = document.getElementById('p3dConfirmModal');
  if (modal) modal.style.display = 'none';
  window._p3dState.confirmPendingAction = null;
}

async function p3dConfirmExecute() {
  const action = window._p3dState.confirmPendingAction;
  closeP3dConfirmModal();
  if (action === 'generate') await _p3dExecuteGenerate(false);
  else if (action === 'regenerate') await _p3dExecuteGenerate(true);
}

// ── Execute Generate with Auto-Draft Persistence (UX2) ────────
async function _p3dExecuteGenerate(isRegen) {
  if (window._p3dState.isSubmitting) return;
  const slot = window._p3dState.currentSlot || parseInt(document.getElementById('opeSlotIndex')?.value, 10) || 1;
  const pid = window._p3dState.currentProjectId || activeProjectId || window.activeProjectData?.id;
  const qualityTier = window._p3dState.currentQuality || 'HIGH';
  if (!slot || !pid) return;

  const fileInput = document.getElementById('opeImageInput');
  const prodName = (document.getElementById('opeName')?.value || '').trim() || ('Product Slot ' + slot);
  let prod = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));

  window._p3dState.isSubmitting = true;
  window._p3dState.elapsedSeconds = 0;

  renderProduct3dSection(slot, { ...prod, product3d: { status: 'QUEUED', qualityTier, previousGlbUrl: prod?.product3d?.glbUrl } });

  const token = p3dGetAuthToken();

  // If new file chosen in browser preview, upload to slot first
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const formData = new FormData();
    formData.append('slotIndex', slot);
    formData.append('name', prodName);
    formData.append('productMediaMode', 'THREE_D');
    formData.append('productImage', fileInput.files[0]);

    try {
      const upRes = await fetch('/api/projects/' + pid + '/products/' + slot, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
        body: formData
      });
      const upData = await upRes.json();
      if (upRes.ok && upData.product) {
        if (!window.activeProjectData.products) window.activeProjectData.products = [];
        const existingIdx = window.activeProjectData.products.findIndex(p => String(p.slotIndex) === String(slot));
        if (existingIdx >= 0) window.activeProjectData.products[existingIdx] = upData.product;
        else window.activeProjectData.products.push(upData.product);
        prod = upData.product;
      }
    } catch (err) {
      console.warn('[P3D] Auto-upload source image warning:', err.message);
    }
  }

  const endpoint = '/api/projects/' + pid + '/products/' + slot + '/3d/' + (isRegen ? 'regenerate' : 'generate');

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ qualityTier, name: prodName, imageUrl: prod?.imageUrl })
    });
    const data = await resp.json();
    if (!resp.ok) {
      window._p3dState.isSubmitting = false;
      if (resp.status === 402) {
        alert('Insufficient 3D tokens. Please recharge your token balance.');
      } else {
        alert('Error: ' + (data.error || 'Failed to start 3D conversion'));
      }
      renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
      return;
    }

    if (window.showToast) window.showToast('🚀 ' + qualityTier + ' 3D conversion started!', 'info');
    p3dStartPolling(slot);

  } catch (e) {
    window._p3dState.isSubmitting = false;
    alert('Request failed: ' + e.message);
    renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
  }
}

async function product3dRemove() {
  const slot = window._p3dState.currentSlot || document.getElementById('opeSlotIndex')?.value || 1;
  const pid = window._p3dState.currentProjectId || activeProjectId || window.activeProjectData?.id;
  if (!slot || !pid) return;
  if (!confirm('Remove 3D model from this product? The 2D product image will not be deleted.')) return;

  const token = p3dGetAuthToken();
  try {
    const resp = await fetch('/api/projects/' + pid + '/products/' + slot + '/3d', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token }
    });
    if (resp.ok) {
      _p3dDisposeInlineViewer();
      if (window.activeProjectData?.products) {
        const prod = window.activeProjectData.products.find(p => String(p.slotIndex) === String(slot));
        if (prod) prod.product3d = null;
      }
      renderProduct3dSection(slot, { ...window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)), product3d: null });
      if (window.showToast) window.showToast('🗑️ 3D model removed', 'info');
    }
  } catch(e) {
    alert('Failed to remove 3D model: ' + e.message);
  }
}

// ── INLINE THREE.JS PREVIEW ENGINE (P3.9-R3) ──────────────────
window._p3dInlineState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  animationId: null,
  currentGlbUrl: null
};

function _p3dInitInlineViewer(glbUrl) {
  if (!glbUrl) return;
  const canvas = document.getElementById('p3dInlineCanvas');
  const container = document.getElementById('p3dInlineCanvasContainer');
  if (!canvas || !container) return;

  if (window._p3dInlineState.currentGlbUrl === glbUrl && window._p3dInlineState.renderer) {
    return; // Already rendering this model
  }

  _p3dDisposeInlineViewer();

  const THREE = window.THREE;
  if (!THREE || !THREE.GLTFLoader || !THREE.OrbitControls) {
    _p3dLoadThreeJs(() => _p3dInitInlineViewer(glbUrl));
    return;
  }

  const W = container.clientWidth || 360;
  const H = container.clientHeight || 260;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(0, 0.5, 3);

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.6);
  dir1.position.set(2, 4, 3);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0x818cf8, 0.8);
  dir2.position.set(-2, -2, -2);
  scene.add(dir2);

  let controls = null;
  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
  }

  window._p3dInlineState = {
    renderer,
    scene,
    camera,
    controls,
    animationId: null,
    currentGlbUrl: glbUrl
  };

  const loadEl = document.getElementById('p3dInlineLoading');
  if (loadEl) loadEl.style.display = 'flex';

  const loader = new THREE.GLTFLoader();
  loader.load(glbUrl, (gltf) => {
    if (!window._p3dInlineState.scene) return;
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / (maxDim || 1);
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    scene.add(model);
    camera.position.set(0, 0, maxDim * scale * 2.5);
    if (controls) controls.target.set(0, 0, 0);
    if (loadEl) loadEl.style.display = 'none';

    _p3dStartInlineAnimationLoop();
  }, undefined, (err) => {
    console.error('[P3D-Inline] Load error:', err);
    if (loadEl) loadEl.style.display = 'none';
  });
}

function _p3dStartInlineAnimationLoop() {
  _p3dStopInlineAnimationLoop();
  const s = window._p3dInlineState;
  function loop() {
    s.animationId = requestAnimationFrame(loop);
    if (s.controls) s.controls.update();
    if (s.renderer && s.scene && s.camera) {
      s.renderer.render(s.scene, s.camera);
    }
  }
  loop();
}

function _p3dStopInlineAnimationLoop() {
  if (window._p3dInlineState?.animationId) {
    cancelAnimationFrame(window._p3dInlineState.animationId);
    window._p3dInlineState.animationId = null;
  }
}

function _p3dDisposeInlineViewer() {
  _p3dStopInlineAnimationLoop();
  const s = window._p3dInlineState;
  if (s?.controls) {
    if (typeof s.controls.dispose === 'function') s.controls.dispose();
    s.controls = null;
  }
  if (s?.scene) {
    s.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    s.scene = null;
  }
  if (s?.renderer) {
    s.renderer.dispose();
    s.renderer = null;
  }
  if (s) {
    s.camera = null;
    s.currentGlbUrl = null;
  }
}

function product3dInlineResetView() {
  const s = window._p3dInlineState;
  if (s?.controls) s.controls.reset();
}

// ── 3D Modal Viewer Logic ─────────────────────────────────────
function product3dOpenViewer() {
  const p3d = window._p3dState.product3d;
  if (!p3d?.glbUrl) return;
  _p3dOpenViewerWithUrl(p3d.glbUrl, window._p3dState.currentProductName || 'Product 3D');
}

function publicOpenProduct3dViewer() {
  const p3d = window._currentPublicProduct3d;
  if (!p3d?.glbUrl) return;
  _p3dOpenViewerWithUrl(p3d.glbUrl, window._currentPublicProductName || 'Product 3D');
}

function _p3dOpenViewerWithUrl(glbUrl, title) {
  const modal = document.getElementById('product3dViewerModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const titleEl = document.getElementById('p3dViewerTitle');
  if (titleEl) titleEl.textContent = title;
  const loadEl = document.getElementById('p3dViewerLoading');
  if (loadEl) loadEl.style.display = 'flex';
  const errEl = document.getElementById('p3dViewerError');
  if (errEl) errEl.style.display = 'none';

  _p3dDisposeViewer();
  _p3dInitViewer(glbUrl);
}

function closeProduct3dViewer() {
  const modal = document.getElementById('product3dViewerModal');
  if (modal) modal.style.display = 'none';
  _p3dDisposeViewer();
}

function p3dDisposeThreeJsResources() {
  _p3dDisposeViewer();
}

function product3dViewerReset() {
  const s = window._p3dState;
  if (s.viewerControls) {
    s.viewerControls.reset();
  }
}

// ── Public product detail integration ─────────────────────────
window._currentPublicProduct3d = null;
window._currentPublicProductName = null;

const _origOpenPublicProductDetail = window.openPublicProductDetail;
window.openPublicProductDetail = function(product, fromCatalog) {
  window._currentPublicProduct3d = product?.product3d || null;
  window._currentPublicProductName = product?.name || 'Product';
  const view3dRow = document.getElementById('ppdView3dRow');
  if (view3dRow) {
    const show = (product?.product3d?.status === 'READY' || product?.product3d?.status === 'NEEDS_REVIEW');
    view3dRow.style.display = show ? 'block' : 'none';
  }
  if (typeof _origOpenPublicProductDetail === 'function') {
    _origOpenPublicProductDetail(product, fromCatalog);
  }
};

// openOwnerProductEditor assigned directly in main scope

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('product3dViewerModal')?.style.display === 'flex') closeProduct3dViewer();
    if (document.getElementById('p3dConfirmModal')?.style.display === 'flex') closeP3dConfirmModal();
  }
});

function catalogProductMoveUp(catalogId, productIndex) {
  _catalogProductReorder(catalogId, productIndex, -1);
}
function catalogProductMoveDown(catalogId, productIndex) {
  _catalogProductReorder(catalogId, productIndex, 1);
}
async function _catalogProductReorder(catalogId, productIndex, direction) {
  const project = window.activeProjectData;
  if (!project) return;
  const catalog = (project.catalogs || []).find(c => c.id === catalogId || c.catalogId === catalogId);
  if (!catalog) return;
  const ids = [...(catalog.productIds || [])];
  const newIdx = productIndex + direction;
  if (newIdx < 0 || newIdx >= ids.length) return;
  [ids[productIndex], ids[newIdx]] = [ids[newIdx], ids[productIndex]];
  catalog.productIds = ids;
  try {
    const token = window.authToken || window._authToken;
    await fetch('/api/projects/' + project.id + '/catalogs/' + catalogId + '/membership', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: ids })
    });
    if (typeof renderCatalogEditorProducts === 'function') renderCatalogEditorProducts(catalogId);
  } catch (e) {
    console.warn('[P3D] reorder error:', e.message);
  }
}

if (typeof window.showToast !== 'function') {
  window.showToast = function(msg, type) {
    const el = document.createElement('div');
    const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#6366f1';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:' + bg + ';color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:340px;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };
}

window.p3dBadgeHtml = function(product) {
  const p3d = product?.product3d;
  if (!p3d || (p3d.status !== 'READY' && p3d.status !== 'NEEDS_REVIEW')) return '';
  return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;color:#a5b4fc;margin-left:6px;"><i class="fa-solid fa-rotate-3d"></i> 3D</span>';
};

window.p3dViewBtn = function(product) {
  const p3d = product?.product3d;
  if (!p3d || (p3d.status !== 'READY' && p3d.status !== 'NEEDS_REVIEW')) return '';
  const encoded = encodeURIComponent(JSON.stringify({ glbUrl: p3d.glbUrl, name: product.name || 'Product' }));
  return '<button type="button" onclick="publicOpenProduct3dViewerFromCatalog(\'' + encoded + '\')" style="margin-top:6px;width:100%;padding:6px;font-size:11px;font-weight:700;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:7px;cursor:pointer;"><i class="fa-solid fa-rotate-3d"></i> View in 3D</button>';
};

window.publicOpenProduct3dViewerFromCatalog = function(encoded) {
  try {
    const data = JSON.parse(decodeURIComponent(encoded));
    window._currentPublicProduct3d = { glbUrl: data.glbUrl, status: 'READY' };
    window._currentPublicProductName = data.name;
    _p3dOpenViewerWithUrl(data.glbUrl, data.name);
  } catch (e) { console.warn('[P3D] catalog viewer open error:', e.message); }
};

// End P3.7 Product 3D System
