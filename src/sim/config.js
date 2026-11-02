// Tham số mặc định lấy từ ares/config.py và ares_config/*.json của repo ARES.
// Phần "physics" là mô hình phòng giả định để minh họa, không phải số đo thực tế.

const deepFreeze = (obj) => {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(obj);
};

export const CONFIG = deepFreeze({
  room: {
    id: 'P101',
    nMax: 40,
    zones: [
      { id: 1, name: 'Khu 1', capacity: 10, k: 3.25, nearWindow: false },
      { id: 2, name: 'Khu 2', capacity: 10, k: 3.25, nearWindow: false },
      { id: 3, name: 'Khu 3', capacity: 10, k: 3.25, nearWindow: true },
      { id: 4, name: 'Khu 4', capacity: 10, k: 3.25, nearWindow: true },
    ],
  },
  schedule: [
    { name: 'Tiết 1-3', start: 7 * 60, end: 9 * 60 + 30 },
    { name: 'Tiết 4-6', start: 9 * 60 + 45, end: 12 * 60 + 15 },
    { name: 'Tiết 7-9', start: 13 * 60, end: 15 * 60 + 30 },
    { name: 'Tiết 10-12', start: 15 * 60 + 45, end: 18 * 60 + 15 },
  ],
  scheduleDays: [2, 3, 4, 5, 6],
  buffers: { lightTauS: 30, hvacTauS: 600 },
  lighting: {
    intervalS: 15,
    luxOccupied: 400,
    luxDense: 450,
    luxIdle: 100,
    densePeople: 8,
    occOnThreshold: 0.35,
    occOffThreshold: 0.15,
    luxDeadband: 30,
    pwmMaxStep: 15,
    idlePwmMin: 10,
    idlePwmMax: 15,
    kp: 0.5,
    kpOnset: 1.0,
    dlMax: 450,
    emptyDimAfterS: 180,
    roomOffAfterS: 180,
  },
  hvac: {
    intervalS: 30,
    tBase: 26.5,
    peopleGain: 2.5,
    rhHigh: 70,
    rhDelta: 0.5,
    zoneFrac: 0.9,
    zoneDelta: 0.5,
    tMin: 22,
    tMax: 27,
    deadband: 0.7,
    tTarget: 25.5,
    precoolSetpoint: 25,
    gamma: 0.8,
    rCoolDefault: 0.1,
    leadMaxMin: 60,
    occOnPeople: 2,
    failsafeAfterMin: 15,
    failsafeEmptyAvg: 0.25,
    keepOnBeforeClassMin: 30,
    minCmdIntervalS: 300,
    setpointMaxStep: 2,
  },
  physics: {
    sunPeakLux: 80000,
    windowFactorNear: 0.009,
    windowFactorFar: 0.0025,
    lampKwPerZone: 0.144,
    leakPerMin: 0.008,
    peopleHeatPerMin: 0.0009,
    solarHeatPerMin: 0.012,
    coolBasePerMin: 0.06,
    coolFanPerMin: 0.03,
    acCompressorKw: 2.6,
    acFanKw: 0.2,
    acIdleKw: 0.35,
    baselineSetpoint: 25,
    baselineMarginMin: 30,
  },
});
