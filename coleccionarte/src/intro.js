import { startCountdown, localDrop } from './countdown.js';

const $ = (id) => document.getElementById(id);

const ERR = {
  email_invalido: 'Escribe un correo válido.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  espera: 'Ya enviamos un código. Espera un momento antes de pedir otro.',
  no_se_pudo_enviar: 'No pudimos enviar el correo. Inténtalo de nuevo en un momento.',
  codigo_invalido: 'El código tiene 6 dígitos.',
  codigo_incorrecto: 'Código incorrecto.',
  codigo_vencido: 'El código venció. Pide uno nuevo.',
  red: 'No hay conexión con la galería. Revisa tu internet.',
};

async function api(path, body) {
  let res;
  try {
    res = await fetch(`api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch { return { ok: false, status: 0, data: { error: 'red' } }; }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

/**
 * The entrance: welcome film → e-mail → OTP → ENTRAR → fly-through film → 3D gallery.
 * `startGallery(data)` builds the 3D room; it runs behind the intro while the visitor reads.
 */
export async function runIntro({ startGallery }) {
  const intro = $('intro');
  const welcome = $('introWelcome');
  const enter = $('introEnter');
  const setStep = (s) => { intro.dataset.step = s; };
  const portrait = () => window.innerWidth / window.innerHeight < 0.9;

  // ----- drop + session -----
  const sess = await api('session.php');
  const drop = sess.ok && sess.data.drop ? sess.data.drop : localDrop();
  let authed = !!(sess.ok && sess.data.authenticated);
  startCountdown(drop, () => setTimeout(() => location.reload(), 1500));

  // Pick the fly-through that matches the screen now, so it is buffered by the time ENTRAR is pressed.
  enter.src = portrait() ? 'media/enter-9x16.mp4' : 'media/enter-16x9.mp4';
  enter.load();

  // ----- gallery loads in the background as soon as access is granted -----
  let galleryPromise = null;
  const loadGallery = () => {
    if (galleryPromise) return galleryPromise;
    galleryPromise = (async () => {
      const r = await api('gallery.php');
      if (!r.ok) throw new Error(r.data.error || 'gallery');
      await startGallery(r.data);
    })();
    galleryPromise.catch((e) => { console.error(e); galleryPromise = null; });
    return galleryPromise;
  };
  const granted = () => { authed = true; setStep('enter'); loadGallery(); };

  // ----- start → welcome film -----
  setStep('start');
  const afterWelcome = () => {
    intro.classList.remove('is-playing');
    if (authed) granted(); else { setStep('email'); setTimeout(() => $('introEmailInput').focus({ preventScroll: true }), 400); }
  };
  welcome.addEventListener('ended', afterWelcome);
  $('introStart').addEventListener('click', async () => {
    setStep('playing');
    intro.classList.add('is-playing');
    welcome.muted = false;
    try { await welcome.play(); }
    catch { welcome.muted = true; try { await welcome.play(); } catch { afterWelcome(); } }
  });
  $('introSkip').addEventListener('click', () => {
    if (intro.dataset.step !== 'playing') return;
    welcome.pause();
    if (isFinite(welcome.duration)) welcome.currentTime = Math.max(0, welcome.duration - 0.05);
    afterWelcome();
  });

  // ----- e-mail -----
  let email = '';
  const formError = (form, code, extra = '') => {
    form.querySelector('.intro-error').textContent = code ? (ERR[code] || 'Algo salió mal. Inténtalo de nuevo.') + extra : '';
  };
  const busy = (form, on) => { form.classList.toggle('is-busy', on); form.querySelector('button[type=submit]').disabled = on; };

  const requestCode = async (form) => {
    busy(form, true); formError(form, '');
    const r = await api('otp-request.php', { email });
    busy(form, false);
    if (!r.ok) { formError(form, r.data.error); return false; }
    if (r.data.debugCode) console.info('[dev] código OTP:', r.data.debugCode);
    $('introDemo').hidden = !r.data.demo;
    return true;
  };

  $('introEmail').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = $('introEmailInput').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { formError(form, 'email_invalido'); return; }
    email = v;
    if (await requestCode(form)) {
      $('introCodeEmail').textContent = email;
      $('introCodeInput').value = '';
      formError($('introCode'), '');
      setStep('code');
      setTimeout(() => $('introCodeInput').focus({ preventScroll: true }), 400);
    }
  });

  // ----- code -----
  const codeInput = $('introCodeInput');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value.length === 6) $('introCode').requestSubmit();
  });
  $('introCode').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = codeInput.value;
    if (code.length !== 6) { formError(form, 'codigo_invalido'); return; }
    busy(form, true); formError(form, '');
    const r = await api('otp-verify.php', { email, code });
    busy(form, false);
    if (!r.ok) {
      const left = r.data.left;
      formError(form, r.data.error, typeof left === 'number' ? ` Te quedan ${left} intento${left === 1 ? '' : 's'}.` : '');
      codeInput.select();
      return;
    }
    granted();
  });
  $('introResend').addEventListener('click', async () => {
    const form = $('introCode');
    if (await requestCode(form)) form.querySelector('.intro-error').textContent = 'Te enviamos un código nuevo.';
  });
  $('introChange').addEventListener('click', () => { setStep('email'); $('introEmailInput').select(); });

  // ----- ENTRAR → fly-through → gallery -----
  $('introEnterBtn').addEventListener('click', async () => {
    setStep('entering');
    const want = portrait() ? 'media/enter-9x16.mp4' : 'media/enter-16x9.mp4';
    if (!enter.src.endsWith(want)) { enter.src = want; enter.load(); }
    intro.classList.add('is-entering');
    try { await enter.play(); } catch { /* fall through to the reveal */ }
    const filmDone = new Promise((res) => {
      if (enter.ended || enter.paused) res();
      enter.addEventListener('ended', res, { once: true });
      enter.addEventListener('error', res, { once: true });
    });
    await filmDone;
    if (!window.__gallery?.ready) {
      intro.classList.add('is-waiting');
      try { await loadGallery(); } catch { /* error message shows in the loader */ }
      await new Promise((res) => {
        const poll = () => (window.__gallery?.ready ? res() : setTimeout(poll, 120));
        poll();
      });
    }
    intro.classList.add('is-done');
    document.body.classList.add('is-inside');
    setTimeout(() => { welcome.pause(); enter.pause(); intro.remove(); }, 1600);
  });
}
