// Kịch bản máy quay + trạng thái mô phỏng cho từng chương. id khớp với data-chapter trong index.html.

const EVEN = [1, 1, 1, 1];

export const CHAPTERS = Object.freeze([
  {
    id: 'hero', label: 'Tòa nhà',
    pose: { pos: [52, 26, 96], target: [-13, 15, 0] },
    layers: { building: 1, room: 1, people: 1 },
    sim: { minute: 17 * 60 + 5, sky: 0.05, tOut: 31, people: 16, weights: EVEN },
    hud: false,
  },
  {
    id: 'see', label: 'Camera',
    pose: { pos: [9.5, 7.2, 11.5], target: [0, 0.8, 0] },
    layers: { room: 1, people: 1, vision: 1, sun: 0.45 },
    sim: { minute: 9 * 60 + 10, sky: 0.6, tOut: 32, people: 16, weights: EVEN },
  },
  {
    id: 'zones', label: 'Vùng',
    pose: { pos: [0.6, 16.5, 6.5], target: [0, 0, 0.3] },
    layers: { room: 1, people: 1, zones: 1, vision: 0.3, sun: 0.35 },
    sim: { minute: 9 * 60 + 20, sky: 0.6, tOut: 32, people: 13, weights: [1.6, 0.7, 1.2, 0.25] },
  },
  {
    id: 'buffer', label: 'Bộ đệm',
    pose: { pos: [-9.5, 6.5, 10.5], target: [0, 1.1, 0] },
    layers: { room: 1, people: 1, buffers: 1, zones: 0.45, sun: 0.35 },
    sim: { minute: 9 * 60 + 40, sky: 0.6, tOut: 32, people: 8, weights: [1, 0, 1, 0.6] },
  },
  {
    id: 'light', label: 'Đèn',
    pose: { pos: [12, 7.5, 15], target: [-0.5, 0.8, 0.6] },
    layers: { room: 1, people: 1, sun: 1 },
    sim: { minute: 15 * 60, sky: 0.9, tOut: 34, people: 8, weights: [1, 0, 0.9, 0] },
  },
  {
    id: 'cool', label: 'Điều hòa',
    pose: { pos: [-6.5, 4.6, 8.5], target: [-1, 1.6, -2.2] },
    layers: { room: 1, people: 1, hvac: 1 },
    sim: {
      minute: 6 * 60 + 2, sky: 0.25, tOut: 34, people: 0, weights: EVEN, clockRate: 1, speed: 45, tIn: 30.5, instant: true,
      script: [{ minute: 6 * 60 + 56, people: 22 }],
    },
  },
  {
    id: 'learn', label: 'Học chủ động',
    pose: { pos: [0, 14.5, 18.5], target: [0, 6, 0] },
    layers: { room: 0.28, people: 0.4, vision: 0.5, learning: 1 },
    sim: { minute: 10 * 60, sky: 0.6, tOut: 33, people: 16, weights: EVEN },
    hud: false,
  },
  {
    id: 'link', label: 'MQTT',
    pose: { pos: [14, 9, 15.5], target: [1.5, 3.2, 0] },
    layers: { room: 0.6, people: 0.6, network: 1 },
    sim: { minute: 10 * 60 + 30, sky: 0.6, tOut: 33, people: 16, weights: EVEN },
    hud: false,
  },
  {
    id: 'result', label: 'Kết quả',
    pose: { pos: [0.4, 21, 10], target: [0, 0, 0.6] },
    layers: { room: 1, people: 1, zones: 0.35, sun: 0.8 },
    sim: { minute: 6 * 60, sky: 0.7, tOut: 33, people: 0, weights: EVEN, clockRate: 1, speed: 420, auto: true },
  },
  {
    id: 'sandbox', label: 'Tự thử',
    pose: { pos: [11, 9.5, 13.5], target: [0, 0.4, 0] },
    layers: { room: 1, people: 1, zones: 0.5, hvac: 1, sun: 1 },
    sim: { minute: 9 * 60, sky: 0.6, tOut: 33, people: 12, weights: EVEN },
    interactive: true,
  },
  {
    id: 'scale', label: 'Tòa nhà',
    pose: { pos: [-58, 30, 92], target: [-14, 15, 0] },
    layers: { building: 1, room: 1, people: 1 },
    sim: { minute: 17 * 60 + 5, sky: 0.05, tOut: 31, people: 16, weights: EVEN },
    hud: false,
  },
]);

export const LAYER_NAMES = Object.freeze(['building', 'room', 'people', 'vision', 'zones', 'buffers', 'hvac', 'learning', 'network', 'sun']);
