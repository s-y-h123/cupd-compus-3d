"""沿原校园 GLB 路面，为南北校区预计算行人路线。"""

import heapq
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROADS = ROOT / 'public/models/cupb/original-roads.glb'
BUILDINGS = ROOT / 'public/data/buildings.json'
LANDMARKS = ROOT / 'public/data/landmarks.json'
OUTPUT = ROOT / 'public/data/pedestrian-routes.json'
CELL = 4.0
X0, N0, NX, NN = -190.0, -205.0, 131, 160
FOUNTAIN = (57, 73, 95, 159)

# 地标名称来自当前米制建筑数据；同一对地点只生成一条双向路线。
PAIRS = [
    ('北门', '图书馆', 'north'),
    ('图书馆', '主楼A座', 'north'),
    ('图书馆', '第二食堂', 'north'),
    ('体育馆', '图书馆', 'north'),
    ('体育馆', '第一食堂', 'north'),
    ('校医院', '图书馆', 'north'),
    ('管院公寓北楼', '图书馆', 'north'),
    ('理学院A座', '化工楼A座', 'north'),
    ('工程东楼', '第一食堂', 'north'),
    ('工程西楼', '提高采收率研究院', 'north'),
    ('青年园公寓2号楼', '第二食堂', 'north'),
    ('东门', '主楼A座', 'north'),
    ('学生活动中心', '第一食堂', 'north'),
    ('第三教学楼', '地质楼', 'south'),
    ('第三教学楼', '中油大厦A座', 'south'),
    ('第三教学楼', '第四教学楼', 'south'),
    ('第四教学楼', '地质楼', 'south'),
    ('地质楼', '声波测井实验室', 'south'),
    ('第三教学楼', '联合纳米岩石物理实验室', 'south'),
    ('中油大厦A座', '南门', 'south'),
    ('第四教学楼', '南门', 'south'),
    ('能源材料微结构实验室', '第四教学楼', 'south'),
]


def road_triangles():
    data = ROADS.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_length])
    binary_start = 20 + json_length + 8
    accessor = doc['accessors'][0]
    view = doc['bufferViews'][accessor['bufferView']]
    offset = binary_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    points = [struct.unpack_from('<fff', data, offset + i * 12)
              for i in range(accessor['count'])]
    for i in range(0, len(points), 3):
        yield tuple((p[0], -p[2]) for p in points[i:i + 3])


def point_segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-9)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def near_triangle(x, n, triangle):
    a, b, c = triangle
    ab = (b[0] - a[0]) * (n - a[1]) - (b[1] - a[1]) * (x - a[0])
    bc = (c[0] - b[0]) * (n - b[1]) - (c[1] - b[1]) * (x - b[0])
    ca = (a[0] - c[0]) * (n - c[1]) - (a[1] - c[1]) * (x - c[0])
    if (ab >= 0 and bc >= 0 and ca >= 0) or (ab <= 0 and bc <= 0 and ca <= 0):
        return True
    return min(point_segment_distance(x, n, *a, *b),
               point_segment_distance(x, n, *b, *c),
               point_segment_distance(x, n, *c, *a)) <= 1.8


def grid_point(i, j):
    return X0 + i * CELL, N0 + j * CELL


def road_mask():
    roads = set()
    for triangle in road_triangles():
        xs, ns = zip(*triangle)
        i0 = max(0, math.floor((min(xs) - 2 - X0) / CELL))
        i1 = min(NX - 1, math.ceil((max(xs) + 2 - X0) / CELL))
        j0 = max(0, math.floor((min(ns) - 2 - N0) / CELL))
        j1 = min(NN - 1, math.ceil((max(ns) + 2 - N0) / CELL))
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                if near_triangle(*grid_point(i, j), triangle):
                    roads.add((i, j))
    return roads


def inside_obstacle(x, n, buildings):
    if FOUNTAIN[0] <= x <= FOUNTAIN[2] and FOUNTAIN[1] <= n <= FOUNTAIN[3]:
        return True
    def in_ring(ring):
        inside = False
        for index, a in enumerate(ring):
            b = ring[(index + 1) % len(ring)]
            if (a[1] > n) != (b[1] > n) and x < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]:
                inside = not inside
        return inside
    for b in buildings:
        w, s, e, north = b['bounds']
        if b['height'] <= 2 or not (w - 2 <= x <= e + 2 and s - 2 <= n <= north + 2):
            continue
        for polygon in b['polygons']:
            if in_ring(polygon[0]) and not any(in_ring(hole) for hole in polygon[1:]):
                return True
            for ring in polygon:
                for index, a in enumerate(ring):
                    c = ring[(index + 1) % len(ring)]
                    if point_segment_distance(x, n, *a, *c) < 3:
                        return True
    return False


