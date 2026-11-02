// Bàn điều khiển mô phỏng: người dùng đổi giờ, thời tiết, số người, và bấm trực tiếp vào phòng 3D.
import * as THREE from 'three';
import { formatClock } from '../sim/schedule.js';
import { ROOM } from '../scene/palette.js';
import { num, setText } from './format.js';

const RUN_SPEED = 360;
const STILL_SPEED = 30;
const SKY_WORDS = ['U ám', 'Nhiều mây', 'Nắng nhẹ', 'Nắng', 'Nắng gắt'];

/**
 * @param {HTMLElement} root
 * @param {{engine:object, people:object, director:object, camera:THREE.Camera, canvas:HTMLCanvasElement}} deps
 */
export function createSandbox(root, { engine, people, director, camera, canvas }) {
  const $ = (k) => root.querySelector(`[data-sb="${k}"]`);
  const ctl = {
    minute: $('minute'), people: $('people'), sky: $('sky'), tout: $('tout'),
    run: $('run'), compare: $('compare'), camera: $('camera'), reset: $('reset'),
  };
  const out = {
    minute: $('minute-out'), people: $('people-out'), sky: $('sky-out'), tout: $('tout-out'),
    ares: $('kwh-ares'), base: $('kwh-base'), saving: $('saving'), note: $('note'), lightNotes: $('light-notes'),
  };
  let compare = false;
  let active = false;

  const setRun = (on) => {
    ctl.run.setAttribute('aria-pressed', String(on));
    engine.setInputs({ clockRate: on ? 1 : 0 });
    director.speed = on ? RUN_SPEED : STILL_SPEED;
  };

  ctl.minute.addEventListener('input', () => {
    setRun(false);
    engine.setInputs({ minute: Number(ctl.minute.value) });
  });
  ctl.people.addEventListener('input', () => people.setTarget(Number(ctl.people.value), [1, 1, 1, 1]));
  ctl.sky.addEventListener('input', () => engine.setInputs({ sky: Number(ctl.sky.value) / 100 }));
  ctl.tout.addEventListener('input', () => engine.setInputs({ tOut: Number(ctl.tout.value) }));
  ctl.run.addEventListener('click', () => setRun(ctl.run.getAttribute('aria-pressed') !== 'true'));
  ctl.compare.addEventListener('change', () => {
    compare = ctl.compare.checked;
  });
  ctl.camera.addEventListener('change', () => engine.setInputs({ cameraOk: !ctl.camera.checked }));
  ctl.reset.addEventListener('click', () => {
    setRun(false);
    ctl.compare.checked = false;
    ctl.camera.checked = false;
    compare = false;
    engine.setInputs({ minute: 9 * 60, sky: 0.6, tOut: 33, cameraOk: true });
    people.setTarget(12, [1, 1, 1, 1]);
    engine.resetEnergy();
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const picked = ray.intersectObjects(people.meshes(), false)[0];
    if (picked) {
      people.removeByMesh(picked.object);
      return;
    }
    if (ray.ray.intersectPlane(floor, hit) && Math.abs(hit.x) < ROOM.w / 2 && Math.abs(hit.z) < ROOM.d / 2) {
      people.addNear(hit);
    }
  });

  return {
    get compare() {
      return active && compare;
    },
    setActive(v) {
      const wasActive = active;
      active = v;
      canvas.classList.toggle('is-interactive', v);
      if (wasActive && !v) ctl.run.setAttribute('aria-pressed', 'false');
    },
    update(state) {
      if (!active) return;
      const { inputs } = state;
      if (document.activeElement !== ctl.minute) ctl.minute.value = String(Math.round(inputs.minute));
      setText(out.minute, formatClock(inputs.minute));
      const count = people.count();
      if (document.activeElement !== ctl.people) ctl.people.value = String(count);
      setText(out.people, `${count} người`);
      setText(out.sky, SKY_WORDS[Math.min(4, Math.floor(inputs.sky * 5))]);
      setText(out.tout, `${num(inputs.tOut)} °C`);
      const { ares, baseline } = state.energy;
      setText(out.ares, `${num(ares, 2)} kWh`);
      setText(out.base, `${num(baseline, 2)} kWh`);
      const saving = baseline > 0.01 ? (1 - ares / baseline) * 100 : null;
      setText(out.saving, saving == null ? 'Chạy đồng hồ để tích luỹ' : `${saving >= 0 ? 'Ít hơn' : 'Nhiều hơn'} ${num(Math.abs(saving), 1)} %`);
      setText(out.note, inputs.cameraOk ? state.hvac.note : 'Mất camera trong giờ học: coi mọi vùng có người');
      setText(out.lightNotes, state.zones.map((z, i) => `Khu ${i + 1}: ${num(z.pwm)} %, ${z.note.toLowerCase()}`).join('\n'));
    },
  };
}
