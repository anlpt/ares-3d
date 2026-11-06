// Chi tiết tòa nhà theo ảnh tham khảo: phòng sáng có trần đèn và sàn hắt sáng, cầu thang, lớp kính bao,
// mép sàn phát sáng, thiết bị mái, quảng trường có cây, cột đèn, mái sảnh và đèn hắt chân tường.
import * as THREE from 'three';
import { ROOM } from './palette.js';
import { radialTexture } from './layer.js';
import { holoLines } from './holo.js';

function verticalGradient() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Ánh sáng trong từng phòng: tường sau sáng dần lên trần, vệt sáng trên sàn, hai dải đèn trần.
 * @returns {{setCell:(i:number, color:THREE.Color)=>void, commit:()=>void}}
 */
export function buildInteriorLights(layer, cells, floorY, cellH) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const one = new THREE.Vector3(1, 1, 1);
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  const wallMat = layer.fade(new THREE.MeshBasicMaterial({ map: verticalGradient(), ...additive }), 0.72);
  const wall = new THREE.InstancedMesh(new THREE.PlaneGeometry(ROOM.w - 0.4, cellH - 0.4), wallMat, cells.length);
  const floorMat = layer.fade(new THREE.MeshBasicMaterial({ map: radialTexture(128), ...additive }), 0.42);
  const floor = new THREE.InstancedMesh(new THREE.PlaneGeometry(ROOM.w - 1, ROOM.d - 1), floorMat, cells.length);
  const barMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#ffffff', ...additive }), 1);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(ROOM.w - 3, 0.05, 0.16), barMat, cells.length * 2);
  cells.forEach(({ c, f }, i) => {
    const x = c * ROOM.w;
    const y0 = floorY(f);
    wall.setMatrixAt(i, m.makeTranslation(x, y0 + cellH / 2, -ROOM.d / 2 + 0.2));
    floor.setMatrixAt(i, m.compose(new THREE.Vector3(x, y0 + 0.08, 0), q, one));
    bars.setMatrixAt(i * 2, m.makeTranslation(x, y0 + cellH - 0.25, -1.4));
    bars.setMatrixAt(i * 2 + 1, m.makeTranslation(x, y0 + cellH - 0.25, 1.6));
  });
  layer.group.add(wall, floor, bars);

  const bar = new THREE.Color();
  return {
    setCell(i, color) {
      wall.setColorAt(i, color);
      floor.setColorAt(i, color);
      bar.copy(color).multiplyScalar(1.6);
      bars.setColorAt(i * 2, bar);
      bars.setColorAt(i * 2 + 1, bar);
    },
    commit() {
      [wall, floor, bars].forEach((mesh) => { if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
    },
  };
}

/** Lõi cầu thang ở cột phải: mỗi tầng một đường gấp khúc và lan can. */
export function buildStairs(layer, floorCount, floorY, cellH, x0) {
  const pts = [];
  const z0 = -ROOM.d / 2 + 0.8;
  for (let f = 0; f < floorCount; f += 1) {
    const y = floorY(f);
    const steps = 10;
    for (let s = 0; s < steps; s += 1) {
      const xa = x0 + (s / steps) * 3.2;
      const xb = x0 + ((s + 1) / steps) * 3.2;
      const ya = y + (s / steps) * cellH;
      const yb = y + ((s + 1) / steps) * cellH;
      pts.push(xa, ya, z0, xb, ya, z0, xb, ya, z0, xb, yb, z0);
    }
    pts.push(x0, y + 0.9, z0 + 0.5, x0 + 3.2, y + cellH + 0.9, z0 + 0.5);
  }
  layer.group.add(holoLines(layer, pts, { opacity: 0.55, boost: 1.4 }));
}

/** Lớp kính bao ngoài, mullion dày theo chiều cao, mép sàn sáng, thiết bị mái. */
export function buildEnvelope(layer, { width, baseY, height, floorCount, floorY }) {
  const pad = 0.35;
  const front = ROOM.d / 2 + pad;
  const pts = [];
  for (let x = -width / 2; x <= width / 2 + 1e-6; x += ROOM.w / 14) {
    pts.push(x, baseY, front, x, baseY + height, front);
  }
  const sideX = width / 2 + pad;
  for (let z = -ROOM.d / 2; z <= ROOM.d / 2 + 1e-6; z += ROOM.d / 8) {
    pts.push(sideX, baseY, z, sideX, baseY + height, z, -sideX, baseY, z, -sideX, baseY + height, z);
  }
  const edges = [];
  for (let f = 0; f <= floorCount; f += 1) {
    const y = floorY(f);
    edges.push(-sideX, y, front, sideX, y, front, sideX, y, front, sideX, y, -ROOM.d / 2 - pad);
    edges.push(-sideX, y, front, -sideX, y, -ROOM.d / 2 - pad);
  }
  layer.group.add(
    holoLines(layer, pts, { opacity: 0.1, boost: 1 }),
    holoLines(layer, edges, { opacity: 0.68, boost: 1.45 }),
  );

  const glassMat = layer.fade(new THREE.MeshBasicMaterial({
    color: '#3fb7c9', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }), 0.025);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(width + pad * 2, height, ROOM.d + pad * 2), glassMat);
  shell.position.set(0, baseY + height / 2, 0);
  layer.group.add(shell);

  const roofMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#0b1b28' }), 1);
  const top = baseY + height;
  [[-8, 2.2, 3], [6, 1.6, 4], [12, 1.2, 2.4]].forEach(([x, h, w]) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), roofMat);
    box.position.set(x, top + h / 2, -1);
    layer.group.add(box);
    layer.group.add(holoLines(layer, edgesOfBox(w, h, 3, x, top + h / 2, -1), { opacity: 0.5 }));
  });
}

