// Vỏ và nội thất lớp học P101 theo vật liệu thật: sàn gạch vinyl, tường sơn, bàn gỗ khung thép,
// ghế nhựa, bảng trắng, tủ, điều hòa treo tường. Chỉ giữ một đường viền xanh ngọc mảnh để nối với mô hình tòa nhà.
import * as THREE from 'three';
import { ROOM } from './palette.js';
import { DESKS, AC_UNITS, CCTV } from './layout.js';
import { boxEdgePoints, holoLines } from './holo.js';

const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function tileTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c4bfb4';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,80,70'},${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(120,112,100,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(size, i * 64); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM.w / 2.4, ROOM.d / 2.4);
  tex.anisotropy = 4;
  return tex;
}

/** @param {{group:THREE.Group, fade:Function}} layer */
function makeStd(layer) {
  return (color, opts = {}, opacity = 1) => layer.fade(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }), opacity);
}

function addBox(layer, material, size, pos, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  layer.group.add(mesh);
  return mesh;
}

/** Sàn, tường (cắt rời kiểu mô hình kiến trúc), bảng, tủ, khung cửa kính. */
export function buildShell(layer) {
  const std = makeStd(layer);
  const floor = addBox(layer, std('#ffffff', { map: tileTexture(), roughness: 0.7 }), [ROOM.w, 0.12, ROOM.d], [0, -0.06, 0], { cast: false });
  floor.receiveShadow = true;

  const wall = std('#d2d7dc', { roughness: 0.95, depthWrite: true }, 0.96);
  const wainscot = std('#7d8996', { roughness: 0.8, depthWrite: true }, 0.96);
  addBox(layer, wall, [ROOM.w, ROOM.h, 0.14], [0, ROOM.h / 2, -ROOM.d / 2 - 0.07], { cast: false });
  addBox(layer, wall, [0.14, ROOM.h, ROOM.d], [-ROOM.w / 2 - 0.07, ROOM.h / 2, 0], { cast: false });
  addBox(layer, wall, [0.14, 0.9, ROOM.d - 1.4], [ROOM.w / 2 + 0.07, 0.45, -0.7], { cast: false });
  addBox(layer, wainscot, [ROOM.w, 0.9, 0.02], [0, 0.45, -ROOM.d / 2 + 0.01], { cast: false });
  addBox(layer, wainscot, [0.02, 0.9, ROOM.d], [-ROOM.w / 2 + 0.01, 0.45, 0], { cast: false });

  const metal = std('#9aa3ad', { metalness: 0.7, roughness: 0.35 });
  addBox(layer, metal, [5.3, 1.4, 0.05], [0, 1.65, -ROOM.d / 2 + 0.03], { cast: false });
  addBox(layer, std('#f4f6f8', { roughness: 0.25, emissive: '#15181b' }), [5.1, 1.24, 0.06], [0, 1.65, -ROOM.d / 2 + 0.05], { cast: false });
  addBox(layer, metal, [5.1, 0.04, 0.12], [0, 1.0, -ROOM.d / 2 + 0.1], { cast: false });

  const wood = std('#a3784f', { roughness: 0.6 });
  addBox(layer, wood, [0.45, 1.8, 1.6], [-ROOM.w / 2 + 0.25, 0.9, -3.4]);
  addBox(layer, wood, [1.5, 0.75, 0.7], [-4.9, 0.375, -3.95]);

  const frame = new THREE.LineBasicMaterial({ color: '#8c96a0' });
  layer.fade(frame, 0.9);
  const mull = [];
  for (let i = 0; i <= 7; i += 1) {
    const x = -ROOM.w / 2 + (ROOM.w / 7) * i;
    mull.push(x, 0, ROOM.d / 2, x, ROOM.h, ROOM.d / 2);
  }
  [0.9, ROOM.h].forEach((y) => mull.push(-ROOM.w / 2, y, ROOM.d / 2, ROOM.w / 2, y, ROOM.d / 2));
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(mull, 3));
  layer.group.add(new THREE.LineSegments(mg, frame));
  addBox(layer, std('#9aa3ad', { metalness: 0.6, roughness: 0.4 }), [ROOM.w, 0.08, 0.2], [0, 0.88, ROOM.d / 2 - 0.08], { cast: false });

  // Vật chắn nắng vô hình (chỉ ghi vào shadow map): trần và phần tường dưới bậu cửa — nắng chỉ lọt qua ô kính.
  const caster = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  [[[ROOM.w + 0.6, 0.12, ROOM.d + 0.6], [0, ROOM.h + 0.06, 0]], [[ROOM.w, 0.9, 0.06], [0, 0.45, ROOM.d / 2 + 0.02]]].forEach(([size, pos]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), caster);
    m.position.set(...pos);
    m.castShadow = true;
    layer.group.add(m);
  });
  const post = std('#9aa3ad', { metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i <= 7; i += 1) {
    addBox(layer, post, [0.08, ROOM.h - 0.9, 0.08], [-ROOM.w / 2 + (ROOM.w / 7) * i, 0.9 + (ROOM.h - 0.9) / 2, ROOM.d / 2 - 0.02], { receive: false });
  }
  addBox(layer, post, [ROOM.w, 0.08, 0.08], [0, ROOM.h - 0.04, ROOM.d / 2 - 0.02], { receive: false });

  const glassMat = layer.fade(new THREE.MeshBasicMaterial({
    color: '#bfe4ff', transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide,
  }), 0.04);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.h), glassMat);
  glass.position.set(0, ROOM.h / 2, ROOM.d / 2);
  layer.group.add(glass);

  // Đường viền phòng mảnh — mối nối với ngôn ngữ hologram của tòa nhà.
  layer.group.add(holoLines(layer, boxEdgePoints(ROOM.w, ROOM.h, ROOM.d, at(0, ROOM.h / 2, 0)), { opacity: 0.18 }));
  return { glassMat };
}

