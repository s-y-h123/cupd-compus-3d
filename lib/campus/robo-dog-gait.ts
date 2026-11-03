import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type DogMotion = 'idle' | 'walking' | 'turning';
export type DogGait = { update: (dt: number, motion: DogMotion) => void };

/**
 * 当前 B2 机器狗 GLB 未附带骨骼/动画，但四腿的外壳、连杆、小腿和脚掌是独立网格。
 * 将这 16 个原网格挂到髋、膝转轴；未来替换有动画的模型时优先播放原生动画。
 */
export async function createRoboDogGait(gltf: GLTF, visual: THREE.Object3D): Promise<DogGait> {
  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
    return { update(dt, motion) { action.paused = motion === 'idle'; mixer.update(dt); } };
  }
  const indices = [12, 17, 22, 27];
  const groups = await Promise.all(indices.map(index => gltf.parser.getDependency('node', index))) as THREE.Object3D[];
  const root = groups[0]?.parent;
  if (!root || !groups.every(group => group?.parent === root && group.children.length === 4))
    return { update() {} };
  const pieces = groups.map(group => [...group.children]);
  // 四组腿部节点均带 0.1 缩放；转轴挂在其父级时必须换算到父级坐标。
  const sourceScale = groups[0].scale.x;
  if (!Number.isFinite(sourceScale) || sourceScale <= 0 || !groups.every(group => Math.abs(group.scale.x - sourceScale) < 1e-5))
    return { update() {} };

  const hips: THREE.Group[] = [], knees: THREE.Group[] = [];
  root.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) {
    const left = i % 2 === 0;
    const front = i >= 2;
    const sourceX = left ? -2 : 2;
    const sourceY = front ? -1 : 2.3;
    const kneeY = front ? -2.2 : 3.5;
    const hip = new THREE.Group();
    hip.name = `roboDogHip${i}`;
    hip.position.set(sourceX * sourceScale, sourceY * sourceScale, 5.2 * sourceScale);
    root.add(hip);
    hip.updateMatrixWorld(true);
    for (const set of pieces.slice(0, 2)) hip.attach(set[i]);
    const knee = new THREE.Group();
    knee.name = `roboDogKnee${i}`;
    knee.position.set(0, (kneeY - sourceY) * sourceScale, -2.5 * sourceScale);
    hip.add(knee);
    knee.updateMatrixWorld(true);
    for (const set of pieces.slice(2)) knee.attach(set[i]);
    hips.push(hip);
    knees.push(knee);
  }
  const idleHeight = visual.position.y;
  let phase = 0, blend = 0;
  return {
    update(dt, motion) {
      const target = motion === 'walking' ? 1 : motion === 'turning' ? .55 : 0;
      blend += (target - blend) * Math.min(1, dt * 7);
      if (motion !== 'idle') phase += dt * (motion === 'turning' ? 5 : 8);
      for (let i = 0; i < 4; i++) {
        const wave = Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI));
        hips[i].rotation.x = wave * .27 * blend;
        knees[i].rotation.x = Math.max(0, -wave) * .34 * blend;
      }
      visual.position.y = idleHeight + Math.abs(Math.sin(phase * 2)) * .012 * blend;
    },
  };
}
