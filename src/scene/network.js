// Hợp đồng MQTT giữa ARES và hai ESP32 (ARES_UPGRADE.md mục 5): gói tin chạy dọc các topic.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { createLayer, makeLabelEl } from './layer.js';

const NODES = Object.freeze({
  sensor: { pos: [-5.6, 1.0, 4.0], title: 'ESP32 #1', sub: 'DHT22 trong/ngoài, BH1750' },
  actuator: { pos: [5.0, 2.95, -4.1], title: 'ESP32 #2', sub: 'PWM 4 vùng đèn, IR điều hòa' },
  broker: { pos: [3.0, 6.4, 0.2], title: 'Mosquitto', sub: 'MQTT, có tài khoản' },
  ares: { pos: [-3.0, 6.4, 0.2], title: 'ARES', sub: 'Control Engine' },
});

const LINKS = Object.freeze([
  { from: 'sensor', to: 'broker', color: 'cool', topic: 'ares/P101/sensors', lift: 3 },
  { from: 'broker', to: 'ares', color: 'cool', topic: '', lift: 1.4 },
  { from: 'ares', to: 'broker', color: 'lamp', topic: '', lift: -1.2 },
  { from: 'broker', to: 'actuator', color: 'lamp', topic: 'cmd/led, cmd/ac (retain)', lift: 1.5 },
]);

const PACKETS_PER_LINK = 3;

/** @param {THREE.Scene} scene */
export function createNetwork(scene) {
  const layer = createLayer('network');
  const v = (key) => new THREE.Vector3(...NODES[key].pos);

  Object.entries(NODES).forEach(([key, n]) => {
    const isBoard = key === 'sensor' || key === 'actuator';
    const geo = isBoard ? new THREE.BoxGeometry(0.7, 0.08, 0.45) : new THREE.OctahedronGeometry(0.42, 0);
    const color = key === 'ares' ? PALETTE.lamp : PALETTE.vision;
    const mesh = new THREE.Mesh(geo, layer.fade(new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: key === 'ares' ? 0.9 : 0.25, roughness: 0.4,
    }), 1));
    mesh.position.copy(v(key));
    const el = layer.label(makeLabelEl('node', `<b>${n.title}</b><span>${n.sub}</span>`));
    const label = new CSS2DObject(el);
    label.position.set(0, 0.6, 0);
    mesh.add(label);
    layer.group.add(mesh);
  });

  const links = LINKS.map((l, li) => {
    const a = v(l.from);
    const b = v(l.to);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, l.lift, 0));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const color = PALETTE[l.color];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      layer.fade(new THREE.LineBasicMaterial({ color }), 0.35));
    layer.group.add(line);
    if (l.topic) {
      const el = layer.label(makeLabelEl(`topic is-${l.color}`, l.topic));
      const label = new CSS2DObject(el);
      label.position.copy(curve.getPoint(0.5));
      layer.group.add(label);
    }
    const packets = Array.from({ length: PACKETS_PER_LINK }, (_, i) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8),
        layer.fade(new THREE.MeshBasicMaterial({ color }), 1));
      layer.group.add(p);
      return { mesh: p, offset: i / PACKETS_PER_LINK + li * 0.13 };
    });
    return { curve, packets };
  });
  scene.add(layer.group);

  let t = 0;
  return {
    layer,
    update(dt) {
      if (!layer.group.visible) return;
      t += dt;
      links.forEach(({ curve, packets }) => {
        packets.forEach((p) => {
          const u = (t * 0.32 + p.offset) % 1;
          p.mesh.position.copy(curve.getPoint(u));
        });
      });
    },
  };
}
