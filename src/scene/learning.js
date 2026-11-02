// Vòng học chủ động lơ lửng trên phòng: 5 trạm theo đúng thứ tự workflow 2026-11-01 của ARES.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { createLayer, makeLabelEl, damp } from './layer.js';

const CENTER = new THREE.Vector3(0, 7.2, 0);
const RADIUS = 4.3;
export const LEARN_STEPS = Object.freeze([
  'Ảnh khó', 'Lọc trùng PCA', 'Người duyệt', 'Huấn luyện đêm', 'Hoán đổi model',
]);

const angleOf = (i) => Math.PI / 2 + (i / LEARN_STEPS.length) * Math.PI * 2;
const pointOn = (a, y = 0) => new THREE.Vector3(Math.cos(a) * RADIUS, y, Math.sin(a) * RADIUS);

function cards(layer) {
  const g = new THREE.Group();
  const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.6));
  for (let i = 0; i < 5; i += 1) {
    const l = new THREE.LineSegments(edges, layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.doubt }), 0.9));
    l.position.set((i - 2) * 0.08, i * 0.12, (i - 2) * -0.06);
    l.rotation.y = 0.3;
    g.add(l);
  }
  return { g, tick: (t) => g.children.forEach((c, i) => { c.position.y = i * 0.12 + Math.sin(t * 2 + i) * 0.05; }) };
}

function cloud(layer) {
  const n = 150;
  const pos = new Float32Array(n * 3);
  const alive = new Float32Array(n).fill(1);
  const home = [];
  for (let i = 0; i < n; i += 1) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(0.25 + Math.random() * 0.7);
    v.y *= 0.6;
    home.push(v);
    pos.set(v.toArray(), i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = layer.fade(new THREE.PointsMaterial({ color: PALETTE.holo, size: 0.08, depthWrite: false }), 0.9);
  const g = new THREE.Group();
  g.add(new THREE.Points(geo, mat));
  let timer = 0;
  return {
    g,
    tick(t, dt) {
      timer += dt;
      g.rotation.y = t * 0.25;
      if (timer < 0.35) return;
      timer = 0;
      const i = Math.floor(Math.random() * n);
      alive[i] = alive[i] > 0 ? 0 : 1;
      const v = alive[i] ? home[i] : home[i].clone().multiplyScalar(0.02);
      pos.set(v.toArray(), i * 3);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function verdicts(layer) {
  const g = new THREE.Group();
  [PALETTE.vision, PALETTE.lamp, PALETTE.doubt].forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), layer.fade(new THREE.MeshBasicMaterial({ color: c }), 0.85));
    m.position.set((i - 1) * 0.55, 0, 0);
    g.add(m);
  });
  return { g, tick: (t) => g.children.forEach((c, i) => { c.position.y = Math.max(0, Math.sin(t * 3 - i * 1.2)) * 0.25; }) };
}

function trainer(layer) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1),
    layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.holo, wireframe: true }), 0.8));
  return { g: m, tick: (t) => { m.rotation.set(t * 0.6, t * 0.9, 0); } };
}

function swapper(layer) {
  const g = new THREE.Group();
  const chip = (color) => new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.75),
    layer.fade(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }), 1));
  const oldChip = chip(PALETTE.line);
  const newChip = chip(PALETTE.lamp);
  g.add(oldChip, newChip);
  return {
    g,
    tick(t) {
      const k = (Math.sin(t * 1.2) + 1) / 2;
      newChip.position.y = 0.6 * (1 - k);
      oldChip.position.y = -0.25 * k;
      oldChip.position.x = 0.5 * k;
    },
  };
}

/** @param {THREE.Scene} scene */
export function createLearning(scene) {
  const layer = createLayer('learning');
  layer.group.position.copy(CENTER);

  const curve = new THREE.EllipseCurve(0, 0, RADIUS, RADIUS, 0, Math.PI * 2);
  const pts = curve.getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const ringMat = layer.fade(new THREE.LineDashedMaterial({ color: PALETTE.holo, dashSize: 0.3, gapSize: 0.2 }), 0.7);
  const ring = new THREE.Line(ringGeo, ringMat);
  ring.computeLineDistances();
  layer.group.add(ring);

  const makers = [cards, cloud, verdicts, trainer, swapper];
  const stations = makers.map((make, i) => {
    const s = make(layer);
    const holder = new THREE.Group();
    holder.position.copy(pointOn(angleOf(i), 0.4));
    holder.add(s.g);
    const el = layer.label(makeLabelEl('station', `<i>${i + 1}</i><b>${LEARN_STEPS[i]}</b>`));
    const label = new CSS2DObject(el);
    label.position.set(0, -0.75, 0);
    holder.add(label);
    layer.group.add(holder);
    return { ...s, holder, el, scale: 1 };
  });

  const token = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14),
    layer.fade(new THREE.MeshBasicMaterial({ color: PALETTE.lampHot }), 1));
  layer.group.add(token);
  scene.add(layer.group);

  let step = 0;
  let tokenAngle = angleOf(0);
  let t = 0;

  return {
    layer,
    setStep(i) {
      step = Math.max(0, Math.min(LEARN_STEPS.length - 1, i));
    },
    update(dt) {
      if (!layer.group.visible) return;
      t += dt;
      const target = angleOf(step);
      tokenAngle = damp(tokenAngle, target, 3, dt);
      token.position.copy(pointOn(tokenAngle, 0.05));
      stations.forEach((s, i) => {
        s.tick(t, dt);
        s.scale = damp(s.scale, i === step ? 1.3 : 0.85, 5, dt);
        s.holder.scale.setScalar(s.scale);
        s.el.classList.toggle('is-active', i === step);
      });
      layer.group.rotation.y = Math.sin(t * 0.15) * 0.06;
    },
  };
}
