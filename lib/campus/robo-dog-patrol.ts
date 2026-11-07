export type PatrolRouteDefinition = {
  id: string;
  name: string;
  nameEn: string;
  checkpoints: string[];
  stopSeconds: number;
};

export type PatrolRoadLink = { from: string; to: string; points: number[][] };
export type PatrolLeg = { from: string; to: string; points: [number, number][]; length: number };
export type PatrolRoute = PatrolRouteDefinition & { legs: PatrolLeg[]; length: number };
export type PatrolStatus = 'idle' | 'walking' | 'turning' | 'yielding' | 'checking' | 'paused' | 'completed' | 'blocked';
export type PatrolSnapshot = {
  routeId: string | null;
  status: PatrolStatus;
  checkpoint: string | null;
  checkpointIndex: number;
  checkpointCount: number;
  distance: number;
  total: number;
  detours?: number;
};

export function clonePatrolRoute(route: PatrolRoute): PatrolRoute {
  return { ...route, legs: route.legs.map(leg => ({ ...leg, points: leg.points.map(point => [...point] as [number, number]) })) };
}

export function refreshPatrolRouteLength(route: PatrolRoute) {
  route.length = 0;
  for (const leg of route.legs) {
    leg.length = 0;
    for (let i = 1; i < leg.points.length; i++)
      leg.length += Math.hypot(leg.points[i][0] - leg.points[i - 1][0], leg.points[i][1] - leg.points[i - 1][1]);
    route.length += leg.length;
  }
}

/** 在原道路附近寻找短距离绕行；每段都做碰撞与道路范围采样，失败时保持受阻状态。 */
export function findPatrolDetour(position: [number, number], points: [number, number][], nextIndex: number,
  allowed: (x: number, z: number) => boolean): { waypoints: [number, number][]; rejoinIndex: number } | null {
  const next = points[nextIndex];
  if (!next) return null;
  const dx = next[0] - position[0], dz = next[1] - position[1];
  const length = Math.hypot(dx, dz);
  if (length < .1) return null;
  const nx = -dz / length, nz = dx / length;
  const clear = (a: [number, number], b: [number, number]) => {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 1, n = Math.ceil(distance / .5); i <= n; i++) {
      const t = i / n;
      if (!allowed(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  };
  for (let end = nextIndex; end < Math.min(points.length, nextIndex + 5); end++) {
    const target = points[end];
    if (Math.hypot(target[0] - position[0], target[1] - position[1]) > 32) break;
    for (const offset of [1.5, 2.5, 3.5, 4.5]) for (const side of [-1, 1]) {
      const a: [number, number] = [position[0] + nx * offset * side, position[1] + nz * offset * side];
      const b: [number, number] = [target[0] + nx * offset * side, target[1] + nz * offset * side];
      if (clear(position, a) && clear(a, b) && clear(b, target))
        return { waypoints: [a, b, target], rejoinIndex: end };
    }
  }
  return null;
}

/** 以道路的唯一覆盖长度和南北校区分布选择互不重复的巡检任务。 */
export function planDistinctPatrolRoutes(routes: PatrolRoute[], count: number): string[] {
  const wanted = Math.max(0, Math.min(count, routes.length));
  if (!wanted) return [];
  const samples = routes.map(route => {
    const cells = new Set<string>();
    for (const leg of route.legs) for (let i = 1; i < leg.points.length; i++) {
      const a = leg.points[i - 1], b = leg.points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let j = 0; j <= steps; j++) {
        const x = a[0] + (b[0] - a[0]) * j / steps, z = a[1] + (b[1] - a[1]) * j / steps;
        cells.add(`${Math.round(x / 3)}:${Math.round(z / 3)}`);
      }
    }
    return cells;
  });
  let best: number[] = [], bestScore = -Infinity;
  const choose = (indices: number[], from: number) => {
    if (indices.length === wanted) {
      const union = new Set<string>();
      let total = 0;
      for (const index of indices) { total += samples[index].size; for (const cell of samples[index]) union.add(cell); }
      const north = indices.some(index => routes[index].id.startsWith('north-'));
      const south = indices.some(index => routes[index].id.startsWith('south-'));
      const score = union.size - (total - union.size) * .8 + (wanted > 1 && north && south ? 1000 : 0);
      if (score > bestScore) { best = [...indices]; bestScore = score; }
      return;
    }
    for (let i = from; i <= routes.length - (wanted - indices.length); i++) choose([...indices, i], i + 1);
  };
  choose([], 0);
  return best.sort((a, b) => routes[a].id.localeCompare(routes[b].id)).map(index => routes[index].id);
}

/** 将行人路径的 [东, 北] 转成 Three.js 地面坐标 [X, Z]；绝不直线跨楼连接地标。 */
export function buildPatrolRoute(definition: PatrolRouteDefinition, roads: PatrolRoadLink[]): PatrolRoute {
  if (definition.checkpoints.length < 2) throw new Error('巡检路线至少需要两个检查点');
  const legs: PatrolLeg[] = [];
  let total = 0;
  for (let i = 1; i < definition.checkpoints.length; i++) {
    const from = definition.checkpoints[i - 1], to = definition.checkpoints[i];
    const road = roads.find(item => (item.from === from && item.to === to) || (item.from === to && item.to === from));
    if (!road || road.points.length < 2) throw new Error(`缺少巡检道路：${from} → ${to}`);
    const directed = road.from === from ? road.points : [...road.points].reverse();
    const points = directed.map(([east, north]) => [east, -north] as [number, number]);
    if (legs.length) {
      const previous = legs.at(-1)!.points.at(-1)!;
      if (Math.hypot(previous[0] - points[0][0], previous[1] - points[0][1]) > .5)
        throw new Error(`巡检道路未连通：${from}`);
    }
    let length = 0;
    for (let j = 1; j < points.length; j++)
      length += Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]);
    if (length < 1) throw new Error(`巡检道路太短：${from} → ${to}`);
    legs.push({ from, to, points, length });
    total += length;
  }
  return { ...definition, legs, length: total };
}
