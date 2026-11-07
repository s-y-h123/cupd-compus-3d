import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CUPB_CONFIG } from '../lib/campus/cupb-config.ts';
import { buildPatrolRoute, clonePatrolRoute, findPatrolDetour, planDistinctPatrolRoutes, refreshPatrolRouteLength } from '../lib/campus/robo-dog-patrol.ts';

const roads = JSON.parse(await readFile(new URL('../public/data/pedestrian-routes.json', import.meta.url), 'utf8')).routes;
const routes = CUPB_CONFIG.patrolRoutes.map(definition => buildPatrolRoute(definition, roads));

test('一键调度为四只机器狗分配互异的南北校区路线', () => {
  const assignments = planDistinctPatrolRoutes(routes, 4);
  assert.equal(assignments.length, 4);
  assert.equal(new Set(assignments).size, 4);
  assert.ok(assignments.some(id => id.startsWith('north-')));
  assert.ok(assignments.some(id => id.startsWith('south-')));
});

test('短距离绕行每段均避开障碍，并且不更改其他机器狗的路线', () => {
  const source = buildPatrolRoute({ id: 'test', name: '测试', nameEn: 'Test', checkpoints: ['A', 'B'], stopSeconds: 1 },
    [{ from: 'A', to: 'B', points: [[0, 0], [10, 0]] }]);
  const route = clonePatrolRoute(source);
  const allowed = (x, z) => Math.abs(z) < 5 && !(x >= 3 && x <= 7 && Math.abs(z) < .8);
  const detour = findPatrolDetour([0, 0], route.legs[0].points, 1, allowed);
  assert.ok(detour);
  route.legs[0].points.splice(1, detour.rejoinIndex, ...detour.waypoints);
  refreshPatrolRouteLength(route);
  assert.ok(route.length > source.length);
  assert.deepEqual(source.legs[0].points.map(([x, z]) => [x, Math.abs(z)]), [[0, 0], [10, 0]]);
  for (let i = 1; i < route.legs[0].points.length; i++) {
    const a = route.legs[0].points[i - 1], b = route.legs[0].points[i];
    for (let j = 0; j <= 20; j++) assert.ok(allowed(a[0] + (b[0] - a[0]) * j / 20, a[1] + (b[1] - a[1]) * j / 20));
  }
  assert.equal(findPatrolDetour([0, 0], source.legs[0].points, 1, (x, z) => z === 0 && x < 3), null);
});
