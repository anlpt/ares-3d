// Người trong phòng: đi từ cửa vào chỗ ngồi, đứng dậy ra về. Vị trí chân quyết định vùng (giống ARES).
import * as THREE from 'three';
import { PALETTE, ROOM } from './palette.js';
import { SEATS, DOOR, AISLE_X, zoneOf } from './layout.js';
import { createLayer } from './layer.js';

const WALK_SPEED = 2.4;
const SPAWN_GAP_S = 0.22;
const SEATED_DROP = 0.42;

function makeMesh(layer, bodyMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.78, 4, 10), bodyMat);
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), bodyMat);
  head.position.y = 1.28;
  g.add(body, head);
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
  const bodyMat = layer.fade(new THREE.MeshStandardMaterial({
    color: PALETTE.vision, roughness: 0.55, emissive: PALETTE.vision, emissiveIntensity: 0.08,
  }));
  scene.add(layer.group);

  /** @type {Array<{id:number, mesh:THREE.Group, pos:THREE.Vector3, path:THREE.Vector3[], seat:object, mode:string, conf:number, wait:number}>} */
  let agents = [];
  let nextId = 1;

  const occupiedSeatIds = () => new Set(agents.filter((a) => a.mode !== 'leaving').map((a) => a.seat.id));

  function spawn(seat, { instant = false, wait = 0 } = {}) {
    const mesh = makeMesh(layer, bodyMat);
    const pos = instant ? new THREE.Vector3(seat.x, 0, seat.z) : new THREE.Vector3(DOOR.x, 0, DOOR.z);
    mesh.position.copy(pos);
    mesh.visible = instant || wait <= 0;
    const agent = {
      id: nextId, mesh, pos, seat, conf: 0.9, wait,
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
    if (a.path.length > 0) {
      const target = a.path[0];
      const delta = target.clone().sub(a.pos);
      const dist = delta.length();
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        a.pos.copy(target);
        a.path = a.path.slice(1);
      } else {
        a.pos.addScaledVector(delta.normalize(), step);
        a.mesh.rotation.y = Math.atan2(delta.x, delta.z);
      }
    } else if (a.mode === 'walking') {
      a.mode = 'seated';
    }
    const seated = a.mode === 'seated';
    const bob = seated ? 0 : Math.abs(Math.sin(performance.now() * 0.012 + a.id)) * 0.05;
    a.mesh.position.set(a.pos.x, (seated ? -SEATED_DROP : 0) + bob, a.pos.z);
    if (seated) a.mesh.rotation.y = Math.PI;
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
      const agent = agents.find((a) => a.mode !== 'leaving' && a.mesh.children.includes(object));
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
    meshes: () => agents.filter((a) => a.mode !== 'leaving').flatMap((a) => a.mesh.children),
    count: () => agents.filter((a) => a.mode !== 'leaving').length,
  };
}
