import './styles/tokens.css';
import './styles/base.css';
import './styles/story.css';
import './styles/panels.css';
import './styles/holo.css';
import './styles/motion.css';
import { gsap } from 'gsap';
import Lenis from 'lenis';
import { createStage } from './scene/stage.js';
import { smoothstep } from './scene/layer.js';
import { createRoom } from './scene/room.js';
import { createBuilding } from './scene/building.js';
import { createPeople } from './scene/people.js';
import { createVision } from './scene/vision.js';
import { createZones } from './scene/zones.js';
import { createHvac } from './scene/hvac.js';
import { createLearning, LEARN_STEPS } from './scene/learning.js';
import { createNetwork } from './scene/network.js';
import { createSun } from './scene/sun.js';
import { createLab } from './scene/lab.js';
import { createOffice } from './scene/office.js';
import { createStreet } from './scene/street.js';
import { createEngine } from './sim/engine.js';
import { CHAPTERS } from './story/chapters.js';
import { formatClock } from './sim/schedule.js';
import { createDirector } from './story/director.js';
import { createHud } from './ui/hud.js';
import { createSandbox } from './ui/sandbox.js';
import { renderPrecoolChart } from './ui/precoolChart.js';
import { createCallouts } from './ui/callouts.js';
import { num, setText } from './ui/format.js';
import { createBoot } from './ui/boot.js';
import { createTransitions } from './ui/transitions.js';
import * as THREE from 'three';

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
  const lab = createLab(scene);
  const office = createOffice(scene);
  const street = createStreet(scene);
  const engine = createEngine();
  const layers = {
    building: building.layer, room: room.layer, people: people.layer, vision: vision.layer,
    zones: zones.zones, buffers: zones.buffers, hvac: hvac.layer, learning: learning.layer, network: network.layer,
    sun: sun.layer, lab: lab.layer, office: office.layer, street: street.layer,
  };
  const director = createDirector({ camera, layers, engine, people, reducedMotion });
  return { canvas, stage, room, building, people, vision, zones, hvac, learning, network, sun, lab, office, street, engine, director };
}

// Mỗi chương: 58 % đầu giữ nguyên góc máy để đọc, phần còn lại máy quay bay dần sang chương sau theo đúng vị trí cuộn.
const HOLD = 0.58;
const SCAN_GAP_MS = 4000;
const JUMP_NEAR_VH = 1.3;
const JUMP_CUT_MS = 280;

function setupScroll(world, ui) {
  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.085 });
  if (lenis) {
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const railButtons = [...document.querySelectorAll('[data-goto]')];
  const learnItems = [...document.querySelectorAll('[data-learn-step]')];
  const sections = [...document.querySelectorAll('main [data-chapter]')]
    .map((el) => ({ el, chapter: CHAPTERS.find((c) => c.id === el.dataset.chapter) }))
    .filter((x) => x.chapter);
  let metrics = [];
  const measure = () => {
    metrics = sections.map((x) => ({ ...x, top: x.el.getBoundingClientRect().top + window.scrollY, height: x.el.offsetHeight }));
  };
  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);

  let previous = null;
  const lastScan = { room: -Infinity, building: -Infinity };
  const scan = (key, fn) => {
    if (reducedMotion || performance.now() - lastScan[key] < SCAN_GAP_MS) return;
    lastScan[key] = performance.now();
    fn();
  };
  const activate = (chapter) => {
    if (previous?.id === chapter.id) return;
    const fromBuilding = Boolean(previous?.layers.building);
    const toBuilding = Boolean(chapter.layers.building);
    if (previous) {
      ui.transitions.enterCard(document.querySelector(`main [data-chapter="${chapter.id}"] .card`));
      if (fromBuilding && !toBuilding) scan('room', () => world.room.materialize());
      if (toBuilding && !fromBuilding) scan('building', () => world.building.materialize(2.2));
    }
    previous = chapter;
    world.director.activate(chapter);
    ui.hud.setVisible(chapter.hud !== false);
    ui.sandbox.setActive(Boolean(chapter.interactive));
    world.director.orbitPaused = Boolean(chapter.interactive);
    ui.syncChapterControls?.(chapter);
    document.body.dataset.chapter = chapter.id;
    sections.forEach((x) => x.el.classList.toggle('is-active', x.chapter.id === chapter.id));
    railButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.goto === chapter.id)));
  };

  /** Gọi mỗi khung hình: đổi vị trí cuộn thành (chương hiện tại, chương kế, độ chuyển). */
  function sync() {
    if (metrics.length === 0) return;
    const focus = window.scrollY + window.innerHeight * 0.5;
    let k = 0;
    metrics.forEach((m, i) => { if (m.top <= focus) k = i; });
    const cur = metrics[k];
    const next = metrics[k + 1] ?? cur;
    const u = Math.min(1, Math.max(0, (focus - cur.top) / cur.height));
    const t = next === cur ? 0 : smoothstep(HOLD, 1, u);
    world.director.setScroll(cur.chapter, next.chapter, t);
    const dominant = t < 0.5 ? cur : next;
    activate(dominant.chapter);
    if (dominant.chapter.id === 'learn') {
      const lu = dominant === cur ? Math.min(1, u / HOLD) : 0;
      const step = Math.min(LEARN_STEPS.length - 1, Math.floor(lu * LEARN_STEPS.length));
      world.learning.setStep(step);
      learnItems.forEach((li, i) => li.classList.toggle('is-active', i === step));
    }
  }

  /** Nhảy chương: gần thì cuộn mượt; xa thì chạy dải quét glitch và cắt cảnh dưới dải quét. */
  const scrollTo = (id) => {
    const m = metrics.find((x) => x.chapter.id === id);
    if (!m) return;
    const y = Math.max(0, m.top - window.innerHeight * 0.5 + m.height * 0.22);
    if (!lenis) {
      window.scrollTo(0, y);
      return;
    }
    if (Math.abs(y - window.scrollY) < window.innerHeight * JUMP_NEAR_VH) {
      lenis.scrollTo(y, { duration: 1.2 });
      return;
    }
    ui.transitions.wipe();
    setTimeout(() => lenis.scrollTo(y, { immediate: true }), JUMP_CUT_MS);
  };
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => scrollTo(b.dataset.goto)));
  sync();
  return { scrollTo, sync };
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

