// Hình người đơn giản nhưng đúng tỉ lệ: đầu, tóc, thân, tay, đùi, cẳng chân — đi bộ và ngồi được.
import * as THREE from 'three';

const SKIN = ['#e3bc98', '#c99b78', '#a87a58', '#f0cdb0', '#8d6248'];
const HAIR = ['#1f1812', '#3a2a1e', '#4d3a2a', '#141414'];
const SHIRT = ['#3f6e9c', '#c9ced6', '#8a5a4a', '#4f7d5c', '#d9b25b', '#6b5b8e', '#2f3e52', '#b85c5c', '#e8e4dc'];
const PANTS = ['#2b3240', '#3b4a5e', '#5d5246', '#1d232c', '#6e6a62'];

const HIP_Y = 0.86;
const THIGH = 0.42;
const SHIN = 0.42;

const materialCache = new Map();
function mat(color, register) {
  if (!materialCache.has(color)) {
    materialCache.set(color, register(new THREE.MeshStandardMaterial({ color, roughness: 0.75 })));
  }
  return materialCache.get(color);
}

const pick = (list, seed) => list[Math.abs(Math.floor(seed)) % list.length];

function limb(radius, length, material) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 8), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * @param {number} seed để chọn màu da/tóc/áo/quần ổn định cho từng người
 * @param {(m:THREE.Material)=>THREE.Material} register hàm đăng ký vật liệu vào lớp (mờ/hiện)
 * @param {{shirt?:string, goggles?:boolean, helmet?:string|null, cup?:boolean}} [opts]
 *   shirt: màu áo cố định (vd áo blouse trắng trong lab); helmet: màu mũ bảo hiểm; cup: cầm cốc nước
 */
export function buildPerson(seed, register, opts = {}) {
  const skin = mat(pick(SKIN, seed * 7), register);
  const hair = mat(pick(HAIR, seed * 3), register);
  const shirt = mat(opts.shirt ?? pick(SHIRT, seed * 5 + 1), register);
  const pants = mat(pick(PANTS, seed * 11 + 2), register);

  const root = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 10), shirt);
  torso.position.y = HIP_Y + 0.3;
  torso.scale.set(1, 1, 0.72);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
  head.position.y = HIP_Y + 0.68;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.copy(head.position);
  hairCap.position.y += 0.012;
  hairCap.position.z -= 0.01;

  const arms = [-1, 1].map((side) => {
    const a = limb(0.052, 0.56, shirt);
    a.position.set(side * 0.22, HIP_Y + 0.5, 0);
    a.rotation.z = side * 0.08;
    return a;
  });
  const legs = [-1, 1].map((side) => {
    const thigh = limb(0.072, THIGH, pants);
    thigh.position.set(side * 0.095, HIP_Y, 0);
    const shin = limb(0.062, SHIN, pants);
    shin.position.y = -THIGH;
    thigh.add(shin);
    return { thigh, shin };
  });

  [torso, head, hairCap].forEach((m) => { m.castShadow = true; });
  root.add(torso, head, hairCap, ...arms, ...legs.map((l) => l.thigh));
  if (opts.goggles) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), mat('#1c2a36', register));
    g.position.set(0, head.position.y + 0.02, 0.1);
    root.add(g);
  }
  if (opts.helmet) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(opts.helmet, register));
    h.position.copy(head.position);
    h.position.y += 0.02;
    root.add(h);
  }
  if (opts.cup) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.11, 10), mat('#e8e4dc', register));
    c.position.set(0, -0.5, 0.06);
    arms[1].add(c);
  }
  root.userData.rig = { arms, legs };
  return root;
}

/**
 * Đặt tư thế theo `sit` (0 đứng … 1 ngồi) và pha bước chân.
 * @param {THREE.Group} person
 */
export function posePerson(person, sit, walkPhase, walking) {
  const { arms, legs } = person.userData.rig;
  const swing = walking ? Math.sin(walkPhase) * 0.5 * (1 - sit) : 0;
  legs.forEach((l, i) => {
    const s = i === 0 ? swing : -swing;
    l.thigh.rotation.x = -Math.PI / 2 * sit + s;
    l.shin.rotation.x = Math.PI / 2 * sit + Math.max(0, -s) * 0.6;
  });
  arms.forEach((a, i) => {
    const s = i === 0 ? -swing : swing;
    a.rotation.x = -1.05 * sit + s * 0.8;
  });
}

export const SEAT_DROP = HIP_Y - 0.47;
