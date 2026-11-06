// Đoạn phố trước tòa nhà về đêm: đèn đường thông minh (sáng theo người/xe), đèn giao thông và camera
// gắn cờ vi phạm. Nhận diện xe, mũ bảo hiểm, làn đường là GÓI MỞ RỘNG ĐỀ XUẤT, cảnh là minh họa.
import * as THREE from 'three';
import { createLayer, radialTexture, damp } from './layer.js';
import { buildPerson, posePerson } from './person.js';
import { createDetections } from './detect.js';

export const STREET_Z = 66;
const HALF = 70;
const LANE_E = STREET_Z - 3; // làn đi về +x
const LANE_W = STREET_Z + 3; // làn đi về -x
const STOP_E = -5;
const STOP_W = 5;
const LIGHT_XS = [-48, -36, -24, -12, 0, 12, 24, 36, 48];
const LIGHT_BASE = 0.2;
const LIGHT_RANGE = 8;
const LAMP_KW = 0.15;
const CYCLE = { green: 7, yellow: 2, red: 9 };

function signal(t) {
  const c = CYCLE.green + CYCLE.yellow + CYCLE.red;
  const k = t % c;
  const east = k < CYCLE.green ? 'green' : k < CYCLE.green + CYCLE.yellow ? 'yellow' : 'red';
  const west = east === 'red' ? (k < CYCLE.green + CYCLE.yellow + CYCLE.red - CYCLE.yellow ? 'green' : 'yellow') : 'red';
  return { east, west };
}

function buildRoad(layer) {
  const basic = (color, op = 1) => layer.fade(new THREE.MeshBasicMaterial({ color }), op);
  const plane = (mat, w, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    layer.group.add(m);
    return m;
  };
  const y0 = -0.28;
  plane(layer.fade(new THREE.MeshStandardMaterial({ color: '#1a1e24', roughness: 0.9 }), 1), HALF * 2, 12, 0, y0, STREET_Z);
  [STREET_Z - 7.8, STREET_Z + 7.8].forEach((z) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.18, 3.6), layer.fade(new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.9 }), 1));
    curb.position.set(0, y0 + 0.09, z);
    layer.group.add(curb);
  });
  const white = basic('#d9dde2', 0.85);
  for (let x = -HALF; x < HALF; x += 6) plane(white, 3, 0.15, x + 1.5, y0 + 0.01, STREET_Z);
  for (let x = -2.6; x <= 2.6; x += 1.3) plane(white, 0.7, 11, x, y0 + 0.012, STREET_Z);
  plane(white, 0.3, 6, STOP_E, y0 + 0.012, LANE_E);
  plane(white, 0.3, 6, STOP_W, y0 + 0.012, LANE_W);
  plane(basic('#f2c230', 0.9), 12, 0.18, 21, y0 + 0.012, STREET_Z - 5.8);
  return y0;
}

function buildTrafficLights(layer, y0) {
  const heads = [[STOP_E - 1, STREET_Z - 6.5, 'east'], [STOP_W + 1, STREET_Z + 6.5, 'west']].map(([x, z, dir]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), layer.fade(new THREE.MeshBasicMaterial({ color: '#2a323c' }), 1));
    pole.position.set(x, y0 + 2.1, z);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.05, 0.35), layer.fade(new THREE.MeshBasicMaterial({ color: '#11161c' }), 1));
    housing.position.set(x, y0 + 4.3, z);
    layer.group.add(pole, housing);
    const lamps = ['red', 'yellow', 'green'].map((c, i) => {
      const m = layer.fade(new THREE.MeshBasicMaterial({ color: '#222' }), 1);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), m);
      s.position.set(x, y0 + 4.62 - i * 0.32, z + (dir === 'east' ? 0.18 : -0.18));
      layer.group.add(s);
      return { c, m };
    });
    return { dir, lamps };
  });
  const ON = { red: new THREE.Color('#ff3b3b').multiplyScalar(2.4), yellow: new THREE.Color('#ffc23b').multiplyScalar(2.2), green: new THREE.Color('#3bff8a').multiplyScalar(2.2) };
  const OFF = new THREE.Color('#2a2a2a');
  return (sig) => heads.forEach((h) => h.lamps.forEach((l) => l.m.color.copy(sig[h.dir] === l.c ? ON[l.c] : OFF)));
}

