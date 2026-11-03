import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUPB_CONFIG } from '../lib/campus/cupb-config.ts';
import { buildPatrolRoute } from '../lib/campus/robo-dog-patrol.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (name) =>
  JSON.parse(await readFile(path.join(root, 'public/data', name), 'utf8'));

const manifest = await readJson('models.json');
assert.equal(manifest.base.url, CUPB_CONFIG.model.url);
for (const key of ['zones', 'landmarks', 'infrastructure', 'sports'])
  assert.deepEqual(manifest[key], [], `旧校园 ${key} 资源不应进入中石大场景`);
assert.equal(manifest.trees, undefined);

const model = await readFile(path.join(root, 'public', manifest.base.url));
assert.equal(model.length, manifest.base.bytes);
assert.equal(createHash('sha256').update(model).digest('hex'), manifest.base.sha256);
const gltf = manifest.base.url.endsWith('.glb')
  ? (assert.equal(model.readUInt32LE(0), 0x46546c67, '无效 GLB'),
    JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString()))
  : JSON.parse(model.toString('utf8'));
const dogModel = await readFile(path.join(root, 'public', CUPB_CONFIG.roboDog.url));
assert.equal(dogModel.readUInt32LE(0), 0x46546c67, '机器狗 GLB 无效');
const dogGltf = JSON.parse(dogModel.subarray(20, 20 + dogModel.readUInt32LE(12)).toString());
// 当前无骨骼动画资产的四腿网格必须保持独立，程序化髋/膝转轴才能正常工作。
if (!dogGltf.animations?.length) {
  for (const nodeIndex of [12, 17, 22, 27]) {
    const group = dogGltf.nodes[nodeIndex];
    assert.equal(group?.children?.length, 4, `机器狗腿组 ${nodeIndex} 结构发生变化`);
    assert.ok(Math.abs(group.scale[0] - .1) < .001, `机器狗腿组 ${nodeIndex} 缩放发生变化`);
  }
}
const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives);
assert.ok(primitives.some((primitive) => primitive.attributes.COLOR_0 !== undefined)
  || [...(gltf.nodes ?? []), ...gltf.meshes].some((item) =>
    /building|road|bridge|tree|vegetation|water|lake|sport|建筑|道路|桥|树|植被|水体|湖|运动场/i.test(item.name ?? '')),
  '模型须保留类别顶点色或语义节点名称，才能控制图层');
const positions = primitives.map((primitive) => gltf.accessors[primitive.attributes.POSITION]);
assert.ok(positions.every((accessor) => accessor.min && accessor.max),
  '模型 POSITION accessor 须包含 min/max 以校验点位坐标');
const minX = Math.min(...positions.map((accessor) => accessor.min[0]));
const minZ = Math.min(...positions.map((accessor) => accessor.min[2]));
const maxX = Math.max(...positions.map((accessor) => accessor.max[0]));
const maxZ = Math.max(...positions.map((accessor) => accessor.max[2]));

const buildings = await readJson('buildings.json');
const pedestrianRoads = await readJson('pedestrian-routes.json');
const landmarks = CUPB_CONFIG.landmarks;
assert.equal(buildings.length, 100);
assert.ok(landmarks.length > 0);
assert.equal(new Set(landmarks.map((l) => l.id)).size, landmarks.length);
for (const place of landmarks) {
  const [east, north] = place.center;
  assert.ok(east >= minX && east <= maxX && -north >= minZ && -north <= maxZ,
    `${place.name} 超出中石大模型范围`);
}
assert.equal(new Set(CUPB_CONFIG.tourOrder).size, CUPB_CONFIG.tourOrder.length);
const ids = new Set(landmarks.map((landmark) => landmark.id));
for (const id of CUPB_CONFIG.tourOrder)
  assert.ok(ids.has(id), `巡游节点不存在：${id}`);
// 每条巡检路线必须逐段沿现有道路连接，不能在建筑之间直线飞越。
assert.equal(CUPB_CONFIG.patrolRoutes.length, 6);
for (const definition of CUPB_CONFIG.patrolRoutes) {
  const patrol = buildPatrolRoute(definition, pedestrianRoads.routes);
  assert.ok(patrol.length > 50 && patrol.legs.length === definition.checkpoints.length - 1);
  for (const leg of patrol.legs) {
    assert.ok(leg.points.length >= 2);
    for (const [east, z] of leg.points)
      assert.ok(Number.isFinite(east) && Number.isFinite(z), `巡检点无效：${definition.name}`);
  }
}
const names = buildings.map((b) => b.name).join('|');
assert.ok(!/广西大学|西大|农院路|秀灵路/.test(names));
console.log(`中石大模型与 ${buildings.length} 栋建筑、${landmarks.length} 个地标坐标一致。`);
