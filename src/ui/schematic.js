// Sơ đồ isometric thu nhỏ của tòa nhà (SVG): mỗi ô là một phòng, có người thì tô hổ phách, tầng đang rê sáng lên.
const SVG_NS = 'http://www.w3.org/2000/svg';
const U = 46; // px cho bề ngang một phòng
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

const iso = (gx, gy, gz) => [(gx - gz) * COS * U, (gx + gz) * SIN * U - gy * U];
const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

/**
 * @param {SVGSVGElement} svg
 * @param {{cols:number, floors:number, cellH:number, depth:number}} dims kích thước tương đối theo bề ngang phòng
 */
export function createSchematic(svg, { cols, floors, cellH, depth }) {
  const top = floors * cellH;
  const cells = [];
  const floorsG = Array.from({ length: floors }, (_, f) => {
    const g = el('g', { class: 'sc-floor' });
    svg.appendChild(g);
    return g;
  });

  const plate = el('polygon', {
    class: 'sc-plate',
    points: poly([iso(-0.35, 0, -0.35), iso(cols + 0.35, 0, -0.35), iso(cols + 0.35, 0, depth + 0.35), iso(-0.35, 0, depth + 0.35)]),
  });
  svg.insertBefore(plate, svg.firstChild);

  for (let f = 0; f < floors; f += 1) {
    const y0 = f * cellH;
    const y1 = y0 + cellH;
    for (let c = 0; c < cols; c += 1) {
      const face = el('polygon', { class: 'sc-cell', points: poly([iso(c, y0, 0), iso(c + 1, y0, 0), iso(c + 1, y1, 0), iso(c, y1, 0)]) });
      floorsG[f].appendChild(face);
      cells.push({ c, f, face });
    }
    floorsG[f].appendChild(el('polygon', {
      class: 'sc-side', points: poly([iso(cols, y0, 0), iso(cols, y0, depth), iso(cols, y1, depth), iso(cols, y1, 0)]),
    }));
  }
  svg.appendChild(el('polygon', {
    class: 'sc-top', points: poly([iso(0, top, 0), iso(cols, top, 0), iso(cols, top, depth), iso(0, top, depth)]),
  }));

  const pts = [iso(-0.35, 0, -0.35), iso(cols + 0.35, 0, depth + 0.35), iso(0, top, 0), iso(cols, top, depth), iso(cols + 0.35, 0, -0.35), iso(-0.35, 0, depth + 0.35)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 6;
  svg.setAttribute('viewBox', `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`);

  return {
    /** @param {Array<{c:number, f:number, lit:boolean}>} states @param {number} hoverFloor */
    update(states, hoverFloor) {
      states.forEach((s) => {
        const cell = cells.find((x) => x.c === s.c && x.f === s.f);
        cell?.face.classList.toggle('is-lit', s.lit);
      });
      floorsG.forEach((g, f) => g.classList.toggle('is-hover', f === hoverFloor));
    },
  };
}