function buildStreetLights(layer, y0) {
  const poolTex = radialTexture(128, 'rgba(255,224,170,1)', 'rgba(255,224,170,0)');
  const poleMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#28303a' }), 1);
  return LIGHT_XS.flatMap((x) => [STREET_Z - 7.2, STREET_Z + 7.2].map((z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), poleMat);
    pole.position.set(x, y0 + 3, z);
    const armDir = z < STREET_Z ? 1 : -1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), poleMat);
    arm.position.set(x, y0 + 5.95, z + armDir * 0.8);
    const headMat = layer.fade(new THREE.MeshBasicMaterial({ color: '#ffe0aa' }), 1);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.35), headMat);
    head.position.set(x, y0 + 5.9, z + armDir * 1.55);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y0 + 0.03, z + armDir * 2.2);
    layer.group.add(pole, arm, head, pool);
    return { x, headMat, poolMat, level: LIGHT_BASE };
  }));
}

function buildCar(layer, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.75, 1.8), layer.fade(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 }), 1));
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 1.6), layer.fade(new THREE.MeshStandardMaterial({ color: '#1c2530', roughness: 0.2 }), 1));
  cabin.position.set(-0.2, 1.2, 0);
  const head = layer.fade(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(2) }), 1);
  const tail = layer.fade(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b3b').multiplyScalar(1.6) }), 1);
  [-0.6, 0.6].forEach((z) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.35), head);
    h.position.set(2.06, 0.6, z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.35), tail);
    t.position.set(-2.06, 0.65, z);
    g.add(h, t);
  });
  g.add(body, cabin);
  return { g, size: [4.3, 1.7, 2] };
}

function buildMoto(layer, seed, helmet) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.35), layer.fade(new THREE.MeshStandardMaterial({ color: '#2f3a48', roughness: 0.5 }), 1));
  frame.position.y = 0.45;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.2), layer.fade(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(2) }), 1));
  lamp.position.set(0.88, 0.62, 0);
  const rider = buildPerson(seed, (m) => layer.fade(m, 1), { helmet: helmet ? '#d9dde2' : null });
  rider.rotation.y = Math.PI / 2;
  rider.position.set(-0.15, 0.25, 0);
  posePerson(rider, 1, 0, false);
  g.add(frame, lamp, rider);
  return { g, size: [1.9, 1.8, 0.8] };
}

/**
 * Xe: lane (z), dir (+1/-1), speed, vi phạm (redlight | wrongway | nohelmet | sidewalk | parked).
 */
const TRAFFIC = [
  { type: 'car', color: '#c9ced6', x: -40, z: LANE_E, dir: 1, speed: 9 },
  { type: 'car', color: '#8a2f3a', x: 10, z: LANE_E, dir: 1, speed: 9 },
  { type: 'car', color: '#2f5f8f', x: 30, z: LANE_W, dir: -1, speed: 10 },
  { type: 'moto', helmet: true, x: -10, z: LANE_W, dir: -1, speed: 8 },
  { type: 'car', color: '#d9b25b', x: -62, z: LANE_E, dir: 1, speed: 11, issue: 'redlight' },
  { type: 'moto', helmet: true, x: 40, z: LANE_E + 1.6, dir: -1, speed: 7, issue: 'wrongway' },
  { type: 'moto', helmet: false, x: -25, z: LANE_E - 1.4, dir: 1, speed: 8, issue: 'nohelmet' },
  { type: 'moto', helmet: true, x: -50, z: STREET_Z + 7.6, dir: 1, speed: 5, issue: 'sidewalk' },
  { type: 'car', color: '#4f7d5c', x: 21, z: STREET_Z - 4.9, dir: 1, speed: 0, issue: 'parked' },
];
const ISSUE_TEXT = {
  redlight: 'Vượt đèn đỏ', wrongway: 'Đi ngược chiều', nohelmet: 'Không đội mũ bảo hiểm', sidewalk: 'Chạy xe trên vỉa hè', parked: 'Đỗ xe sai chỗ',
};

