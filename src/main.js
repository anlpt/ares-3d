import './styles/tokens.css';
import './styles/base.css';
import './styles/story.css';
import './styles/panels.css';
import './styles/holo.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createStage } from './scene/stage.js';
import { createRoom } from './scene/room.js';
import { createBuilding } from './scene/building.js';
import { createPeople } from './scene/people.js';
import { createVision } from './scene/vision.js';
import { createZones } from './scene/zones.js';
import { createHvac } from './scene/hvac.js';
import { createLearning, LEARN_STEPS } from './scene/learning.js';
import { createNetwork } from './scene/network.js';
import { createSun } from './scene/sun.js';
import { createEngine } from './sim/engine.js';
import { CHAPTERS } from './story/chapters.js';
import { formatClock } from './sim/schedule.js';
import { createDirector } from './story/director.js';
import { createHud } from './ui/hud.js';
import { createSandbox } from './ui/sandbox.js';
import { renderPrecoolChart } from './ui/precoolChart.js';
import { createCallouts } from './ui/callouts.js';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);
// Mỗi lần mở trang bắt đầu từ cảnh tòa nhà, không nhảy giữa chừng câu chuyện.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function buildWorld() {
  const canvas = document.getElementById('scene');
  const stage = createStage(canvas, document.getElementById('labels'));
  const { scene, camera } = stage;
  const room = createRoom(scene);
  const building = createBuilding(scene);
  const people = createPeople(scene);
  const vision = createVision(scene);
  const zones = createZones(scene);
  const hvac = createHvac(scene);
  const learning = createLearning(scene);
  const network = createNetwork(scene);
  const sun = createSun(scene, room.sunLight);
  const engine = createEngine();
  const layers = {
    building: building.layer, room: room.layer, people: people.layer, vision: vision.layer,
    zones: zones.zones, buffers: zones.buffers, hvac: hvac.layer, learning: learning.layer, network: network.layer,
    sun: sun.layer,
  };
  const director = createDirector({ camera, layers, engine, people, reducedMotion });
  return { canvas, stage, room, building, people, vision, zones, hvac, learning, network, sun, engine, director };
}

function setupScroll(world, ui) {
  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.09 });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const railButtons = [...document.querySelectorAll('[data-goto]')];
  const learnItems = [...document.querySelectorAll('[data-learn-step]')];

  const activate = (chapter) => {
    world.director.goTo(chapter);
    ui.hud.setVisible(chapter.hud !== false);
    ui.sandbox.setActive(Boolean(chapter.interactive));
    world.director.orbitPaused = Boolean(chapter.interactive);
    ui.syncChapterControls?.(chapter);
    document.body.dataset.chapter = chapter.id;
    railButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.goto === chapter.id)));
  };

  document.querySelectorAll('main [data-chapter]').forEach((section) => {
    const chapter = CHAPTERS.find((c) => c.id === section.dataset.chapter);
    if (!chapter) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => self.isActive && activate(chapter),
      onUpdate: (self) => {
        if (world.director.chapter?.id !== chapter.id) return;
        world.director.setProgress(self.progress);
        if (chapter.id === 'learn') {
          const step = Math.min(LEARN_STEPS.length - 1, Math.floor(self.progress * LEARN_STEPS.length));
          world.learning.setStep(step);
          learnItems.forEach((li, i) => li.classList.toggle('is-active', i === step));
        }
      },
    });
  });

  const scrollTo = (id) => {
    const el = document.querySelector(`main [data-chapter="${id}"]`);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
    else el.scrollIntoView();
  };
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => scrollTo(b.dataset.goto)));
  activate(CHAPTERS[0]);
  return { scrollTo };
}

const BUILDING_CHAPTERS = new Set(['hero', 'scale']);
const DRAG_THRESHOLD_PX = 5;

/** Kéo chuột trên cảnh để xoay 360°; phân biệt kéo với bấm để không thêm người/bay vào phòng nhầm. */
function setupOrbit(world) {
  const { canvas, director } = world;
  const drag = { active: false, x: 0, y: 0, moved: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    Object.assign(drag, { active: true, x: e.clientX, y: e.clientY, moved: 0 });
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > DRAG_THRESHOLD_PX) {
      canvas.classList.add('is-dragging');
      director.drag(dx, dy);
    }
  });
  window.addEventListener('pointerup', () => {
    drag.active = false;
    canvas.classList.remove('is-dragging');
  });
  const toggle = document.querySelector('[data-orbit]');
  toggle.setAttribute('aria-pressed', String(director.autoRotate));
  toggle.addEventListener('click', () => {
    director.autoRotate = !director.autoRotate;
    toggle.setAttribute('aria-pressed', String(director.autoRotate));
  });
  return { wasDrag: () => drag.moved > DRAG_THRESHOLD_PX };
}
const inBuildingChapter = (world) => BUILDING_CHAPTERS.has(world.director.chapter?.id);

