// Thành phố đêm quanh tòa nhà: khối nhà tối với cửa sổ li ti, quảng trường lưới xanh ngọc dưới chân.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { radialTexture } from './layer.js';

const BLOCKS = 190;
const WINDOW_POINTS = 6500;
const PLAZA = 110;
const CLEAR_RADIUS = 175;

function seeded(seed0) {
  let seed = seed0;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function placeBlocks(rand) {
  const blocks = [];
  while (blocks.length < BLOCKS) {
    const a = rand() * Math.PI * 2;
    // Vành đai quanh tòa nhà, bắt đầu xa hơn mọi vị trí máy quay (kể cả khi xoay 360°) để không khối nào chắn tầm nhìn.
    const r = CLEAR_RADIUS + rand() * 170;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 8 + rand() * 18;
    const d = 8 + rand() * 18;
    const h = 8 + Math.pow(rand(), 1.8) * 95;
    blocks.push({ x, z, w, d, h });
  }
  return blocks;
}

function windowPoints(blocks, rand, baseY) {
  const pos = new Float32Array(WINDOW_POINTS * 3);
  const col = new Float32Array(WINDOW_POINTS * 3);
  const palette = [new THREE.Color('#ffd9a0'), new THREE.Color('#f2f4ff'), PALETTE.holo.clone(), new THREE.Color('#8fb8ff')];
  const c = new THREE.Color();
  for (let i = 0; i < WINDOW_POINTS; i += 1) {
    const b = blocks[Math.floor(rand() * blocks.length)];
    const side = Math.floor(rand() * 4);
    const u = rand() - 0.5;
    const y = baseY + 1 + rand() * (b.h - 2);
    const px = side < 2 ? b.x + u * b.w : b.x + (side === 2 ? -1 : 1) * (b.w / 2 + 0.05);
    const pz = side < 2 ? b.z + (side === 0 ? 1 : -1) * (b.d / 2 + 0.05) : b.z + u * b.d;
    pos.set([px, y, pz], i * 3);
    c.copy(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.6 + rand() * 0.9);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function plazaLines(baseY) {
  const pts = [];
  const step = 5;
  for (let v = -PLAZA / 2; v <= PLAZA / 2; v += step) {
    pts.push(v, baseY + 0.02, -PLAZA / 2, v, baseY + 0.02, PLAZA / 2);
    pts.push(-PLAZA / 2, baseY + 0.02, v, PLAZA / 2, baseY + 0.02, v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** Đốm sáng mờ (bokeh) của thành phố xa — giống ảnh chụp đêm có độ sâu trường ảnh nông. */
function bokeh(layer, rand, baseY) {
  const tex = radialTexture(64, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  const colors = [new THREE.Color('#ffd49a'), new THREE.Color('#f4f6ff'), PALETTE.holo.clone(), new THREE.Color('#ff9f6b')];
  return [9, 15, 24].map((size, k) => {
    const n = 140 - k * 30;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = CLEAR_RADIUS + 20 + rand() * 240;
      pos.set([Math.cos(a) * r, baseY + 3 + rand() * 70, Math.sin(a) * r], i * 3);
      const c = colors[Math.floor(rand() * colors.length)].clone().multiplyScalar(0.5 + rand() * 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, layer.fade(new THREE.PointsMaterial({
      size, map: tex, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), 0.55 - k * 0.1));
  });
}

/**
 * Thêm thành phố vào cùng lớp với tòa nhà để mờ/hiện cùng nhau.
 * @param {{group:THREE.Group, fade:Function}} layer
 * @param {number} baseY
 */
export function createCity(layer, baseY) {
  const rand = seeded(97);
  const blocks = placeBlocks(rand);
  const m = new THREE.Matrix4();
  const blockMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#0a1526', fog: false }), 1);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMat, blocks.length);
  blocks.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, baseY + b.h / 2, b.z);
    mesh.setMatrixAt(i, m);
  });

  const lights = new THREE.Points(windowPoints(blocks, rand, baseY), layer.fade(new THREE.PointsMaterial({
    size: 1.5, map: radialTexture(32), alphaTest: 0.02, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  }), 0.9));

  const groundMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#050a13' }), 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = baseY - 0.05;

  const grid = new THREE.LineSegments(plazaLines(baseY), layer.fade(new THREE.LineBasicMaterial({
    color: PALETTE.holo, depthWrite: false, blending: THREE.AdditiveBlending,
  }), 0.1));
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLAZA, PLAZA)),
    layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.holo, depthWrite: false }), 0.45),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = baseY + 0.03;

  layer.group.add(ground, grid, edge, mesh, lights, ...bokeh(layer, rand, baseY));
}
