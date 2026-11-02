// Tòa nhà ban đêm: mỗi ô cửa là một phòng, sáng khi có người. Ô (0,0) chính là phòng P101.
import * as THREE from 'three';
import { PALETTE, ROOM } from './palette.js';
import { createLayer } from './layer.js';

const COLS = [-2, -1, 0, 1, 2];
const FLOORS = [-3, -2, -1, 0, 1, 2, 3];
const CELL_H = 3.6;
const TOGGLE_EVERY_S = 0.9;

function cells() {
  return FLOORS.flatMap((f) => COLS.map((c) => ({ c, f }))).filter(({ c, f }) => !(c === 0 && f === 0));
}

/** Giả lập hiện diện các phòng khác: ~45 % sáng, đổi dần theo thời gian. */
function seededLit(n) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return { lit: Array.from({ length: n }, () => rand() < 0.45), rand };
}

/** @param {THREE.Scene} scene */
export function createBuilding(scene) {
  const layer = createLayer('building');
  const list = cells();
  const glow = layer.fade(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(ROOM.w - 0.6, CELL_H - 0.9), glow, list.length);
  const m = new THREE.Matrix4();
  list.forEach(({ c, f }, i) => windows.setMatrixAt(i, m.makeTranslation(c * ROOM.w, f * CELL_H + 1.5, ROOM.d / 2 + 0.06)));
  layer.group.add(windows);

  const width = COLS.length * ROOM.w;
  const bottom = FLOORS[0] * CELL_H - 0.3;
  const height = FLOORS.length * CELL_H;
  const bodyMat = layer.fade(new THREE.MeshStandardMaterial({ color: '#0d131c', roughness: 1 }));
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(ROOM.w - 0.08, CELL_H - 0.08, ROOM.d - 0.2), bodyMat, list.length);
  list.forEach(({ c, f }, i) => body.setMatrixAt(i, m.makeTranslation(c * ROOM.w, f * CELL_H + 1.5, -0.12)));
  layer.group.add(body);

  const lineMat = layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.line }), 0.85);
  const pts = [];
  FLOORS.concat(FLOORS[FLOORS.length - 1] + 1).forEach((f) => {
    const y = f * CELL_H - 0.3;
    pts.push(-width / 2, y, ROOM.d / 2 + 0.1, width / 2, y, ROOM.d / 2 + 0.1);
  });
  for (let i = 0; i <= COLS.length; i += 1) {
    const x = -width / 2 + i * ROOM.w;
    pts.push(x, bottom, ROOM.d / 2 + 0.1, x, bottom + height, ROOM.d / 2 + 0.1);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  layer.group.add(new THREE.LineSegments(lg, lineMat));

  const groundMat = layer.fade(new THREE.MeshStandardMaterial({ color: '#0b1017', roughness: 1 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = bottom - 0.02;
  const grid = new THREE.GridHelper(600, 120, '#1c2532', '#141b26');
  grid.position.y = bottom;
  layer.fade(grid.material, 0.6);
  layer.group.add(ground, grid);
  scene.add(layer.group);

  const { lit, rand } = seededLit(list.length);
  const warm = PALETTE.lamp.clone().multiplyScalar(0.62);
  const cold = new THREE.Color('#141c28');
  const level = lit.map((on) => (on ? 1 : 0));
  const color = new THREE.Color();
  list.forEach((_, i) => windows.setColorAt(i, color.copy(cold).lerp(warm, level[i])));
  let timer = 0;

  return {
    layer,
    update(dt) {
      if (!layer.group.visible) return;
      timer += dt;
      if (timer > TOGGLE_EVERY_S) {
        timer = 0;
        const i = Math.floor(rand() * lit.length);
        lit[i] = !lit[i];
      }
      list.forEach((_, i) => {
        level[i] += ((lit[i] ? 1 : 0) - level[i]) * Math.min(1, dt * 2.5);
        color.copy(cold).lerp(warm, level[i]);
        windows.setColorAt(i, color);
      });
      windows.instanceColor.needsUpdate = true;
    },
  };
}
