// Phòng P101 dạng mô hình cắt rời: vỏ + nội thất (classroom.js), 16 bộ đèn theo 4 vùng, mặt trời đổ bóng.
import * as THREE from 'three';
import { PALETTE, ROOM } from './palette.js';
import { LAMPS, ZONE_CENTERS } from './layout.js';
import { createLayer, radialTexture, damp } from './layer.js';
import { buildShell, buildFurniture } from './classroom.js';
import { createScan } from './scan.js';

const LAMP_Y = ROOM.h - 0.2;
const LAMP_OFF = new THREE.Color('#7d858d'); // tấm khuếch tán khi tắt

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

function buildLamps(layer) {
  const poolTex = radialTexture(128, 'rgba(255,214,150,1)', 'rgba(255,214,150,0)');
  const lamps = LAMPS.map((l) => {
    const panelMat = new THREE.MeshBasicMaterial({ color: LAMP_OFF.clone(), transparent: true });
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
  const { glassMat } = buildShell(layer);
  buildFurniture(layer);
  // Ánh sáng nền dịu trong phòng để vật liệu sáng màu đọc được cả khi đèn vùng tắt.
  const fill = new THREE.HemisphereLight('#dfe8f2', '#3a3430', 0.35);
  layer.group.add(fill);
  const { lamps, areas } = buildLamps(layer);

  // Đèn mặt trời: sun.js đặt vị trí/cường độ theo giờ; chỉ nguồn này đổ bóng.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 0);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  layer.group.add(sun, sun.target);

  const scan = createScan(layer, {
    axis: 'x', from: -ROOM.w / 2 - 0.4, to: ROOM.w / 2 + 0.4,
    size: [ROOM.d + 0.8, ROOM.h + 0.6], center: [0, ROOM.h / 2, 0],
  });
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
        lampColor.copy(LAMP_OFF).lerp(PALETTE.lampHot, Math.min(1, k * 1.15)).multiplyScalar(1 + k * 0.9);
        l.panelMat.color.copy(lampColor);
        l.cone.material.uniforms.uIntensity.value = k * mix;
        l.poolMat.opacity = 0.32 * k * mix;
      });
      areas.forEach((a, i) => {
        a.intensity = (shown.pwm[i] / 100) * 3 * mix;
      });
      glassMat.opacity = (0.03 + shown.daylight * 0.03) * mix;
      fill.intensity = 0.35 * mix;
    },
    getShownPwm: () => [...shown.pwm],
    /** Phòng được "quét" hiện ra từ trái sang phải khi máy quay bay vào. */
    materialize: (duration = 1.6) => scan.play(duration),
    sunLight: sun,
  };
}
