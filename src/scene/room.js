// Phòng P101 dạng "nhà búp bê": sàn, tường sau/trái, mặt kính trước, bàn ghế và 16 bộ đèn theo 4 vùng.
import * as THREE from 'three';
import { PALETTE, ROOM } from './palette.js';
import { DESKS, LAMPS, ZONE_CENTERS, AC_UNITS, CCTV } from './layout.js';
import { createLayer, radialTexture, damp } from './layer.js';
import { boxEdgePoints, holoLines, gridPoints } from './holo.js';

const LAMP_Y = ROOM.h - 0.2;

function coneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: PALETTE.lampHot.clone() }, uIntensity: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uIntensity; varying float vY; void main(){ float a = pow(vY, 2.4) * 0.07 * uIntensity; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const GLASS_WALL = '#0c1a2b';
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Vỏ phòng: sàn tối có lưới mảnh, tường kính mờ, mọi cạnh viền xanh ngọc như mô hình tòa nhà. */
function buildShell(layer, edges) {
  const glassStd = (color, opacity, opts = {}) => layer.fade(new THREE.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0.1, depthWrite: opacity >= 1, ...opts,
  }), opacity);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.12, ROOM.d), glassStd('#0a1422', 1));
  floor.position.y = -0.06;
  const parts = [
    { size: [ROOM.w, ROOM.h, 0.14], pos: [0, ROOM.h / 2, -ROOM.d / 2 - 0.07] },
    { size: [0.14, ROOM.h, ROOM.d], pos: [-ROOM.w / 2 - 0.07, ROOM.h / 2, 0] },
    { size: [0.14, 0.9, ROOM.d - 1.4], pos: [ROOM.w / 2 + 0.07, 0.45, -0.7] },
  ];
  const wallMat = glassStd(GLASS_WALL, 0.72);
  parts.forEach(({ size, pos }) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat);
    wall.position.set(...pos);
    layer.group.add(wall);
    edges.push(...boxEdgePoints(...size, at(...pos)));
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 0.04), glassStd('#0f2a2c', 1, { emissive: '#0b2a2a' }));
  board.position.set(0, 1.65, -ROOM.d / 2 + 0.02);
  edges.push(...boxEdgePoints(5.2, 1.3, 0.04, at(0, 1.65, -ROOM.d / 2 + 0.02)));
  layer.group.add(floor, board);
  edges.push(...boxEdgePoints(ROOM.w, ROOM.h, ROOM.d, at(0, ROOM.h / 2, 0)));

  const mullions = [];
  for (let i = 1; i < 7; i += 1) {
    const x = -ROOM.w / 2 + (ROOM.w / 7) * i;
    mullions.push(x, 0, ROOM.d / 2, x, ROOM.h, ROOM.d / 2);
  }
  mullions.push(-ROOM.w / 2, 0.9, ROOM.d / 2, ROOM.w / 2, 0.9, ROOM.d / 2);
  layer.group.add(
    holoLines(layer, mullions, { opacity: 0.22 }),
    holoLines(layer, gridPoints(ROOM.w, ROOM.d, 1, 0.012), { opacity: 0.07, boost: 1 }),
  );

  const glassMat = layer.fade(new THREE.MeshBasicMaterial({
    color: PALETTE.holo, transparent: true, opacity: 0.03, depthWrite: false, side: THREE.DoubleSide,
  }), 0.03);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.h), glassMat);
  glass.position.set(0, ROOM.h / 2, ROOM.d / 2);
  layer.group.add(glass);
  return { glassMat };
}

