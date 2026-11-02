// Bảng HUD kính nối vào tòa nhà bằng đường dẫn: chiếu điểm neo 3D ra màn hình mỗi khung hình.
import * as THREE from 'three';
import { ANCHORS, FLOOR_COUNT } from '../scene/building.js';
import { num, setText } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ELBOW = 26;
const REFRESH_S = 0.25;
const FLOOR_BASE_KW = 0.3;
const ROOM_KW = 1.15;
const P101_GAUGE_MAX_KW = 4.5;
const ENERGY_RATIO = 32.64 / 37.12; // ARES / bật hết, 4 ngày mô phỏng (ARES_UPGRADE.md mục 9)

const floorCode = (f) => `L${String(f + 1).padStart(2, '0')}`;

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function setRing(circle, frac) {
  const r = Number(circle.getAttribute('r'));
  const len = 2 * Math.PI * r;
  circle.style.strokeDasharray = `${len}`;
  circle.style.strokeDashoffset = `${len * (1 - Math.max(0, Math.min(1, frac)))}`;
}

/** Điểm gắn trên mép bảng, phía gần điểm neo nhất. */
function attachPoint(rect, p) {
  if (p.x < rect.left) return { x: rect.left, y: rect.top + rect.height / 2, dx: -1, dy: 0 };
  if (p.x > rect.right) return { x: rect.right, y: rect.top + rect.height / 2, dx: 1, dy: 0 };
  if (p.y < rect.top) return { x: rect.left + rect.width / 2, y: rect.top, dx: 0, dy: -1 };
  return { x: rect.left + rect.width / 2, y: rect.bottom, dx: 0, dy: 1 };
}

function buildTelemetryRows(tbody, onHover) {
  return Array.from({ length: FLOOR_COUNT }, (_, i) => FLOOR_COUNT - 1 - i).map((f) => {
    const tr = document.createElement('tr');
    tr.dataset.floor = String(f);
    const cells = ['th', 'td', 'td', 'td'].map((tag) => tr.appendChild(document.createElement(tag)));
    cells[0].scope = 'row';
    cells[0].textContent = floorCode(f);
    tr.addEventListener('pointerenter', () => onHover(f));
    tr.addEventListener('pointerleave', () => onHover(-1));
    tbody.appendChild(tr);
    return { f, tr, kw: cells[1], rooms: cells[2], bar: cells[3] };
  });
}

/**
 * @param {HTMLElement} root
 * @param {{camera:THREE.Camera, building:object}} deps
 */
export function createCallouts(root, { camera, building }) {
  const svg = root.querySelector('.callout-lines');
  const panels = [...root.querySelectorAll('[data-callout]')].map((el) => {
    const anchor = ANCHORS[el.dataset.callout];
    const path = svgEl('path', { class: 'callout-path' });
    const dot = svgEl('circle', { r: 3.5, class: 'callout-dot' });
    const ring = svgEl('circle', { r: 10, class: 'callout-ring' });
    svg.append(path, ring, dot);
    return { el, anchor, path, dot, ring };
  });

  let hoverFloor = -1;
  const setHover = (f) => {
    hoverFloor = f;
    building.setHoverFloor(f);
  };
  const rows = buildTelemetryRows(root.querySelector('[data-tele-rows]'), setHover);
  const occHost = root.querySelector('[data-occ-bars]');
  const occBars = Array.from({ length: FLOOR_COUNT }, () => occHost.appendChild(document.createElement('i')));
  occHost.style.setProperty('--n', String(FLOOR_COUNT));
  setText(root.querySelector('[data-occ-top]'), floorCode(FLOOR_COUNT - 1));
  const occTotal = root.querySelector('[data-occ-total]');
  const p101 = {
    ring: root.querySelector('[data-p101-ring]'), kw: root.querySelector('[data-p101-kw]'),
    temp: root.querySelector('[data-p101-temp]'), people: root.querySelector('[data-p101-people]'),
  };
  setRing(root.querySelector('[data-energy-ring]'), ENERGY_RATIO);

  const v = new THREE.Vector3();
  let acc = REFRESH_S;
  let visible = false;

  function refreshData(state) {
    const stats = building.floorStats();
    const roomKw = state.power.light + state.power.ac;
    rows.forEach((r) => {
      const s = stats[r.f];
      const kw = FLOOR_BASE_KW + (s.lit - (r.f === 0 ? 1 : 0)) * ROOM_KW + (r.f === 0 ? roomKw : 0);
      setText(r.kw, num(Math.max(0, kw), 2));
      setText(r.rooms, `${s.lit}/${s.total}`);
      r.bar.style.setProperty('--v', String(s.lit / s.total));
      r.tr.classList.toggle('is-hover', r.f === hoverFloor);
    });
    occBars.forEach((bar, f) => {
      bar.style.setProperty('--v', String(stats[f].lit / stats[f].total));
      bar.classList.toggle('is-hover', f === hoverFloor);
    });
    const lit = stats.reduce((a, s) => a + s.lit, 0);
    setText(occTotal, `${lit}/${stats.length * stats[0].total}`);
    setRing(p101.ring, roomKw / P101_GAUGE_MAX_KW);
    setText(p101.kw, num(roomKw, 2));
    setText(p101.temp, `${num(state.tIn, 1)} °C`);
    setText(p101.people, `${state.inputs.zoneCounts.reduce((a, b) => a + b, 0)}`);
  }

  function drawLines() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    panels.forEach((p) => {
      const rect = p.el.getBoundingClientRect();
      v.copy(p.anchor).project(camera);
      const onScreen = rect.width > 0 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      const target = { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
      p.path.style.display = onScreen ? '' : 'none';
      p.dot.style.display = p.path.style.display;
      p.ring.style.display = p.path.style.display;
      if (!onScreen) return;
      const a = attachPoint(rect, target);
      const ex = a.x + a.dx * ELBOW;
      const ey = a.y + a.dy * ELBOW;
      p.path.setAttribute('d', `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)} L${target.x.toFixed(1)},${target.y.toFixed(1)}`);
      p.dot.setAttribute('cx', target.x.toFixed(1));
      p.dot.setAttribute('cy', target.y.toFixed(1));
      p.ring.setAttribute('cx', target.x.toFixed(1));
      p.ring.setAttribute('cy', target.y.toFixed(1));
    });
  }

  return {
    setHover,
    get hoverFloor() {
      return hoverFloor;
    },
    /** @param {boolean} active chương có tòa nhà @param {number} mix độ hiện của tòa nhà */
    update(state, dt, { active, mix }) {
      const show = active && mix > 0.35;
      if (show !== visible) {
        visible = show;
        root.classList.toggle('is-on', show);
        if (!show) setHover(-1);
      }
      if (!show) return;
      acc += dt;
      if (acc >= REFRESH_S) {
        acc = 0;
        refreshData(state);
      }
      drawLines();
    },
  };
}
