import * as THREE from 'three';
import type { Building, Landmark, Preset, Weather } from './types';
import { createSiteElements } from './site-elements';
import { createPedestrianCrowd } from './pedestrian-crowd';
import { treeAppearance, treeRotation } from './vegetation';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CUPB_CONFIG } from './cupb-config';
import { buildPatrolRoute, clonePatrolRoute, findPatrolDetour, planDistinctPatrolRoutes, refreshPatrolRouteLength, type PatrolRoute, type PatrolSnapshot, type PatrolStatus } from './robo-dog-patrol';
import { createRoboDogGait, type DogGait } from './robo-dog-gait';
import { createRoboDogBeacon, createRoboDogPaint } from './robo-dog-appearance';
import { createRoboDogFleet, createRoboDogTrail } from './robo-dog-fleet';

export interface RoboDogState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  speed: number;
  state: 'idle' | 'walking' | 'turning';
  firstPerson: boolean;
}

type Path = { name: string; path: number[][] };
export type PedestrianRouteData = { routes: { from: string; to: string; region: 'north' | 'south'; weight: number; points: number[][] }[] };
type WalkingRoute = { name: string; points: [number, number][]; lengths: number[]; total: number; region: 'north' | 'south' };
type Walker = { route: WalkingRoute; distance: number; direction: number; speed: number; pause: number; phase: number; lane: number; avoidance: number; x: number; z: number; heading: number };
type CupbGreenData = { trees: [number, number, number, number][]; shrubs: [number, number, number][] };
const mat = (name: string, color: string, roughness = 0.86, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
const STONE = [
  mat('stone', '#d3d2cd'), mat('stone', '#c7c9c8'),
  mat('stone', '#ddd8d0'), mat('stone', '#bfc4c6'),
];
// 实例化窗格共用几何体，不能套用旧 GLB 的逐窗顶点夜灯着色器。
const GLASS = mat('facadePane', '#455d6b', 0.24, 0.28);
const BLUE_GLASS = mat('facadePane', '#52788b', 0.2, 0.3);
const LIT_GLASS = GLASS.clone();
const LIT_BLUE_GLASS = BLUE_GLASS.clone();
const FRAME = mat('metal', '#7e898d', 0.5, 0.35);
const PALE = mat('stone', '#edeae3');
const SILL = mat('windowSill', '#e6e3dc', .72);
const DARK_TRIM = mat('curtainWallFrame', '#4b555b', .46, .22);
const DOOR = mat('entranceGlass', '#334b57', .18, .36);
const ROOF = mat('roof', '#93999b');
const CURB = mat('curb', '#d6d5cf');
const LINE = mat('roadWhite', '#e9e9e3');
const GRASS = mat('grass', '#759668');
const SHRUB = mat('green', '#4f7051');
const TREE = mat('treeCanopy', '#557856');
const TRUNK = mat('trunk', '#695847');
const LAMP = mat('lampGlass', '#f8e4b6', 0.28);
const FLOOR = mat('grass', '#b5b7aa');
const temp = new THREE.Object3D();

function surfaceTexture(kind: 'stone' | 'asphalt' | 'paving' | 'grass') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = kind === 'grass' ? '#f4f6f2' : '#f5f5f4';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 440; i++) {
    const x = (i * 73 + i * i * 17) % 128;
    const y = (i * 47 + i * i * 29) % 128;
    const shade = kind === 'grass' ? 210 + i % 28 : 213 + i % 29;
    context.fillStyle = `rgba(${shade},${shade},${shade},${kind === 'asphalt' ? .22 : .14})`;
    context.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  if (kind === 'stone' || kind === 'paving') {
    context.strokeStyle = kind === 'stone' ? 'rgba(120,125,126,.12)' : 'rgba(100,105,108,.2)';
    context.lineWidth = 1;
    const cell = kind === 'stone' ? 64 : 32;
    for (let p = 0; p <= 128; p += cell) {
      context.beginPath(); context.moveTo(p, 0); context.lineTo(p, 128); context.stroke();
      context.beginPath(); context.moveTo(0, p); context.lineTo(128, p); context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'stone' ? .045 : kind === 'grass' ? 8 : 3, kind === 'stone' ? .045 : kind === 'grass' ? 8 : 3);
  texture.anisotropy = 4;
  return texture;
}

function box(group: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.rotation.y = yaw;
  mesh.castShadow = size[1] > 0.5;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function mass(building: Building, material: THREE.Material) {
  const group = new THREE.Group();
  for (const polygon of building.polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    const shape = new THREE.Shape();
    ring.forEach(([x, north], i) => i ? shape.lineTo(x, north) : shape.moveTo(x, north));
    shape.closePath();
    for (const hole of polygon.slice(1)) {
      const path = new THREE.Path();
      hole.forEach(([x, north], i) => i ? path.lineTo(x, north) : path.moveTo(x, north));
      path.closePath();
      shape.holes.push(path);
    }
    if (/中油大厦/.test(building.name) && polygon.length === 1) {
      const [west, south, east, north] = building.bounds;
      if (east - west > 36 && north - south > 36) {
        const cx = (west + east) / 2, cy = (south + north) / 2;
        const courtyard = new THREE.Path();
        courtyard.moveTo(cx - 7, cy - 7); courtyard.lineTo(cx + 7, cy - 7);
        courtyard.lineTo(cx + 7, cy + 7); courtyard.lineTo(cx - 7, cy + 7);
        courtyard.closePath(); shape.holes.push(courtyard);
      }
    }
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Math.max(3, building.height), bevelEnabled: false }), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = building.elevation;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
function sign(group: THREE.Group, text: string, x: number, y: number, z: number, width: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, 512, 96);
  context.fillStyle = '#a91f30';
  context.font = 'bold 56px sans-serif';
  context.textAlign = 'center';
  context.fillText(text, 256, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  panel.position.set(x, y, z);
  group.add(panel);
}
function buildingStyle(name: string, category: string) {
  if (/主楼|行政/.test(name)) return { wall: STONE[1], glass: GLASS, spacing: 3.2, bays: 0.7, kind: 'admin' };
  if (/中油大厦/.test(name)) return { wall: STONE[0], glass: BLUE_GLASS, spacing: 3.2, bays: 0.62, kind: 'oil' };
  if (/图书馆/.test(name)) return { wall: STONE[2], glass: GLASS, spacing: 4.2, bays: 0.68, kind: 'library' };
  if (/地质/.test(name)) return { wall: PALE, glass: GLASS, spacing: 3.1, bays: 0.54, kind: 'geology' };
  if (/教学楼|工程|理学|化工|实验室/.test(name)) return { wall: STONE[3], glass: GLASS, spacing: 3.5, bays: 0.6, kind: 'teaching' };
  if (/公寓|宿舍/.test(name)) return { wall: STONE[2], glass: GLASS, spacing: 3.0, bays: 0.5, kind: 'dorm' };
  if (/食堂/.test(name)) return { wall: STONE[0], glass: BLUE_GLASS, spacing: 4.4, bays: 0.76, kind: 'canteen' };
  if (/体育馆|游泳馆/.test(name)) return { wall: STONE[1], glass: BLUE_GLASS, spacing: 5.5, bays: 0.55, kind: 'sports' };
  if (/会堂|多功能/.test(name)) return { wall: STONE[3], glass: GLASS, spacing: 4, bays: 0.58, kind: 'hall' };
  return { wall: STONE[category === 'living' ? 2 : 0], glass: GLASS, spacing: 3.7, bays: 0.48, kind: 'other' };
}

export function createProceduralCampus(buildings: Building[], landmarks: Landmark[], paths: Path[], pedestrianRoutes: PedestrianRouteData) {
  // 石材、铺装、沥青和草地均用轻纹理 Canvas 生成，无外部贴图请求。
  const stoneMap = surfaceTexture('stone');
  const grassMap = surfaceTexture('grass');
  for (const material of [...STONE, PALE, ROOF]) material.map = stoneMap;
  GRASS.map = grassMap; FLOOR.map = grassMap;
  const baseGroup = new THREE.Group(); baseGroup.name = 'baseGroup';
  const buildingsGroup = new THREE.Group(); buildingsGroup.name = 'buildingsGroup'; buildingsGroup.userData.layer = 'buildings';
  const roadGroup = new THREE.Group(); roadGroup.name = 'roadGroup'; roadGroup.userData.layer = 'roads';
  const wetGroup = new THREE.Group(); wetGroup.name = 'wetRoadSurfaces'; wetGroup.visible = false; roadGroup.add(wetGroup);
  const greenGroup = new THREE.Group(); greenGroup.name = 'greenGroup'; greenGroup.userData.layer = 'vegetation';
  const sportsGroup = new THREE.Group(); sportsGroup.name = 'sportsGroup'; sportsGroup.userData.layer = 'sports';
  const pedestrianGroup = new THREE.Group(); pedestrianGroup.name = 'pedestrianGroup'; pedestrianGroup.userData.layer = 'context';
  const roboDog = new THREE.Group(); roboDog.name = 'roboDog';
  const weatherGroup = new THREE.Group(); weatherGroup.name = 'weatherGroup';
  const lightGroup = new THREE.Group(); lightGroup.name = 'lightGroup';
  baseGroup.add(buildingsGroup, roadGroup, greenGroup, sportsGroup, pedestrianGroup, roboDog, weatherGroup, lightGroup);
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(1160, 960), FLOOR);
  terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true;
  baseGroup.add(terrain);
  const windowsDark: THREE.Matrix4[] = [], windowsBlue: THREE.Matrix4[] = [];
  const windowsDarkLit: THREE.Matrix4[] = [], windowsBlueLit: THREE.Matrix4[] = [];
  const frames: THREE.Matrix4[] = [], balconies: THREE.Matrix4[] = [];
  const sills: THREE.Matrix4[] = [], mullions: THREE.Matrix4[] = [];
  const bands: THREE.Matrix4[] = [], railings: THREE.Matrix4[] = [];
  const matrix = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number) => {
    temp.position.set(x, y, z); temp.rotation.set(0, yaw, 0); temp.scale.set(sx, sy, sz); temp.updateMatrix();
    return temp.matrix.clone();
  };
  for (const b of buildings) {
    if (!b.insideCampus || b.height < 2) continue;
    const style = buildingStyle(b.name, b.category);
    const wall = style.wall.clone();
    const idNumber = Number(b.id.match(/\d+$/)?.[0] ?? 0);
    wall.color.offsetHSL(0, 0, ((idNumber % 7) - 3) * .012);
    const part = mass(b, wall);
    part.name = b.name; buildingsGroup.add(part);
    const [west, south, east, north] = b.bounds;
    const cx = (west + east) / 2, cz = -(south + north) / 2;
    const width = east - west, depth = north - south, height = Math.max(3, b.height);
    const floors = Math.max(1, Math.min(14, Math.round(height / style.spacing)));
    const edges = b.polygons.flatMap((p) => p[0] ? p[0].map((a, i, arr) => [a, arr[(i + 1) % arr.length]] as const) : []);
    // 具名建筑沿真实足迹边线分配窗、竖梃和腰线；短碎边不做浮空窗。
    for (const [a, c] of edges) {
      const dx = c[0] - a[0], dz = -(c[1] - a[1]), length = Math.hypot(dx, dz);
      if (length < 8) continue;
      const yaw = -Math.atan2(dz, dx);
      // 立面细部沿建筑真实轮廓向外偏移，避免窗格埋入墙身。
      const normalX = -dz / length, normalZ = dx / length;
      const edgeMidX = (a[0] + c[0]) / 2, edgeMidZ = -(a[1] + c[1]) / 2;
      const outward = (edgeMidX - cx) * normalX + (edgeMidZ - cz) * normalZ >= 0 ? 1 : -1;
      const count = Math.min(26, Math.floor(length / (style.kind === 'dorm' ? 4.2 : 5.2)));
      if (!count) continue;
      for (let i = 0; i < count; i++) {
        const f = (i + .5) / count, x = a[0] + dx * f + normalX * outward * .12;
        const z = -a[1] + dz * f + normalZ * outward * .12;
        for (let level = 0; level < floors; level++) {
          const y = b.elevation + (level + .55) * height / floors;
          const paneW = Math.min(3.6, length / count * style.bays);
          const paneH = Math.min(2.1, height / floors * .55);
          const lit = (idNumber * 13 + i * 7 + level * 11) % 10 < 4;
          const panes = style.glass === BLUE_GLASS
            ? (lit ? windowsBlueLit : windowsBlue)
            : (lit ? windowsDarkLit : windowsDark);
          panes.push(matrix(x, y, z, paneW, paneH, .18, yaw));
          sills.push(matrix(x, y - paneH / 2 - .07, z, paneW + .28, .12, .32, yaw));
          if (style.kind === 'admin' || style.kind === 'oil')
            mullions.push(matrix(x, y, z + normalZ * outward * .13, .075, paneH + .18, .12, yaw));
          if (style.kind === 'geology' || style.kind === 'teaching' || style.kind === 'other')
            mullions.push(matrix(x - Math.cos(yaw) * paneW / 2, y, z + normalZ * outward * .1, .11, paneH + .2, .12, yaw));
          if (level % 2 === 0 || style.kind === 'admin' || style.kind === 'oil')
            frames.push(matrix(x, y, z, .09, Math.min(2.3, height / floors * .65), .26, yaw));
          if (style.kind === 'dorm' && level > 0) {
            const balconyW = Math.min(3.8, length / count * .9);
            balconies.push(matrix(x, y - .75, z, balconyW, .12, .72, yaw));
            railings.push(matrix(x + normalX * outward * .5, y - .35, z + normalZ * outward * .5, balconyW, .08, .08, yaw));
          }
        }
      }
      if (['admin', 'oil', 'geology', 'teaching', 'hall', 'other'].includes(style.kind)) {
        const every = style.kind === 'geology' ? 1 : 2;
        for (let level = every; level < floors; level += every)
          bands.push(matrix(edgeMidX + normalX * outward * .18, b.elevation + level * height / floors,
            edgeMidZ + normalZ * outward * .18, length, style.kind === 'geology' ? .13 : .1, .3, yaw));
      }
    }
    box(part, [Math.max(3, width * .24), .35, Math.max(3, depth * .22)], [cx, b.elevation + height + .18, cz], ROOF);
    if (/图书馆/.test(b.name)) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(width, depth) * .18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), BLUE_GLASS);
      dome.position.set(cx, b.elevation + height + .35, cz); dome.castShadow = true; part.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.min(width, depth) * .18, .28, 6, 32), FRAME);
      rim.rotation.x = Math.PI / 2; rim.position.copy(dome.position); part.add(rim);
    }
    if (['admin', 'oil', 'geology', 'teaching', 'canteen', 'hall'].includes(style.kind)) {
      const entranceW = Math.min(15, width * .33);
      box(part, [entranceW, .35, 3.2], [cx, b.elevation + 3.4, cz - depth / 2 - 1.2], FRAME);
      box(part, [Math.min(9, width * .22), 2.8, .18], [cx, b.elevation + 1.4, cz - depth / 2 - .12], DOOR);
      for (const side of [-1, 1])
        box(part, [.35, 3.2, .45], [cx + side * entranceW * .48, b.elevation + 1.6, cz - depth / 2 - 1.2], PALE);
      if (style.kind === 'admin' || style.kind === 'oil' || style.kind === 'geology')
        for (let step = 0; step < 2; step++)
          box(part, [entranceW * .9, .13, .75], [cx, b.elevation + .08 + step * .13, cz - depth / 2 - 3.2 + step * .75], PALE);
      if (style.kind === 'oil') sign(part, '中油大厦', cx, b.elevation + Math.min(height - 2, 9), cz - depth / 2 - .3, Math.min(21, width * .45));
      if (style.kind === 'geology') sign(part, '地质楼', cx, b.elevation + Math.min(height - 2, 8), cz - depth / 2 - .3, Math.min(13, width * .35));
    }
    if (style.kind === 'sports') {
      box(part, [Math.max(3, width * .88), 1.2, Math.max(3, depth * .88)], [cx, b.elevation + height + .6, cz], ROOF);
    }
    if (style.kind === 'geology' || style.kind === 'teaching') {
      for (let level = 3; level < floors; level += 3)
        box(part, [Math.max(3, width * .92), .16, .44], [cx, b.elevation + level * height / floors, cz - depth / 2 - .08], PALE);
    }
    if (style.kind === 'hall') {
      for (let step = 0; step < 3; step++)
        box(part, [Math.min(15, width * .4), .16, 1.2], [cx, b.elevation + .08 + step * .16, cz - depth / 2 - 5 + step * 1.2], PALE);
    }
  }
  const instance = (group: THREE.Group, material: THREE.Material, matrices: THREE.Matrix4[]) => {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh);
  };
  instance(buildingsGroup, GLASS, windowsDark);
  instance(buildingsGroup, BLUE_GLASS, windowsBlue);
  instance(buildingsGroup, LIT_GLASS, windowsDarkLit);
  instance(buildingsGroup, LIT_BLUE_GLASS, windowsBlueLit);
  instance(buildingsGroup, FRAME, frames);
  instance(buildingsGroup, PALE, balconies);
  instance(buildingsGroup, SILL, sills);
  instance(buildingsGroup, DARK_TRIM, mullions);
  instance(buildingsGroup, SILL, bands);
  instance(buildingsGroup, FRAME, railings);
  const walkSegments: [THREE.Vector3, THREE.Vector3][] = [];
  const treePositions: THREE.Vector3[] = [];
  const wet = mat('wetRoad', '#899ba7', .09, .35);
  wet.transparent = true; wet.opacity = 0; wet.depthWrite = false;
  for (const route of paths) for (let i = 1; i < route.path.length; i++) {
    const p = route.path[i - 1], q = route.path[i];
    if (Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(q[0]), Math.abs(q[1])) > 550) continue;
    const a = new THREE.Vector3(p[0], 0, -p[1]), b = new THREE.Vector3(q[0], 0, -q[1]);
    const length = a.distanceTo(b); if (length < 4 || length > 220) continue;
    walkSegments.push([a, b]);
    if (/府学路|中石路|环路|主/.test(route.name))
      for (let d = 15; d < length; d += 38) treePositions.push(a.clone().lerp(b, d / length));
  }
  const site = createSiteElements(buildings);
  baseGroup.add(site.fountainGroup, site.wallGroup, site.gateGroup);
  const collides = (x: number, z: number, pad = 3) => buildings.some((b) => b.insideCampus && x > b.bounds[0] - pad && x < b.bounds[2] + pad && -z > b.bounds[1] - pad && -z < b.bounds[3] + pad);
  const insideRing = (x: number, north: number, ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > north) !== (b[1] > north) && x < (b[0] - a[0]) * (north - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const nearRing = (x: number, north: number, ring: number[][], radius: number) => ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / Math.max(.001, dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, north - a[1] - t * dy) < radius;
  });
  const collidesPatrol = (x: number, z: number) => buildings.some(b => {
    const north = -z, radius = .35;
    if (!b.insideCampus || x < b.bounds[0] - radius || x > b.bounds[2] + radius || north < b.bounds[1] - radius || north > b.bounds[3] + radius) return false;
    return b.polygons.some(polygon => {
      const [outer, ...holes] = polygon;
      if (!insideRing(x, north, outer) && !nearRing(x, north, outer, radius)) return false;
      return !holes.some(hole => insideRing(x, north, hole) && !nearRing(x, north, hole, radius));
    });
  });
  const nearRoad = (x: number, z: number) => walkSegments.some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1, dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < 5;
  });
  // 楼前绿地沿原建筑轮廓留空，避让楼体和已有道路，不另造建筑占地。
  for (const building of buildings) {
    if (!building.insideCampus || building.height < 2) continue;
    const [west, , east, north] = building.bounds;
    const width = east - west;
    if (width < 18) continue;
    for (const side of [-1, 1]) {
      const x = (west + east) / 2 + side * width * .27;
      const z = -north - 9;
      if (collides(x, z, 4) || nearRoad(x, z)) continue;
      const lawnWidth = Math.min(13, width * .22);
      box(greenGroup, [lawnWidth, .12, 5.2], [x, .1, z], GRASS);
      box(greenGroup, [lawnWidth, .55, .6], [x, .42, z - 2.2], SHRUB);
    }
  }
  const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [];
  treePositions.forEach((p, i) => {
    if (i % 2 || collides(p.x, p.z, 5)) return;
    const h = 5.3 + (i % 4) * .3;
    trunks.push(matrix(p.x + 4.5, h / 2, p.z + 4.5, .45, h, .45, 0));
    crowns.push(matrix(p.x + 4.5, h + 2, p.z + 4.5, 3.4, 3.1, 3.4, 0));
    box(greenGroup, [2.6, .18, 2.6], [p.x + 4.5, .1, p.z + 4.5], GRASS);
    if (i % 5 === 0) {
      box(lightGroup, [.13, 6.2, .13], [p.x - 4, 3.1, p.z - 4], FRAME);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.32, 8, 6), LAMP);
      bulb.position.set(p.x - 4, 6.25, p.z - 4); lightGroup.add(bulb);
    }
  });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .6, 1, 6), TRUNK, trunks.length);
  trunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m)); greenGroup.add(trunkMesh);
  const crownMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), TREE, crowns.length);
  crowns.forEach((m, i) => crownMesh.setMatrixAt(i, m)); crownMesh.castShadow = true; greenGroup.add(crownMesh);
  for (const place of landmarks.filter((l) => /图书馆|主楼/.test(l.name))) {
    const [x, n] = place.center;
    for (const d of [-1, 1]) {
      box(greenGroup, [12, .22, 4], [x + d * 18, .14, -n - 28], GRASS);
      box(greenGroup, [12.4, .18, .25], [x + d * 18, .25, -n - 30], CURB);
    }
  }
  const field = landmarks.find((l) => l.placeKind === 'sports' && /操场/.test(l.name));
  if (field) {
    const [w, s, e, n] = field.bounds, cx = (w + e) / 2, cz = -(s + n) / 2;
    const outer = new THREE.Mesh(new THREE.RingGeometry(.72, 1, 64), mat('track', '#a74442'));
    outer.rotation.x = -Math.PI / 2; outer.scale.set((e - w) / 2, (n - s) / 2, 1); outer.position.set(cx, .18, cz); sportsGroup.add(outer);
    box(sportsGroup, [(e - w) * .68, .04, (n - s) * .68], [cx, .2, cz], GRASS);
    for (const d of [-1, 1]) box(sportsGroup, [(e - w) * .65, .01, .16], [cx, .25, cz + d * (n - s) * .31], LINE);
  }
  // 行人使用原始路面网格推导的米制路线，南北校区均覆盖；不再沿校外道路往返。
  const routes: WalkingRoute[] = pedestrianRoutes.routes.map(route => {
    const points = route.points.map(([x, north]) => [x, -north] as [number, number]);
    const lengths = [0];
    for (let j = 1; j < points.length; j++) lengths.push(lengths[j - 1] + Math.hypot(
      points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
    return { name: `${route.from} → ${route.to}`, region: route.region, points, lengths, total: lengths.at(-1) ?? 0 };
  }).filter(route => route.total > 8);
  const weightedRoutes = routes.flatMap(route => route.region === 'south' ? [route, route] : [route]);
  const crowd = createPedestrianCrowd();
  pedestrianGroup.add(crowd.group);
  const routeMarkers = new THREE.Group();
  routeMarkers.name = 'pedestrianRoutes';
  const dotMatrices: THREE.Matrix4[] = [];
  for (const route of routes) for (let d = 0; d < route.total; d += 9) {
    let segment = 1;
    while (segment < route.lengths.length - 1 && route.lengths[segment] < d) segment++;
    const t = (d - route.lengths[segment - 1]) / Math.max(.001, route.lengths[segment] - route.lengths[segment - 1]);
    const a = route.points[segment - 1], b = route.points[segment];
    dotMatrices.push(matrix(a[0] + (b[0] - a[0]) * t, .13, a[1] + (b[1] - a[1]) * t, .8, .07, .8, 0));
  }
  if (dotMatrices.length) {
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5),
      new THREE.MeshBasicMaterial({ color: '#bb253b', transparent: true, opacity: .64, depthWrite: false }), dotMatrices.length);
    dotMatrices.forEach((m, i) => dots.setMatrixAt(i, m));
    routeMarkers.add(dots);
  }
  routeMarkers.visible = false;
  pedestrianGroup.add(routeMarkers);
  const walkers: Walker[] = [];
  let pedestrianCount = 96, pedestrianSpeed = 1;
  const sampleRoute = (walker: Walker) => {
    const { route } = walker;
    let segment = 1;
    while (segment < route.lengths.length - 1 && route.lengths[segment] < walker.distance) segment++;
    const a = route.points[segment - 1], b = route.points[segment];
    const t = (walker.distance - route.lengths[segment - 1]) / Math.max(.001, route.lengths[segment] - route.lengths[segment - 1]);
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
    const direction = walker.direction;
    // 相向行人走道路两侧，局部错开相同路线上的队列。
    const lane = walker.lane + direction * .45 + walker.avoidance;
    return {
      x: a[0] + dx * t - dz / length * lane,
      z: a[1] + dz * t + dx / length * lane,
      heading: Math.atan2(dx * direction, dz * direction),
    };
  };
  const createWalker = (index: number): Walker => {
    const route = weightedRoutes[(index * 17 + Math.floor(index / 11) * 7) % weightedRoutes.length];
    const walker: Walker = {
      route, distance: ((index * .61803398875) % 1) * route.total,
      direction: index % 2 ? -1 : 1, speed: .8 + (index % 7) * .115,
      pause: index % 11 === 0 ? 1.4 : 0, phase: index * 1.73,
      lane: [-.55, -.3, 0, .3, .55][index % 5], avoidance: 0, x: 0, z: 0, heading: 0,
    };
    Object.assign(walker, sampleRoute(walker));
    return walker;
  };
  const setPedestrianCount = (count: number) => {
    pedestrianCount = Math.max(0, Math.min(crowd.max, Math.round(count)));
    if (!weightedRoutes.length) pedestrianCount = 0;
    while (walkers.length < pedestrianCount) walkers.push(createWalker(walkers.length));
    crowd.setCount(pedestrianCount);
    for (let i = 0; i < pedestrianCount; i++) {
      const w = walkers[i];
      crowd.setPerson(i, w.x, w.z, w.heading, w.phase, false);
    }
    crowd.flush();
  };
  setPedestrianCount(pedestrianCount);
  const rainPositions = new Float32Array(1600 * 6);
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: '#cbd5d8', transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  weatherGroup.add(rain); rain.visible = false;
  const roboDogState: RoboDogState = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), speed: 1.2, state: 'idle', firstPerson: false };
  const patrolRoutes = new Map<string, PatrolRoute>(CUPB_CONFIG.patrolRoutes.map(def => {
    const route = buildPatrolRoute(def, pedestrianRoutes.routes);
    return [route.id, route];
  }));
  let activePatrol: PatrolRoute | null = null;
  let patrolStatus: PatrolStatus = 'idle', patrolLeg = 0, patrolPoint = 1;
  let patrolDistance = 0, inspectionTime = 0, primaryDetours = 0;
  let dogGait: DogGait | null = null;
  let dogPaint: ((hex: string) => void) | null = null;
  let dogBeacon: ReturnType<typeof createRoboDogBeacon> | null = null;
  let dogColor = '#c5283e';
  const primaryTrail = createRoboDogTrail(roadGroup, dogColor);
  const personGap = 1.45;
  const peopleNear = (x: number, z: number, radius: number) => {
    let closest = Infinity;
    for (let i = 0; i < pedestrianCount; i++)
      closest = Math.min(closest, Math.hypot(x - walkers[i].x, z - walkers[i].z));
    return closest < radius;
  };
  const fleet = createRoboDogFleet({ baseGroup, roadGroup, routes: patrolRoutes, primary: roboDog,
    speed: () => roboDogState.speed, collides: collidesPatrol, nearRoad, peopleNear });
  const separateWalker = (walker: Walker, index: number, preferred: { x: number; z: number; heading: number }) => {
    const robots = robotLoaded ? [roboDog.position, ...fleet.positions()] : [];
    const nearest = robots.reduce<THREE.Vector3 | null>((best, dog) =>
      Math.hypot(preferred.x - dog.x, preferred.z - dog.z) < Math.hypot(preferred.x - (best?.x ?? Infinity), preferred.z - (best?.z ?? Infinity)) ? dog : best, null);
    if (!nearest || Math.hypot(preferred.x - nearest.x, preferred.z - nearest.z) >= personGap) return preferred;
    // 正常相遇时先停步等待横向避让，避免行人瞬间跳到机器狗另一侧。
    if (Math.hypot(walker.x - nearest.x, walker.z - nearest.z) >= personGap)
      return { x: walker.x, z: walker.z, heading: walker.heading };
    let best: typeof preferred | null = null, bestDistance = Infinity;
    for (let k = 0; k < 16; k++) {
      const angle = k * Math.PI / 8;
      const x = nearest.x + Math.cos(angle) * (personGap + .08);
      const z = nearest.z + Math.sin(angle) * (personGap + .08);
      if (collidesPatrol(x, z)) continue;
      if (robots.some(dog => dog !== nearest && Math.hypot(x - dog.x, z - dog.z) < personGap)) continue;
      if (walkers.some((other, j) => j !== index && j < pedestrianCount && Math.hypot(x - other.x, z - other.z) < .8)) continue;
      const distance = Math.hypot(x - preferred.x, z - preferred.z);
      if (distance < bestDistance) { best = { x, z, heading: preferred.heading }; bestDistance = distance; }
    }
    return best ?? { x: walker.x, z: walker.z, heading: walker.heading };
  };
  const getPatrolState = (): PatrolSnapshot => ({
    routeId: activePatrol?.id ?? null,
    status: patrolStatus,
    checkpoint: activePatrol?.checkpoints[Math.min(patrolLeg + 1, activePatrol.checkpoints.length - 1)] ?? null,
    checkpointIndex: activePatrol ? Math.min(patrolLeg + 1, activePatrol.checkpoints.length - 1) : 0,
    checkpointCount: activePatrol?.checkpoints.length ?? 0,
    distance: patrolDistance,
    total: activePatrol?.length ?? 0,
    detours: primaryDetours,
  });
  const advancePatrol = (dt: number) => {
    if (!activePatrol || patrolStatus === 'idle' || patrolStatus === 'paused' || patrolStatus === 'blocked' || patrolStatus === 'completed') return;
    if (patrolStatus === 'checking') {
      inspectionTime = Math.max(0, inspectionTime - dt);
      if (inspectionTime > 0) return;
      if (patrolLeg === activePatrol.legs.length - 1) {
        patrolStatus = 'completed';
        roboDogState.state = 'idle';
      } else {
        patrolLeg++;
        patrolPoint = 1;
        patrolStatus = 'turning';
      }
      return;
    }
    const leg = activePatrol.legs[patrolLeg];
    while (patrolPoint < leg.points.length) {
      const point = leg.points[patrolPoint];
      const dx = point[0] - roboDog.position.x, dz = point[1] - roboDog.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < .08) { patrolPoint++; continue; }
      const direction = new THREE.Vector3(dx / distance, 0, dz / distance);
      const heading = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
      const angle = roboDogState.quaternion.angleTo(heading);
      if (angle > .055) {
        roboDogState.quaternion.slerp(heading, Math.min(1, 1.8 * dt / angle));
        roboDog.quaternion.copy(roboDogState.quaternion);
        roboDogState.state = 'turning';
        patrolStatus = 'turning';
        return;
      }
      const step = Math.min(distance, roboDogState.speed * dt);
      const nextX = roboDog.position.x + direction.x * step;
      const nextZ = roboDog.position.z + direction.z * step;
      // 行人路网已经限定可行走位置；建筑碰撞按真实轮廓，不能用包围盒封死庭院和楼前路。
      if (collidesPatrol(nextX, nextZ)) {
        const detour = primaryDetours < 3 && findPatrolDetour(
          [roboDog.position.x, roboDog.position.z], leg.points, patrolPoint,
          (x, z) => !collidesPatrol(x, z) && nearRoad(x, z));
        if (detour) {
          leg.points.splice(patrolPoint, detour.rejoinIndex - patrolPoint + 1, ...detour.waypoints);
          refreshPatrolRouteLength(activePatrol);
          primaryDetours++;
          patrolStatus = 'turning';
          roboDogState.state = 'turning';
        } else {
          patrolStatus = 'blocked';
          roboDogState.state = 'idle';
        }
        return;
      }
      // 行人优先：进入安全距离就原地等待，下一帧自动重试，不将行人当作永久路障。
      if (peopleNear(nextX, nextZ, personGap) || fleet.positions().some(dog => Math.hypot(nextX - dog.x, nextZ - dog.z) < 1.7)) {
        patrolStatus = 'yielding';
        roboDogState.state = 'idle';
        return;
      }
      roboDog.position.set(nextX, roboDog.position.y, nextZ);
      primaryTrail.mark(nextX, nextZ);
      roboDogState.position.copy(roboDog.position);
      roboDogState.quaternion.copy(heading);
      roboDog.quaternion.copy(heading);
      roboDogState.state = 'walking';
      patrolStatus = 'walking';
      patrolDistance = Math.min(activePatrol.length, patrolDistance + step);
      if (distance - step < .08) patrolPoint++;
      return;
    }
    patrolDistance = Math.min(activePatrol.length, activePatrol.legs.slice(0, patrolLeg + 1).reduce((sum, item) => sum + item.length, 0));
    inspectionTime = activePatrol.stopSeconds;
    patrolStatus = 'checking';
    roboDogState.state = 'idle';
  };
  let weather: Weather = 'clear';
  let timeOfDay: Preset = 'day';
  let rainStrength = 0, nightStrength = 0;
  let robotLoaded = false;
  const startPrimaryPatrol = (id: string) => {
    const source = patrolRoutes.get(id);
    if (!robotLoaded || !source) return false;
    const first = source.legs[0].points;
    let startIndex = -1;
    for (let i = 0; i < first.length - 1; i++) {
      if (!peopleNear(first[i][0], first[i][1], personGap * 1.6) && !collidesPatrol(first[i][0], first[i][1]) && !fleet.positions().some(dog => Math.hypot(first[i][0] - dog.x, first[i][1] - dog.z) < 1.7)) { startIndex = i; break; }
    }
    if (startIndex < 0) return false;
    activePatrol = clonePatrolRoute(source);
    activePatrol.legs[0].points = activePatrol.legs[0].points.slice(startIndex);
    refreshPatrolRouteLength(activePatrol);
    patrolLeg = 0;
    patrolPoint = 1;
    patrolDistance = 0;
    inspectionTime = 0;
    primaryDetours = 0;
    patrolStatus = 'turning';
    const [x, z] = first[startIndex];
    roboDog.position.set(x, 0, z);
    primaryTrail.reset(x, z);
    roboDogState.position.copy(roboDog.position);
    roboDogState.state = 'turning';
    return true;
  };
  return {
    root: baseGroup, buildingsGroup, roadGroup, greenGroup, pedestrianGroup, roboDog, weatherGroup, lightGroup,
    fountainGroup: site.fountainGroup, wallGroup: site.wallGroup, gateGroup: site.gateGroup,
    setGateOpen: (name: string, open: boolean) => site.setGateOpen(name, open),
    setPedestrianCount,
    setPedestrianSpeed: (speed: number) => { pedestrianSpeed = Math.max(0, Math.min(3, speed)); },
    setPedestrianRoutesVisible: (visible: boolean) => { routeMarkers.visible = visible; },
    roboDogState,
    startRoboDogPatrol: startPrimaryPatrol,
    startCoordinatedPatrol() {
      if (!robotLoaded) return { assignments: [] as { dogId: number; routeId: string }[], unavailableDogs: [1] };
      while (fleet.states().length < 3 && fleet.add() !== null) { /* 补足可安全投放的机器狗 */ }
      const ids = [1, ...fleet.states().map(dog => dog.id)];
      const preferred = planDistinctPatrolRoutes([...patrolRoutes.values()], ids.length);
      const used = new Set<string>();
      const assignments: { dogId: number; routeId: string }[] = [];
      const unavailableDogs: number[] = [];
      ids.forEach((dogId, index) => {
        const candidates = [preferred[index], ...patrolRoutes.keys()].filter((id): id is string => !!id && !used.has(id));
        const routeId = candidates.find(id => dogId === 1 ? startPrimaryPatrol(id) : fleet.start(dogId, id));
        if (routeId) { used.add(routeId); assignments.push({ dogId, routeId }); }
        else unavailableDogs.push(dogId);
      });
      return { assignments, unavailableDogs };
    },
    pauseRoboDogPatrol() {
      if (activePatrol && !['completed', 'blocked'].includes(patrolStatus)) {
        patrolStatus = 'paused';
        roboDogState.state = 'idle';
      }
    },
    resumeRoboDogPatrol() {
      if (activePatrol && patrolStatus === 'paused') {
        patrolStatus = inspectionTime > 0 ? 'checking' : 'turning';
        roboDogState.state = inspectionTime > 0 ? 'idle' : 'turning';
      }
    },
    stopRoboDogPatrol() { activePatrol = null; patrolStatus = 'idle'; roboDogState.state = 'idle'; },
    getRoboDogPatrolState: getPatrolState,
    addRoboDog: () => fleet.add(),
    removeRoboDog: (id: number) => fleet.remove(id),
    startAdditionalDogPatrol: (id: number, routeId: string) => fleet.start(id, routeId),
    stopAdditionalDogPatrol: (id: number) => fleet.stop(id),
    getAdditionalDogPatrolStates: () => fleet.states(),
    setRoboDogColor(hex: string) {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      dogColor = hex;
      dogPaint?.(hex);
      dogBeacon?.setColor(hex);
      primaryTrail.setColor(hex);
    },
    // 道路只使用原校园 GLB 提取的路面；paths 仅供行人与机器狗导航。
    async loadOriginalRoads(modelUrl: string) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      gltf.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = true;
        }
      });
      roadGroup.add(gltf.scene);
      const wetRoads = gltf.scene.clone(true);
      wetRoads.position.y += .025;
      wetRoads.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.material = wet;
          object.castShadow = false;
        }
      });
      wetGroup.add(wetRoads);
    },
    // 绿化采用原中石大模型中的绿色地块，树形复用广西大学既有模板 0/1。
    async loadMappedGreens(greenModelUrl: string, treeModelUrl: string, positionUrl: string, loader: GLTFLoader) {
      const [greenModel, treeModel, positions] = await Promise.all([
        loader.loadAsync(greenModelUrl),
        loader.loadAsync(treeModelUrl),
        fetch(positionUrl).then(async response => {
          if (!response.ok) throw new Error(`绿化点位加载失败: ${response.status}`);
          return response.json() as Promise<CupbGreenData>;
        }),
      ]);
      greenModel.scene.name = 'mappedGrass';
      // 从原模型抽取的地块与程序化底板同高，略抬起以避免深度冲突。
      greenModel.scene.position.y = .06;
      const mappedGrass = new THREE.MeshStandardMaterial({
        name: 'mappedGrass', color: '#8fae81', roughness: 1,
        side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      greenModel.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.material = mappedGrass;
          object.castShadow = false;
          object.receiveShadow = true;
        }
      });
      greenGroup.add(greenModel.scene);
      treeModel.scene.updateMatrixWorld(true);
      const dummy = new THREE.Object3D();
      for (const part of treeModel.scene.children) {
        const typ = part.userData.template;
        if (typ !== 0 && typ !== 1) continue;
        const rows = positions.trees.filter(row => row[3] === typ);
        part.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
          const mesh = new THREE.InstancedMesh(geometry, object.material, rows.length);
          mesh.name = `gxuTreeType${typ}`;
          rows.forEach(([x, north, height], i) => {
            const appearance = treeAppearance(x, north);
            dummy.position.set(x, .05, -north);
            dummy.rotation.set(0, treeRotation(x, north), 0);
            dummy.scale.set(appearance.width * height / 9, appearance.height * height / 9,
              appearance.width * height / 9);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, new THREE.Color(...appearance.tint));
          });
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          greenGroup.add(mesh);
        });
      }
      const shrub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), SHRUB, positions.shrubs.length);
      shrub.name = 'mappedShrubs';
      positions.shrubs.forEach(([x, north, width], i) => {
        dummy.position.set(x, .56, -north);
        dummy.rotation.set(0, treeRotation(x, north), 0);
        dummy.scale.set(width, .56, width * .88);
        dummy.updateMatrix();
        shrub.setMatrixAt(i, dummy.matrix);
      });
      shrub.instanceMatrix.needsUpdate = true;
      shrub.receiveShadow = true;
      greenGroup.add(shrub);
    },
    setWeather(next: Weather, time: Preset) {
      weather = next;
      timeOfDay = time;
      lightGroup.visible = true;
      LAMP.emissive.set('#fff0ca');
      LIT_GLASS.emissive.set('#ecf0e5');
      LIT_BLUE_GLASS.emissive.set('#e0e9e9');
    },
    update(dt: number, time: number, camera: THREE.Camera) {
      site.update(weather, time);
      const blend = Math.min(1, dt / .45);
      rainStrength += ((weather === 'rain' ? 1 : 0) - rainStrength) * blend;
      nightStrength += ((timeOfDay === 'night' ? 1 : 0) - nightStrength) * blend;
      rain.visible = rainStrength > .01; rainMaterial.opacity = rainStrength * .64;
      wetGroup.visible = rainStrength > .01; wet.opacity = rainStrength * .34;
      LAMP.emissiveIntensity = nightStrength * 3;
      LIT_GLASS.emissiveIntensity = nightStrength * .55;
      LIT_BLUE_GLASS.emissiveIntensity = nightStrength * .45;
      for (let i = 0; i < pedestrianCount; i++) {
        const w = walkers[i];
        const dogDistance = robotLoaded ? Math.hypot(w.x - roboDog.position.x, w.z - roboDog.position.z) : Infinity;
        const baseLane = w.lane + w.direction * .45;
        const side = baseLane >= 0 ? 1 : -1;
        const targetAvoidance = dogDistance < 4.5 ? side * Math.max(0, 2.4 - Math.abs(baseLane)) : 0;
        const oldAvoidance = w.avoidance;
        w.avoidance += Math.max(-dt * 2.8, Math.min(dt * 2.8, targetAvoidance - w.avoidance));
        const avoidingDog = robotLoaded && (dogDistance < 5 || Math.abs(w.avoidance) > .01);
        if (avoidingDog) {
          const offsetPosition = sampleRoute(w);
          if (collidesPatrol(offsetPosition.x, offsetPosition.z)) w.avoidance = oldAvoidance;
        }
        let moving = pedestrianSpeed > 0 && w.pause <= 0;
        if (w.pause > 0 && pedestrianSpeed > 0) w.pause = Math.max(0, w.pause - dt);
        const previous = w.distance;
        if (moving) {
          const next = Math.max(0, Math.min(w.route.total, w.distance + w.direction * w.speed * pedestrianSpeed * Math.min(dt, .1)));
          w.distance = next;
          if (next === 0 || next === w.route.total) {
            w.direction *= -1;
            w.pause = 1.1 + (i % 4) * .48;
            moving = false;
          }
        }
        let p = sampleRoute(w);
        if (avoidingDog && collidesPatrol(p.x, p.z)) {
          w.distance = previous;
          w.avoidance = oldAvoidance;
          p = sampleRoute(w);
          moving = false;
        }
        p = separateWalker(w, i, p);
        // 同路相向与结伴行走时保留间距，避免人形叠在一起。
        const crowded = (moving || Math.abs(w.avoidance - oldAvoidance) > .01) && walkers.some((other, j) => j !== i && j < pedestrianCount && other.route === w.route && Math.hypot(p.x - other.x, p.z - other.z) < .8);
        if (crowded) { w.distance = previous; moving = false; }
        else { w.x = p.x; w.z = p.z; w.heading = p.heading; }
        if (moving) w.phase += dt * w.speed * pedestrianSpeed * 5.8;
        crowd.setPerson(i, w.x, w.z, w.heading, w.phase, moving);
      }
      if (pedestrianCount) crowd.flush();
      advancePatrol(dt);
      fleet.update(dt, camera, time);
      dogGait?.update(dt, roboDogState.state);
      dogBeacon?.update(camera, time, roboDogState.firstPerson);
      if (rain.visible) {
        for (let i = 0; i < 1600; i++) {
          const seed = i * 12.9898;
          const x = Math.sin(seed) * 43758.5453 % 1;
          const z = Math.sin(seed + 3.1) * 73581.234 % 1;
          const offset = i * 6, y = ((time * -.025 + i * 17.7) % 65 + 65) % 65;
          rainPositions[offset] = camera.position.x + x * 140;
          rainPositions[offset + 1] = y;
          rainPositions[offset + 2] = camera.position.z + z * 140;
          rainPositions[offset + 3] = rainPositions[offset] + .24;
          rainPositions[offset + 4] = y + 1.6;
          rainPositions[offset + 5] = rainPositions[offset + 2] - .1;
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }
    },
    async loadRoboDog(modelUrl: string, modelLoader?: GLTFLoader, onProgress?: (fraction: number | null) => void) {
      if (!modelUrl) throw new Error('机器狗模型 URL 不能为空');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await (modelLoader ?? new GLTFLoader()).loadAsync(modelUrl, event => {
        onProgress?.(event.total > 0 ? Math.min(1, event.loaded / event.total) : null);
      });
      onProgress?.(1);
      const visual = gltf.scene;
      // 原始 Rhino/FBX 资产以 Z 为竖直轴，转换后的 glTF 仍保留此轴向。
      visual.rotation.x = -Math.PI / 2;
      // 当前模型头部朝向源文件 -Y，校正后统一以局部 -Z 为前方。
      visual.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI);
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.length()) || Math.max(size.x, size.z) < 1e-6)
        throw new Error('机器狗模型尺寸无效');
      // 将源文件的未知单位归一为约 1.1 米长，保留原始网格、材质和法线。
      visual.scale.multiplyScalar(1.1 / Math.max(size.x, size.z));
      visual.updateMatrixWorld(true);
      bounds.setFromObject(visual);
      const center = bounds.getCenter(new THREE.Vector3());
      visual.position.x -= center.x;
      visual.position.z -= center.z;
      visual.position.y -= bounds.min.y;
      visual.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      dogGait = await createRoboDogGait(gltf, visual);
      dogPaint = createRoboDogPaint(visual);
      dogPaint(dogColor);
      dogBeacon?.dispose();
      roboDog.clear();
      roboDog.add(visual);
      fleet.setTemplate(visual);
      dogBeacon = createRoboDogBeacon(roboDog, dogColor);
      robotLoaded = true;
      return visual;
    },
    moveRoboDog(dt: number, direction: THREE.Vector3) {
      if (activePatrol) { activePatrol = null; patrolStatus = 'idle'; }
      if (!robotLoaded || roboDogState.speed <= 0) return;
      const step = direction.clone().setY(0).normalize().multiplyScalar(roboDogState.speed * dt);
      const next = roboDogState.position.clone().add(step);
      if (collides(next.x, next.z, 1.2) || !nearRoad(next.x, next.z) || peopleNear(next.x, next.z, personGap)) { roboDogState.state = 'idle'; return; }
      roboDogState.position.copy(next); roboDog.position.copy(next);
      const heading = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction.clone().setY(0).normalize());
      roboDogState.state = roboDogState.quaternion.angleTo(heading) > .25 ? 'turning' : 'walking';
      roboDogState.quaternion.copy(heading);
      roboDog.quaternion.copy(roboDogState.quaternion);
    },
  };
}
