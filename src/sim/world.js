// Mô hình phòng giả định (ánh sáng ngày, nhiệt, công suất) — chỉ để minh họa logic điều khiển.
import { clamp } from './formulas.js';

/** Độ cao mặt trời chuẩn hoá 0..1 theo giờ (06:00 → 18:00). */
export function sunAltitude(minute) {
  const t = (minute - 360) / 720;
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
}

/** Lux ngoài trời: sky = 0 (u ám) .. 1 (nắng gắt). */
export function outdoorLux(minute, sky, physics) {
  const alt = sunAltitude(minute);
  return alt * (2000 + sky * physics.sunPeakLux);
}

/** Lux ánh sáng ngày đóng góp lên mặt bàn của từng vùng. */
export function zoneDaylight(minute, sky, zones, physics) {
  const out = outdoorLux(minute, sky, physics);
  return zones.map((z) => out * (z.nearWindow ? physics.windowFactorNear : physics.windowFactorFar));
}

/** Điều hòa đang chạy máy nén khi phòng còn nóng hơn setpoint. */
export const compressorOn = (power, tIn, setpoint) => power && setpoint != null && tIn > setpoint - 0.2;

/**
 * Nhiệt độ phòng sau dtMin phút.
 * @param {{tIn:number, tOut:number, people:number, minute:number, sky:number, power:boolean, setpoint:number|null, fan:number}} s
 */
export function stepTemperature(s, dtMin, physics) {
  const gain = physics.leakPerMin * (s.tOut - s.tIn)
    + physics.peopleHeatPerMin * s.people
    + physics.solarHeatPerMin * sunAltitude(s.minute) * s.sky;
  const cooling = compressorOn(s.power, s.tIn, s.setpoint)
    ? physics.coolBasePerMin + physics.coolFanPerMin * s.fan
    : 0;
  return clamp(s.tIn + (gain - cooling) * dtMin, 16, 42);
}

/** Công suất điều hòa (kW). */
export function acPowerKw(power, tIn, setpoint, fan, physics) {
  if (!power) return 0;
  return compressorOn(power, tIn, setpoint)
    ? physics.acCompressorKw + physics.acFanKw * fan
    : physics.acIdleKw;
}

/** Công suất đèn (kW) từ PWM % từng vùng. */
export const lightPowerKw = (pwms, physics) => pwms.reduce((sum, p) => sum + (p / 100) * physics.lampKwPerZone, 0);
