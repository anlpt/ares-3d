import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';

const MAX_PIXEL_RATIO = 1.75;

/** Nền trời đêm: xanh thẫm ở trên, sáng dần về đường chân trời như ánh đèn thành phố. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#03070f');
  g.addColorStop(0.55, '#081426');
  g.addColorStop(0.8, '#0f2238');
  g.addColorStop(1, '#060c17');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Renderer + camera + hậu kỳ bloom + lớp nhãn CSS2D.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} labelRoot
 */
export function createStage(canvas, labelRoot) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.night, 95, 360);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700);
  camera.position.set(48, 14, 78);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const labels = new CSS2DRenderer({ element: labelRoot });

  const hemi = new THREE.HemisphereLight('#9fb4d6', '#0b0e14', 0.35);
  scene.add(hemi);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    bloom,
    hemi,
    render() {
      composer.render();
      labels.render(scene, camera);
    },
  };
}
