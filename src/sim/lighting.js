import { clamp, luxSetpoint, pwmUpdate } from './formulas.js';

/** @typedef {{pwm:number, occupied:boolean, onset:boolean, emptyFor:number, setpoint:number, actual:number, note:string}} ZoneLight */

/** @returns {ZoneLight} */
export const initialZoneLight = () => ({
  pwm: 0, occupied: false, onset: false, emptyFor: 999, setpoint: 100, actual: 0, note: 'Chưa có dữ liệu',
});

/**
 * Một nhịp điều khiển đèn cho một vùng (LightingController của ARES, có lớp chống bật/tắt).
 * @param {ZoneLight} zone
 * @param {{occAvg:number, count:number, daylight:number, dt:number, roomEmptyFor:number}} input
 * @param {object} cfg CONFIG.lighting
 * @returns {ZoneLight}
 */
export function stepZoneLight(zone, input, cfg) {
  const { occAvg, count, daylight, dt, roomEmptyFor } = input;
  const becameOccupied = !zone.occupied && occAvg >= cfg.occOnThreshold;
  const occupied = zone.occupied ? occAvg >= cfg.occOffThreshold : becameOccupied;
  const emptyFor = occupied ? 0 : zone.occupied ? dt : zone.emptyFor + dt;
  const actual = daylight + (zone.pwm / 100) * cfg.dlMax;

  if (occupied) {
    const setpoint = luxSetpoint(count, true, cfg);
    const e = setpoint - actual;
    if (!becameOccupied && Math.abs(e) <= cfg.luxDeadband) {
      return { ...zone, occupied, onset: false, emptyFor, setpoint, actual, note: 'Đủ sáng, giữ nguyên' };
    }
    const kp = becameOccupied ? cfg.kpOnset : cfg.kp;
    const next = pwmUpdate(zone.pwm, setpoint, actual, kp, cfg.dlMax, 0);
    const pwm = becameOccupied ? next : clamp(next, zone.pwm - cfg.pwmMaxStep, zone.pwm + cfg.pwmMaxStep);
    const note = becameOccupied ? 'Vừa có người, lên đèn' : e < 0 ? 'Nắng đủ, giảm đèn' : 'Bù phần còn thiếu';
    return { pwm, occupied, onset: becameOccupied, emptyFor, setpoint, actual, note };
  }

  if (roomEmptyFor > cfg.roomOffAfterS) {
    return { ...zone, pwm: 0, occupied, onset: false, emptyFor, setpoint: 0, actual, note: 'Cả phòng trống, tắt' };
  }
  if (emptyFor <= cfg.emptyDimAfterS) {
    return { ...zone, occupied, onset: false, emptyFor, actual, note: 'Vừa trống, giữ mức cũ' };
  }
  const idle = pwmUpdate(zone.pwm, cfg.luxIdle, actual, cfg.kp, cfg.dlMax, cfg.idlePwmMin, cfg.idlePwmMax);
  return { pwm: idle, occupied, onset: false, emptyFor, setpoint: cfg.luxIdle, actual, note: 'Trống, về mức nền' };
}
