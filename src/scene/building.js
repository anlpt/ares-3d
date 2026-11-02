// Tòa nhà dạng hologram: khung kính xanh ngọc, sàn từng tầng lộ ra, phòng có người sáng hổ phách.
// Ô (cột 0, tầng 0) chính là phòng P101 — mô hình chi tiết trong room.js nằm đúng chỗ đó.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE, ROOM } from './palette.js';
import { createLayer, makeLabelEl, damp } from './layer.js';
import { createCity } from './city.js';

const COLS = [-1, 0, 1];
export const FLOOR_COUNT = 9;
export const CELL_H = 3.6;
const BASE_Y = -0.3;
const TOGGLE_EVERY_S = 0.9;
const WIDTH = COLS.length * ROOM.w;
const FRONT = ROOM.d / 2;
const BACK = -ROOM.d / 2;

const isTarget = ({ c, f }) => c === 0 && f === 0;
const ALL_CELLS = Array.from({ length: FLOOR_COUNT }, (_, f) => COLS.map((c) => ({ c, f }))).flat();
const OTHER_CELLS = ALL_CELLS.filter((cell) => !isTarget(cell));
const floorY = (f) => BASE_Y + f * CELL_H;

function seededRandom(seed0) {
  let seed = seed0;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function boxEdges(x0, x1, y0, y1, z0, z1) {
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return e.flatMap(([a, b]) => [...c[a], ...c[b]]);
}

function lineMesh(layer, pts, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = layer.fade(new THREE.LineBasicMaterial({
    color, depthWrite: false, blending: THREE.AdditiveBlending,
  }), opacity);
  return new THREE.LineSegments(g, mat);
}

function buildFrame(layer) {
  const holo = PALETTE.holo.clone().multiplyScalar(1.35);
  const frame = ALL_CELLS.flatMap(({ c, f }) => boxEdges(
    c * ROOM.w - ROOM.w / 2, c * ROOM.w + ROOM.w / 2, floorY(f), floorY(f) + CELL_H, BACK, FRONT,
  ));
  const mullions = OTHER_CELLS.flatMap(({ c, f }) => {
    const x0 = c * ROOM.w - ROOM.w / 2;
    const y0 = floorY(f);
    const verticals = [1, 2, 3, 4, 5, 6].flatMap((i) => [x0 + (ROOM.w / 7) * i, y0, FRONT, x0 + (ROOM.w / 7) * i, y0 + CELL_H, FRONT]);
    return [...verticals, x0, y0 + 0.95, FRONT, x0 + ROOM.w, y0 + 0.95, FRONT];
  });
  layer.group.add(lineMesh(layer, frame, holo, 0.55), lineMesh(layer, mullions, PALETTE.holo, 0.16));
}

function buildGlass(layer) {
  const m = new THREE.Matrix4();
  const glassMat = layer.fade(new THREE.MeshBasicMaterial({
    color: PALETTE.holo, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }), 0.035);
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(ROOM.w - 0.1, CELL_H - 0.1, ROOM.d - 0.1), glassMat, OTHER_CELLS.length);
  OTHER_CELLS.forEach(({ c, f }, i) => glass.setMatrixAt(i, m.makeTranslation(c * ROOM.w, floorY(f) + CELL_H / 2, 0)));

  const slabMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#0d2a33', depthWrite: false }), 0.55);
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(WIDTH, 0.1, ROOM.d), slabMat, FLOOR_COUNT + 1);
  for (let f = 0; f <= FLOOR_COUNT; f += 1) slabs.setMatrixAt(f, m.makeTranslation(0, floorY(f), 0));

  const interiorMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }), 0.95);
  const interior = new THREE.InstancedMesh(new THREE.PlaneGeometry(ROOM.w - 0.4, CELL_H - 0.5), interiorMat, OTHER_CELLS.length);
  OTHER_CELLS.forEach(({ c, f }, i) => interior.setMatrixAt(i, m.makeTranslation(c * ROOM.w, floorY(f) + CELL_H / 2, BACK + 0.15)));

  const rand = seededRandom(31);
  const deskMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#06121a' }), 1);
  const per = 6;
  const desks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.8, 0.7), deskMat, OTHER_CELLS.length * per);
  OTHER_CELLS.forEach(({ c, f }, i) => {
    for (let k = 0; k < per; k += 1) {
      const x = c * ROOM.w - 5 + (k % 3) * 5 + (rand() - 0.5);
      const z = k < 3 ? -1.5 : 1.8;
      desks.setMatrixAt(i * per + k, m.makeTranslation(x, floorY(f) + 0.45, z));
    }
  });
  layer.group.add(slabs, interior, desks, glass);
  return { interior };
}

