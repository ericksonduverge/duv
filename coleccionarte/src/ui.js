const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
export const MOBILE_QUERY = '(max-width: 820px), (max-aspect-ratio: 4/5)';
export const isSheet = () => window.matchMedia(MOBILE_QUERY).matches;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export function createUI({ gallery, artworks, actions }) {
  const body = document.body;
  const N = artworks.length;
  const panel = $('panel'), panelBody = $('panelBody');
  let current = -1, swapTimer = 0;

  $('hint').textContent = N
    ? (isTouch() ? 'Toca una obra para explorarla' : 'Haz clic en una obra para explorarla')
    : 'Próximamente, nuevas obras en sala';

  const fill = (i) => {
    const a = artworks[i];
    $('pCount').textContent = `OBRA ${pad(i + 1)} / ${pad(N)}`;
    $('pTitle').textContent = a.title || 'Sin título';
    $('pArtist').textContent = a.artist || '';
    $('pSize').textContent = a.widthCm && a.heightCm ? `${a.widthCm} × ${a.heightCm} cm` : '—';
    $('pYear').textContent = a.year ?? '—';
    $('pTech').textContent = a.technique || '—';
    $('pDesc').textContent = a.description || '';
    document.title = `${a.title || 'Obra'} — COLECCIONARTE`;
  };
  const syncSheet = () => document.documentElement.style.setProperty('--sheet-h', `${panel.offsetHeight}px`);

  const setPill = (i) => {
    $('pillLabel').textContent = N ? `Sala Principal · ${pad(Math.max(0, i) + 1)} / ${pad(N)}` : 'Sala Principal';
  };
  setPill(0);

  // ----- drawer -----
  const drawer = $('drawer'), list = $('drawerList');
  const openDrawer = (mode) => {
    $('drawerTitle').textContent = mode === 'artistas' ? 'Artistas' : 'Colección';
    list.innerHTML = '';
    const order = artworks.map((a, i) => ({ a, i }));
    if (mode === 'artistas') order.sort((x, y) => String(x.a.artist).localeCompare(String(y.a.artist), 'es'));
    let last = null;
    for (const { a, i } of order) {
      if (mode === 'artistas' && a.artist !== last) {
        last = a.artist;
        const g = document.createElement('li');
        g.className = 'group';
        g.textContent = a.artist || 'Artista';
        list.append(g);
      }
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const th = document.createElement('span');
      th.className = 'thumb';
      th.style.backgroundImage = `url("${encodeURI(a.image || '')}")`;
      const tx = document.createElement('span');
      const t = document.createElement('b');
      t.textContent = a.title || 'Sin título';
      const s = document.createElement('small');
      s.textContent = [a.artist, a.year].filter(Boolean).join(' · ');
      tx.append(t, s);
      const n = document.createElement('em');
      n.textContent = pad(i + 1);
      b.append(th, tx, n);
      b.addEventListener('click', () => { closeOverlay(drawer); actions.focus(i); });
      li.append(b);
      list.append(li);
    }
    openOverlay(drawer);
  };

  // ----- inquiry modal -----
  const modal = $('modal');
  const contact = gallery.contact || {};
  let inquiryArt = null;
  const buildLinks = () => {
    const name = $('mName').value.trim();
    const msg = $('mMsg').value.trim() + (name ? `\n\n— ${name}` : '');
    const subject = inquiryArt ? `Consulta de precio: ${inquiryArt.title}` : `Consulta — ${gallery.name || 'Coleccionarte'}`;
    const wa = String(contact.whatsapp || '').replace(/\D/g, '');
    const w = $('mWhats'), m = $('mMail');
    w.style.display = wa ? '' : 'none';
    m.style.display = contact.email ? '' : 'none';
    if (wa) w.href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    if (contact.email) m.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
    m.classList.toggle('ghost', !!wa);
  };
  const openInquiry = (a) => {
    inquiryArt = a || null;
    $('mEyebrow').textContent = a ? 'CONSULTA PRIVADA' : 'CONTACTO';
    $('mTitle').textContent = a ? 'Consultar precio' : 'Hablemos de arte';
    $('mSub').textContent = a ? `${a.title} — ${a.artist}` : (gallery.tagline || '');
    $('mMsg').value = a
      ? `Hola, me interesa la obra «${a.title}» de ${a.artist} (${a.widthCm} × ${a.heightCm} cm, ${a.year}). ¿Podrían indicarme su precio y disponibilidad?`
      : 'Hola, me gustaría recibir más información sobre la galería y sus obras disponibles.';
    buildLinks();
    openOverlay(modal);
  };
  $('mName').addEventListener('input', buildLinks);
  $('mMsg').addEventListener('input', buildLinks);
  $('inquiry').addEventListener('submit', (e) => { e.preventDefault(); buildLinks(); ($('mWhats').style.display !== 'none' ? $('mWhats') : $('mMail')).click(); });

  function openOverlay(el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
  function closeOverlay(el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  const overlayOpen = () => drawer.classList.contains('open') || modal.classList.contains('open');
  for (const el of [drawer, modal]) el.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => closeOverlay(el)));

  // ----- wiring -----
  $('pillPrev').addEventListener('click', actions.prev);
  $('pillNext').addEventListener('click', actions.next);
  $('stepPrev').addEventListener('click', actions.prev);
  $('stepNext').addEventListener('click', actions.next);
  $('closeBtn').addEventListener('click', actions.close);
  $('brand').addEventListener('click', (e) => { e.preventDefault(); actions.close(); });
  $('ctaBtn').addEventListener('click', () => current >= 0 && openInquiry(artworks[current]));
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.nav;
    if (k === 'coleccion' || k === 'artistas') openDrawer(k);
    else if (k === 'visita') actions.next();
    else openInquiry(null);
  }));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { if (e.key === 'Escape') closeOverlay(modal); return; }
    if (e.key === 'Escape') {
      if (modal.classList.contains('open')) closeOverlay(modal);
      else if (drawer.classList.contains('open')) closeOverlay(drawer);
      else actions.close();
    } else if (!overlayOpen()) {
      if (e.key === 'ArrowRight') actions.next();
      if (e.key === 'ArrowLeft') actions.prev();
    }
  });
  // swipe on the sheet to change artwork
  let sx = 0, sy = 0;
  panel.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) (dx < 0 ? actions.next : actions.prev)();
    else if (dy > 90 && panel.scrollTop <= 0 && isSheet()) actions.close();
  }, { passive: true });

  return {
    showDetail(i) {
      const wasOpen = body.classList.contains('is-detail');
      clearTimeout(swapTimer);
      if (wasOpen && current !== i && !isSheet()) {
        panelBody.classList.add('swap');
        swapTimer = setTimeout(() => { fill(i); panelBody.classList.remove('swap'); }, 280);
      } else {
        panelBody.classList.remove('swap');
        fill(i);
      }
      current = i;
      setPill(i);
      panel.scrollTop = 0;
      panel.setAttribute('aria-hidden', 'false');
      body.classList.add('is-detail');
      body.classList.remove('is-overview');
      syncSheet();
    },
    hideDetail() {
      current = -1;
      panel.setAttribute('aria-hidden', 'true');
      body.classList.remove('is-detail');
      body.classList.add('is-overview');
      document.title = 'COLECCIONARTE — Galería de arte';
    },
    /** Screen area (px) left free for the artwork while the panel is open. */
    freeArea() {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (isSheet()) {
        syncSheet();
        return { x0: 14, x1: vw - 14, y0: 74, y1: Math.max(180, vh - panel.offsetHeight - 22) };
      }
      const right = parseFloat(getComputedStyle(panel).right) || 40;
      return { x0: 34, x1: vw - right - panel.offsetWidth - 34, y0: 92, y1: vh - 84 };
    },
    setProgress(p) { $('loaderBar').style.transform = `scaleX(${Math.min(1, p).toFixed(3)})`; },
    setLoaded() { body.classList.remove('is-loading'); },
    setError(msg) { $('loaderMsg').textContent = msg; },
    setCursor(pointer) { $('scene').style.cursor = pointer ? 'pointer' : ''; },
  };
}
