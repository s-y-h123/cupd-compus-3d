import * as THREE from 'three';

const MAX_PEDESTRIANS = 180;
type Part = { mesh: THREE.InstancedMesh; x: number; y: number; z: number; swing: 'none' | 'armLeft' | 'armRight' | 'legLeft' | 'legRight' };

/** 与右上角单人预览相同的素雅关节人形；实例化让人数滑杆不增加绘制次数。 */
export function createPedestrianCrowd() {
  const group = new THREE.Group();
  group.name = 'walkingPeople';
  const parts: Part[] = [];
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number,
    swing: Part['swing'] = 'none', coat = false) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .87 });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_PEDESTRIANS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (coat) {
      const coats = ['#454f57', '#7c8588', '#aeb3ae'];
      for (let i = 0; i < MAX_PEDESTRIANS; i++) mesh.setColorAt(i, new THREE.Color(coats[i % coats.length]));
    }
    group.add(mesh);
    parts.push({ mesh, x, y, z, swing });
  };
  add(new THREE.CylinderGeometry(.27, .34, .88, 8), '#ffffff', 0, 1.22, 0, 'none', true);
  add(new THREE.BoxGeometry(.12, .54, .04), '#e1e0d9', 0, 1.36, -.28);
  add(new THREE.CylinderGeometry(.09, .09, .16, 8), '#c6ad99', 0, 1.73, 0);
  add(new THREE.SphereGeometry(.23, 10, 8), '#c6ad99', 0, 1.93, 0);
  add(new THREE.SphereGeometry(.235, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#33383d', 0, 1.98, 0);
  for (const side of [-1, 1]) {
    const arm = side < 0 ? 'armLeft' : 'armRight';
    const leg = side < 0 ? 'legLeft' : 'legRight';
    add(new THREE.CylinderGeometry(.095, .075, .53, 7), '#ffffff', side * .36, 1.28, 0, arm, true);
    add(new THREE.SphereGeometry(.085, 7, 6), '#c6ad99', side * .36, .98, 0, arm);
    add(new THREE.CylinderGeometry(.13, .105, .69, 7), '#3b434b', side * .17, .48, 0, leg);
    add(new THREE.BoxGeometry(.19, .12, .32), '#2b3135', side * .17, .10, -.08, leg);
  }
  const root = new THREE.Object3D();
  const pivot = new THREE.Object3D();
  const local = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const all = new THREE.Matrix4();
  return {
    group,
    max: MAX_PEDESTRIANS,
    setCount(count: number) {
      for (const part of parts) part.mesh.count = count;
    },
    setPerson(index: number, x: number, z: number, heading: number, phase: number, moving: boolean) {
      const swing = moving ? Math.sin(phase) * .36 : 0;
      root.position.set(x, moving ? Math.abs(swing) * .035 : 0, z);
      root.rotation.set(0, heading, 0);
      root.updateMatrix();
      world.copy(root.matrix);
      for (const part of parts) {
        const limb = part.swing;
        if (limb === 'none') {
          local.position.set(part.x, part.y, part.z);
          local.rotation.set(0, 0, 0);
          local.updateMatrix();
          all.multiplyMatrices(world, local.matrix);
        } else {
          const arm = limb.startsWith('arm');
          const side = limb.endsWith('Left') ? -1 : 1;
          const py = arm ? 1.56 : .82;
          pivot.position.set(arm ? side * .36 : side * .17, py, 0);
          pivot.rotation.set(arm ? -side * swing * .72 : side * swing, 0, 0);
          pivot.updateMatrix();
          local.position.set(part.x - pivot.position.x, part.y - py, part.z);
          local.rotation.set(0, 0, 0);
          local.updateMatrix();
          all.multiplyMatrices(world, pivot.matrix).multiply(local.matrix);
        }
        part.mesh.setMatrixAt(index, all);
      }
    },
    flush() {
      for (const part of parts) part.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
