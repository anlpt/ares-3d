// Biểu đồ nhiệt độ phòng 05:30 → 07:30: có và không có pre-cooling, tính bằng chính engine.
import { createEngine } from '../sim/engine.js';
import { CONFIG } from '../sim/config.js';
import { tLeadMinutes } from '../sim/formulas.js';
import { formatClock } from '../sim/schedule.js';
import { num } from './format.js';

const START = 5 * 60 + 30;
const END = 7 * 60 + 30;
const CLASS_AT = 7 * 60;
const T_IN = 30.5;
const T_OUT = 34;
const W = 560;
const H = 220;
const PAD = { l: 38, r: 14, t: 16, b: 30 };
const SVG_NS = 'http://www.w3.org/2000/svg';

function simulateAres() {
  const engine = createEngine({ minute: START, sky: 0.25, tOut: T_OUT, clockRate: 1 });
  engine.prime({ tIn: T_IN });
  const pts = [];
  let arrived = false;
  while (engine.getState().inputs.minute < END) {
    if (!arrived && engine.getState().inputs.minute >= CLASS_AT) {
      arrived = true;
      engine.setInputs({ zoneCounts: [6, 6, 5, 5] });
      engine.prime();
    }
    engine.tick(30);
    pts.push([engine.getState().inputs.minute, engine.getState().tIn]);
  }
  return pts;
}

function simulateNoPrecool() {
  // Phòng tự nóng lên tới lúc vào lớp rồi mới bật điều hòa.
  const engine = createEngine({ minute: START, sky: 0.25, tOut: T_OUT, clockRate: 1, day: 8 });
  engine.prime({ tIn: T_IN });
  const pts = [];
  while (engine.getState().inputs.minute < CLASS_AT) {
    engine.tick(30);
    pts.push([engine.getState().inputs.minute, engine.getState().tIn]);
  }
  const at = engine.getState().tIn;
  const after = createEngine({ minute: CLASS_AT, sky: 0.25, tOut: T_OUT, clockRate: 1, zoneCounts: [6, 6, 5, 5] });
  after.prime({ tIn: at });
  while (after.getState().inputs.minute < END) {
    after.tick(30);
    pts.push([after.getState().inputs.minute, after.getState().tIn]);
  }
  return pts;
}

const sx = (m) => PAD.l + ((m - START) / (END - START)) * (W - PAD.l - PAD.r);
const sy = (t) => PAD.t + ((32 - t) / (32 - 23)) * (H - PAD.t - PAD.b);

function el(name, attrs, text) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  if (text != null) node.textContent = text;
  return node;
}

const pathOf = (pts) => pts.filter(([, t]) => t != null)
  .map(([m, t], i) => `${i === 0 ? 'M' : 'L'}${sx(m).toFixed(1)},${sy(t).toFixed(1)}`).join('');

/** @param {HTMLElement} host */
export function renderPrecoolChart(host) {
  const lead = tLeadMinutes(T_IN, T_OUT, CONFIG.hvac.rCoolDefault, CONFIG.hvac.tTarget, CONFIG.hvac.gamma);
  const ares = simulateAres();
  const plain = simulateNoPrecool();
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'pcTitle' });
  svg.append(el('title', { id: 'pcTitle' }, `Nhiệt độ phòng trước giờ học: ARES bật trước ${Math.round(lead)} phút`));

  [24, 26, 28, 30].forEach((t) => {
    svg.append(el('line', { x1: PAD.l, x2: W - PAD.r, y1: sy(t), y2: sy(t), class: 'pc-grid' }));
    svg.append(el('text', { x: PAD.l - 8, y: sy(t) + 4, class: 'pc-axis', 'text-anchor': 'end' }, `${t}°`));
  });
  [START, 6 * 60, 6 * 60 + 30, CLASS_AT, END].forEach((m) => {
    svg.append(el('text', { x: sx(m), y: H - 8, class: 'pc-axis', 'text-anchor': 'middle' }, formatClock(m)));
  });
  svg.append(el('rect', { x: sx(CLASS_AT - lead), y: PAD.t, width: sx(CLASS_AT) - sx(CLASS_AT - lead), height: H - PAD.t - PAD.b, class: 'pc-lead' }));
  svg.append(el('line', { x1: sx(CLASS_AT), x2: sx(CLASS_AT), y1: PAD.t, y2: H - PAD.b, class: 'pc-class' }));
  svg.append(el('text', { x: sx(CLASS_AT) + 6, y: PAD.t + 12, class: 'pc-tag' }, 'Vào lớp'));
  svg.append(el('text', { x: sx(CLASS_AT - lead) + 6, y: PAD.t + 12, class: 'pc-tag is-cool' }, `Bật lúc ${formatClock(CLASS_AT - lead)}`));
  svg.append(el('path', { d: pathOf(plain), class: 'pc-line is-plain' }));
  svg.append(el('path', { d: pathOf(ares), class: 'pc-line is-ares' }));

  host.replaceChildren(svg);
  const atClass = (pts) => pts.find(([m]) => m >= CLASS_AT)?.[1];
  return { lead, aresAtClass: atClass(ares), plainAtClass: atClass(plain), fmt: (v) => num(v, 1) };
}
