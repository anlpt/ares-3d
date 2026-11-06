// Phòng thí nghiệm (ô bên trái P101): bàn đảo, tủ hút, khu hạn chế; ARES gắn cờ vi phạm an toàn lab.
// Nhận diện áo/kính bảo hộ, ăn uống là GÓI MỞ RỘNG ĐỀ XUẤT — model trong repo ARES hiện chỉ nhận diện người.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROOM } from './palette.js';
import { createLayer, makeLabelEl, radialTexture } from './layer.js';
import { buildPerson, posePerson } from './person.js';
import { createDetections } from './detect.js';
import { holoLines, boxEdgePoints } from './holo.js';

export const LAB_X = -ROOM.w;
const ZONE = { x0: LAB_X - 6.6, x1: LAB_X - 3.4, z0: -ROOM.d / 2 + 0.1, z1: -2.3 };
const COAT = '#eef1f4';

function hatchTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,77,94,0.18)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,196,64,0.85)';
  ctx.lineWidth = 8;
  for (let i = -64; i < 128; i += 22) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function buildRoom(layer) {
  const std = (color, o = {}, op = 1) => layer.fade(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }), op);
  const box = (m, size, pos) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    layer.group.add(mesh);
    return mesh;
  };
  box(std('#cfd6db', { roughness: 0.5 }), [ROOM.w, 0.12, ROOM.d], [LAB_X, -0.06, 0]);
  const wall = std('#dfe4e8', { roughness: 0.95, depthWrite: true }, 0.96);
  box(wall, [ROOM.w, ROOM.h, 0.14], [LAB_X, ROOM.h / 2, -ROOM.d / 2 - 0.07]);
  box(wall, [0.14, ROOM.h, ROOM.d], [LAB_X - ROOM.w / 2 - 0.07, ROOM.h / 2, 0]);

  const resin = std('#22272d', { roughness: 0.35 });
  const cabinet = std('#e6eaee', { roughness: 0.6 });
  [-2.6, 2.4].forEach((dx) => {
    box(cabinet, [1.3, 0.82, 5.4], [LAB_X + dx, 0.41, 0.6]);
    box(resin, [1.45, 0.05, 5.6], [LAB_X + dx, 0.86, 0.6]);
    box(std('#9aa3ad', { metalness: 0.6, roughness: 0.4 }), [0.08, 0.7, 5.2], [LAB_X + dx, 1.25, 0.6]);
    for (let k = 0; k < 7; k += 1) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 10),
        std(['#6fc3d9', '#d9a86f', '#9ad96f', '#e6e6e6'][k % 4], { roughness: 0.2, transparent: true }, 0.85));
      bottle.position.set(LAB_X + dx + (k % 2 ? 0.25 : -0.25), 1.0, -1.6 + k * 0.7);
      layer.group.add(bottle);
    }
  });
  // Tủ hút khí độc ở tường sau, có cửa kính trượt.
  box(std('#c2c9cf', { metalness: 0.5, roughness: 0.4 }), [2.4, 2.3, 0.95], [LAB_X - 5, 1.15, -ROOM.d / 2 + 0.5]);
  box(layer.fade(new THREE.MeshStandardMaterial({ color: '#9fd4e6', roughness: 0.1, transparent: true }), 0.35), [2.1, 1.0, 0.04], [LAB_X - 5, 1.35, -ROOM.d / 2 + 1.0]);
  box(std('#7d8996'), [3.2, 0.9, 0.6], [LAB_X + 4.5, 0.45, -ROOM.d / 2 + 0.35]);

  const zoneMat = layer.fade(new THREE.MeshBasicMaterial({ map: hatchTexture(), transparent: true, depthWrite: false }), 0.8);
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x1 - ZONE.x0, ZONE.z1 - ZONE.z0), zoneMat);
  zone.rotation.x = -Math.PI / 2;
  zone.position.set((ZONE.x0 + ZONE.x1) / 2, 0.015, (ZONE.z0 + ZONE.z1) / 2);
  layer.group.add(zone);
  const el = layer.label(makeLabelEl('zone is-alert-zone', '<b>Khu hạn chế</b><span>tủ hút hóa chất</span>'));
  const lbl = new CSS2DObject(el);
  lbl.position.set((ZONE.x0 + ZONE.x1) / 2, 0.05, ZONE.z1 + 0.3);
  layer.group.add(lbl);

  const panel = layer.fade(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b0').multiplyScalar(1.6) }), 1);
  const pool = layer.fade(new THREE.MeshBasicMaterial({ map: radialTexture(128, 'rgba(255,226,176,1)', 'rgba(255,226,176,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0.3);
  [[-3.5, -1.5], [3.5, -1.5], [-3.5, 2], [3.5, 2]].forEach(([dx, z]) => {
    box(panel, [1.1, 0.05, 0.32], [LAB_X + dx, ROOM.h - 0.2, z]);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), pool);
    p.rotation.x = -Math.PI / 2;
    p.position.set(LAB_X + dx, 0.02, z);
    layer.group.add(p);
  });
  const light = new THREE.PointLight('#ffe2b0', 0, 12, 1.3);
  light.position.set(LAB_X, 2.6, 0.5);
  const fill = new THREE.HemisphereLight('#e6eef6', '#3a3430', 0);
  layer.group.add(light, fill);
  layer.group.add(holoLines(layer, boxEdgePoints(ROOM.w, ROOM.h, ROOM.d, new THREE.Matrix4().makeTranslation(LAB_X, ROOM.h / 2, 0)), { opacity: 0.18 }));
  return { light, fill };
}

/** Kịch bản 6 người: 2 đúng quy định, 4 vi phạm (thiếu kính, không áo, ăn uống, vào khu hạn chế). */
const CAST = [
  { x: -3.4, z: -0.6, h: Math.PI / 2, opts: { shirt: COAT, goggles: true } },
  { x: -1.8, z: 1.8, h: -Math.PI / 2, opts: { shirt: COAT, goggles: true } },
  { x: 1.6, z: -0.8, h: Math.PI / 2, opts: { shirt: COAT }, issue: 'Thiếu kính bảo hộ' },
  { x: 3.2, z: 2.2, h: -Math.PI / 2, opts: {}, issue: 'Không mặc áo bảo hộ' },
  { x: 5.0, z: 0.4, h: Math.PI, opts: { shirt: COAT, goggles: true, cup: true }, issue: 'Ăn uống trong lab' },
  { walker: true, opts: { shirt: COAT, goggles: true } },
];

/** @param {THREE.Scene} scene */
export function createLab(scene) {
  const layer = createLayer('lab');
  const { light, fill } = buildRoom(layer);
  const people = CAST.map((c, i) => {
    const mesh = buildPerson(31 + i * 17, (m) => layer.fade(m, 1), c.opts);
    mesh.position.set(LAB_X + (c.x ?? 0), 0, c.z ?? 0);
    mesh.rotation.y = c.h ?? 0;
    posePerson(mesh, 0, 0, false);
    layer.group.add(mesh);
    return { ...c, mesh };
  });
  const detections = createDetections(layer, CAST.length);
  scene.add(layer.group);

  // Người thứ 6 đi vòng qua khu hạn chế.
  const route = [new THREE.Vector3(LAB_X + 0.2, 0, 3.4), new THREE.Vector3(LAB_X - 5, 0, -3.4), new THREE.Vector3(LAB_X - 5.8, 0, 3.2)];
  let seg = 0;
  let phase = 0;
  const tmp = new THREE.Vector3();
  const inZone = (p) => p.x > ZONE.x0 && p.x < ZONE.x1 && p.z > ZONE.z0 && p.z < ZONE.z1;
  let violations = 0;

  return {
    layer,
    update(dt) {
      light.intensity = 4 * layer.mix;
      fill.intensity = 0.75 * layer.mix;
      if (!layer.group.visible) return;
      const walker = people[people.length - 1];
      const target = route[(seg + 1) % route.length];
      tmp.copy(target).sub(walker.mesh.position);
      const dist = tmp.length();
      if (dist < 0.1) seg = (seg + 1) % route.length;
      else {
        walker.mesh.position.addScaledVector(tmp.normalize(), Math.min(dist, 1.1 * dt));
        walker.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
      }
      phase += dt * 8;
      posePerson(walker.mesh, 0, phase, true);
      walker.issue = inZone(walker.mesh.position) ? 'Vào khu hạn chế' : null;

      const items = people.map((p) => ({
        pos: p.mesh.position, size: [0.75, 1.75, 0.6], kind: p.issue ? 'bad' : 'ok',
        text: p.issue ? `VI PHẠM: ${p.issue}` : 'người, đủ bảo hộ',
      }));
      violations = items.filter((it) => it.kind === 'bad').length;
      detections.set(items, dt);
    },
    stats: () => ({ people: people.length, violations }),
  };
}
