// Port 1:1 các hàm thuần trong ares/formulas.py (Control Engine, spec mục 6).

/** @param {number} x @param {number} lo @param {number} hi @returns {number} */
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Làm tròn nửa lên: 24,5 → 25 (tránh banker's rounding khi đặt máy lạnh). */
export const roundHalfUp = (x) => Math.floor(x + 0.5);

/** L_actual = lux_trần × k */
export const deskLux = (luxCeiling, k) => luxCeiling * k;

/**
 * 400 lux nếu có người; 450 lux nếu > densePeople; luxIdle nếu trống.
 * @param {number} nZone
 * @param {boolean} occupied
 * @param {{luxOccupied:number, luxDense:number, luxIdle:number, densePeople:number}} cfg
 */
export function luxSetpoint(nZone, occupied, cfg) {
  if (!occupied) return cfg.luxIdle;
  return nZone > cfg.densePeople ? cfg.luxDense : cfg.luxOccupied;
}

/** PWM(t) = clamp(PWM(t−1) + 100·Kp·e/ΔL_max, PWM_min, PWM_max) — PWM tính theo %. */
export function pwmUpdate(prevPwm, setpoint, actual, kp, dlMax, pwmMin, pwmMax = 100) {
  const e = setpoint - actual;
  return clamp(prevPwm + (100 * kp * e) / dlMax, pwmMin, pwmMax);
}

/** t_lead = (T_in − T_target)/R_cool + γ·max(0, T_out − 30), kẹp [0, leadMax] phút. */
export function tLeadMinutes(tIn, tOut, rCool, tTarget, gamma, tOutRef = 30, rMin = 0.02, leadMax = 60) {
  const r = Math.max(rCool, rMin);
  const base = Math.max(0, tIn - tTarget) / r;
  const solar = gamma * Math.max(0, tOut - tOutRef);
  return clamp(base + solar, 0, leadMax);
}

/** R_cool_new = 0,8·old + 0,2·today */
export const ema = (oldV, newV, alpha = 0.2) => (1 - alpha) * oldV + alpha * newV;

/**
 * T_setpoint = clamp(round(T_base − ΔT_people − ΔT_humidity − ΔT_zone), t_min, t_max)
 * @returns {{raw:number, unclamped:number, integer:number, dPeople:number, dHumidity:number, dZone:number, crowdedZones:number[]}}
 */
export function tSetpoint(nTotal, nMax, rh, zoneCounts, zoneCaps, cfg) {
  const ratio = clamp(nTotal / Math.max(1, nMax), 0, 1);
  const dPeople = cfg.peopleGain * ratio;
  const dHumidity = rh != null && rh > cfg.rhHigh ? cfg.rhDelta : 0;
  const crowdedZones = zoneCounts
    .map((n, i) => (n > cfg.zoneFrac * zoneCaps[i] ? i : -1))
    .filter((i) => i >= 0);
  const dZone = crowdedZones.length > 0 ? cfg.zoneDelta : 0;
  const unclamped = cfg.tBase - dPeople - dHumidity - dZone;
  const raw = clamp(unclamped, cfg.tMin, cfg.tMax);
  const integer = clamp(roundHalfUp(raw), cfg.tMin, cfg.tMax);
  return { raw, unclamped, integer, dPeople, dHumidity, dZone, crowdedZones };
}

/** Quạt 1..3 theo tải; vùng quá đông hoặc phòng nóng hơn setpoint ≥ 2 °C thì mức 3. */
export function fanLevel(nTotal, nMax, crowded, tIn, setpoint, rh, rhHigh) {
  const ratio = nTotal / Math.max(1, nMax);
  let fan = ratio < 0.2 ? 1 : ratio <= 0.7 ? 2 : 3;
  if (crowded) fan = 3;
  if (tIn != null && tIn - setpoint >= 2) fan = 3;
  if (rh != null && rh > rhHigh) fan = Math.max(fan, 2);
  return fan;
}

/** Chỉ bắn IR khi giá trị chưa làm tròn lệch setpoint đang đặt quá ±deadband. */
export function deadbandPass(raw, lastSent, deadband) {
  if (lastSent == null) return true;
  return Math.abs(raw - lastSent) > deadband;
}
