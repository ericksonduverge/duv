// Monthly drop countdown: "Galería Noviembre 2026  8D 05H 03M 12S".
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = (n) => String(n).padStart(2, '0');

/** Fallback when the API is unreachable: calendar month in Santo Domingo time (UTC-4, no DST). */
export function localDrop() {
  const now = new Date();
  const rd = new Date(now.getTime() - 4 * 3600e3); // shift to UTC-4 and read UTC fields
  const y = rd.getUTCFullYear(), m = rd.getUTCMonth();
  const end = new Date(Date.UTC(y, m + 1, 1, 4, 0, 0)); // 00:00 UTC-4 on the 1st of next month
  return { label: `Galería ${MESES[m]} ${y}`, endsAt: end.toISOString(), now: now.toISOString() };
}

export function format(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${d}D ${pad(h)}H ${pad(m)}M ${pad(sec)}S`;
}

/** Drives every [data-countdown] element on the page. Calls onEnd once when the drop closes. */
export function startCountdown(drop, onEnd) {
  const end = Date.parse(drop.endsAt);
  const skew = drop.now ? Date.parse(drop.now) - Date.now() : 0; // trust the server clock
  const els = [...document.querySelectorAll('[data-countdown]')];
  for (const el of els) el.querySelector('.cd-label').textContent = drop.label;
  let fired = false;
  const tick = () => {
    const left = end - (Date.now() + skew);
    const txt = format(left);
    for (const el of els) {
      const t = el.querySelector('.cd-time');
      if (t.textContent !== txt) t.textContent = txt;
    }
    if (left <= 0 && !fired) { fired = true; onEnd && onEnd(); }
  };
  tick();
  return setInterval(tick, 1000);
}
