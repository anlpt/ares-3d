// Hiệu ứng "dựng hologram": một mặt quét lưới xanh ngọc chạy qua vật thể, phía sau mặt quét mới hiện hình.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { PALETTE } from './palette.js';

const OPEN = 1e4; // hằng số mặt cắt khi không quét: mọi thứ đều hiện
const SHEET_PEAK = 0.22;

function gridTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(95,230,226,0.25)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(160,255,250,1)';
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, 0, 2, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * @param {{group:THREE.Group, clip:Function, mix:number}} layer
 * @param {{axis:'x'|'y', from:number, to:number, size:[number, number], center:[number, number, number]}} opts
 */
export function createScan(layer, { axis, from, to, size, center }) {
  const normal = axis === 'y' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-1, 0, 0);
  const plane = new THREE.Plane(normal, OPEN);
  layer.clip([plane]);

  const tex = gridTexture();
  tex.repeat.set(size[0] / 1.2, size[1] / 1.2);
  const sheetMat = new THREE.MeshBasicMaterial({
    map: tex, color: PALETTE.holo, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), sheetMat);
  const edgeMat = new THREE.LineBasicMaterial({
    color: PALETTE.holo.clone().multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false,
  });
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(size[0], size[1])), edgeMat);
  sheet.add(edge);
  if (axis === 'y') sheet.rotation.x = -Math.PI / 2;
  else sheet.rotation.y = Math.PI / 2;
  sheet.position.set(...center);
  sheet.visible = false;
  layer.group.add(sheet);

  const state = { v: OPEN };
  const place = (v) => {
    plane.constant = v;
    if (axis === 'y') sheet.position.y = v;
    else sheet.position.x = v;
  };

  return {
    /** Quét từ `from` tới `to`; có thể gọi lại để chạy lại hiệu ứng. */
    play(duration = 2) {
      gsap.killTweensOf(state);
      state.v = from;
      place(from);
      sheet.visible = true;
      return gsap.to(state, {
        v: to,
        duration,
        ease: 'power2.inOut',
        onUpdate() {
          place(state.v);
          const k = Math.sin(Math.PI * this.progress()) * layer.mix;
          sheetMat.opacity = SHEET_PEAK * k;
          edgeMat.opacity = k;
        },
        onComplete() {
          place(OPEN);
          sheet.visible = false;
        },
      });
    },
    /** Ẩn toàn bộ vật thể (chờ quét). */
    hide() {
      gsap.killTweensOf(state);
      place(from);
    },
    reveal() {
      gsap.killTweensOf(state);
      place(OPEN);
      sheet.visible = false;
    },
  };
}
