// Định dạng số kiểu Việt Nam (dấu phẩy thập phân).
const nf = (digits) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const cache = new Map();

/** @param {number} value @param {number} [digits] */
export function num(value, digits = 0) {
  if (!Number.isFinite(value)) return '–';
  if (!cache.has(digits)) cache.set(digits, nf(digits));
  return cache.get(digits).format(value);
}

/** Đặt text an toàn, chỉ cập nhật khi đổi. */
export function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
