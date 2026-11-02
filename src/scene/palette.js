// Màu theo ngữ nghĩa — khớp với styles/tokens.css.
import * as THREE from 'three';

export const PALETTE = Object.freeze({
  night: new THREE.Color('#060C17'),
  holo: new THREE.Color('#5FE6E2'),
  floor: new THREE.Color('#121925'),
  wall: new THREE.Color('#1A2230'),
  desk: new THREE.Color('#263042'),
  line: new THREE.Color('#3A465A'),
  lamp: new THREE.Color('#F2A93B'),
  lampHot: new THREE.Color('#FFD08A'),
  cool: new THREE.Color('#7CC6E8'),
  vision: new THREE.Color('#ECE6D8'),
  doubt: new THREE.Color('#E26D9C'),
  sun: new THREE.Color('#FFF1D6'),
  dark: new THREE.Color('#0E141D'),
});

/** Ánh xạ góc nhìn: kích thước phòng (mét). */
export const ROOM = Object.freeze({ w: 14, d: 9, h: 3.2 });
