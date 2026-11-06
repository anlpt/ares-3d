// Khung nhận diện dùng chung cho các cảnh mở rộng: khung trắng = phát hiện bình thường, khung đỏ = vi phạm.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { makeLabelEl } from './layer.js';

export const ALERT = new THREE.Color('#ff4d5e');

/**
 * @param {{group:THREE.Group, fade:Function, label:Function}} layer
 * @param {number} max số khung tối đa
 */
export function createDetections(layer, max) {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const pool = Array.from({ length: max }, () => {
    const mat = layer.fade(new THREE.LineBasicMaterial({ color: PALETTE.vision, depthWrite: false }), 0.95);
    const box = new THREE.LineSegments(edges, mat);
    box.visible = false;
    const el = layer.label(makeLabelEl('det'));
    const label = new CSS2DObject(el);
    layer.group.add(box, label);
    return { box, mat, el, label, text: '', kind: '' };
  });
  let t = 0;

  return {
    /**
     * @param {Array<{pos:THREE.Vector3, size:[number, number, number], kind:'ok'|'bad', text:string}>} items
     * @param {number} dt
     */
    set(items, dt) {
      t += dt;
      const pulse = 0.65 + Math.sin(t * 7) * 0.35;
      pool.forEach((p, i) => {
        const it = items[i];
        const show = Boolean(it) && layer.group.visible;
        p.box.visible = show;
        p.label.visible = show;
        if (!show) return;
        p.box.position.copy(it.pos);
        p.box.position.y += it.size[1] / 2;
        p.box.scale.set(...it.size);
        p.label.position.set(it.pos.x, it.pos.y + it.size[1] + 0.25, it.pos.z);
        const bad = it.kind === 'bad';
        p.mat.color.copy(bad ? ALERT : PALETTE.vision).multiplyScalar(bad ? 0.8 + pulse * 0.6 : 1);
        if (p.text !== it.text || p.kind !== it.kind) {
          p.text = it.text;
          p.kind = it.kind;
          p.el.textContent = it.text;
          p.el.classList.toggle('is-alert', bad);
        }
      });
    },
  };
}
