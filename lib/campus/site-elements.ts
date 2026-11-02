import * as THREE from 'three';
import type { Building } from './types';

const stone = new THREE.MeshStandardMaterial({ name: 'stone', color: '#d6d3cb', roughness: .84 });
const steel = new THREE.MeshStandardMaterial({ name: 'metal', color: '#58656b', metalness: .55, roughness: .5 });
const line = new THREE.MeshBasicMaterial({ color: '#f1f2ef' });
const water = new THREE.MeshPhysicalMaterial({ color: '#4c8c9b', transparent: true, opacity: .78, metalness: .22, roughness: .12, clearcoat: 1, clearcoatRoughness: .06 });
function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = h > .5; o.receiveShadow = true; g.add(o); return o;
}
function clearOfBuildings(buildings: Building[], west: number, south: number, east: number, north: number, pad = 3) {
  return !buildings.some(b => b.insideCampus && b.bounds[0] < east + pad && b.bounds[2] > west - pad && b.bounds[1] < north + pad && b.bounds[3] > south - pad);
}

/** 景观与校门沿用现有米制坐标。 */
export function createSiteElements(buildings: Building[]) {
  const fountainGroup = new THREE.Group(); fountainGroup.name = 'fountainGroup'; fountainGroup.userData.layer = 'context';
  const wallGroup = new THREE.Group(); wallGroup.name = 'wallGroup'; wallGroup.userData.layer = 'context';
  const gateGroup = new THREE.Group(); gateGroup.name = 'gateGroup'; gateGroup.userData.layer = 'context';
  const ripples: THREE.Mesh[] = [];
  const fountainJets: { geometry: THREE.BufferGeometry; positions: Float32Array; originZ: number }[] = [];
  // 参考俯视图红框：位于图书馆南侧中央矩形空地，约宽 36 米、长 84 米。
  const fountainX = 76, fountainZ = -116, fountainWidth = 36, fountainLength = 84;
  if (clearOfBuildings(buildings, 58, 74, 94, 158, 4)) {
    box(fountainGroup, fountainWidth, .34, fountainLength, fountainX, .18, fountainZ, stone);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(fountainWidth - 1.5, fountainLength - 1.5),
      new THREE.MeshStandardMaterial({ color: '#355e69', roughness: .3, metalness: .12 }));
    inner.rotation.x = -Math.PI / 2; inner.position.set(fountainX, .355, fountainZ); fountainGroup.add(inner);
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(fountainWidth - 2.1, fountainLength - 2.1), water);
    surface.rotation.x = -Math.PI / 2; surface.position.set(fountainX, .39, fountainZ); fountainGroup.add(surface);
    for (const [index, offsetZ] of [-27, 0, 27].entries()) {
      const z = fountainZ + offsetZ;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, .16, 10), steel);
      nozzle.position.set(fountainX, .47, z); fountainGroup.add(nozzle);
      const ripple = new THREE.Mesh(new THREE.RingGeometry(.7, .76, 32),
        new THREE.MeshBasicMaterial({ color: '#d9edf1', transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false }));
      ripple.rotation.x = -Math.PI / 2; ripple.position.set(fountainX, .405 + index * .002, z);
      fountainGroup.add(ripple); ripples.push(ripple);
      const positions = new Float32Array(80 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const spray = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#e3f3f5', size: .17, transparent: true, opacity: .8, depthWrite: false }));
      spray.frustumCulled = false; fountainGroup.add(spray);
      fountainJets.push({ geometry, positions, originZ: z });
    }
  }
  // 覆盖矩形并非实测校界；围墙仅表达模型范围，既有门点保留原地标坐标。
  const edges: [[number, number], [number, number]][] = [
    [[-573, -477], [78, -477]], [[90, -477], [573, -477]],
    [[573, -477], [573, 109]], [[573, 121], [573, 477]],
    [[573, 477], [77, 477]], [[65, 477], [-573, 477]],
    [[-573, 477], [-573, -477]],
  ];
  for (const [a, b] of edges) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const alongX = a[1] === b[1];
    box(wallGroup, alongX ? d : .28, 2.25, alongX ? .28 : d, (a[0] + b[0]) / 2, 1.14, -(a[1] + b[1]) / 2, stone);
    box(wallGroup, alongX ? d : .43, .15, alongX ? .43 : d, (a[0] + b[0]) / 2, 2.33, -(a[1] + b[1]) / 2, steel);
    for (let distance = 36; distance < d - 18; distance += 48) {
      const t = distance / d, x = a[0] + (b[0] - a[0]) * t, z = -(a[1] + (b[1] - a[1]) * t);
      box(wallGroup, .16, 2.95, .16, x, 1.48, z, steel);
      box(wallGroup, .55, .15, .55, x, 3.02, z, line);
    }
  }
  const gates = [
    { name: '北门', x: 71.197, n: 395.291 }, { name: '东门', x: 321.597, n: 114.713 },
    { name: '南门', x: 84.019, n: -36.776 },
  ];
  const gateLeaves = new Map<string, [THREE.Group, THREE.Group]>();
  for (const gate of gates) {
    const g = new THREE.Group(); g.name = gate.name; g.position.set(gate.x, 0, -gate.n); gateGroup.add(g);
    for (const dx of [-5, 5]) box(g, .85, 4.4, .85, dx, 2.2, 0, stone);
    box(g, 11.4, .7, 1.15, 0, 4.5, 0, stone);
    box(g, 2.9, 2.5, 2.5, -7.7, 1.25, 1.5, stone);
    const left = new THREE.Group(), right = new THREE.Group();
    left.position.x = -5; right.position.x = 5;
    box(left, 4.7, 1.55, .09, 2.35, 1.02, 0, steel);
    box(right, 4.7, 1.55, .09, -2.35, 1.02, 0, steel);
    g.add(left, right); gateLeaves.set(gate.name, [left, right]);
  }
  return { fountainGroup, wallGroup, gateGroup,
    setGateOpen(name: string, open: boolean) {
      const leaves = gateLeaves.get(name);
      if (!leaves) return false;
      leaves[0].rotation.y = open ? -Math.PI / 2 : 0;
      leaves[1].rotation.y = open ? Math.PI / 2 : 0;
      return true;
    },
    update(weather: string, time: number) {
      ripples.forEach((r, i) => {
        const phase = (time * .00065 + i / 3) % 1;
        r.scale.setScalar(1 + phase * 3.5);
        (r.material as THREE.MeshBasicMaterial).opacity = weather === 'rain' ? (1 - phase) * .28 : .08 * (1 - phase);
      });
      fountainJets.forEach(({ geometry, positions, originZ }, jet) => {
        for (let i = 0; i < 80; i++) {
          const phase = (i * .618 + time * .00055 + jet * .23) % 1;
          const angle = i * 2.39996;
          const spread = Math.sin(Math.PI * phase) * 1.45;
          positions[i * 3] = fountainX + Math.cos(angle) * spread;
          positions[i * 3 + 1] = .5 + Math.sin(Math.PI * phase) * (jet === 1 ? 3 : 2.4);
          positions[i * 3 + 2] = originZ + Math.sin(angle) * spread;
        }
        geometry.attributes.position.needsUpdate = true;
      });
    },
  };
}
