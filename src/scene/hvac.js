// Điều hòa: luồng hạt khí lạnh, mật độ theo mức quạt; nhãn lệnh IR gần nhất.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { AC_UNITS } from './layout.js';
import { createLayer, makeLabelEl } from './layer.js';

const PER_UNIT = 260;
const LIFE_S = 2.6;

const MODE_TEXT = Object.freeze({
  off: 'Tắt', precool: 'Làm mát trước', comfort: 'Theo số người', failsafe: 'Tắt an toàn', keep: 'Giữ chạy',
});

function particleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: PALETTE.cool.clone() }, uMix: { value: 0 } },
    vertexShader: `attribute float aAlpha; varying float vA;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = 9.0 * (8.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uMix; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uMix;
      gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** @param {THREE.Scene} scene */
export function createHvac(scene) {
  const layer = createLayer('hvac');
  const count = PER_UNIT * AC_UNITS.length;
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count).fill(-1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = particleMaterial();
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  layer.group.add(points);

  const el = layer.label(makeLabelEl('ac'));
  const label = new CSS2DObject(el);
  label.position.set(AC_UNITS[0].x, AC_UNITS[0].y + 0.55, AC_UNITS[0].z + 0.2);
  layer.group.add(label);
  scene.add(layer.group);

  let spawnAcc = 0;
  let last = '';

  function respawn(i) {
    const u = AC_UNITS[i % AC_UNITS.length];
    pos[i * 3] = u.x + (Math.random() - 0.5) * 1.0;
    pos[i * 3 + 1] = u.y - 0.15;
    pos[i * 3 + 2] = u.z + 0.15;
    vel[i * 3] = (Math.random() - 0.5) * 0.5;
    vel[i * 3 + 1] = -0.35 - Math.random() * 0.3;
    vel[i * 3 + 2] = 1.1 + Math.random() * 1.1;
    life[i] = LIFE_S;
  }

  return {
    layer,
    update(state, dt) {
      mat.uniforms.uMix.value = layer.mix;
      const { hvac } = state;
      const rate = hvac.power ? 70 * hvac.fan : 0;
      spawnAcc += rate * dt;
      for (let i = 0; i < count; i += 1) {
        if (life[i] <= 0 && spawnAcc >= 1) {
          respawn(i);
          spawnAcc -= 1;
        }
        if (life[i] > 0) {
          life[i] -= dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] = Math.max(0.1, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const t = life[i] / LIFE_S;
          alpha[i] = Math.sin(Math.PI * t) * 0.8;
        } else {
          alpha[i] = 0;
        }
      }
      spawnAcc = Math.min(spawnAcc, 5);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;

      const sp = hvac.power && hvac.setpoint != null ? `${hvac.setpoint} °C, quạt ${hvac.fan}` : 'Không chạy';
      const text = `<b>${MODE_TEXT[hvac.mode] ?? hvac.mode}</b><span>${sp}</span>`;
      if (text !== last) {
        last = text;
        el.innerHTML = text;
        el.classList.toggle('is-on', hvac.power);
      }
    },
  };
}
