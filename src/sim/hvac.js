import { clamp, deadbandPass, fanLevel, tLeadMinutes, tSetpoint } from './formulas.js';
import { currentSession, nextSession } from './schedule.js';

/** @typedef {{power:boolean, setpoint:number|null, fan:number, mode:string, lead:number, lastCmdAt:number, rCool:number, note:string}} HvacState */

/** @returns {HvacState} */
export const initialHvac = () => ({
  power: false, setpoint: null, fan: 1, mode: 'off', lead: 0, lastCmdAt: -1e9, rCool: 0.1, note: 'Chờ',
});

const off = (state, mode, lead, note) => ({ ...state, power: false, fan: 1, mode, lead, note });

/**
 * Một nhịp kế hoạch điều hòa (HvacController của ARES, bản rút gọn để minh họa).
 * @param {HvacState} state
 * @param {{minute:number, day?:number, tIn:number, tOut:number, rh:number, avg10:number,
 *   zoneCounts:number[], zoneCaps:number[], nMax:number, now:number}} input
 * @param {object} cfg CONFIG.hvac
 * @returns {HvacState}
 */
export function stepHvac(state, input, cfg) {
  const day = input.day ?? 2;
  const { minute, tIn, tOut, rh, avg10, zoneCounts, zoneCaps, nMax, now } = input;
  const lead = tLeadMinutes(tIn, tOut, state.rCool, cfg.tTarget, cfg.gamma, 30, 0.02, cfg.leadMaxMin);
  const session = currentSession(minute, day);
  const next = nextSession(minute, day);
  const untilNext = next ? next.start - minute : Infinity;

  if (avg10 >= cfg.occOnPeople) {
    const sp = tSetpoint(avg10, nMax, rh, zoneCounts, zoneCaps, cfg);
    const fan = fanLevel(avg10, nMax, sp.crowdedZones.length > 0, tIn, sp.integer, rh, cfg.rhHigh);
    const due = now - state.lastCmdAt >= cfg.minCmdIntervalS || !state.power;
    if (!state.power || (due && deadbandPass(sp.raw, state.setpoint, cfg.deadband))) {
      const prev = state.setpoint ?? sp.integer;
      const setpoint = clamp(sp.integer, prev - cfg.setpointMaxStep, prev + cfg.setpointMaxStep);
      return { ...state, power: true, setpoint, fan, mode: 'comfort', lead, lastCmdAt: now,
        note: `Có ${Math.round(avg10)} người, đặt ${setpoint} °C` };
    }
    return { ...state, power: true, fan, mode: 'comfort', lead, note: `Trong vùng chết ±${String(cfg.deadband).replace('.', ',')} °C, giữ lệnh` };
  }

  if (session && minute - session.start >= cfg.failsafeAfterMin && avg10 < cfg.failsafeEmptyAvg) {
    return off(state, 'failsafe', lead, `Vào lớp ${cfg.failsafeAfterMin} phút vẫn trống, tắt`);
  }

  if (untilNext <= lead) {
    return { ...state, power: true, setpoint: cfg.precoolSetpoint, fan: 3, mode: 'precool', lead,
      lastCmdAt: state.mode === 'precool' ? state.lastCmdAt : now,
      note: `Làm mát trước ${Math.round(lead)} phút cho ${next.name}` };
  }

  if (state.power && untilNext <= cfg.keepOnBeforeClassMin) {
    return { ...state, setpoint: cfg.precoolSetpoint, fan: 3, mode: 'keep', lead, note: 'Sắp vào lớp, giữ máy chạy' };
  }

  return off(state, 'off', lead, next ? `Chờ ${next.name}` : 'Hết lịch hôm nay');
}
