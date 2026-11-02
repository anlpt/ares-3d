// Đạo diễn: chuyển máy quay và trạng thái mô phỏng giữa các chương, cùng chuyển động nhỏ theo cuộn/chuột.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { LAYER_NAMES } from './chapters.js';
import { currentSession } from '../sim/schedule.js';
import { smoothstep } from '../scene/layer.js';

const MOVE_S = 2.1;
const MIX_S = 1.1;
const DEFAULT_SPEED = 30;
const AUTO_IN_CLASS = 22;
const AUTO_BREAK = 2;
const AUTO_YAW_PER_S = 0.075; // ~84 giây một vòng 360°
const DRAG_YAW = 0.0065;
const DRAG_PITCH = 0.004;
const PITCH_MIN = -0.45;
const PITCH_MAX = 0.55;
const RESUME_AFTER_S = 2.5;
const CAMERA_DAMP = 6;

/**
 * @param {{camera:THREE.PerspectiveCamera, layers:Record<string, {setMix:(v:number)=>void}>,
 *   engine:ReturnType<import('../sim/engine.js').createEngine>, people:object, reducedMotion:boolean}} deps
 */
export function createDirector({ camera, layers, engine, people, reducedMotion }) {
  const pose = { px: 44, py: 12, pz: 72, tx: 0, ty: 2.5, tz: 0 };
  const mix = Object.fromEntries(LAYER_NAMES.map((n) => [n, 0]));
  const view = { x: 0, y: 0 };
  let chapter = null;
  let progress = 0;
  let speed = DEFAULT_SPEED;
  let scriptIdx = 0;
  let autoInClass = null;

  const applyMix = () => LAYER_NAMES.filter((n) => n !== 'building').forEach((n) => layers[n]?.setMix(mix[n]));
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const smoothPos = new THREE.Vector3(pose.px, pose.py, pose.pz);
  const smoothTarget = new THREE.Vector3(pose.tx, pose.ty, pose.tz);
  const spherical = new THREE.Spherical();
  // Góc xoay người dùng: yaw quanh trục đứng (không giới hạn → 360°), pitch giới hạn để không lật dưới sàn.
  const orbit = { yaw: 0, pitch: 0, yawGoal: 0, pitchGoal: 0, auto: !reducedMotion, idle: RESUME_AFTER_S, paused: false };
  let firstFrame = true;

  function applySim(sim, { instant: jump }) {
    const instant = jump || Boolean(sim.instant);
    engine.setInputs({
      minute: sim.minute, sky: sim.sky, tOut: sim.tOut, clockRate: sim.clockRate ?? 0, cameraOk: true,
    });
    speed = sim.speed ?? DEFAULT_SPEED;
    scriptIdx = 0;
    autoInClass = null;
    people.setTarget(sim.people, sim.weights, { instant });
    if (instant || sim.tIn != null) {
      engine.setInputs({ zoneCounts: instant ? people.zoneCounts() : engine.getState().inputs.zoneCounts });
      engine.prime({ tIn: sim.tIn });
    }
    engine.resetEnergy();
  }

  function runScript(state) {
    const sim = chapter?.sim;
    if (!sim) return;
    const script = sim.script ?? [];
    while (scriptIdx < script.length && state.inputs.minute >= script[scriptIdx].minute) {
      people.setTarget(script[scriptIdx].people, sim.weights);
      scriptIdx += 1;
    }
    if (sim.auto) {
      const inClass = Boolean(currentSession(state.inputs.minute, state.inputs.day));
      if (inClass !== autoInClass) {
        autoInClass = inClass;
        people.setTarget(inClass ? AUTO_IN_CLASS : AUTO_BREAK, sim.weights, { seed: Math.floor(state.inputs.minute) });
      }
    }
  }

  return {
    get chapter() {
      return chapter;
    },
    get speed() {
      return speed;
    },
    set speed(v) {
      speed = v;
    },
    goTo(next, { instant = false } = {}) {
      if (chapter?.id === next.id) return;
      chapter = next;
      const dur = instant || reducedMotion ? 0 : MOVE_S;
      const [px, py, pz] = next.pose.pos;
      const [tx, ty, tz] = next.pose.target;
      gsap.killTweensOf(pose);
      gsap.to(pose, { px, py, pz, tx, ty, tz, duration: dur, ease: 'power3.inOut' });
      const targetMix = Object.fromEntries(LAYER_NAMES.map((n) => [n, next.layers[n] ?? 0]));
      gsap.killTweensOf(mix);
      gsap.to(mix, { ...targetMix, duration: instant || reducedMotion ? 0 : MIX_S, ease: 'power2.inOut', onUpdate: applyMix });
      if (instant || reducedMotion) applyMix();
      applySim(next.sim, { instant });
    },
    setProgress(p) {
      progress = p;
    },
    get autoRotate() {
      return orbit.auto;
    },
    set autoRotate(v) {
      orbit.auto = v;
    },
    /** Tạm dừng tự xoay (ví dụ khi người dùng đang bấm trong phòng mô phỏng). */
    set orbitPaused(v) {
      orbit.paused = v;
    },
    /** Kéo chuột: dx, dy theo pixel. */
    drag(dx, dy) {
      orbit.yawGoal -= dx * DRAG_YAW;
      orbit.pitchGoal = THREE.MathUtils.clamp(orbit.pitchGoal + dy * DRAG_PITCH, PITCH_MIN, PITCH_MAX);
      orbit.idle = 0;
    },
    /** @param {number} dt @param {{x:number, y:number}} pointer */
    update(dt, pointer) {
      const state = engine.getState();
      runScript(state);
      engine.setInputs({ zoneCounts: people.zoneCounts() });
      engine.tick(dt * speed);

      const motion = reducedMotion ? 0 : 1;
      orbit.idle += dt;
      if (orbit.auto && !orbit.paused && orbit.idle > RESUME_AFTER_S) orbit.yawGoal += AUTO_YAW_PER_S * dt;
      orbit.yaw = THREE.MathUtils.damp(orbit.yaw, orbit.yawGoal, 5, dt);
      orbit.pitch = THREE.MathUtils.damp(orbit.pitch, orbit.pitchGoal, 5, dt);

      const aspect = camera.aspect;
      const desktop = window.innerWidth >= 900;
      const zoomOut = aspect < 0.8 ? 1.6 : aspect < 1.25 ? 1.25 : 1;
      target.set(pose.tx, pose.ty, pose.tz);
      offset.set(pose.px - pose.tx, pose.py - pose.ty, pose.pz - pose.tz).multiplyScalar(zoomOut);
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP,
        orbit.yaw + motion * ((progress - 0.5) * 0.16 + pointer.x * 0.04));
      spherical.setFromVector3(offset);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - orbit.pitch - motion * pointer.y * 0.03, 0.12, Math.PI / 2 - 0.04);
      offset.setFromSpherical(spherical);
      pos.copy(target).add(offset);
      if (firstFrame) {
        smoothPos.copy(pos);
        smoothTarget.copy(target);
        firstFrame = false;
      }
      smoothPos.x = THREE.MathUtils.damp(smoothPos.x, pos.x, CAMERA_DAMP, dt);
      smoothPos.y = THREE.MathUtils.damp(smoothPos.y, pos.y, CAMERA_DAMP, dt);
      smoothPos.z = THREE.MathUtils.damp(smoothPos.z, pos.z, CAMERA_DAMP, dt);
      smoothTarget.lerp(target, 1 - Math.exp(-CAMERA_DAMP * dt));
      camera.position.copy(smoothPos);
      camera.lookAt(smoothTarget);

      view.x += ((desktop ? -0.17 : 0) - view.x) * Math.min(1, dt * 3);
      view.y += ((desktop ? 0 : 0.14) - view.y) * Math.min(1, dt * 3);
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.setViewOffset(w, h, view.x * w, view.y * h, w, h);

      const dist = camera.position.length();
      layers.building?.setMix(mix.building * smoothstep(16, 40, dist));
    },
  };
}
