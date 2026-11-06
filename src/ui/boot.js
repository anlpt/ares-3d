// Màn khởi động: vòng đo tròn + phần trăm tải thật + nhật ký hệ thống, rồi quét lộ cảnh 3D.
import { setText } from './format.js';

const EXIT_MS = 900;
const MAX_WAIT_MS = 7000;
const MIN_SHOW_MS = 1400;

/**
 * @param {HTMLElement} root phần tử #boot
 * @param {{reducedMotion:boolean}} opts
 */
export function createBoot(root, { reducedMotion }) {
  const ring = root.querySelector('[data-boot-ring]');
  const pctEl = root.querySelector('[data-boot-pct]');
  const log = root.querySelector('[data-boot-log]');
  const len = 2 * Math.PI * Number(ring.getAttribute('r'));
  ring.style.strokeDasharray = String(len);
  ring.style.strokeDashoffset = String(len);
  const startedAt = performance.now();
  let target = 0;
  let shown = 0;
  let finished = false;

  const render = () => {
    setText(pctEl, String(Math.round(shown)));
    root.style.setProperty('--p', String(shown / 100));
    ring.style.strokeDashoffset = String(len * (1 - shown / 100));
  };
  // setInterval thay vì rAF: tab ở nền vẫn chạy tiếp, màn khởi động không kẹt.
  const timer = setInterval(() => {
    shown += (target - shown) * 0.18 + (shown < target ? 0.4 : 0);
    shown = Math.min(shown, target);
    render();
  }, 30);

  return {
    /** Ghi một dòng nhật ký và đẩy tiến độ lên `pct` (0–100). */
    step(text, pct) {
      target = Math.max(target, pct);
      const li = document.createElement('li');
      li.textContent = text;
      log.appendChild(li);
    },
    /** @returns {Promise<void>} xong khi màn khởi động đã rút khỏi màn hình */
    async finish() {
      if (finished) return;
      finished = true;
      target = 100;
      if (reducedMotion) {
        clearInterval(timer);
        root.remove();
        return;
      }
      const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - startedAt));
      await new Promise((r) => { setTimeout(r, wait + 350); });
      clearInterval(timer);
      shown = 100;
      render();
      root.classList.add('is-leaving');
      await new Promise((r) => { setTimeout(r, EXIT_MS); });
      root.remove();
    },
    /** Lưới an toàn: nếu có bước nào treo, vẫn mở trang sau MAX_WAIT_MS. */
    get maxWaitMs() {
      return MAX_WAIT_MS;
    },
  };
}
