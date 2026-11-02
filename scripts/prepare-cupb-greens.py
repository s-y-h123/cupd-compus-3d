"""从中石大原模型提取绿色地块，并在地块内部生成广西大学风格的树位。"""

import json
import math
import random
import struct
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'public/models/cupb/campus.glb'
GREEN_MODEL = ROOT / 'public/models/cupb/original-greens.glb'
TREE_DATA = ROOT / 'public/data/cupb-green-trees.json'
GREEN_COLOR = (0.62, 0.79, 0.55)
FOUNTAIN = (57, 73, 95, 159)
CELL = 24


def point_in_ring(x, n, ring):
    inside = False
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        if (a[1] > n) != (b[1] > n) and x < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def edge_distance(x, n, a, b):
    dx, dn = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x - a[0]) * dx + (n - a[1]) * dn) / max(dx * dx + dn * dn, 1e-9)))
    return math.hypot(x - a[0] - t * dx, n - a[1] - t * dn)


def in_building(x, n, buildings):
    for b in buildings:
        w, s, e, north = b['bounds']
        if not (w - 4 < x < e + 4 and s - 4 < n < north + 4):
            continue
        for polygon in b['polygons']:
            if point_in_ring(x, n, polygon[0]) and not any(point_in_ring(x, n, hole) for hole in polygon[1:]):
                return True
            for ring in polygon:
                if any(edge_distance(x, n, a, ring[(i + 1) % len(ring)]) < 3
                       for i, a in enumerate(ring)):
                    return True
    return False


def in_triangle(x, n, triangle):
    a, b, c = triangle
    v = []
    for p, q in ((a, b), (b, c), (c, a)):
        v.append((q[0] - p[0]) * (n - p[1]) - (q[1] - p[1]) * (x - p[0]))
    return all(t >= -1e-6 for t in v) or all(t <= 1e-6 for t in v)


def source_data():
    content = MODEL.read_bytes()
    json_length = struct.unpack_from('<I', content, 12)[0]
    doc = json.loads(content[20:20 + json_length])
    binary_start = 20 + json_length + 8
    accessors, views = doc['accessors'], doc['bufferViews']
    primitive = doc['meshes'][0]['primitives'][0]

    def values(index, size):
        accessor = accessors[index]
        view = views[accessor['bufferView']]
        start = binary_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        return [content[start + i * size:start + (i + 1) * size] for i in range(accessor['count'])]

    positions = values(primitive['attributes']['POSITION'], 12)
    normals = values(primitive['attributes']['NORMAL'], 12)
    colors = values(primitive['attributes']['COLOR_0'], 12)
    indices = [struct.unpack('<I', value)[0] for value in values(primitive['indices'], 4)]
    return positions, normals, colors, indices


def sport_footprints():
    source = json.loads((ROOT / 'data/cupb/campus_buildings.geojson').read_text(encoding='utf-8'))['features']
    coords = []
    def collect(value):
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
            coords.append(value)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    for feature in source:
        collect(feature['geometry']['coordinates'])
    lon0 = (min(v[0] for v in coords) + max(v[0] for v in coords)) / 2
    lat0 = (min(v[1] for v in coords) + max(v[1] for v in coords)) / 2
    x_factor = 111320 * math.cos(math.radians(lat0))
    scene = json.loads((ROOT / 'data/cupb/campus_scene.geojson').read_text(encoding='utf-8'))['features']
    polygons = []
    for feature in scene:
        if feature['properties'].get('_category') != 'sport':
            continue
        geometry = feature['geometry']
        groups = ([geometry['coordinates']] if geometry['type'] == 'Polygon' else
                  geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [])
        for group in groups:
            ring = [((p[0] - lon0) * x_factor, (p[1] - lat0) * 110540) for p in group[0]]
            if len(ring) >= 3:
                polygons.append(ring)
    return polygons


