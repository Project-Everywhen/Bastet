const form = document.getElementById('loginForm');
const nameInput = document.getElementById('name-input');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle');
  const msg = document.getElementById('formMsg');
  const btn = document.getElementById('submitBtn');

  // Show / hide password
  toggle.addEventListener('click', () => {
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    toggle.textContent = hidden ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(hidden));
  });

  function setError(fieldId, errId, text) {
    document.getElementById(fieldId).classList.toggle('invalid', !!text);
    document.getElementById(errId).textContent = text;
    return !text;
  }

  function validate() {
    const e = email.value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const okEmail = setError('emailField', 'emailErr',
      !e ? 'Enter your email address.' : (!emailOk ? 'Enter a valid email, like name@example.com.' : ''));
    const okPass = setError('passField', 'passErr',
      !password.value ? 'Enter your password.' : (password.value.length < 8 ? 'Passwords have at least 8 characters.' : ''));
    return okEmail && okPass;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = ''; msg.className = 'form-msg';
    if (!validate()) return;

    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      // to be finished after backend creation

      await new Promise(r => setTimeout(r, 700)); // fake delay for the demo
      msg.textContent = 'Logged in. (Demo only: connect the backend call above.)';
      msg.classList.add('ok');
    } catch (err) {
      msg.textContent = err.message || 'Something went wrong. Try again.';
      msg.classList.add('fail');
    } finally {
      btn.disabled = false; btn.textContent = 'Log in';
    }
  });