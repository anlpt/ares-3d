// Vòng điều khiển ARES thu nhỏ: bộ đệm → đèn (15 s) + điều hòa (30 s) → vật lý phòng → điện năng.
// State là bất biến: mỗi tick trả về object mới, view chỉ đọc.
import { CONFIG } from './config.js';
import { initialZoneLight, stepZoneLight } from './lighting.js';
import { initialHvac, stepHvac } from './hvac.js';
import { inBaselineWindow } from './schedule.js';
import { acPowerKw, lightPowerKw, stepTemperature, zoneDaylight, outdoorLux } from './world.js';

const DEFAULT_INPUTS = Object.freeze({
  minute: 9 * 60,
  day: 2,
  sky: 0.7,
  tOut: 33,
  rh: 62,
  zoneCounts: [0, 0, 0, 0],
  cameraOk: true,
  clockRate: 0,
});

function initialState(inputs) {
  const zoneCount = CONFIG.room.zones.length;
  return {
    inputs,
    t: 0,
    occAvg: Array(zoneCount).fill(0),
    avg10: 0,
    roomEmptyFor: 999,
    zones: Array.from({ length: zoneCount }, initialZoneLight),
    hvac: initialHvac(),
    tIn: 29.5,
    tInBase: 29.5,
    daylight: Array(zoneCount).fill(0),
    outdoorLux: 0,
    power: { light: 0, ac: 0, lightBase: 0, acBase: 0 },
    energy: { ares: 0, baseline: 0 },
    nextLightAt: 0,
    nextHvacAt: 0,
  };
}

const expDecay = (avg, target, dt, tau) => avg + (target - avg) * (1 - Math.exp(-dt / tau));

function advanceClock(inputs, dt) {
  if (!inputs.clockRate) return inputs;
  const raw = inputs.minute + (dt / 60);
  if (raw < 1440) return { ...inputs, minute: raw };
  return { ...inputs, minute: raw - 1440, day: inputs.day >= 8 ? 2 : inputs.day + 1 };
}

function stepBuffers(s, inputs, dt) {
  // Mất camera trong giờ học: ARES coi mọi vùng có người (thà thừa điện còn hơn lớp tối).
  const presence = inputs.zoneCounts.map((n) => (inputs.cameraOk ? (n > 0 ? 1 : 0) : 1));
  const total = inputs.zoneCounts.reduce((a, b) => a + b, 0);
  const occAvg = s.occAvg.map((a, i) => expDecay(a, presence[i], dt, CONFIG.buffers.lightTauS));
  const avg10 = expDecay(s.avg10, total, dt, CONFIG.buffers.hvacTauS);
  return { occAvg, avg10, total };
}

function stepControllers(s, inputs, buffers) {
  const L = CONFIG.lighting;
  const daylight = zoneDaylight(inputs.minute, inputs.sky, CONFIG.room.zones, CONFIG.physics);
  let { zones, hvac, nextLightAt, nextHvacAt } = s;
  if (s.t >= nextLightAt) {
    zones = zones.map((z, i) => stepZoneLight(z, {
      occAvg: buffers.occAvg[i], count: inputs.zoneCounts[i], daylight: daylight[i],
      dt: L.intervalS, roomEmptyFor: s.roomEmptyFor,
    }, L));
    nextLightAt = s.t + L.intervalS;
  }
  if (s.t >= nextHvacAt) {
    hvac = stepHvac(hvac, {
      minute: inputs.minute, day: inputs.day, tIn: s.tIn, tOut: inputs.tOut, rh: inputs.rh,
      avg10: buffers.avg10, zoneCounts: inputs.zoneCounts,
      zoneCaps: CONFIG.room.zones.map((z) => z.capacity), nMax: CONFIG.room.nMax, now: s.t,
    }, CONFIG.hvac);
    nextHvacAt = s.t + CONFIG.hvac.intervalS;
  }
  return { zones, hvac, daylight, nextLightAt, nextHvacAt };
}

function stepPhysics(s, inputs, ctrl, total, dt) {
  const P = CONFIG.physics;
  const dtMin = dt / 60;
  const baseOn = inBaselineWindow(inputs.minute, inputs.day);
  const common = { tOut: inputs.tOut, people: total, minute: inputs.minute, sky: inputs.sky };
  const tIn = stepTemperature({ ...common, tIn: s.tIn, ...ctrl.hvac }, dtMin, P);
  const tInBase = stepTemperature({
    ...common, tIn: s.tInBase, power: baseOn, setpoint: P.baselineSetpoint, fan: 2,
  }, dtMin, P);
  const power = {
    light: lightPowerKw(ctrl.zones.map((z) => z.pwm), P),
    ac: acPowerKw(ctrl.hvac.power, s.tIn, ctrl.hvac.setpoint, ctrl.hvac.fan, P),
    lightBase: baseOn ? lightPowerKw(ctrl.zones.map(() => 100), P) : 0,
    acBase: acPowerKw(baseOn, s.tInBase, P.baselineSetpoint, 2, P),
  };
  const hours = dt / 3600;
  const energy = {
    ares: s.energy.ares + (power.light + power.ac) * hours,
    baseline: s.energy.baseline + (power.lightBase + power.acBase) * hours,
  };
  return { tIn, tInBase, power, energy };
}

/**
 * @param {Partial<typeof DEFAULT_INPUTS>} [initial]
 */
export function createEngine(initial = {}) {
  let state = initialState({ ...DEFAULT_INPUTS, ...initial });
  const listeners = new Set();

  const commit = (next) => {
    state = next;
    listeners.forEach((fn) => fn(state));
  };

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setInputs(partial) {
      commit({ ...state, inputs: { ...state.inputs, ...partial } });
    },
    /** Đổ đầy bộ đệm theo hiện trạng (dùng khi chuyển cảnh để khỏi chờ 10 phút mô phỏng). */
    prime({ tIn } = {}) {
      const { inputs } = state;
      const total = inputs.zoneCounts.reduce((a, b) => a + b, 0);
      commit({
        ...state,
        occAvg: inputs.zoneCounts.map((n) => (n > 0 ? 1 : 0)),
        avg10: total,
        roomEmptyFor: total > 0 ? 0 : 999,
        tIn: tIn ?? state.tIn,
        nextLightAt: state.t,
        nextHvacAt: state.t,
      });
    },
    resetEnergy() {
      commit({ ...state, energy: { ares: 0, baseline: 0 } });
    },
    /** @param {number} dt giây mô phỏng */
    tick(dt) {
      if (dt <= 0) return;
      const inputs = advanceClock(state.inputs, dt * state.inputs.clockRate);
      const buffers = stepBuffers(state, inputs, dt);
      const ctrl = stepControllers(state, inputs, buffers);
      const phys = stepPhysics(state, inputs, ctrl, buffers.total, dt);
      const anyOccupied = ctrl.zones.some((z) => z.occupied);
      commit({
        ...state,
        ...ctrl,
        ...phys,
        inputs,
        t: state.t + dt,
        occAvg: buffers.occAvg,
        avg10: buffers.avg10,
        roomEmptyFor: anyOccupied ? 0 : state.roomEmptyFor + dt,
        outdoorLux: outdoorLux(inputs.minute, inputs.sky, CONFIG.physics),
      });
    },
  };
}
