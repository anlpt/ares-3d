// Chuyển cảnh kiểu HUD: dải quét + mảnh glitch lướt qua màn hình, tiêu đề giải mã chữ, thẻ tự vẽ khung.
const WIPE_MS = 820;
const SLICES = 7;
const DECODE_MS = 650;
const GLYPHS = '01<>/[]#%&*+=ABCDEFXYZ';

const rand = (a, b) => a + Math.random() * (b - a);

/** @param {HTMLElement} root phần tử #wipe */
export function createTransitions(root, { reducedMotion }) {
  const band = root.querySelector('.wipe-band');
  const slices = Array.from({ length: SLICES }, () => {
    const s = document.createElement('i');
    s.className = 'wipe-slice';
    root.appendChild(s);
    return s;
  });
  let running = false;

  function wipe() {
    if (reducedMotion || running) return;
    running = true;
    root.classList.add('is-on');
    const anim = band.animate(
      [{ transform: 'translateX(-45vw) skewX(-8deg)' }, { transform: 'translateX(130vw) skewX(-8deg)' }],
      { duration: WIPE_MS, easing: 'cubic-bezier(.65,0,.35,1)' },
    );
    slices.forEach((s) => {
      const top = rand(0, 96);
      const h = rand(0.4, 3.2);
      const delay = rand(60, WIPE_MS * 0.6);
      Object.assign(s.style, { top: `${top}%`, height: `${h}%`, width: `${rand(18, 55)}vw` });
      s.animate([
        { opacity: 0, transform: `translateX(${rand(-20, 30)}vw)` },
        { opacity: 0.9, transform: `translateX(${rand(10, 60)}vw)`, offset: 0.35 },
        { opacity: 0.2, transform: `translateX(${rand(40, 90)}vw)`, offset: 0.7 },
        { opacity: 0, transform: `translateX(${rand(70, 120)}vw)` },
      ], { duration: rand(260, 420), delay, easing: 'steps(6, end)', fill: 'both' });
    });
    anim.onfinish = () => {
      running = false;
      root.classList.remove('is-on');
    };
  }

  /** Chữ ngẫu nhiên → chữ thật, từ trái sang phải. Giữ aria-label để trình đọc màn hình đọc đúng. */
  function decode(el) {
    if (reducedMotion || !el) return;
    const text = el.dataset.text ?? el.textContent;
    el.dataset.text = text;
    el.setAttribute('aria-label', text);
    el.classList.remove('is-glitch');
    void el.offsetWidth; // khởi động lại animation CSS
    el.classList.add('is-glitch');
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / DECODE_MS);
      const solved = Math.floor(text.length * t);
      el.textContent = [...text].map((ch, i) => {
        if (i < solved || ch === ' ') return ch;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }).join('');
      if (t < 1) setTimeout(tick, 32);
      else {
        el.textContent = text;
        el.removeAttribute('aria-label');
      }
    };
    tick();
  }

  /** Thẻ chương: khung vẽ ra, nội dung bung lần lượt. */
  function enterCard(card) {
    if (reducedMotion || !card) return;
    card.classList.remove('is-entering');
    void card.offsetWidth;
    card.classList.add('is-entering');
    decode(card.querySelector('h2'));
  }

  return { wipe, decode, enterCard };
}
