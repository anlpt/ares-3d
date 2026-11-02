// Công cụ chung cho phong cách hologram: gom cạnh nhiều khối thành một LineSegments phát sáng.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const edgeCache = new Map();

/** Cạnh của một hộp w×h×d, đã dịch theo ma trận, dạng mảng toạ độ phẳng. */
export function boxEdgePoints(w, h, d, matrix) {
  const key = `${w}|${h}|${d}`;
  if (!edgeCache.has(key)) edgeCache.set(key, new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)));
  const src = edgeCache.get(key).attributes.position;
  const v = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < src.count; i += 1) {
    v.fromBufferAttribute(src, i).applyMatrix4(matrix);
    out.push(v.x, v.y, v.z);
  }
  return out;
}

/**
 * Một LineSegments cộng sáng, đăng ký mờ/hiện theo lớp.
 * @param {{fade:Function}} layer
 * @param {number[]} pts
 */
export function holoLines(layer, pts, { color = PALETTE.holo, opacity = 0.5, boost = 1.2 } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = layer.fade(new THREE.LineBasicMaterial({
    color: color.clone().multiplyScalar(boost), depthWrite: false, blending: THREE.AdditiveBlending,
  }), opacity);
  return new THREE.LineSegments(g, mat);
}

/** Lưới sàn mảnh (mỗi `step` mét) trong khung w×d tại độ cao y. */
export function gridPoints(w, d, step, y) {
  const pts = [];
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, y, -d / 2, x, y, d / 2);
  for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) pts.push(-w / 2, y, z, w / 2, y, z);
  return pts;
}

/** Vật liệu "người hologram": viền phát sáng theo góc nhìn (fresnel), thân trong suốt. */
export function fresnelMaterial({ base = PALETTE.vision, rim = PALETTE.holo } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: base.clone().multiplyScalar(0.5) },
      uRim: { value: rim.clone().multiplyScalar(1.4) },
      uMix: { value: 1 },
    },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uBase; uniform vec3 uRim; uniform float uMix; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      vec3 c = mix(uBase, uRim, f); gl_FragColor = vec4(c, (0.38 + 0.62 * f) * uMix); }`,
    transparent: true,
    depthWrite: false,
  });
}
