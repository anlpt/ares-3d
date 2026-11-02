// Mặt bằng phòng P101 (mét). Gốc toạ độ ở tâm sàn; +z là mặt kính, cửa ra vào ở tường +x.
// Vùng theo ares_config/zones.json (2×2): 0 = Khu 1 … 3 = Khu 4; Khu 3–4 cạnh mặt kính.
import { ROOM } from './palette.js';

const DESK_COLS = [-5.4, -3.6, -1.8, 1.8, 3.6, 5.4];
const DESK_ROWS = [-3.0, -1.3, 1.3, 3.0];
const SEAT_OFFSET = 0.55;

export const zoneOf = (x, z) => (x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0);

export const ZONE_CENTERS = Object.freeze([
  [-ROOM.w / 4, -ROOM.d / 4],
  [ROOM.w / 4, -ROOM.d / 4],
  [-ROOM.w / 4, ROOM.d / 4],
  [ROOM.w / 4, ROOM.d / 4],
]);

export const DESKS = Object.freeze(
  DESK_ROWS.flatMap((z) => DESK_COLS.map((x) => Object.freeze({ x, z }))),
);

export const SEATS = Object.freeze(
  DESKS.map((d, i) => Object.freeze({ id: i, x: d.x, z: d.z + SEAT_OFFSET, zone: zoneOf(d.x, d.z) })),
);

export const DOOR = Object.freeze({ x: ROOM.w / 2 + 0.8, z: 3.9 });
export const AISLE_X = 6.45;

export const LAMPS = Object.freeze(
  ZONE_CENTERS.flatMap(([cx, cz], zone) => [
    [cx - 1.6, cz - 1.05], [cx + 1.6, cz - 1.05], [cx - 1.6, cz + 1.05], [cx + 1.6, cz + 1.05],
  ].map(([x, z]) => Object.freeze({ x, z, zone }))),
);

export const AC_UNITS = Object.freeze([
  Object.freeze({ x: -3.5, y: 2.55, z: -ROOM.d / 2 + 0.2 }),
  Object.freeze({ x: 3.5, y: 2.55, z: -ROOM.d / 2 + 0.2 }),
]);

export const CCTV = Object.freeze({ x: ROOM.w / 2 - 0.35, y: ROOM.h - 0.15, z: -ROOM.d / 2 + 0.35 });