/** Bàn ghế khối kính tối, cạnh sáng mảnh; thiết bị (điều hòa, camera) viền rõ hơn. */
function buildFurniture(layer, edges, deviceEdges) {
  const deskMat = layer.fade(new THREE.MeshStandardMaterial({ color: '#10213a', roughness: 0.85, metalness: 0.05 }));
  const pieces = [
    { size: [1.25, 0.06, 0.6], y: 0.75, dz: 0 },
    { size: [1.15, 0.7, 0.05], y: 0.36, dz: -0.25 },
    { size: [0.45, 0.45, 0.42], y: 0.22, dz: 0.62 },
  ];
  const m = new THREE.Matrix4();
  pieces.forEach(({ size, y, dz }) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), deskMat, DESKS.length);
    DESKS.forEach((d, i) => {
      m.makeTranslation(d.x, y, d.z + dz);
      mesh.setMatrixAt(i, m);
      edges.push(...boxEdgePoints(...size, m));
    });
    layer.group.add(mesh);
  });

  const devMat = layer.fade(new THREE.MeshStandardMaterial({ color: '#13283f', roughness: 0.4, emissive: '#0a2230' }));
  AC_UNITS.forEach((u) => {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 0.26), devMat);
    ac.position.set(u.x, u.y, u.z);
    layer.group.add(ac);
    deviceEdges.push(...boxEdgePoints(1.15, 0.34, 0.26, at(u.x, u.y, u.z)));
  });
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), devMat);
  cam.position.set(CCTV.x, CCTV.y, CCTV.z);
  cam.lookAt(0, 0, 0.5);
  layer.group.add(cam);
}

function buildLamps(layer) {
  const poolTex = radialTexture(128, 'rgba(255,214,150,1)', 'rgba(255,214,150,0)');
  const lamps = LAMPS.map((l) => {
    const panelMat = new THREE.MeshBasicMaterial({ color: PALETTE.dark.clone(), transparent: true });
    layer.fade(panelMat, 1);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.32), panelMat);
    panel.position.set(l.x, LAMP_Y, l.z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.25, LAMP_Y - 0.05, 24, 1, true), coneMaterial());
    cone.position.set(l.x, (LAMP_Y - 0.05) / 2, l.z);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(l.x, 0.02, l.z);
    layer.group.add(panel, cone, pool);
    return { zone: l.zone, panelMat, cone, poolMat };
  });

  const areas = ZONE_CENTERS.map(([x, z]) => {
    const light = new THREE.PointLight(PALETTE.lampHot, 0, 9, 1.4);
    light.position.set(x, LAMP_Y - 0.4, z);
    layer.group.add(light);
    return light;
  });
  return { lamps, areas };
}

/** @param {THREE.Scene} scene */
export function createRoom(scene) {
  const layer = createLayer('room');
  const edges = [];
  const deviceEdges = [];
  const { glassMat } = buildShell(layer, edges);
  buildFurniture(layer, edges, deviceEdges);
  layer.group.add(holoLines(layer, edges, { opacity: 0.32 }), holoLines(layer, deviceEdges, { opacity: 0.8, boost: 1.5 }));
  const { lamps, areas } = buildLamps(layer);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 0);
  sun.position.set(-4, 9, 16);
  sun.target.position.set(0, 0, 0);
  layer.group.add(sun, sun.target);

  scene.add(layer.group);
  const shown = { pwm: [0, 0, 0, 0], daylight: 0 };
  const lampColor = new THREE.Color();

  return {
    layer,
    /** @param {object} state engine state @param {number} dt */
    update(state, dt, { compare = false } = {}) {
      const mix = layer.mix;
      for (let i = 0; i < 4; i += 1) {
        const target = compare ? 100 : state.zones[i].pwm;
        shown.pwm[i] = damp(shown.pwm[i], target, 3.5, dt);
      }
      shown.daylight = damp(shown.daylight, Math.min(1, state.outdoorLux / 60000), 2, dt);
      lamps.forEach((l) => {
        const k = shown.pwm[l.zone] / 100;
        lampColor.copy(PALETTE.dark).lerp(PALETTE.lampHot, Math.min(1, k * 1.15)).multiplyScalar(1 + k * 0.9);
        l.panelMat.color.copy(lampColor);
        l.cone.material.uniforms.uIntensity.value = k * mix;
        l.poolMat.opacity = 0.32 * k * mix;
      });
      areas.forEach((a, i) => {
        a.intensity = (shown.pwm[i] / 100) * 3 * mix;
      });
      sun.intensity = shown.daylight * 1.3 * mix;
      glassMat.opacity = (0.012 + shown.daylight * 0.012) * mix;
    },
    getShownPwm: () => [...shown.pwm],
  };
}
