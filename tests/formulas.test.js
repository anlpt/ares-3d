import { describe, expect, test } from 'vitest';
import {
  clamp,
  roundHalfUp,
  luxSetpoint,
  pwmUpdate,
  tLeadMinutes,
  ema,
  tSetpoint,
  fanLevel,
  deadbandPass,
} from '../src/sim/formulas.js';

// Số kỳ vọng lấy từ ares/formulas.py và tests/ares/test_formulas.py của repo ARES.
describe('formulas (port từ ares/formulas.py)', () => {
  test('roundHalfUp làm tròn nửa lên, không phải banker', () => {
    expect(roundHalfUp(24.5)).toBe(25);
    expect(roundHalfUp(25.5)).toBe(26);
    expect(roundHalfUp(24.49)).toBe(24);
  });

  test('clamp giữ giá trị trong khoảng', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  test('luxSetpoint: 400 khi có người, 450 khi > 8 người, 100 khi trống', () => {
    const cfg = { luxOccupied: 400, luxDense: 450, luxIdle: 100, densePeople: 8 };
    expect(luxSetpoint(3, true, cfg)).toBe(400);
    expect(luxSetpoint(9, true, cfg)).toBe(450);
    expect(luxSetpoint(0, false, cfg)).toBe(100);
  });

  test('pwmUpdate dùng 100·Kp·e/ΔLmax và kẹp trong [min, max]', () => {
    // e = 400 - 175 = 225 → +100·0.5·225/450 = +25
    expect(pwmUpdate(20, 400, 175, 0.5, 450, 0)).toBeCloseTo(45);
    expect(pwmUpdate(95, 400, 0, 1, 450, 0)).toBe(100);
    expect(pwmUpdate(5, 0, 400, 1, 450, 10)).toBe(10);
  });

  test('tLeadMinutes = (T_in − 25,5)/R_cool + 0,8·max(0, T_out − 30), kẹp 0..60', () => {
    expect(tLeadMinutes(28.5, 30, 0.1, 25.5, 0.8)).toBeCloseTo(30);
    expect(tLeadMinutes(28.5, 35, 0.1, 25.5, 0.8)).toBeCloseTo(34);
    expect(tLeadMinutes(24, 28, 0.1, 25.5, 0.8)).toBe(0);
    expect(tLeadMinutes(40, 40, 0.1, 25.5, 0.8)).toBe(60);
  });

  test('ema trộn 0,8 cũ + 0,2 mới', () => {
    expect(ema(0.1, 0.2)).toBeCloseTo(0.12);
  });

  test('tSetpoint: phòng đầy 75 % ra 25 °C (spec mục 6C)', () => {
    const cfg = {
      tBase: 26.5, peopleGain: 2.5, rhHigh: 70, rhDelta: 0.5,
      zoneFrac: 0.9, zoneDelta: 0.5, tMin: 22, tMax: 27,
    };
    const r = tSetpoint(30, 40, 60, [8, 8, 7, 7], [10, 10, 10, 10], cfg);
    expect(r.raw).toBeCloseTo(24.625);
    expect(r.integer).toBe(25);
    const humid = tSetpoint(30, 40, 80, [10, 8, 7, 5], [10, 10, 10, 10], cfg);
    expect(humid.dHumidity).toBe(0.5);
    expect(humid.crowdedZones).toEqual([0]);
    expect(humid.integer).toBe(24);
  });

  test('fanLevel theo tải người, vùng đông hoặc phòng còn nóng thì mức 3', () => {
    expect(fanLevel(4, 40, false, 25, 25, 50, 70)).toBe(1);
    expect(fanLevel(20, 40, false, 25, 25, 50, 70)).toBe(2);
    expect(fanLevel(35, 40, false, 25, 25, 50, 70)).toBe(3);
    expect(fanLevel(4, 40, true, 25, 25, 50, 70)).toBe(3);
    expect(fanLevel(4, 40, false, 28, 25, 50, 70)).toBe(3);
  });

  test('deadbandPass chỉ bắn IR khi lệch quá ±0,7 °C', () => {
    expect(deadbandPass(24.6, null, 0.7)).toBe(true);
    expect(deadbandPass(24.6, 25, 0.7)).toBe(false);
    expect(deadbandPass(24.2, 25, 0.7)).toBe(true);
  });
});
