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
};

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