/** @param {THREE.Scene} scene */
export function createStreet(scene) {
  const layer = createLayer('street');
  const y0 = buildRoad(layer);
  const setSignals = buildTrafficLights(layer, y0);
  const lamps = buildStreetLights(layer, y0);
  const vehicles = TRAFFIC.map((v, i) => {
    const built = v.type === 'car' ? buildCar(layer, v.color) : buildMoto(layer, 90 + i * 7, v.helmet);
    built.g.position.set(v.x, y0, v.z);
    built.g.rotation.y = v.dir > 0 ? 0 : Math.PI;
    layer.group.add(built.g);
    return { ...v, g: built.g, size: built.size, flaggedFor: 0, parkedS: 260 };
  });
  const walkers = [[-30, STREET_Z - 8.2, 1], [8, STREET_Z + 8.4, -1], [26, STREET_Z - 8.6, -1], [-14, STREET_Z + 8.0, 1]].map(([x, z, dir], i) => {
    const p = buildPerson(140 + i * 9, (m) => layer.fade(m, 1));
    p.position.set(x, y0 + 0.18, z);
    p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    layer.group.add(p);
    return { p, dir, phase: i };
  });
  const detections = createDetections(layer, vehicles.length + walkers.length);
  const fill = new THREE.HemisphereLight('#8fa6c8', '#0b0e14', 0);
  layer.group.add(fill);
  scene.add(layer.group);

  let t = 0;
  const stats = { lit: 0, total: lamps.length, saving: 0, violations: {} };
  const wrap = (x) => (x > HALF ? -HALF : x < -HALF ? HALF : x);

  function moveVehicle(v, sig, dt) {
    if (v.issue === 'parked') {
      v.parkedS += dt * 6;
      return;
    }
    const light = v.dir > 0 ? sig.east : sig.west;
    const stopX = v.dir > 0 ? STOP_E : STOP_W;
    const before = (stopX - v.g.position.x) * v.dir;
    const obeys = v.issue !== 'redlight' && v.issue !== 'wrongway' && v.issue !== 'sidewalk';
    const blocked = obeys && light !== 'green' && before > 0.5 && before < 9;
    const ahead = vehicles.some((o) => o !== v && o.z === v.z && o.dir === v.dir && (o.g.position.x - v.g.position.x) * v.dir > 0 && (o.g.position.x - v.g.position.x) * v.dir < 6);
    const target = blocked || (ahead && obeys) ? 0 : v.speed;
    // eslint-disable-next-line no-param-reassign -- trạng thái chuyển động của xe trong cảnh
    v.cur = damp(v.cur ?? v.speed, target, 3, dt);
    const nx = v.g.position.x + v.dir * v.cur * dt;
    if (v.issue === 'redlight' && light === 'red' && before > 0 && (stopX - nx) * v.dir <= 0) v.flaggedFor = 4;
    v.g.position.x = wrap(nx);
    // eslint-disable-next-line no-param-reassign
    v.flaggedFor = Math.max(0, v.flaggedFor - dt);
  }

  return {
    layer,
    update(dt) {
      fill.intensity = 0.7 * layer.mix;
      if (!layer.group.visible) return;
      t += dt;
      const sig = signal(t);
      setSignals(sig);
      vehicles.forEach((v) => moveVehicle(v, sig, dt));
      walkers.forEach((w) => {
        w.p.position.x = wrap(w.p.position.x + w.dir * 1.3 * dt);
        w.phase += dt * 8;
        posePerson(w.p, 0, w.phase, true);
      });

      const xs = [...vehicles.map((v) => v.g.position.x), ...walkers.map((w) => w.p.position.x)];
      let sum = 0;
      lamps.forEach((l) => {
        const near = xs.some((x) => Math.abs(x - l.x) < LIGHT_RANGE);
        l.level = damp(l.level, near ? 1 : LIGHT_BASE, 2.5, dt);
        l.headMat.color.setRGB(0.4 + l.level * 1.6, 0.36 + l.level * 1.4, 0.3 + l.level * 1.1);
        l.poolMat.opacity = 0.5 * l.level * layer.mix;
        sum += l.level;
      });
      stats.lit = lamps.filter((l) => l.level > 0.8).length;
      stats.saving = 1 - (sum * LAMP_KW) / (lamps.length * LAMP_KW);

      const items = vehicles.map((v) => {
        const active = v.issue && v.issue !== 'redlight' ? true : v.flaggedFor > 0;
        let text = v.type === 'car' ? 'ô tô' : 'xe máy';
        if (active) text = `VI PHẠM: ${ISSUE_TEXT[v.issue]}${v.issue === 'parked' ? ` ${Math.floor(v.parkedS / 60)} phút` : ''}`;
        return { pos: v.g.position, size: v.size, kind: active ? 'bad' : 'ok', text };
      });
      walkers.forEach((w) => items.push({ pos: w.p.position, size: [0.7, 1.75, 0.6], kind: 'ok', text: 'người đi bộ' }));
      stats.violations = items.filter((it) => it.kind === 'bad').length;
      detections.set(items, dt);
    },
    stats: () => stats,
  };
}
