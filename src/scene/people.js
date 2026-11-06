// Người trong phòng: đi từ cửa vào chỗ ngồi, đứng dậy ra về. Vị trí chân quyết định vùng (giống ARES).
import * as THREE from 'three';
import { ROOM } from './palette.js';
import { SEATS, DOOR, AISLE_X, zoneOf } from './layout.js';
import { createLayer } from './layer.js';
import { buildPerson, posePerson, SEAT_DROP } from './person.js';

const WALK_SPEED = 2.4;
const SPAWN_GAP_S = 0.22;
const STRIDE_RATE = 9;
const TURN_RATE = 9;
const SIT_RATE = 6;

/** Xoay mượt về hướng đích theo đường ngắn nhất (tránh quay 359°). */
function dampAngle(from, to, rate, dt) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * (1 - Math.exp(-rate * dt));
}

function makeMesh(layer, seed) {
  const g = buildPerson(seed, (m) => layer.fade(m, 1));
  layer.group.add(g);
  return g;
}

/** Thứ tự ưu tiên chỗ ngồi theo trọng số vùng (ổn định với cùng seed). */
function rankSeats(weights, seed) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return SEATS
    .map((seat) => ({ seat, score: (weights[seat.zone] ?? 1) * (0.25 + rand()) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.seat);
}

const pathIn = (seat) => [
  new THREE.Vector3(AISLE_X, 0, DOOR.z),
  new THREE.Vector3(AISLE_X, 0, seat.z),
  new THREE.Vector3(seat.x, 0, seat.z),
];

/** @param {THREE.Scene} scene */
export function createPeople(scene) {
  const layer = createLayer('people');
  scene.add(layer.group);

  /** @type {Array<{id:number, mesh:THREE.Group, pos:THREE.Vector3, path:THREE.Vector3[], seat:object, mode:string, conf:number, wait:number}>} */
  let agents = [];
  let nextId = 1;

  const occupiedSeatIds = () => new Set(agents.filter((a) => a.mode !== 'leaving').map((a) => a.seat.id));

  function spawn(seat, { instant = false, wait = 0 } = {}) {
    const mesh = makeMesh(layer, nextId * 13 + seat.id);
    const pos = instant ? new THREE.Vector3(seat.x, 0, seat.z) : new THREE.Vector3(DOOR.x, 0, DOOR.z);
    mesh.position.copy(pos);
    mesh.visible = instant || wait <= 0;
    const agent = {
      id: nextId, mesh, pos, seat, conf: 0.9, wait, heading: Math.PI, sit: instant ? 1 : 0, phase: 0,
      path: instant ? [] : pathIn(seat), mode: instant ? 'seated' : 'walking',
    };
    nextId += 1;
    agents = [...agents, agent];
  }

  function leave(agent) {
    agent.mode = 'leaving';
    agent.path = [new THREE.Vector3(AISLE_X, 0, agent.pos.z), new THREE.Vector3(AISLE_X, 0, DOOR.z),
      new THREE.Vector3(DOOR.x, 0, DOOR.z)];
  }

  function stepAgent(a, dt) {
    if (a.wait > 0) {
      a.wait -= dt;
      a.mesh.visible = a.wait <= 0;
      return;
    }
    const walking = a.path.length > 0;
    if (walking) {
      a.phase += STRIDE_RATE * dt;
      const target = a.path[0];
      const delta = target.clone().sub(a.pos);
      const dist = delta.length();
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        a.pos.copy(target);
        a.path = a.path.slice(1);
      } else {
        a.pos.addScaledVector(delta.normalize(), step);
        a.heading = dampAngle(a.heading, Math.atan2(delta.x, delta.z), TURN_RATE, dt);
      }
    } else if (a.mode === 'walking') {
      a.mode = 'seated';
    }
    const seated = a.mode === 'seated';
    a.sit += ((seated ? 1 : 0) - a.sit) * (1 - Math.exp(-SIT_RATE * dt));
    if (seated) a.heading = dampAngle(a.heading, Math.PI, TURN_RATE, dt);
    const bob = walking ? (1 - a.sit) * Math.abs(Math.sin(a.phase)) * 0.035 : 0;
    a.mesh.position.set(a.pos.x, -SEAT_DROP * a.sit + bob, a.pos.z);
    a.mesh.rotation.y = a.heading;
    posePerson(a.mesh, a.sit, a.phase, walking);
  }

  return {
    layer,
    /** Đưa số người về n, ưu tiên các vùng theo `weights`. */
    setTarget(n, weights = [1, 1, 1, 1], { instant = false, seed = 11 } = {}) {
      const wanted = rankSeats(weights, seed).slice(0, n);
      const wantedIds = new Set(wanted.map((s) => s.id));
      if (instant) {
        agents.forEach((a) => layer.group.remove(a.mesh));
        agents = [];
        wanted.forEach((seat) => spawn(seat, { instant: true }));
        return;
      }
      agents.filter((a) => a.mode !== 'leaving' && !wantedIds.has(a.seat.id)).forEach(leave);
      const taken = occupiedSeatIds();
      wanted.filter((s) => !taken.has(s.id)).forEach((seat, i) => spawn(seat, { wait: i * SPAWN_GAP_S }));
    },
    /** Thêm một người vào chỗ trống gần điểm bấm nhất. */
    addNear(point) {
      const taken = occupiedSeatIds();
      const free = SEATS.filter((s) => !taken.has(s.id));
      if (free.length === 0) return false;
      const best = free.reduce((a, b) => (Math.hypot(a.x - point.x, a.z - point.z) < Math.hypot(b.x - point.x, b.z - point.z) ? a : b));
      spawn(best);
      return true;
    },
    removeByMesh(object) {
      let root = object;
      while (root && !agents.some((a) => a.mesh === root)) root = root.parent;
      const agent = agents.find((a) => a.mode !== 'leaving' && a.mesh === root);
      if (agent) leave(agent);
      return Boolean(agent);
    },
    update(dt) {
      agents.forEach((a) => stepAgent(a, dt));
      const gone = agents.filter((a) => a.mode === 'leaving' && a.path.length === 0);
      if (gone.length > 0) {
        gone.forEach((a) => layer.group.remove(a.mesh));
        agents = agents.filter((a) => !gone.includes(a));
      }
    },
    /** Số người theo vùng — chỉ đếm người đã vào trong phòng và đã hiện ra. */
    zoneCounts() {
      return agents.reduce((acc, a) => {
        const inside = a.mesh.visible && a.pos.x < ROOM.w / 2 - 0.1;
        if (!inside) return acc;
        const z = zoneOf(a.pos.x, a.pos.z);
        return acc.map((v, i) => (i === z ? v + 1 : v));
      }, [0, 0, 0, 0]);
    },
    agents: () => agents,
    meshes: () => agents.filter((a) => a.mode !== 'leaving').flatMap((a) => {
      const list = [];
      a.mesh.traverse((o) => { if (o.isMesh) list.push(o); });
      return list;
    }),
    count: () => agents.filter((a) => a.mode !== 'leaving').length,
  };
}
