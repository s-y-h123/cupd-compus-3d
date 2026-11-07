import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createRoboDogBeacon, createRoboDogPaint } from './robo-dog-appearance';
import type { PatrolRoute, PatrolSnapshot, PatrolStatus } from './robo-dog-patrol';

/** 巡检轨迹只在实际走过的路面盖章；InstancedMesh 避免逐点创建网格。 */
export function createRoboDogTrail(roadGroup: THREE.Group, color: string) {
  const geometry = new THREE.PlaneGeometry(.9, 1.3);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .88, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(geometry, material, 1800);
  mesh.name = 'roboDogVisitedRoad';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  roadGroup.add(mesh);
  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions([0, .16, 0, 0, .16, 0]);
  const lineMaterial = new LineMaterial({ color, linewidth: 4, transparent: true, opacity: .92, depthTest: true, depthWrite: false });
  const resize = () => lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);
  const line = new Line2(lineGeometry, lineMaterial);
  line.name = 'roboDogVisitedRoute';
  line.visible = false;
  line.renderOrder = 6;
  roadGroup.add(line);
  const dummy = new THREE.Object3D();
  let lastX = 0, lastZ = 0, carry = 0;
  let linePoints: number[] = [];
  const stamp = (x: number, z: number, dx: number, dz: number) => {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    dummy.position.set(x, .11, z);
    dummy.rotation.set(0, Math.atan2(dx, -dz), 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count++, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    linePoints.push(x, .16, z);
    if (linePoints.length >= 6) {
      lineGeometry.setPositions(linePoints);
      line.visible = true;
    }
  };
  return {
    reset(x: number, z: number) { mesh.count = 0; line.visible = false; linePoints = [x, .16, z]; lastX = x; lastZ = z; carry = 0; },
    mark(x: number, z: number) {
      const dx = x - lastX, dz = z - lastZ;
      const length = Math.hypot(dx, dz);
      if (length < 1e-5) return;
      const ux = dx / length, uz = dz / length;
      for (let at = 1.5 - carry; at <= length; at += 1.5)
        stamp(lastX + ux * at, lastZ + uz * at, ux, uz);
      carry = (carry + length) % 1.5;
      lastX = x; lastZ = z;
    },
    setColor(hex: string) { material.color.set(hex); lineMaterial.color.set(hex); },
    dispose() { window.removeEventListener('resize', resize); roadGroup.remove(mesh, line); geometry.dispose(); material.dispose(); lineGeometry.dispose(); lineMaterial.dispose(); },
  };
}

type FleetDog = {
  id: number;
  root: THREE.Group;
  route: PatrolRoute | null;
  status: PatrolStatus;
  leg: number;
  point: number;
  distance: number;
  stopTime: number;
  trail: ReturnType<typeof createRoboDogTrail>;
  beacon: ReturnType<typeof createRoboDogBeacon>;
  gait: (dt: number, motion: 'idle' | 'walking' | 'turning') => void;
  materials: Set<THREE.Material>;
};

function cloneGait(visual: THREE.Object3D) {
  const hips = [0, 1, 2, 3].map(i => visual.getObjectByName(`roboDogHip${i}`));
  const knees = [0, 1, 2, 3].map(i => visual.getObjectByName(`roboDogKnee${i}`));
  const idleHeight = visual.position.y;
  let phase = 0, blend = 0;
  return (dt: number, motion: 'idle' | 'walking' | 'turning') => {
    if (hips.some(item => !item) || knees.some(item => !item)) return;
    const target = motion === 'walking' ? 1 : motion === 'turning' ? .55 : 0;
    blend += (target - blend) * Math.min(1, dt * 7);
    if (motion !== 'idle') phase += dt * (motion === 'turning' ? 5 : 8);
    for (let i = 0; i < 4; i++) {
      const wave = Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI));
      hips[i]!.rotation.x = wave * .27 * blend;
      knees[i]!.rotation.x = Math.max(0, -wave) * .34 * blend;
    }
    visual.position.y = idleHeight + Math.abs(Math.sin(phase * 2)) * .012 * blend;
  };
}

