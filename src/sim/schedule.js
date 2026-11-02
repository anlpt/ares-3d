import { CONFIG } from './config.js';

/** Buổi học đang diễn ra tại `minute` (phút trong ngày), hoặc null. */
export function currentSession(minute, day, cfg = CONFIG) {
  if (!cfg.scheduleDays.includes(day)) return null;
  return cfg.schedule.find((s) => minute >= s.start && minute < s.end) ?? null;
}

/** Buổi học kế tiếp bắt đầu sau `minute` trong cùng ngày, hoặc null. */
export function nextSession(minute, day, cfg = CONFIG) {
  if (!cfg.scheduleDays.includes(day)) return null;
  return cfg.schedule.find((s) => s.start > minute) ?? null;
}

/** Khung giờ baseline "bật hết": 30 phút trước buổi đầu → 30 phút sau buổi cuối. */
export function inBaselineWindow(minute, day, cfg = CONFIG) {
  if (!cfg.scheduleDays.includes(day)) return false;
  const margin = cfg.physics.baselineMarginMin;
  const first = cfg.schedule[0].start - margin;
  const last = cfg.schedule[cfg.schedule.length - 1].end + margin;
  return minute >= first && minute < last;
}

/** "07:05" từ số phút trong ngày. */
export function formatClock(minute) {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
