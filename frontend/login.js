/* ==========================================
   CropSwitch â€” Frontend Login & Auth Controller
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM Elements ----------
    const tabSignIn = document.getElementById('tabSignIn');
    const tabSignUp = document.getElementById('tabSignUp');
    const tabSlider = document.getElementById('tabSlider');
    const authTabs = document.querySelector('.auth-tabs');
    const signInFormPanel = document.getElementById('signInFormPanel');
    const signUpFormPanel = document.getElementById('signUpFormPanel');

    // Forms
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const forgotForm = document.getElementById('forgotForm');

    // Submit Buttons
    const signInSubmitBtn = document.getElementById('signInSubmitBtn');
    const signUpSubmitBtn = document.getElementById('signUpSubmitBtn');

    // Password Toggle Buttons
    const togglePasswordBtns = document.querySelectorAll('.toggle-password-btn');

    // Password Strength Meter Elements
    const regPasswordInput = document.getElementById('regPassword');
    const passwordMeterWrap = document.getElementById('passwordMeterWrap');
    const meterBar = document.getElementById('meterBar');
    const meterLabel = document.getElementById('meterLabel');
    const meterHint = document.getElementById('meterHint');

    // Forgot Password Modal Elements
    const forgotModal = document.getElementById('forgotModal');
    const openForgotBtn = document.getElementById('openForgotBtn');
    const closeForgotBtn = document.getElementById('closeForgotBtn');
    const cancelForgotBtn = document.getElementById('cancelForgotBtn');
    const forgotEmailInput = document.getElementById('forgotEmail');

    // SSO Buttons
    const ssoGoogleBtn = document.getElementById('ssoGoogleBtn');
    const ssoAgriBtn = document.getElementById('ssoAgriBtn');

    // Toast Container
    const toastContainer = document.getElementById('toastContainer');

    // ==========================================
    // 1. TAB SWITCHING (SIGN IN / CREATE ACCOUNT)
    // ==========================================
    function switchTab(target) {
        if (target === 'signin') {
            tabSignIn.classList.add('active');
            tabSignUp.classList.remove('active');
            tabSignIn.setAttribute('aria-selected', 'true');
            tabSignUp.setAttribute('aria-selected', 'false');
            authTabs.classList.remove('signup-active');

            signInFormPanel.style.display = 'block';
            signUpFormPanel.style.display = 'none';
        } else {
            tabSignUp.classList.add('active');
            tabSignIn.classList.remove('active');
            tabSignUp.setAttribute('aria-selected', 'true');
            tabSignIn.setAttribute('aria-selected', 'false');
            authTabs.classList.add('signup-active');

            signUpFormPanel.style.display = 'block';
            signInFormPanel.style.display = 'none';
        }
    }

    tabSignIn.addEventListener('click', () => switchTab('signin'));
    tabSignUp.addEventListener('click', () => switchTab('signup'));

    // ==========================================
    // 2. TOGGLE PASSWORD VISIBILITY
    // ==========================================
    togglePasswordBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');

            if (input.type === 'password') {
                input.type = 'text';
                if (eyeOpen) eyeOpen.style.display = 'none';
                if (eyeClosed) eyeClosed.style.display = 'block';
                btn.setAttribute('aria-label', 'Hide password');
            } else {
                input.type = 'password';
                if (eyeOpen) eyeOpen.style.display = 'block';
                if (eyeClosed) eyeClosed.style.display = 'none';
                btn.setAttribute('aria-label', 'Show password');
            }
        });
    });

    // ==========================================
    // 3. PASSWORD STRENGTH CALCULATION
    // ==========================================
    if (regPasswordInput) {
        regPasswordInput.addEventListener('input', () => {
            const val = regPasswordInput.value;
            if (!val) {
                passwordMeterWrap.classList.remove('active');
                return;
            }
            passwordMeterWrap.classList.add('active');

            let score = 0;
            if (val.length >= 8) score++;
            if (val.length >= 12) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            let percent = 0;
            let color = '#D9383A';
            let labelText = 'Weak';
            let hintText = 'Add numbers and special characters';

            if (score <= 1) {
                percent = 20;
                color = '#D9383A';
                labelText = 'Very Weak';
                hintText = 'Needs at least 8 characters';
            } else if (score === 2) {
                percent = 45;
                color = '#E67E22';
                labelText = 'Fair';
                hintText = 'Try mixing uppercase & numbers';
            } else if (score === 3 || score === 4) {
                percent = 75;
                color = '#F1C40F';
                labelText = 'Good';
                hintText = 'Strong password for farm telemetry';
            } else if (score >= 5) {
                percent = 100;
                color = '#27AE60';
                labelText = 'Excellent';
                hintText = 'High security encrypted key';
            }

            meterBar.style.width = percent + '%';
            meterBar.style.backgroundColor = color;
            meterLabel.textContent = labelText;
            meterLabel.style.color = color;
            meterHint.textContent = hintText;
        });
    }

    // ==========================================
    // 5. CLIENT-SIDE VALIDATION HELPERS
    // ==========================================
    function setInputError(input, errorElement, message) {
        const wrapper = input.closest('.input-wrapper');
        if (wrapper) wrapper.classList.add('has-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('visible');
        }
    }

    function clearInputError(input) {
        const wrapper = input.closest('.input-wrapper');
        if (wrapper) wrapper.classList.remove('has-error');
        const parent = input.closest('.input-group');
        if (parent) {
            const err = parent.querySelector('.field-error');
            if (err) {
                err.textContent = '';
                err.classList.remove('visible');
            }
        }
    }

    // Clear error on input typing
    document.querySelectorAll('.input-wrapper input').forEach(input => {
        input.addEventListener('input', () => clearInputError(input));
    });

    // ==========================================
    // EMAIL AUTHENTICITY & ANTI-FAKE VALIDATION
    // ==========================================
    const BLOCKED_DISPOSABLE_DOMAINS = new Set([
        'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'trashmail.com',
        'yopmail.com', 'sharklasers.com', 'getairmail.com', 'throwawaymail.com', 'dispostable.com',
        'fakemailgenerator.com', 'temp-mail.org', 'fakeinbox.com', 'maildrop.cc', 'inboxkitten.com',
        'mohmal.com', 'crazymailing.com', 'nada.ltd', 'getnada.com', 'burnermail.io', 'emailondeck.com',
        'mytemp.email', 'tempail.com', 'burneremail.com', 'tempmailaddress.com', 'discard.email',
        'fake.com', 'example.com', 'test.com', 'sample.com', 'dummy.com', 'mock.com', 'asdf.com',
        'xyz.com', 'abc.com', 'none.com', 'invalid.com', 'testing.com', 'nowhere.com', 'fakeemail.com',
        'tmail.ws', 'generator.email', 'dropmail.me', 'tempmailo.com', 'tempr.email'
    ]);

    const BLOCKED_FAKE_USERNAMES = new Set([
        'test', 'fake', 'dummy', 'sample', 'asdf', 'admin', 'none', 'noone', 'abc', 'xyz',
        'qwerty', '123', 'user', 'temp', 'nobody', 'random', 'foo', 'bar', 'testuser', 'demo'
    ]);

    function validateEmailRealness(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, error: 'Email address is required.' };
        }

        const trimmed = email.trim().toLowerCase();

        // 1. Strict RFC 5322 regex check
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/;
        if (!emailRegex.test(trimmed)) {
            return { valid: false, error: 'Please enter a valid, complete email address (e.g. name@domain.com).' };
        }

        const parts = trimmed.split('@');
        if (parts.length !== 2) {
            return { valid: false, error: 'Invalid email structure.' };
        }

        const [username, domain] = parts;

        // 2. Username checks (length, blocked dummy names, repetitive characters)
        if (username.length < 3) {
            return { valid: false, error: 'Email username must be at least 3 characters long.' };
        }

        if (BLOCKED_FAKE_USERNAMES.has(username)) {
            return { valid: false, error: 'Placeholder usernames (e.g. "test", "fake", "dummy") are not permitted.' };
        }

        // Check for repeated single character (e.g. "aaaaa", "11111")
        if (/^(.)\1+$/.test(username)) {
            return { valid: false, error: 'Please provide a genuine personal or farm email address.' };
        }

        // 3. Domain checks
        if (BLOCKED_DISPOSABLE_DOMAINS.has(domain)) {
            return { valid: false, error: 'Disposable and temporary email domains are blocked. Please use a real email address.' };
        }

        for (const blocked of BLOCKED_DISPOSABLE_DOMAINS) {
            if (domain.endsWith('.' + blocked)) {
                return { valid: false, error: 'Disposable and temporary email domains are not allowed.' };
            }
        }

        // 4. Domain extension (TLD) check
        const domainParts = domain.split('.');
        const tld = domainParts[domainParts.length - 1];
        if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
            return { valid: false, error: 'Invalid email domain extension.' };
        }

        if (domainParts[0].length < 2) {
            return { valid: false, error: 'Invalid domain name.' };
        }

        return { valid: true, email: trimmed, username: username, domain: domain };
    }

    // Remove the old browser-based registry containing plaintext passwords.
    localStorage.removeItem('cropswitch_user_registry');

    // ==========================================
    // 6. SIGN IN - DATABASE AUTHENTICATION
    // ==========================================
    signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const emailErr = document.getElementById('loginEmailError');
        const passErr = document.getElementById('loginPasswordError');

        let isValid = true;

        if (!emailInput.value.trim()) {
            setInputError(emailInput, emailErr, 'Please enter your registered email address.');
            isValid = false;
        } else {
            const emailCheck = validateEmailRealness(emailInput.value);
            if (!emailCheck.valid) {
                setInputError(emailInput, emailErr, emailCheck.error);
                isValid = false;
            }
        }

        if (!passwordInput.value) {
            setInputError(passwordInput, passErr, 'Please enter your password.');
            isValid = false;
        }

        if (!isValid) return;

        signInSubmitBtn.disabled = true;
        signInSubmitBtn.classList.add('loading');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailInput.value.trim(),
                    password: passwordInput.value
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    setInputError(passwordInput, passErr, data.message || 'Incorrect email or password.');
                } else {
                    showToast('Sign-in failed', data.message || 'Please try again.', '!', true);
                }
                return;
            }

            localStorage.setItem('cropswitch_user_name', data.user.name || '');
            localStorage.setItem('cropswitch_user_farm', data.user.farm || '');
            localStorage.setItem('cropswitch_user_email', data.user.email || '');

            showToast(
                `Welcome back, ${data.user.name || 'Grower'}!`,
                `Signed in to ${data.user.farm || 'your CropSwitch account'}.`,
                '🌱'
            );

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } catch (error) {
            console.error('Sign-in request failed:', error);
            showToast('Connection error', 'Could not contact the CropSwitch server.', '!', true);
        } finally {
            signInSubmitBtn.disabled = false;
            signInSubmitBtn.classList.remove('loading');
        }
    });

    // ==========================================
    // 7. CREATE ACCOUNT - DATABASE REGISTRATION
    // ==========================================
    signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('regName');
        const farmInput = document.getElementById('regFarm');
        const emailInput = document.getElementById('regEmail');
        const passInput = document.getElementById('regPassword');
        const termsInput = document.getElementById('regTerms');

        const nameErr = document.getElementById('regNameError');
        const farmErr = document.getElementById('regFarmError');
        const emailErr = document.getElementById('regEmailError');
        const passErr = document.getElementById('regPasswordError');
        const termsErr = document.getElementById('regTermsError');

        let isValid = true;

        if (nameInput.value.trim().length < 2) {
            setInputError(nameInput, nameErr, 'Please enter a name with at least 2 characters.');
            isValid = false;
        }

        if (farmInput.value.trim().length < 2) {
            setInputError(farmInput, farmErr, 'Please enter a farm name with at least 2 characters.');
            isValid = false;
        }

        let validatedEmail = '';

        const emailCheck = validateEmailRealness(emailInput.value);
        if (!emailCheck.valid) {
            setInputError(emailInput, emailErr, emailCheck.error);
            isValid = false;
        } else {
            validatedEmail = emailCheck.email;
        }

        if (passInput.value.length < 8 || passInput.value.length > 128) {
            setInputError(passInput, passErr, 'Password must be between 8 and 128 characters.');
            isValid = false;
        }

        if (!termsInput.checked) {
            if (termsErr) {
                termsErr.textContent = 'Please accept the terms to proceed.';
                termsErr.classList.add('visible');
            }
            isValid = false;
        } else if (termsErr) {
            termsErr.textContent = '';
            termsErr.classList.remove('visible');
        }

        if (!isValid) return;

        const selectedRole = document.querySelector('input[name="userRole"]:checked');

        signUpSubmitBtn.disabled = true;
        signUpSubmitBtn.classList.add('loading');

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.value.trim(),
                    farm: farmInput.value.trim(),
                    email: validatedEmail,
                    password: passInput.value,
                    role: selectedRole?.value || 'grower'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 409) {
                    setInputError(emailInput, emailErr, data.message);
                } else {
                    showToast('Registration failed', data.message || 'Please try again.', '!', true);
                }
                return;
            }

            localStorage.setItem('cropswitch_user_name', data.user.name || '');
            localStorage.setItem('cropswitch_user_farm', data.user.farm || '');
            localStorage.setItem('cropswitch_user_email', data.user.email || '');

            showToast(
                'Account created successfully!',
                `Welcome to CropSwitch, ${data.user.name}.`,
                '🌱'
            );

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } catch (error) {
            console.error('Registration request failed:', error);
            showToast('Connection error', 'Could not contact the CropSwitch server.', '!', true);
        } finally {
            signUpSubmitBtn.disabled = false;
            signUpSubmitBtn.classList.remove('loading');
        }
    });

    // ==========================================
    // 8. FORGOT PASSWORD
    // ==========================================
    function openModal() {
        forgotModal.style.display = 'flex';
        forgotEmailInput.value = document.getElementById('loginEmail').value || '';
        forgotEmailInput.focus();
    }

    function closeModal() {
        forgotModal.style.display = 'none';
    }

    openForgotBtn.addEventListener('click', openModal);
    closeForgotBtn.addEventListener('click', closeModal);
    cancelForgotBtn.addEventListener('click', closeModal);

    forgotModal.addEventListener('click', (e) => {
        if (e.target === forgotModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && forgotModal.style.display === 'flex') {
            closeModal();
        }
    });

    forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const emailCheck = validateEmailRealness(forgotEmailInput.value);

        if (!emailCheck.valid) {
            showToast('Invalid email', emailCheck.error, '!', true);
            return;
        }

        showToast(
            'Password reset unavailable',
            'The email-based password reset service has not been configured yet.',
            '!',
            true
        );
    });

    // ==========================================
    // 9. SSO - NOT CONFIGURED
    // ==========================================
    function showSsoUnavailable() {
        showToast(
            'Sign-in provider unavailable',
            'Google and AgriPass authentication have not been configured yet.',
            '!',
            true
        );
    }

    if (ssoGoogleBtn) {
        ssoGoogleBtn.addEventListener('click', showSsoUnavailable);
    }

    if (ssoAgriBtn) {
        ssoAgriBtn.addEventListener('click', showSsoUnavailable);
    }
    // ==========================================
    // 10. TOAST NOTIFICATION UTILITY
    // ==========================================
    function showToast(title, message, icon = 'ðŸŒ±', isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'toast-error' : ''}`;
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-body">
                <strong>${title}</strong>
                <span>${message}</span>
            </div>
        `;
        toastContainer.appendChild(toast);

        // Force reflow
        void toast.offsetWidth;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 350);
        }, 4000);
    }
});