def find_building(buildings, name):
    found = [b for b in buildings if b['name'] == name]
    if not found:
        raise ValueError(f'No building: {name}')
    return max(found, key=lambda b: b['height'])


def main_component(blocked, region):
    remaining = {(i, j) for i in range(NX) for j in range(NN)
                 if (i, j) not in blocked and
                 (N0 + j * CELL >= -45 if region == 'north' else N0 + j * CELL <= -25)}
    largest = set()
    while remaining:
        seed = remaining.pop()
        component = {seed}
        queue = [seed]
        for i, j in queue:
            for nxt in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                if nxt in remaining:
                    remaining.remove(nxt)
                    component.add(nxt)
                    queue.append(nxt)
        if len(component) > len(largest):
            largest = component
    return largest


def nearest_road(building, region, roads, accessible):
    cx, cn = building['center']
    w, s, e, n = building['bounds']
    candidates = []
    for i, j in roads:
        if (i, j) not in accessible:
            continue
        x, north = grid_point(i, j)
        if region == 'north' and north < -45 or region == 'south' and north > -25:
            continue
        edge = math.hypot(max(w - x, 0, x - e), max(s - north, 0, north - n))
        if edge < 90:
            candidates.append((edge + .08 * math.hypot(x - cx, north - cn), (i, j)))
    if not candidates:
        raise ValueError(f'No road near {building["name"]}')
    return min(candidates)[1]


def route(start, goal, roads, near_roads, blocked, region):
    def allowed(cell):
        i, j = cell
        if not (0 <= i < NX and 0 <= j < NN) or cell in blocked:
            return False
        north = N0 + j * CELL
        return north >= -45 if region == 'north' else north <= -25

    queue = [(0.0, start)]
    distance = {start: 0.0}
    parent = {}
    while queue:
        _, current = heapq.heappop(queue)
        if current == goal:
            break
        i, j = current
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            nxt = (i + di, j + dj)
            if not allowed(nxt) or di and dj and (not allowed((i + di, j)) or not allowed((i, j + dj))):
                continue
            cost = 1 if nxt in roads else 2.5 if nxt in near_roads else 7
            trial = distance[current] + math.hypot(di, dj) * CELL * cost
            if trial < distance.get(nxt, math.inf):
                distance[nxt] = trial
                parent[nxt] = current
                h = math.hypot(nxt[0] - goal[0], nxt[1] - goal[1]) * CELL
                heapq.heappush(queue, (trial + h, nxt))
    if goal not in distance:
        raise ValueError(f'Route disconnected: {start} -> {goal}')
    path = [goal]
    while path[-1] != start:
        path.append(parent[path[-1]])
    path.reverse()
    # 保留转弯点，连续直线只存端点；路面本体仍来自原 GLB。
    compact = [path[0]]
    for k in range(1, len(path) - 1):
        before, now, after = path[k - 1:k + 2]
        if (now[0] - before[0], now[1] - before[1]) != (after[0] - now[0], after[1] - now[1]):
            compact.append(now)
    compact.append(path[-1])
    return [list(grid_point(*node)) for node in compact], sum(cell in roads for cell in path) / len(path)


def main():
    buildings = json.loads(BUILDINGS.read_text(encoding='utf-8'))
    for landmark in json.loads(LANDMARKS.read_text(encoding='utf-8')):
        if landmark['name'] == '南门':
            buildings.append({'name': landmark['name'], 'center': landmark['center'],
                              'bounds': landmark['bounds'], 'height': 0, 'polygons': []})
    roads = road_mask()
    blocked = {(i, j) for i in range(NX) for j in range(NN)
               if inside_obstacle(*grid_point(i, j), buildings)}
    near_roads = {(i + di, j + dj) for i, j in roads
                  for di in (-1, 0, 1) for dj in (-1, 0, 1)}
    accessible = {region: main_component(blocked, region) for region in ('north', 'south')}
    result = []
    for source, destination, region in PAIRS:
        a = nearest_road(find_building(buildings, source), region, roads, accessible[region])
        b = nearest_road(find_building(buildings, destination), region, roads, accessible[region])
        points, on_road = route(a, b, roads, near_roads, blocked, region)
        result.append({'from': source, 'to': destination, 'region': region,
                       'weight': 1.5 if region == 'south' else 1,
                       'points': points, 'roadFraction': round(on_road, 3)})
    OUTPUT.write_text(json.dumps({'version': 1, 'units': 'meters', 'routes': result},
                                 ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    north = sum(r['region'] == 'north' for r in result)
    print(f'{len(result)} routes: {north} north, {len(result)-north} south; '
          f'road occupancy {sum(r["roadFraction"] for r in result)/len(result):.1%}')


if __name__ == '__main__':
    main()