def write_glb(positions, normals, colors, chosen):
    arrays = [b''.join(items[i] for i in chosen) for items in (positions, normals, colors)]
    binary = b''.join(arrays)
    binary += b'\0' * (-len(binary) % 4)
    offsets = [0, len(arrays[0]), len(arrays[0]) + len(arrays[1])]
    points = [struct.unpack('<fff', positions[i]) for i in chosen]
    mins = [min(p[axis] for p in points) for axis in range(3)]
    maxes = [max(p[axis] for p in points) for axis in range(3)]
    gltf = {
        'asset': {'version': '2.0', 'generator': 'prepare-cupb-greens.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': '原校园绿色地块', 'mesh': 0, 'extras': {'layer': 'vegetation'}}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'material': 0}]}],
        'materials': [{'name': 'mappedGrass', 'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 1},
            'doubleSided': True}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offsets[i], 'byteLength': len(arrays[i]), 'target': 34962}
                        for i in range(3)],
        'accessors': [{'bufferView': i, 'componentType': 5126, 'count': len(chosen), 'type': 'VEC3',
                       **({'min': mins, 'max': maxes} if i == 0 else {})} for i in range(3)],
    }
    packed = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    packed += b' ' * (-len(packed) % 4)
    GREEN_MODEL.write_bytes(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(packed) + 8 + len(binary)) +
                            struct.pack('<I4s', len(packed), b'JSON') + packed +
                            struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def main():
    positions, normals, colors, indices = source_data()
    chosen = []
    triangles = []
    bins = defaultdict(list)
    for i in range(0, len(indices), 3):
        ids = indices[i:i + 3]
        color = tuple(round(v, 2) for v in struct.unpack('<fff', colors[ids[0]]))
        points = [struct.unpack('<fff', positions[k]) for k in ids]
        if color != GREEN_COLOR or not all(abs(p[1]) < .25 for p in points):
            continue
        chosen.extend(ids)
        triangle = tuple((p[0], -p[2]) for p in points)
        index = len(triangles)
        triangles.append(triangle)
        xs, ns = zip(*triangle)
        for bx in range(math.floor(min(xs) / CELL), math.floor(max(xs) / CELL) + 1):
            for bn in range(math.floor(min(ns) / CELL), math.floor(max(ns) / CELL) + 1):
                bins[(bx, bn)].append(index)
    if not chosen:
        raise ValueError('No green surfaces in original campus model')
    write_glb(positions, normals, colors, chosen)

    def on_green(x, n):
        return any(in_triangle(x, n, triangles[i]) for i in bins.get((math.floor(x / CELL), math.floor(n / CELL)), ()))

    buildings = json.loads((ROOT / 'public/data/buildings.json').read_text(encoding='utf-8'))
    landmarks = json.loads((ROOT / 'public/data/landmarks.json').read_text(encoding='utf-8'))
    sports = [l['bounds'] for l in landmarks if l.get('placeKind') == 'sports']
    sport_polygons = sport_footprints()
    rows = []
    for ix in range(-42, 44):
        for inn in range(-36, 40):
            randomizer = random.Random((ix * 73856093) ^ (inn * 19349663) ^ 1928)
            x = ix * 12 + randomizer.uniform(-1.6, 1.6)
            n = inn * 12 + randomizer.uniform(-1.6, 1.6)
            # 四方向净空让树冠落在绿色区域，不压道路、建筑、跑道或喷泉。
            if not all(on_green(x + dx, n + dn) for dx, dn in ((0, 0), (3.5, 0), (-3.5, 0), (0, 3.5), (0, -3.5))):
                continue
            if in_building(x, n, buildings) or FOUNTAIN[0]-4 < x < FOUNTAIN[2]+4 and FOUNTAIN[1]-4 < n < FOUNTAIN[3]+4:
                continue
            if any(w-5 < x < e+5 and s-5 < n < north+5 for w, s, e, north in sports):
                continue
            if any(point_in_ring(x, n, ring) for ring in sport_polygons):
                continue
            # 广西大学模板 0/1 是阔叶与高冠树；不把其热带树形模板 2 搬到北京。
            typ = 0 if randomizer.random() < .74 else 1
            height = round(randomizer.uniform(7.5, 10.5), 2)
            rows.append([round(x, 2), round(n, 2), height, typ])
    shrubs = []
    for i, (x, n, _, _) in enumerate(rows):
        if i % 3:
            continue
        dx, dn = ((4.2, 0) if i % 2 else (-4.2, 0))
        if on_green(x + dx, n + dn) and not in_building(x + dx, n + dn, buildings):
            shrubs.append([round(x + dx, 2), n, 1.3 + (i % 4) * .16])
    TREE_DATA.write_text(json.dumps({'version': 1, 'units': 'meters', 'trees': rows, 'shrubs': shrubs},
                                    ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'green triangles: {len(triangles)}; trees: {len(rows)}; shrubs: {len(shrubs)}; '
          f'north: {sum(n >= -40 for _, n, _, _ in rows)}; south: {sum(n < -40 for _, n, _, _ in rows)}')


if __name__ == '__main__':
    main()