function buildRuler(layer) {
  const x = WIDTH / 2 + 2.2;
  const pts = [x, BASE_Y, FRONT, x, floorY(FLOOR_COUNT), FRONT];
  const labels = [];
  for (let f = 0; f < FLOOR_COUNT; f += 1) {
    pts.push(x, floorY(f), FRONT, x + 0.8, floorY(f), FRONT);
    const el = layer.label(makeLabelEl('floor', `L${String(f + 1).padStart(2, '0')}`));
    const label = new CSS2DObject(el);
    label.position.set(x + 2.2, floorY(f) + CELL_H / 2, FRONT);
    layer.group.add(label);
    labels.push(el);
  }
  layer.group.add(lineMesh(layer, pts, PALETTE.holo, 0.6));
  return labels;
}

function buildHoverVolumes(layer) {
  return Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.holo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 0.4, CELL_H, ROOM.d + 0.4), mat);
    mesh.position.set(0, floorY(f) + CELL_H / 2, 0);
    mesh.userData.floor = f;
    layer.group.add(mesh);
    return { mesh, mat, level: 0 };
  });
}

/** Điểm neo cho các bảng HUD (toạ độ thế giới). */
export const ANCHORS = Object.freeze({
  telemetry: new THREE.Vector3(ROOM.w, floorY(8) + CELL_H / 2, FRONT),
  occupancy: new THREE.Vector3(ROOM.w, floorY(3) + CELL_H / 2, FRONT),
  p101: new THREE.Vector3(0, CELL_H / 2, FRONT),
  energy: new THREE.Vector3(0, floorY(6) + CELL_H / 2, FRONT),
});

/** @param {THREE.Scene} scene */
export function createBuilding(scene) {
  const layer = createLayer('building');
  buildFrame(layer);
  const { interior } = buildGlass(layer);
  const floorLabels = buildRuler(layer);
  const hover = buildHoverVolumes(layer);
  createCity(layer, BASE_Y);
  scene.add(layer.group);

  const rand = seededRandom(7);
  const lit = OTHER_CELLS.map(() => rand() < 0.45);
  const level = lit.map((on) => (on ? 1 : 0));
  const warm = PALETTE.lamp.clone().multiplyScalar(0.85);
  const cold = new THREE.Color('#0b2b36');
  const color = new THREE.Color();
  OTHER_CELLS.forEach((_, i) => interior.setColorAt(i, color.copy(cold).lerp(warm, level[i])));
  let timer = 0;
  let hoverFloor = -1;
  let roomOccupied = true;

  return {
    layer,
    update(dt, { occupied = true } = {}) {
      roomOccupied = occupied;
      if (!layer.group.visible) return;
      timer += dt;
      if (timer > TOGGLE_EVERY_S) {
        timer = 0;
        const i = Math.floor(rand() * lit.length);
        lit[i] = !lit[i];
      }
      OTHER_CELLS.forEach((_, i) => {
        level[i] += ((lit[i] ? 1 : 0) - level[i]) * Math.min(1, dt * 2.5);
        interior.setColorAt(i, color.copy(cold).lerp(warm, level[i]));
      });
      interior.instanceColor.needsUpdate = true;
      hover.forEach((h, f) => {
        h.level = damp(h.level, f === hoverFloor ? 1 : 0, 8, dt);
        h.mat.opacity = h.level * 0.09 * layer.mix;
      });
      floorLabels.forEach((el, f) => el.classList.toggle('is-hover', f === hoverFloor));
    },
    /** Số phòng có người theo tầng (tầng 0 tính cả P101 thật). */
    floorStats() {
      return Array.from({ length: FLOOR_COUNT }, (_, f) => {
        const own = OTHER_CELLS.reduce((n, cell, i) => n + (cell.f === f && lit[i] ? 1 : 0), 0);
        return { floor: f, lit: own + (f === 0 && roomOccupied ? 1 : 0), total: COLS.length };
      });
    },
    /** @param {THREE.Raycaster} ray @returns {{floor:number, isP101:boolean}|null} */
    pick(ray) {
      if (!layer.group.visible || layer.mix < 0.5) return null;
      const hit = ray.intersectObjects(hover.map((h) => h.mesh), false)[0];
      if (!hit) return null;
      const { floor } = hit.object.userData;
      return { floor, isP101: floor === 0 && Math.abs(hit.point.x) < ROOM.w / 2 };
    },
    setHoverFloor(f) {
      hoverFloor = f;
    },
  };
}