export function createRoboDogFleet({ baseGroup, roadGroup, routes, primary, speed, collides, peopleNear }: {
  baseGroup: THREE.Group;
  roadGroup: THREE.Group;
  routes: Map<string, PatrolRoute>;
  primary: THREE.Group;
  speed: () => number;
  collides: (x: number, z: number) => boolean;
  peopleNear: (x: number, z: number, radius: number) => boolean;
}) {
  const dogs = new Map<number, FleetDog>();
  const colors = ['#1975c6', '#ed8a19', '#2a9c70'];
  let template: THREE.Object3D | null = null;
  let nextId = 2;
  const tooClose = (x: number, z: number, exclude?: number) => {
    if (Math.hypot(primary.position.x - x, primary.position.z - z) < 1.7) return true;
    for (const dog of dogs.values())
      if (dog.id !== exclude && Math.hypot(dog.root.position.x - x, dog.root.position.z - z) < 1.7) return true;
    return false;
  };
  const snapshot = (dog: FleetDog): PatrolSnapshot => ({
    routeId: dog.route?.id ?? null,
    status: dog.status,
    checkpoint: dog.route?.checkpoints[Math.min(dog.leg + 1, dog.route.checkpoints.length - 1)] ?? null,
    checkpointIndex: dog.route ? Math.min(dog.leg + 1, dog.route.checkpoints.length - 1) : 0,
    checkpointCount: dog.route?.checkpoints.length ?? 0,
    distance: dog.distance,
    total: dog.route?.length ?? 0,
  });
  return {
    setTemplate(visual: THREE.Object3D) { template = visual; },
    positions() { return [...dogs.values()].map(dog => dog.root.position); },
    tooClose,
    add() {
      if (!template || dogs.size >= 3) return null;
      const id = nextId++;
      const color = colors[(id - 2) % colors.length];
      const route = [...routes.values()][(id - 2) % routes.size];
      const point = route?.legs[0].points.find(([x, z]) => !collides(x, z) && !tooClose(x, z) && !peopleNear(x, z, 1.45));
      if (!point) return null;
      const visual = template.clone(true);
      const materials = new Set<THREE.Material>();
      visual.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.material = Array.isArray(object.material)
            ? object.material.map(material => material.clone()) : object.material.clone();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      createRoboDogPaint(visual)(color);
      visual.traverse(object => {
        if (object instanceof THREE.Mesh)
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      const root = new THREE.Group();
      root.name = `roboDog${id}`;
      root.add(visual);
      root.position.set(point[0], 0, point[1]);
      baseGroup.add(root);
      const beacon = createRoboDogBeacon(root, color);
      const trail = createRoboDogTrail(roadGroup, color);
      dogs.set(id, { id, root, route: null, status: 'idle', leg: 0, point: 1, distance: 0, stopTime: 0, trail, beacon, gait: cloneGait(visual), materials });
      return id;
    },
    remove(id: number) {
      const dog = dogs.get(id);
      if (!dog) return;
      dog.beacon.dispose(); dog.trail.dispose(); baseGroup.remove(dog.root);
      dog.materials.forEach(material => material.dispose());
      dogs.delete(id);
    },
    start(id: number, routeId: string) {
      const dog = dogs.get(id), route = routes.get(routeId);
      if (!dog || !route) return false;
      const first = route.legs[0].points;
      const index = first.findIndex(([x, z], i) => i < first.length - 1 && !collides(x, z) && !peopleNear(x, z, 1.8) && !tooClose(x, z, id));
      if (index < 0) return false;
      dog.route = route; dog.leg = 0; dog.point = index + 1;
      dog.distance = 0;
      for (let i = 1; i <= index; i++) dog.distance += Math.hypot(first[i][0] - first[i-1][0], first[i][1] - first[i-1][1]);
      dog.stopTime = 0; dog.status = 'turning';
      dog.root.position.set(first[index][0], 0, first[index][1]);
      dog.trail.reset(dog.root.position.x, dog.root.position.z);
      return true;
    },
    stop(id: number) { const dog = dogs.get(id); if (dog) { dog.route = null; dog.status = 'idle'; } },
    states() { return [...dogs.values()].map(dog => ({ id: dog.id, ...snapshot(dog) })); },
    update(dt: number, camera: THREE.Camera, time: number) {
      for (const dog of dogs.values()) {
        const route = dog.route;
        if (route && !['idle', 'paused', 'blocked', 'completed'].includes(dog.status)) {
          if (dog.status === 'checking') {
            dog.stopTime = Math.max(0, dog.stopTime - dt);
            if (!dog.stopTime) {
              if (dog.leg === route.legs.length - 1) dog.status = 'completed';
              else { dog.leg++; dog.point = 1; dog.status = 'turning'; }
            }
          } else {
            const leg = route.legs[dog.leg];
            while (dog.point < leg.points.length && Math.hypot(leg.points[dog.point][0] - dog.root.position.x, leg.points[dog.point][1] - dog.root.position.z) < .08) dog.point++;
            if (dog.point >= leg.points.length) {
              dog.distance = Math.min(route.length, route.legs.slice(0, dog.leg + 1).reduce((sum, part) => sum + part.length, 0));
              dog.stopTime = route.stopSeconds; dog.status = 'checking';
            } else {
              const [x, z] = leg.points[dog.point];
              const distance = Math.hypot(x - dog.root.position.x, z - dog.root.position.z);
              const direction = new THREE.Vector3((x - dog.root.position.x) / distance, 0, (z - dog.root.position.z) / distance);
              const heading = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
              const angle = dog.root.quaternion.angleTo(heading);
              if (angle > .055) {
                dog.root.quaternion.slerp(heading, Math.min(1, 1.8 * dt / angle));
                dog.status = 'turning';
              } else {
                const step = Math.min(distance, speed() * dt);
                const nx = dog.root.position.x + direction.x * step, nz = dog.root.position.z + direction.z * step;
                if (collides(nx, nz)) dog.status = 'blocked';
                else if (peopleNear(nx, nz, 1.45) || tooClose(nx, nz, dog.id)) dog.status = 'yielding';
                else {
                  dog.root.position.set(nx, 0, nz);
                  dog.root.quaternion.copy(heading);
                  dog.trail.mark(nx, nz);
                  dog.distance = Math.min(route.length, dog.distance + step);
                  dog.status = 'walking';
                  if (distance - step < .08) dog.point++;
                }
              }
            }
          }
        }
        dog.gait(dt, dog.status === 'walking' ? 'walking' : dog.status === 'turning' ? 'turning' : 'idle');
        dog.beacon.update(camera, time, false);
      }
    },
  };
}
