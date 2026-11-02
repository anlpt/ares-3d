// Ánh nắng: mặt trời đi theo giờ, chùm sáng xuyên từng ô kính mặt trước, vệt nắng trên sàn và bóng đổ.
// Hướng nắng chỉ để minh họa (mặt kính quay về +z); cường độ lấy từ outdoorLux của engine.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROOM } from './palette.js';
import { ZONE_CENTERS } from './layout.js';
import { createLayer, makeLabelEl, damp } from './layer.js';
import { sunAltitude } from '../sim/world.js';
import { formatClock } from '../sim/schedule.js';

const PANES = 7;
const SILL_Y = 0.9;
const SUN_R = 26;
const MAX_ELEV = THREE.MathUtils.degToRad(62);
const MIN_ELEV = THREE.MathUtils.degToRad(9);
const FULL_SUN_LUX = 60000;
const DUST = 260;
const SUN_COLOR = new THREE.Color('#ffd9a0');

/** Vị trí mặt trời (toạ độ phòng) theo phút trong ngày: mọc phía +x, lặn phía −x, luôn chiếu vào mặt kính. */
export function sunPosition(minute, out = new THREE.Vector3()) {
  const t = THREE.MathUtils.clamp((minute - 360) / 720, 0, 1);
  const elev = MIN_ELEV + (MAX_ELEV - MIN_ELEV) * sunAltitude(minute);
  const az = Math.PI * t;
  return out.set(Math.cos(az) * SUN_R * Math.cos(elev), Math.sin(elev) * SUN_R, SUN_R * 0.75 * Math.cos(elev) + 4);
}

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: SUN_COLOR.clone() }, uI: { value: 0 } },
    vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uI; varying float vT; void main(){ float a = (0.35 + 0.65 * (1.0 - vT)) * 0.2 * uI; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Một ô kính: chùm sáng (4 mặt bên nối ô kính với vệt sàn) + vệt nắng trên sàn. */
function makePane(group, beamMat, patchMat) {
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  beamGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1));
  beamGeo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const patchGeo = new THREE.BufferGeometry();
  patchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
  patchGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  const patch = new THREE.Mesh(patchGeo, patchMat);
  beam.frustumCulled = false;
  patch.frustumCulled = false;
  group.add(beam, patch);
  return { beamGeo, patchGeo };
}

/** Chiếu điểm p theo hướng tia nắng xuống sàn y = 0.02, kẹp trong phòng. */
function toFloor(p, dir, out) {
  const k = (p.y - 0.02) / -dir.y;
  out.copy(p).addScaledVector(dir, k);
  out.x = THREE.MathUtils.clamp(out.x, -ROOM.w / 2, ROOM.w / 2);
  out.z = THREE.MathUtils.clamp(out.z, -ROOM.d / 2, ROOM.d / 2);
  out.y = 0.02;
  return out;
}

function buildDust(layer) {
  const pos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i += 1) {
    pos.set([(Math.random() - 0.5) * ROOM.w, 0.2 + Math.random() * 2.8, ROOM.d / 2 - Math.random() * 4.5], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = layer.fade(new THREE.PointsMaterial({
    color: SUN_COLOR, size: 0.035, depthWrite: false, blending: THREE.AdditiveBlending,
  }), 0);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, mat, geo, pos };
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.DirectionalLight} sunLight đèn mặt trời của phòng (đổ bóng)
 */
