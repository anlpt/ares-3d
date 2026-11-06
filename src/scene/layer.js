import * as THREE from 'three';

/**
 * Một lớp cảnh có thể hiện/ẩn mượt: mọi vật liệu đăng ký sẽ nhân opacity với `mix`.
 * @param {string} name
 */
export function createLayer(name) {
  const group = new THREE.Group();
  group.name = name;
  const faders = [];
  const labelEls = [];
  let mix = 0;
  group.visible = false;

  return {
    group,
    get mix() {
      return mix;
    },
    /** Đăng ký vật liệu; opacity gốc được nhớ để nhân với mix. */
    fade(material, baseOpacity = material.opacity ?? 1) {
      material.transparent = true;
      faders.push({ material, baseOpacity });
      return material;
    },
    label(el) {
      labelEls.push(el);
      return el;
    },
    /** Gắn mặt cắt cho mọi vật liệu đã đăng ký (dùng cho hiệu ứng quét hologram). */
    clip(planes) {
      faders.forEach(({ material }) => {
        // eslint-disable-next-line no-param-reassign -- vật liệu three.js là đối tượng có trạng thái
        material.clippingPlanes = planes;
      });
    },
    setMix(v) {
      mix = v;
      group.visible = v > 0.005;
      faders.forEach(({ material, baseOpacity }) => {
        material.opacity = baseOpacity * v;
      });
      labelEls.forEach((el) => {
        el.style.opacity = String(v);
      });
    },
  };
}

/** Texture vệt sáng tròn (dùng cho vũng sáng trên sàn, quầng đèn). */
export function radialTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Nhãn HTML gắn vào cảnh 3D. */
export function makeLabelEl(className, html = '') {
  const el = document.createElement('div');
  el.className = `scene-label ${className}`;
  el.innerHTML = html;
  return el;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
