// Đạo diễn: máy quay và độ hiện các lớp được nội suy trực tiếp theo vị trí cuộn giữa hai chương liền kề;
// trạng thái mô phỏng đổi khi chương "chiếm ưu thế" đổi. Kéo chuột để xoay, tự xoay là tuỳ chọn.
import * as THREE from 'three';
import { LAYER_NAMES } from './chapters.js';
import { currentSession } from '../sim/schedule.js';
import { smoothstep } from '../scene/layer.js';

const DEFAULT_SPEED = 30;
// Thu xa máy quay so với pose gốc để thấy trọn mô hình.
const ZOOM_BUILDING = 1.14;
const ZOOM_ROOM = 1.32;
const AUTO_IN_CLASS = 22;
const AUTO_BREAK = 2;
const AUTO_YAW_PER_S = 0.075; // ~84 giây một vòng 360°
const DRAG_YAW = 0.0065;
const DRAG_PITCH = 0.004;
const PITCH_MIN = -0.45;
const PITCH_MAX = 0.55;
const RESUME_AFTER_S = 2.5;
const CAMERA_DAMP = 7;
const SCROLL_RECENTER_RATE = 3; // khi cuộn, góc xoay tay trở dần về góc chuẩn của chương
const TAU = Math.PI * 2;

// Góc ngang cố định cho mọi chương: cuộn chỉ tiến/lùi, nâng/hạ và dịch khung — không bao giờ xoay mô hình.
// Xoay chỉ đến từ kéo chuột hoặc chế độ tự xoay.
const SCROLL_THETA = 0.44; // ~25°, nhìn từ phía trước bên phải

const zoomOf = (c) => c.zoom ?? (c.layers.building ? ZOOM_BUILDING : ZOOM_ROOM);

/**
 * @param {{camera:THREE.PerspectiveCamera, layers:Record<string, {setMix:(v:number)=>void}>,
 *   engine:ReturnType<import('../sim/engine.js').createEngine>, people:object, reducedMotion:boolean}} deps
 */
export function createDirector({ camera, layers, engine, people, reducedMotion }) {
  const mix = Object.fromEntries(LAYER_NAMES.map((n) => [n, -1]));
  const view = { x: 0, y: 0 };
  let chapter = null;
  let speed = DEFAULT_SPEED;
  let scriptIdx = 0;
  let autoInClass = null;

  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const smoothPos = new THREE.Vector3();
  const smoothTarget = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const sA = new THREE.Spherical();
  const sB = new THREE.Spherical();
  const tmp = new THREE.Vector3();
  let from = null;
  let to = null;
  let blend = 0;
  let scrollKey = '';
  let scrollT = 0;
  let scrolling = 0;

  /** Pose nội suy giữa hai chương: tâm nhìn nội suy thẳng; khoảng cách và độ cao nội suy theo cầu, góc ngang giữ nguyên. */
  function blendedPose() {
    const a = from.pose;
    const b = to.pose;
    target.set(...a.target).lerp(tmp.set(...b.target), blend);
    sA.setFromVector3(tmp.set(...a.pos).sub(new THREE.Vector3(...a.target)).multiplyScalar(zoomOf(from)));
    sB.setFromVector3(tmp.set(...b.pos).sub(new THREE.Vector3(...b.target)).multiplyScalar(zoomOf(to)));
    spherical.set(
      THREE.MathUtils.lerp(sA.radius, sB.radius, blend),
      THREE.MathUtils.lerp(sA.phi, sB.phi, blend),
      SCROLL_THETA,
    );
    offset.setFromSpherical(spherical);
  }

  function applyMix(cameraDist) {
    LAYER_NAMES.forEach((n) => {
      let v = THREE.MathUtils.lerp(from.layers[n] ?? 0, to.layers[n] ?? 0, blend);
      if (n === 'building') v *= smoothstep(16, 40, cameraDist);
      if (Math.abs(v - mix[n]) < 0.002) return;
      mix[n] = v;
      layers[n]?.setMix(v);
    });
  }
  // Góc xoay người dùng: yaw quanh trục đứng (không giới hạn → 360°), pitch giới hạn để không lật dưới sàn.
  const orbit = { yaw: 0, pitch: 0, yawGoal: 0, pitchGoal: 0, auto: false, idle: RESUME_AFTER_S, paused: false };
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
    /** Chương chiếm ưu thế đổi: nạp trạng thái mô phỏng của chương đó. */
    activate(next, { instant = false } = {}) {
      if (chapter?.id === next.id) return;
      chapter = next;
      applySim(next.sim, { instant });
    },
    /** Vị trí cuộn: đang ở giữa chương `a` và `b`, `t` = 0 (ở a) … 1 (ở b). */
    setScroll(a, b, t) {
      const key = `${a.id}>${b.id}`;
      if (key !== scrollKey || Math.abs(t - scrollT) > 0.0005) scrolling = 0.6;
      scrollKey = key;
      scrollT = t;
      from = a;
      to = b;
      blend = reducedMotion ? (t < 0.5 ? 0 : 1) : t;
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
    /** @param {number} dt */
    update(dt) {
      const state = engine.getState();
      runScript(state);
      engine.setInputs({ zoneCounts: people.zoneCounts() });
      engine.tick(dt * speed);

      orbit.idle += dt;
      scrolling = Math.max(0, scrolling - dt);
      if (scrolling > 0) {
        // Cuộn là đi theo kịch bản: thả góc xoay tay về vòng gần nhất, tạm dừng tự xoay.
        orbit.idle = 0;
        orbit.yawGoal = THREE.MathUtils.damp(orbit.yawGoal, Math.round(orbit.yawGoal / TAU) * TAU, SCROLL_RECENTER_RATE, dt);
        orbit.pitchGoal = THREE.MathUtils.damp(orbit.pitchGoal, 0, SCROLL_RECENTER_RATE, dt);
      } else if (orbit.auto && !orbit.paused && orbit.idle > RESUME_AFTER_S) {
        orbit.yawGoal += AUTO_YAW_PER_S * dt;
      }
      orbit.yaw = THREE.MathUtils.damp(orbit.yaw, orbit.yawGoal, 5, dt);
      orbit.pitch = THREE.MathUtils.damp(orbit.pitch, orbit.pitchGoal, 5, dt);

      if (!from) return;
      const aspect = camera.aspect;
      const desktop = window.innerWidth >= 900;
      const zoomOut = aspect < 0.8 ? 1.6 : aspect < 1.25 ? 1.25 : 1;
      blendedPose();
      offset.multiplyScalar(zoomOut);
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP,
        orbit.yaw);
      spherical.setFromVector3(offset);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - orbit.pitch, 0.12, Math.PI / 2 - 0.04);
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

      const viewOf = (c) => c.view ?? -0.17; // lệch khung hình sang phải để chừa chỗ cho thẻ chữ bên trái
      const viewGoal = desktop ? THREE.MathUtils.lerp(viewOf(from), viewOf(to), blend) : 0;
      view.x += (viewGoal - view.x) * Math.min(1, dt * 4);
      view.y += ((desktop ? 0 : 0.14) - view.y) * Math.min(1, dt * 3);
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.setViewOffset(w, h, view.x * w, view.y * h, w, h);

      applyMix(camera.position.length());
    },
  };
}
