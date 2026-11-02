// Vùng 2×2 trên sàn + điểm chân của từng người; và cột "bộ đệm 30 s" có hai ngưỡng bật/tắt.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE, ROOM } from './palette.js';
import { ZONE_CENTERS } from './layout.js';
import { CONFIG } from '../sim/config.js';
import { createLayer, makeLabelEl, damp } from './layer.js';

const COL_H = 2.4;
const MAX_FEET = 24;

function buildTiles(layer) {
  const w = ROOM.w / 2 - 0.12;
  const d = ROOM.d / 2 - 0.12;
  return ZONE_CENTERS.map(([x, z], i) => {
    const mat = layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.lamp, depthWrite: false }), 0.05);
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x, 0.015, z);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.vision }), 0.35),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.02, z);
    const el = layer.label(makeLabelEl('zone'));
    const label = new CSS2DObject(el);
    label.position.set(x, 0.05, z + (z > 0 ? 1.7 : -1.7));
    layer.group.add(tile, edge, label);
    return { mat, el, name: CONFIG.room.zones[i].name, last: '' };
  });
}

function buildFeet(layer) {
  const geo = new THREE.RingGeometry(0.16, 0.24, 24);
  const mat = layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.vision, side: THREE.DoubleSide, depthWrite: false }), 0.9);
  return Array.from({ length: MAX_FEET }, () => {
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    layer.group.add(ring);
    return ring;
  });
}

/** Cột thuỷ tinh: mức chất lỏng = trung bình hiện diện 30 s; vòng hổ phách = ngưỡng bật, vòng xám = ngưỡng tắt. */
function buildColumns(layer) {
  const L = CONFIG.lighting;
  return ZONE_CENTERS.map(([x, z]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, COL_H, 32, 1, true),
      layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.vision, side: THREE.DoubleSide, depthWrite: false }), 0.07),
    );
    glass.position.y = COL_H / 2;
    const fillMat = layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.lamp }), 0.85);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 32), fillMat);
    const ring = (frac, color) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 48),
        layer.fade(new THREE.MeshBasicMaterial({ color }), 1));
      r.rotation.x = Math.PI / 2;
      r.position.y = frac * COL_H;
      return r;
    };
    g.add(glass, fill, ring(L.occOnThreshold, PALETTE.lamp), ring(L.occOffThreshold, PALETTE.line));
    const el = layer.label(makeLabelEl('buffer'));
    const label = new CSS2DObject(el);
    label.position.set(0, COL_H + 0.35, 0);
    g.add(label);
    layer.group.add(g);
    return { fill, fillMat, el, level: 0, last: '' };
  });
}

/** @param {THREE.Scene} scene */
export function createZones(scene) {
  const zones = createLayer('zones');
  const buffers = createLayer('buffers');
  const tiles = buildTiles(zones);
  const feet = buildFeet(zones);
  const cols = buildColumns(buffers);
  scene.add(zones.group, buffers.group);
  const off = PALETTE.line.clone();

  return {
    zones,
    buffers,
    update(state, agents, dt) {
      const counts = state.inputs.zoneCounts;
      tiles.forEach((t, i) => {
        const occ = state.occAvg[i];
        t.mat.color.copy(off).lerp(PALETTE.lamp, occ);
        t.mat.opacity = (0.03 + occ * 0.09) * zones.mix;
        const text = `<b>${t.name}</b><span>${counts[i]} người</span>`;
        if (text !== t.last) {
          t.last = text;
          t.el.innerHTML = text;
          t.el.classList.toggle('is-on', state.zones[i].occupied);
        }
      });
      const seen = agents.filter((a) => a.mesh.visible && a.wait <= 0);
      feet.forEach((ring, i) => {
        const a = seen[i];
        ring.visible = Boolean(a);
        if (a) ring.position.set(a.pos.x, 0.03, a.pos.z);
      });
      cols.forEach((c, i) => {
        c.level = damp(c.level, state.occAvg[i], 4, dt);
        const h = Math.max(0.001, c.level * COL_H);
        c.fill.scale.y = h;
        c.fill.position.y = h / 2;
        c.fillMat.color.copy(off).lerp(PALETTE.lamp, state.zones[i].occupied ? 1 : 0.15);
        const text = `TB 30 s <b>${c.level.toFixed(2).replace('.', ',')}</b>`;
        if (text !== c.last) {
          c.last = text;
          c.el.innerHTML = text;
        }
      });
    },
  };
}
