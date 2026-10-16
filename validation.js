(function () {
  'use strict';

  var form = document.getElementById('loginForm') || document.getElementById('signupForm');
  if (!form) return;

  var isSignup = form.id === 'signupForm' || !!document.getElementById('repeatPassword');
  var nameInput = document.getElementById('name');
  var email = document.getElementById('email');
  var password = document.getElementById('password');
  var repeatPassword = document.getElementById('repeatPassword');
  var toggle = document.getElementById('toggle');
  var msg = document.getElementById('formMsg');
  var btn = document.getElementById('submitBtn');

  if (!email || !password || !msg || !btn) return;

  // Show / hide password (login page only; guarded so signup never throws).
  if (toggle && password) {
    toggle.addEventListener('click', function () {
      var hidden = password.type === 'password';
      password.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(hidden));
    });
  }

  function setError(fieldId, errId, text) {
    var field = document.getElementById(fieldId);
    var err = document.getElementById(errId);
    if (field) field.classList.toggle('invalid', !!text);
    if (err) err.textContent = text || '';
    return !text;
  }

  function validate() {
    var e = email.value.trim();
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    var okEmail = setError('emailField', 'emailErr',
      !e ? 'Enter your email address.' : (!emailOk ? 'Enter a valid email, like name@example.com.' : ''));
    var okPass = setError('passField', 'passErr',
      !password.value ? 'Enter your password.' : (password.value.length < 8 ? 'Passwords have at least 8 characters.' : ''));

    if (!isSignup) return okEmail && okPass;

    var okName = setError('nameField', 'nameErr',
      !nameInput || !nameInput.value.trim() ? 'Enter your name.' : '');
    var okRepeat = setError('repeatpassField', 'repeatErr',
      !repeatPassword || !repeatPassword.value ? 'Repeat your password.'
        : (repeatPassword.value !== password.value ? 'Passwords do not match.' : ''));
    return okEmail && okPass && okName && okRepeat;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.textContent = ''; msg.className = 'form-msg';
    if (!validate()) return;

    var busyLabel = isSignup ? 'Creating account…' : 'Logging in…';
    var doneLabel = isSignup
      ? 'Account created. (Demo only: connect the backend call above.)'
      : 'Logged in. (Demo only: connect the backend call above.)';
    var idleLabel = isSignup ? 'Sign up' : 'Log in';

    btn.disabled = true; btn.textContent = busyLabel;
    new Promise(function (r) { setTimeout(r, 700); }).then(function () {
      msg.textContent = doneLabel;
      msg.classList.add('ok');
      btn.disabled = false; btn.textContent = idleLabel;
    }).catch(function (err) {
      msg.textContent = (err && err.message) || 'Something went wrong. Try again.';
      msg.classList.add('fail');
      btn.disabled = false; btn.textContent = idleLabel;
    });
  });
})();