/** Bàn gỗ khung thép + ghế nhựa xanh, dựng bằng InstancedMesh cho nhẹ. */
export function buildFurniture(layer) {
  const std = makeStd(layer);
  const parts = [
    { mat: std('#b88b5d', { roughness: 0.55 }), size: [1.2, 0.04, 0.58], at: (d) => [d.x, 0.74, d.z] },
    { mat: std('#5c646e', { metalness: 0.6, roughness: 0.4 }), size: [1.1, 0.32, 0.02], at: (d) => [d.x, 0.56, d.z - 0.26] },
    { mat: std('#5c646e', { metalness: 0.6, roughness: 0.4 }), size: [0.04, 0.72, 0.54], at: (d) => [d.x - 0.56, 0.36, d.z] },
    { mat: std('#5c646e', { metalness: 0.6, roughness: 0.4 }), size: [0.04, 0.72, 0.54], at: (d) => [d.x + 0.56, 0.36, d.z] },
    { mat: std('#2f5f8f', { roughness: 0.5 }), size: [0.42, 0.04, 0.4], at: (d) => [d.x, 0.45, d.z + 0.62] },
    { mat: std('#2f5f8f', { roughness: 0.5 }), size: [0.42, 0.34, 0.03], at: (d) => [d.x, 0.68, d.z + 0.83] },
    { mat: std('#454c55', { metalness: 0.6, roughness: 0.4 }), size: [0.38, 0.45, 0.03], at: (d) => [d.x, 0.22, d.z + 0.62] },
  ];
  const m = new THREE.Matrix4();
  parts.forEach(({ mat, size, at: place }) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), mat, DESKS.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    DESKS.forEach((d, i) => mesh.setMatrixAt(i, m.makeTranslation(...place(d))));
    layer.group.add(mesh);
  });

  const white = std('#eef1f3', { roughness: 0.45 });
  const vent = std('#8e979f', { roughness: 0.5 });
  AC_UNITS.forEach((u) => {
    addBox(layer, white, [1.15, 0.32, 0.24], [u.x, u.y, u.z]);
    addBox(layer, vent, [1.0, 0.04, 0.02], [u.x, u.y - 0.12, u.z + 0.125], { cast: false });
  });
  const cam = addBox(layer, white, [0.2, 0.14, 0.3], [CCTV.x, CCTV.y, CCTV.z]);
  cam.lookAt(0, 0, 0.5);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), std('#111418', { roughness: 0.2 }));
  lens.position.set(0, 0, 0.16);
  cam.add(lens);
}