/** Rê chuột lên một tầng để làm nổi tầng đó; bấm vào P101 để bay vào phòng. */
function setupBuildingPointer(world, ui, scrollTo, orbit) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (e) => {
    if (!inBuildingChapter(world)) return null;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, world.stage.camera);
    return world.building.pick(ray);
  };
  world.canvas.addEventListener('pointermove', (e) => {
    if (e.buttons && orbit.wasDrag()) return;
    const hit = pickAt(e);
    ui.callouts.setHover(hit ? hit.floor : -1);
    world.canvas.classList.toggle('is-pointing', Boolean(hit?.isP101));
  });
  world.canvas.addEventListener('pointerleave', () => ui.callouts.setHover(-1));
  world.canvas.addEventListener('click', (e) => {
    if (!orbit.wasDrag() && pickAt(e)?.isP101) scrollTo('see');
  });
}

const SKY_WORDS = ['U ám', 'Nhiều mây', 'Nắng nhẹ', 'Nắng', 'Nắng gắt'];
const skyWord = (v) => SKY_WORDS[Math.min(SKY_WORDS.length - 1, Math.floor(v * SKY_WORDS.length))];

function setupInlineControls(world, ui) {
  const sky = document.getElementById('lightSky');
  const skyOut = document.getElementById('lightSkyOut');
  const time = document.getElementById('lightTime');
  const timeOut = document.getElementById('lightTimeOut');
  sky.addEventListener('input', () => {
    const v = Number(sky.value) / 100;
    world.engine.setInputs({ sky: v });
    skyOut.textContent = skyWord(v);
  });
  time.addEventListener('input', () => {
    world.engine.setInputs({ minute: Number(time.value) });
    timeOut.textContent = formatClock(Number(time.value));
  });
  // Khi quay lại chương Đèn, thanh kéo khớp với trạng thái mô phỏng của chương.
  // eslint-disable-next-line no-param-reassign -- gắn hook vào object ui dùng chung
  ui.syncChapterControls = (chapter) => {
    if (chapter.id !== 'light') return;
    time.value = String(chapter.sim.minute);
    timeOut.textContent = formatClock(chapter.sim.minute);
    sky.value = String(Math.round(chapter.sim.sky * 100));
    skyOut.textContent = skyWord(chapter.sim.sky);
  };
  const chart = renderPrecoolChart(document.getElementById('precoolChart'));
  document.getElementById('precoolLead').textContent = `${Math.round(chart.lead)} phút`;
  document.getElementById('precoolAres').textContent = `${chart.fmt(chart.aresAtClass)} °C`;
  document.getElementById('precoolPlain').textContent = `${chart.fmt(chart.plainAtClass)} °C`;
}

function startLoop(world, ui) {
  const pointer = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });
  let last = performance.now();
  world.stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    smooth.x += (pointer.x - smooth.x) * Math.min(1, dt * 2);
    smooth.y += (pointer.y - smooth.y) * Math.min(1, dt * 2);
    world.people.update(dt);
    world.director.update(dt, smooth);
    const state = world.engine.getState();
    const compare = ui.sandbox.compare;
    world.room.update(state, dt, { compare });
    const occupied = state.inputs.zoneCounts.some((n) => n > 0);
    world.building.update(dt, { occupied });
    world.sun.update(state, dt);
    ui.callouts.update(state, dt, { active: inBuildingChapter(world), mix: world.building.layer.mix });
    world.vision.update(world.people.agents(), dt);
    world.zones.update(state, world.people.agents(), dt);
    world.hvac.update(state, dt);
    world.learning.update(dt);
    world.network.update(dt);
    ui.hud.update(state, dt, { compare });
    ui.sandbox.update(state);
    world.stage.render();
  });
}

function boot() {
  if (!hasWebGL()) {
    document.body.classList.add('no-webgl');
    return;
  }
  const world = buildWorld();
  const orbit = setupOrbit(world);
  const ui = {
    hud: createHud(document.getElementById('hud')),
    sandbox: createSandbox(document.getElementById('sandbox'), {
      engine: world.engine, people: world.people, director: world.director,
      camera: world.stage.camera, canvas: world.canvas, wasDrag: orbit.wasDrag,
    }),
    callouts: createCallouts(document.getElementById('callouts'), { camera: world.stage.camera, building: world.building }),
  };
  world.people.setTarget(16, [1, 1, 1, 1], { instant: true });
  setupInlineControls(world, ui);
  const { scrollTo } = setupScroll(world, ui);
  setupBuildingPointer(world, ui, scrollTo, orbit);
  startLoop(world, ui);
  if (import.meta.env.DEV) window.__ares = world;
  setTimeout(() => document.body.classList.add('is-ready'), 60);
}

boot();
