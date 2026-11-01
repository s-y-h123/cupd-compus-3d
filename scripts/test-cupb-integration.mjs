import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUPB_CONFIG } from '../lib/campus/cupb-config.ts';

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
const names = buildings.map((b) => b.name).join('|');
assert.ok(!/广西大学|西大|农院路|秀灵路/.test(names));
console.log(`中石大模型与 ${buildings.length} 栋建筑、${landmarks.length} 个地标坐标一致。`);
