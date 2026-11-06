// Văn phòng làm việc (ô bên phải P101): hai cụm bàn, phòng họp kính, cửa sổ mở được.
// Kịch bản lặp 40 giây: ARES phát hiện lãng phí (cụm bàn trống vẫn bật đèn/màn hình, phòng họp trống
// vẫn chạy điều hòa, mở cửa sổ khi điều hòa chạy) rồi tự tắt; sau đó người quay lại, đèn bật lại.
import * as THREE from 'three';
import { ROOM } from './palette.js';
import { createLayer, radialTexture, damp } from './layer.js';
import { buildPerson, posePerson, SEAT_DROP } from './person.js';
import { createDetections } from './detect.js';
import { holoLines, boxEdgePoints } from './holo.js';

export const OFFICE_X = ROOM.w;
const CYCLE_S = 40;
const OFF_AT = 14;
const MEETING_OFF_AT = 22;
const WINDOW_CLOSE_AT = 30;
const RETURN_AT = 30;
const CLUSTER_KW = 0.42;

const clusterDesks = (cx) => [-1, 1].flatMap((side) => [-1.6, 0, 1.6].map((dx) => ({ x: cx + dx, z: -1.2 + side * 0.75, side })));

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
  box(std('#5d6774', { roughness: 0.95 }), [ROOM.w, 0.12, ROOM.d], [OFFICE_X, -0.06, 0]);
  const wall = std('#dde2e6', { roughness: 0.95, depthWrite: true }, 0.96);
  box(wall, [ROOM.w, ROOM.h, 0.14], [OFFICE_X, ROOM.h / 2, -ROOM.d / 2 - 0.07]);
  box(wall, [0.14, ROOM.h, ROOM.d], [OFFICE_X + ROOM.w / 2 + 0.07, ROOM.h / 2, 0]);

  const top = std('#f2f2ef', { roughness: 0.5 });
  const leg = std('#555c65', { metalness: 0.6, roughness: 0.4 });
  const screenMats = [];
  const clusters = [OFFICE_X - 3.4, OFFICE_X + 1.6].map((cx) => {
    const screens = [];
    const desks = clusterDesks(cx);
    desks.forEach((d) => {
      box(top, [1.5, 0.05, 0.72], [d.x, 0.74, d.z]);
      box(leg, [1.4, 0.7, 0.04], [d.x, 0.36, d.z + d.side * 0.33]);
      const sm = layer.fade(new THREE.MeshBasicMaterial({ color: '#9fd7ff' }), 1);
      screenMats.push(sm);
      const scr = box(sm, [0.6, 0.36, 0.03], [d.x, 1.0, d.z - d.side * 0.18]);
      scr.rotation.y = d.side > 0 ? 0 : Math.PI;
      screens.push(sm);
    });
    const panels = [-1.6, 1.6].map((dx) => box(layer.fade(new THREE.MeshBasicMaterial({ color: '#ffe8c0' }), 1), [1.2, 0.05, 0.32], [cx + dx, ROOM.h - 0.2, -1.2]));
    const poolMat = layer.fade(new THREE.MeshBasicMaterial({ map: radialTexture(128, 'rgba(255,232,192,1)', 'rgba(255,232,192,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0.32);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.02, -1.2);
    layer.group.add(pool);
    const lamp = new THREE.PointLight('#ffe8c0', 0, 9, 1.3);
    lamp.position.set(cx, 2.6, -1.2);
    layer.group.add(lamp);
    return { cx, desks, screens, panels, poolMat, lamp, level: 1 };
  });

  // Phòng họp kính ở góc trước-phải.
  const mx = OFFICE_X + 4.4;
  const mz = 2.6;
  const glass = layer.fade(new THREE.MeshStandardMaterial({ color: '#bfe4ff', roughness: 0.1, transparent: true, depthWrite: false }), 0.18);
  box(glass, [3.6, 2.6, 0.04], [mx, 1.3, mz - 1.5]);
  box(glass, [0.04, 2.6, 3], [mx - 1.8, 1.3, mz]);
  box(std('#8a6a4c', { roughness: 0.6 }), [2.2, 0.06, 1.1], [mx, 0.74, mz]);
  layer.group.add(holoLines(layer, boxEdgePoints(3.6, 2.6, 3, new THREE.Matrix4().makeTranslation(mx, 1.3, mz)), { opacity: 0.35 }));
  const ac = box(std('#eef1f3', { roughness: 0.45 }), [1.0, 0.3, 0.22], [mx, 2.6, mz + 1.35]);

  // Cửa sổ mặt trước có một cánh mở được.
  const sash = box(layer.fade(new THREE.MeshStandardMaterial({ color: '#cfeaff', roughness: 0.1, transparent: true }), 0.4), [1.8, 1.6, 0.04], [OFFICE_X - 4.5, 1.9, ROOM.d / 2]);
  const fill = new THREE.HemisphereLight('#e6eef6', '#3a3430', 0);
  layer.group.add(fill, holoLines(layer, boxEdgePoints(ROOM.w, ROOM.h, ROOM.d, new THREE.Matrix4().makeTranslation(OFFICE_X, ROOM.h / 2, 0)), { opacity: 0.18 }));
  return { clusters, meeting: { pos: new THREE.Vector3(mx, 0, mz), ac }, sash, fill };
}

/** @param {THREE.Scene} scene */
export function createOffice(scene) {
  const layer = createLayer('office');
  const { clusters, meeting, sash, fill } = buildRoom(layer);
  const seat = (d, i, visible) => {
    const p = buildPerson(70 + i * 13, (m) => layer.fade(m, 1));
    p.position.set(d.x, -SEAT_DROP, d.z + d.side * 0.62);
    p.rotation.y = d.side > 0 ? Math.PI : 0;
    posePerson(p, 1, 0, false);
    p.visible = visible;
    layer.group.add(p);
    return p;
  };
  const crewA = clusters[0].desks.slice(0, 5).map((d, i) => seat(d, i, true));
  const crewB = clusters[1].desks.slice(0, 2).map((d, i) => seat(d, i + 10, false));
  const detections = createDetections(layer, 12);
  scene.add(layer.group);
  let t = 0;
  let wasteKw = 0;
  let flags = 0;

  return {
    layer,
    update(dt) {
      fill.intensity = 0.95 * layer.mix;
      if (!layer.group.visible) return;
      t = (t + dt) % CYCLE_S;
      const bBack = t >= RETURN_AT;
      crewB.forEach((p) => { p.visible = bBack; });
      const bOn = t < OFF_AT || bBack;
      clusters[0].level = 1;
      clusters[1].level = damp(clusters[1].level, bOn ? 1 : 0.1, 3, dt);
      clusters.forEach((c) => {
        c.lamp.intensity = 6 * c.level * layer.mix;
        c.poolMat.opacity = 0.32 * c.level * layer.mix;
        c.panels.forEach((pn) => pn.material.color.setRGB(0.35 + c.level, 0.33 + c.level * 0.9, 0.3 + c.level * 0.75));
        c.screens.forEach((s) => s.color.set(c.level > 0.5 ? '#9fd7ff' : '#1a2330'));
      });
      const meetingOn = t < MEETING_OFF_AT;
      const windowOpen = t < WINDOW_CLOSE_AT;
      sash.rotation.y = windowOpen ? -0.7 : 0;
      sash.position.z = ROOM.d / 2 + (windowOpen ? 0.55 : 0);
      meeting.ac.material.emissive?.set(meetingOn ? '#1f6f7a' : '#000000');

      const left = Math.max(0, OFF_AT - t);
      const mm = Math.floor((left / OFF_AT) * 3);
      const ss = String(Math.floor(((left / OFF_AT) * 180) % 60)).padStart(2, '0');
      const items = [...crewA, ...crewB.filter((p) => p.visible)].map((p) => ({
        pos: p.position.clone().setY(0), size: [0.75, 1.35, 0.6], kind: 'ok', text: 'người',
      }));
      const wasteB = t < OFF_AT;
      items.push({
        pos: new THREE.Vector3(clusters[1].cx, 0, -1.2), size: [5.2, 1.2, 2.6], kind: wasteB ? 'bad' : 'ok',
        text: wasteB ? `LÃNG PHÍ: đèn + 6 màn hình, 0 người. ARES tắt sau ${mm}:${ss}` : bBack ? 'Có người, bật lại đèn' : `Đã tắt, tiết kiệm ${String(CLUSTER_KW).replace('.', ',')} kW`,
      });
      if (meetingOn) items.push({ pos: meeting.pos, size: [3.4, 2.4, 2.8], kind: 'bad', text: 'LÃNG PHÍ: phòng họp trống, điều hòa đang chạy' });
      if (windowOpen) items.push({ pos: new THREE.Vector3(OFFICE_X - 4.5, 1.05, ROOM.d / 2), size: [2, 1.7, 0.5], kind: 'bad', text: 'LÃNG PHÍ: cửa sổ mở khi điều hòa chạy' });
      flags = items.filter((it) => it.kind === 'bad').length;
      wasteKw = (wasteB ? CLUSTER_KW : 0) + (meetingOn ? 1.1 : 0) + (windowOpen ? 0.35 : 0);
      detections.set(items, dt);
    },
    stats: () => ({ flags, wasteKw }),
  };
}