export function createSun(scene, sunLight) {
  const layer = createLayer('sun');
  const beamMat = beamMaterial();
  const patchMat = new THREE.MeshBasicMaterial({
    color: SUN_COLOR, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const panes = Array.from({ length: PANES }, () => makePane(layer.group, beamMat, patchMat));
  const dust = buildDust(layer);
  layer.group.add(dust.pts);

  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1c9').multiplyScalar(2.2) }));
  const arcPts = Array.from({ length: 49 }, (_, i) => sunPosition(360 + i * 15));
  const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts),
    layer.fade(new THREE.LineDashedMaterial({ color: SUN_COLOR, dashSize: 0.6, gapSize: 0.5 }), 0.45));
  arc.computeLineDistances();
  const sunEl = layer.label(makeLabelEl('sun'));
  const sunLabel = new CSS2DObject(sunEl);
  sunLabel.position.set(0, 1.7, 0);
  disc.add(sunLabel);
  layer.group.add(disc, arc);

  const zoneEls = ZONE_CENTERS.map(([x, z]) => {
    const el = layer.label(makeLabelEl('daylight'));
    const obj = new CSS2DObject(el);
    obj.position.set(x, 1.1, z);
    layer.group.add(obj);
    return { el, last: '' };
  });
  scene.add(layer.group);

  const sunPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const floorPt = new THREE.Vector3();
  let intensity = 0;
  let lastSunText = '';

  function updateGeometry() {
    const paneW = ROOM.w / PANES;
    panes.forEach((p, i) => {
      const x0 = -ROOM.w / 2 + i * paneW + 0.08;
      const x1 = x0 + paneW - 0.16;
      const top = [[x0, ROOM.h - 0.05], [x1, ROOM.h - 0.05], [x1, SILL_Y], [x0, SILL_Y]];
      const beam = p.beamGeo.attributes.position;
      const patch = p.patchGeo.attributes.position;
      top.forEach(([x, y], k) => {
        corner.set(x, y, ROOM.d / 2);
        beam.setXYZ(k, corner.x, corner.y, corner.z);
        toFloor(corner, dir, floorPt);
        beam.setXYZ(k + 4, floorPt.x, floorPt.y, floorPt.z);
        patch.setXYZ(k, floorPt.x, floorPt.y, floorPt.z);
      });
      beam.needsUpdate = true;
      patch.needsUpdate = true;
    });
  }

  return {
    layer,
    /** @param {object} state engine state @param {number} dt */
    update(state, dt) {
      const { minute } = state.inputs;
      sunPosition(minute, sunPos);
      dir.copy(sunPos).negate().normalize();
      const up = sunAltitude(minute) > 0;
      intensity = damp(intensity, up ? Math.min(1, state.outdoorLux / FULL_SUN_LUX) : 0, 3, dt);
      sunLight.position.copy(sunPos);
      sunLight.intensity = intensity * 2.6 * Math.max(layer.mix, 0.25);
      sunLight.castShadow = intensity > 0.05 && layer.mix > 0.05;

      if (!layer.group.visible) return;
      const shown = intensity * layer.mix;
      updateGeometry();
      beamMat.uniforms.uI.value = shown;
      patchMat.opacity = 0.55 * shown;
      dust.mat.opacity = 0.85 * shown;
      for (let i = 0; i < DUST; i += 1) {
        dust.pos[i * 3 + 1] += Math.sin(performance.now() * 0.0004 + i) * 0.0015;
        dust.pos[i * 3] += 0.002;
        if (dust.pos[i * 3] > ROOM.w / 2) dust.pos[i * 3] = -ROOM.w / 2;
      }
      dust.geo.attributes.position.needsUpdate = true;
      disc.position.copy(sunPos);
      disc.visible = up;

      const sunText = `<b>${formatClock(minute)}</b><span>${Math.round(state.outdoorLux / 1000)} nghìn lux ngoài trời</span>`;
      if (sunText !== lastSunText) {
        lastSunText = sunText;
        sunEl.innerHTML = sunText;
      }
      zoneEls.forEach((z, i) => {
        const text = `<span>Nắng <b>${Math.round(state.daylight[i])}</b> lux</span><span>Đèn <b>${Math.round(state.zones[i].pwm)}</b> %</span>`;
        if (text !== z.last) {
          z.last = text;
          z.el.innerHTML = text;
        }
      });
    },
  };
}

