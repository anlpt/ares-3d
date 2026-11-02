// Bảng đo nhỏ góc màn hình: đọc trực tiếp state của engine.
import { formatClock } from '../sim/schedule.js';
import { num, setText } from './format.js';

const HVAC_MODE = Object.freeze({
  off: 'Tắt', precool: 'Làm mát trước', comfort: 'Theo số người', failsafe: 'Tắt an toàn', keep: 'Giữ chạy',
});
const REFRESH_S = 0.2;

/** @param {HTMLElement} root */
export function createHud(root) {
  const q = (k) => root.querySelector(`[data-hud="${k}"]`);
  const bars = [...root.querySelectorAll('[data-hud-bar]')];
  const fields = {
    clock: q('clock'), people: q('people'), tin: q('tin'), ac: q('ac'),
    kw: q('kw'), kwBase: q('kw-base'), note: q('note'),
  };
  let acc = REFRESH_S;

  return {
    setVisible(v) {
      root.classList.toggle('is-hidden', !v);
    },
    update(state, dt, { compare = false } = {}) {
      acc += dt;
      if (acc < REFRESH_S) return;
      acc = 0;
      const total = state.inputs.zoneCounts.reduce((a, b) => a + b, 0);
      setText(fields.clock, formatClock(state.inputs.minute));
      setText(fields.people, `${total}`);
      setText(fields.tin, `${num(state.tIn, 1)} °C`);
      const { hvac } = state;
      setText(fields.ac, hvac.power && hvac.setpoint != null
        ? `${HVAC_MODE[hvac.mode]}, ${hvac.setpoint} °C`
        : HVAC_MODE[hvac.mode] ?? 'Tắt');
      const kw = state.power.light + state.power.ac;
      setText(fields.kw, `${num(kw, 2)} kW`);
      setText(fields.kwBase, `${num(state.power.lightBase + state.power.acBase, 2)} kW`);
      bars.forEach((bar, i) => {
        const pwm = compare ? 100 : state.zones[i].pwm;
        bar.style.setProperty('--v', String(pwm / 100));
        bar.title = `Khu ${i + 1}: ${num(pwm)} %`;
      });
      const busiest = state.zones.findIndex((z) => z.onset);
      const note = busiest >= 0 ? `Khu ${busiest + 1}: ${state.zones[busiest].note}` : hvac.note;
      setText(fields.note, note);
    },
  };
}
