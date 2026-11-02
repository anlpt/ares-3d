import { describe, expect, test } from 'vitest';
import { stepZoneLight, initialZoneLight } from '../src/sim/lighting.js';
import { stepHvac, initialHvac } from '../src/sim/hvac.js';
import { createEngine } from '../src/sim/engine.js';
import { CONFIG } from '../src/sim/config.js';

const L = CONFIG.lighting;

describe('stepZoneLight', () => {
  test('vùng vừa có người lên đèn ngay bằng Kp onset, không bị giới hạn bước', () => {
    const z = stepZoneLight(initialZoneLight(), { occAvg: 0.6, count: 3, daylight: 0, dt: 15, roomEmptyFor: 0 }, L);
    expect(z.occupied).toBe(true);
    expect(z.pwm).toBeCloseTo(100 * 1.0 * 400 / 450);
  });

  test('trễ (hysteresis): đã có người thì 0,2 chưa coi là hết người', () => {
    const on = { ...initialZoneLight(), occupied: true, pwm: 80 };
    const z = stepZoneLight(on, { occAvg: 0.2, count: 0, daylight: 0, dt: 15, roomEmptyFor: 0 }, L);
    expect(z.occupied).toBe(true);
  });

  test('nắng đủ thì PWM giảm (daylight harvesting)', () => {
    const on = { ...initialZoneLight(), occupied: true, pwm: 80, onset: false };
    const z = stepZoneLight(on, { occAvg: 1, count: 3, daylight: 600, dt: 15, roomEmptyFor: 0 }, L);
    expect(z.pwm).toBeLessThan(80);
    expect(80 - z.pwm).toBeLessThanOrEqual(L.pwmMaxStep);
  });

  test('trống quá 3 phút về nền 10–15 %, cả phòng trống quá 3 phút thì tắt', () => {
    const off = { ...initialZoneLight(), occupied: false, pwm: 80, emptyFor: 200 };
    const dim = stepZoneLight(off, { occAvg: 0, count: 0, daylight: 0, dt: 15, roomEmptyFor: 0 }, L);
    expect(dim.pwm).toBeGreaterThanOrEqual(L.idlePwmMin);
    expect(dim.pwm).toBeLessThanOrEqual(L.idlePwmMax);
    const dark = stepZoneLight(off, { occAvg: 0, count: 0, daylight: 0, dt: 15, roomEmptyFor: 400 }, L);
    expect(dark.pwm).toBe(0);
  });

  test('trong 3 phút ân hạn giữ nguyên mức cũ', () => {
    const grace = { ...initialZoneLight(), occupied: true, pwm: 70 };
    const z = stepZoneLight(grace, { occAvg: 0.05, count: 0, daylight: 0, dt: 15, roomEmptyFor: 0 }, L);
    expect(z.occupied).toBe(false);
    expect(z.pwm).toBe(70);
  });
});

describe('stepHvac', () => {
  const base = {
    tIn: 30.5, tOut: 34, rh: 60, avg10: 0, zoneCounts: [0, 0, 0, 0],
    zoneCaps: [10, 10, 10, 10], nMax: 40, now: 0,
  };

  test('pre-cool bật trước giờ học đúng t_lead', () => {
    // t_lead = (30,5−25,5)/0,1 + 0,8·4 = 53,2 phút → 07:00 − 53 phút ≈ 06:07
    const before = stepHvac(initialHvac(), { ...base, minute: 6 * 60 }, CONFIG.hvac);
    expect(before.power).toBe(false);
    const during = stepHvac(initialHvac(), { ...base, minute: 6 * 60 + 10 }, CONFIG.hvac);
    expect(during.power).toBe(true);
    expect(during.mode).toBe('precool');
  });

  test('fail-safe: vào lớp 15 phút vẫn trống thì tắt', () => {
    const on = { ...initialHvac(), power: true, mode: 'precool', setpoint: 25 };
    const s = stepHvac(on, { ...base, tIn: 25, minute: 7 * 60 + 20 }, CONFIG.hvac);
    expect(s.power).toBe(false);
    expect(s.mode).toBe('failsafe');
  });

  test('có người thì đặt setpoint động', () => {
    const s = stepHvac(initialHvac(), { ...base, tIn: 26, avg10: 30, zoneCounts: [8, 8, 7, 7], minute: 8 * 60 }, CONFIG.hvac);
    expect(s.power).toBe(true);
    expect(s.mode).toBe('comfort');
    expect(s.setpoint).toBe(25);
  });
});

describe('createEngine', () => {
  test('tick không sửa state cũ (bất biến) và tích luỹ điện năng', () => {
    const engine = createEngine();
    engine.setInputs({ minute: 9 * 60, zoneCounts: [3, 0, 2, 0], sky: 0.8 });
    const s0 = engine.getState();
    for (let i = 0; i < 240; i += 1) engine.tick(5);
    const s1 = engine.getState();
    expect(s1).not.toBe(s0);
    expect(s0.energy.ares).toBe(0);
    expect(s1.energy.ares).toBeGreaterThan(0);
    expect(s1.energy.baseline).toBeGreaterThan(s1.energy.ares);
    expect(s1.zones[1].pwm).toBeLessThan(s1.zones[0].pwm);
  });
});
