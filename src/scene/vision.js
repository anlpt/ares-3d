// Camera CCTV + YOLO: hình nón tầm nhìn và bbox 3D cho từng người kèm độ tin cậy.
// Bbox hồng = conf 0,35–0,55: ca khó, sẽ đi vào hàng đợi học chủ động.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE, ROOM } from './palette.js';
import { CCTV } from './layout.js';
import { createLayer, makeLabelEl } from './layer.js';

const MAX_BOXES = 24;
const RECONF_EVERY_S = 2.6;
const DOUBT_SHARE = 0.18;

function buildCone(layer) {
  const apex = new THREE.Vector3(CCTV.x, CCTV.y, CCTV.z);
  const corners = [
    [-ROOM.w / 2, 0, ROOM.d / 2], [ROOM.w / 2, 0, ROOM.d / 2],
    [-ROOM.w / 2, 0, -ROOM.d / 2 + 0.6], [ROOM.w / 2 - 0.4, 0, -ROOM.d / 2 + 0.6],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const pts = corners.flatMap((c) => [apex.x, apex.y, apex.z, c.x, c.y, c.z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = layer.fade(new THREE.LineDashedMaterial({ color: PALETTE.vision, dashSize: 0.25, gapSize: 0.18 }), 0.45);
  const lines = new THREE.LineSegments(g, mat);
  lines.computeLineDistances();
  layer.group.add(lines);

  const beamGeo = new THREE.BufferGeometry();
  const [a, b, c, d] = corners;
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...apex.toArray(), ...a.toArray(), ...b.toArray(),
    ...apex.toArray(), ...b.toArray(), ...d.toArray(),
    ...apex.toArray(), ...d.toArray(), ...c.toArray(),
    ...apex.toArray(), ...c.toArray(), ...a.toArray(),
  ], 3));
  const beamMat = layer.fade(new THREE.MeshBasicMaterial({
    color: PALETTE.vision, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  }), 0.035);
  layer.group.add(new THREE.Mesh(beamGeo, beamMat));
}

function buildBoxes(layer) {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, 1.55, 0.6));
  return Array.from({ length: MAX_BOXES }, () => {
    const mat = layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.vision }), 0.95);
    const box = new THREE.LineSegments(edges, mat);
    box.visible = false;
    const el = layer.label(makeLabelEl('det'));
    const label = new CSS2DObject(el);
    label.position.set(0, 0.95, 0);
    box.add(label);
    layer.group.add(box);
    return { box, mat, el, label, conf: -1 };
  });
}

const formatConf = (c) => c.toFixed(2).replace('.', ',');

/** @param {THREE.Scene} scene */
export function createVision(scene) {
  const layer = createLayer('vision');
  buildCone(layer);
  const boxes = buildBoxes(layer);
  scene.add(layer.group);
  let timer = RECONF_EVERY_S;

  function reconf(agents) {
    agents.forEach((a) => {
      const doubt = Math.random() < DOUBT_SHARE;
      // eslint-disable-next-line no-param-reassign -- conf là trạng thái hiển thị của agent
      a.conf = doubt ? 0.35 + Math.random() * 0.2 : 0.62 + Math.random() * 0.34;
    });
  }

  return {
    layer,
    update(agents, dt) {
      timer += dt;
      if (timer >= RECONF_EVERY_S) {
        timer = 0;
        reconf(agents);
      }
      const visible = agents.filter((a) => a.mesh.visible && a.wait <= 0);
      boxes.forEach((b, i) => {
        const a = visible[i];
        b.box.visible = Boolean(a) && layer.group.visible;
        b.label.visible = b.box.visible;
        if (!a) return;
        b.box.position.set(a.pos.x, a.mesh.position.y + 0.78, a.pos.z);
        if (b.conf !== a.conf) {
          b.conf = a.conf;
          const doubt = a.conf < 0.55;
          b.mat.color.copy(doubt ? PALETTE.doubt : PALETTE.vision);
          b.el.textContent = `người ${formatConf(a.conf)}`;
          b.el.classList.toggle('is-doubt', doubt);
        }
      });
    },
  };
}