function edgesOfBox(w, h, d, x, y, z) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const a = g.attributes.position.array;
  const out = [];
  for (let i = 0; i < a.length; i += 3) out.push(a[i] + x, a[i + 1] + y, a[i + 2] + z);
  return out;
}

/** Quảng trường: lối đi, bồn cây, cột đèn tỏa sáng, mái sảnh, đèn hắt chân tòa nhà. */
export function buildPlaza(layer, { baseY, width }) {
  const y = baseY + 0.02;
  const glowTex = radialTexture(64, 'rgba(255,236,200,1)', 'rgba(255,236,200,0)');
  const glow = (color, opacity) => layer.fade(new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), opacity);

  const pathMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#13202e' }), 1);
  [[0, 22, 6, 30], [-30, 14, 34, 4], [30, 14, 34, 4]].forEach(([x, z, w, d]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y + 0.01, z);
    layer.group.add(p);
  });

  const poleMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#1d2a36' }), 1);
  const warmGlow = glow('#ffe3b0', 0.62);
  const poles = [];
  for (let i = -3; i <= 3; i += 1) poles.push([i * 9, 30], [i * 9, 12]);
  poles.forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), poleMat);
    pole.position.set(x, y + 2, z);
    const s = new THREE.Sprite(warmGlow);
    s.position.set(x, y + 4.1, z);
    s.scale.set(2, 2, 1);
    layer.group.add(pole, s);
  });

  const leaf = layer.fade(new THREE.MeshStandardMaterial({ color: '#16352a', roughness: 1, emissive: '#06140f' }), 1);
  const trunk = layer.fade(new THREE.MeshBasicMaterial({ color: '#1c1712' }), 1);
  const planter = layer.fade(new THREE.MeshBasicMaterial({ color: '#0f1a24' }), 1);
  [[-22, 20], [-14, 26], [14, 26], [22, 20], [-34, 8], [34, 8]].forEach(([x, z], i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 4), planter);
    box.position.set(x, y + 0.3, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6), trunk);
    t.position.set(x, y + 1.4, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + (i % 3) * 0.3, 1), leaf);
    crown.position.set(x, y + 3, z);
    layer.group.add(box, t, crown);
  });

  const canopyMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#0c1a26' }), 1);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 4), canopyMat);
  canopy.position.set(ROOM.w, baseY + 3.4, ROOM.d / 2 + 2.2);
  layer.group.add(canopy, holoLines(layer, edgesOfBox(10, 0.25, 4, ROOM.w, baseY + 3.4, ROOM.d / 2 + 2.2), { opacity: 0.9, boost: 1.6 }));

  const uplight = glow('#8ff3ee', 0.38);
  for (let x = -width / 2; x <= width / 2 + 1e-6; x += 3.5) {
    const s = new THREE.Sprite(uplight);
    s.position.set(x, baseY + 0.4, ROOM.d / 2 + 0.6);
    s.scale.set(2.2, 1.4, 1);
    layer.group.add(s);
  }
}

