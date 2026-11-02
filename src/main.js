import './styles/tokens.css';
import './styles/base.css';
import './styles/story.css';
import './styles/panels.css';
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
import { createEngine } from './sim/engine.js';
import { CHAPTERS } from './story/chapters.js';
import { createDirector } from './story/director.js';
import { createHud } from './ui/hud.js';
import { createSandbox } from './ui/sandbox.js';
import { renderPrecoolChart } from './ui/precoolChart.js';

gsap.registerPlugin(ScrollTrigger);
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
  const engine = createEngine();
  const layers = {
    building: building.layer, room: room.layer, people: people.layer, vision: vision.layer,
    zones: zones.zones, buffers: zones.buffers, hvac: hvac.layer, learning: learning.layer, network: network.layer,
  };
  const director = createDirector({ camera, layers, engine, people, reducedMotion });
  return { canvas, stage, room, building, people, vision, zones, hvac, learning, network, engine, director };
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
    document.body.dataset.chapter = chapter.id;
    railButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.goto === chapter.id)));
  };

  document.querySelectorAll('[data-chapter]').forEach((section) => {
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
    const el = document.querySelector(`[data-chapter="${id}"]`);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
    else el.scrollIntoView();
  };
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => scrollTo(b.dataset.goto)));
  activate(CHAPTERS[0]);
}

function setupInlineControls(world) {
  const sky = document.getElementById('lightSky');
  const skyOut = document.getElementById('lightSkyOut');
  sky?.addEventListener('input', () => {
    const v = Number(sky.value) / 100;
    world.engine.setInputs({ sky: v });
    skyOut.textContent = `${Math.round(world.engine.getState().outdoorLux / 1000)} nghìn lux ngoài trời`;
  });
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
    world.building.update(dt);
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
  const ui = {
    hud: createHud(document.getElementById('hud')),
    sandbox: createSandbox(document.getElementById('sandbox'), {
      engine: world.engine, people: world.people, director: world.director,
      camera: world.stage.camera, canvas: world.canvas,
    }),
  };
  world.people.setTarget(16, [1, 1, 1, 1], { instant: true });
  setupInlineControls(world);
  setupScroll(world, ui);
  startLoop(world, ui);
  if (import.meta.env.DEV) window.__ares = world;
  setTimeout(() => document.body.classList.add('is-ready'), 60);
}

boot();