const STATS_EVERY_S = 0.3;
let statsAcc = 0;
const statEl = (k) => document.querySelector(`[data-stat="${k}"]`);
/** Số liệu trực tiếp trên thẻ của ba chương mở rộng. */
function sceneStats(world, dt) {
  statsAcc += dt;
  if (statsAcc < STATS_EVERY_S) return;
  statsAcc = 0;
  const lab = world.lab.stats();
  const office = world.office.stats();
  const street = world.street.stats();
  setText(statEl('lab-people'), String(lab.people));
  setText(statEl('lab-violations'), String(lab.violations));
  setText(statEl('office-flags'), String(office.flags));
  setText(statEl('office-kw'), `${num(office.wasteKw, 2)} kW`);
  setText(statEl('street-lit'), `${street.lit}/${street.total}`);
  setText(statEl('street-saving'), `${num(street.saving * 100, 0)} %`);
  setText(statEl('street-violations'), String(street.violations));
}

function startLoop(world, ui, scroll) {
  let last = performance.now();
  world.stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    world.people.update(dt);
    scroll.sync();
    world.director.update(dt);
    const state = world.engine.getState();
    const compare = ui.sandbox.compare;
    world.room.update(state, dt, { compare });
    const occupied = state.inputs.zoneCounts.some((n) => n > 0);
    world.building.update(dt, { occupied });
    world.sun.update(state, dt);
    world.lab.update(dt);
    world.office.update(dt);
    world.street.update(dt);
    sceneStats(world, dt);
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

const nextFrames = (n) => new Promise((resolve) => {
  let left = n;
  const tick = () => {
    left -= 1;
    if (left <= 0) resolve();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(resolve, 1500); // tab ở nền: rAF bị dừng, không chờ mãi
});
const fontsReady = () => Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => { setTimeout(r, 2500); })]);

async function boot() {
  const bootScreen = createBoot(document.getElementById('boot'), { reducedMotion });
  if (!hasWebGL()) {
    document.body.classList.add('no-webgl');
    bootScreen.finish();
    return;
  }
  const safety = setTimeout(() => bootScreen.finish(), bootScreen.maxWaitMs);
  bootScreen.step('Khởi động bộ mô phỏng ARES', 10);
  const world = buildWorld();
  if (!reducedMotion) world.building.hideForBoot();
  bootScreen.step('Dựng tòa nhà 9 tầng và phòng P101', 42);
  const orbit = setupOrbit(world);
  const ui = {
    hud: createHud(document.getElementById('hud')),
    sandbox: createSandbox(document.getElementById('sandbox'), {
      engine: world.engine, people: world.people, director: world.director,
      camera: world.stage.camera, canvas: world.canvas, wasDrag: orbit.wasDrag,
    }),
    callouts: createCallouts(document.getElementById('callouts'), { camera: world.stage.camera, building: world.building }),
    transitions: createTransitions(document.getElementById('wipe'), { reducedMotion }),
  };
  world.people.setTarget(16, [1, 1, 1, 1], { instant: true });
  bootScreen.step('Camera CCTV-01, YOLO lớp người, ngưỡng 0,35', 58);
  setupInlineControls(world, ui);
  bootScreen.step('Bộ điều khiển đèn 4 vùng và điều hòa pre-cool', 70);
  const scroll = setupScroll(world, ui);
  const { scrollTo } = scroll;
  setupBuildingPointer(world, ui, scrollTo, orbit);
  bootScreen.step('Kênh MQTT ares/P101 (mô phỏng)', 80);
  startLoop(world, ui, scroll);
  if (import.meta.env.DEV) window.__ares = world;
  await fontsReady();
  bootScreen.step('Phông chữ và giao diện HUD', 90);
  await nextFrames(4);
  bootScreen.step('Kết xuất khung hình đầu tiên', 97);
  await bootScreen.finish();
  clearTimeout(safety);
  if (!reducedMotion) world.building.materialize();
  document.body.classList.add('is-ready');
}

boot();
