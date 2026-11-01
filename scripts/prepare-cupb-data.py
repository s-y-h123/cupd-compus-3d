"""Convert the supplied CUPB GeoJSON to this viewer's metre based runtime data.

The supplied GLB was made by model.py: its geographic origin is the midpoint
of campus_buildings.geojson's extrema. East is +X, north is +Y in the data,
and glTF uses (X, up, -north). This script does not generate any geometry.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "cupb"
PUBLIC = ROOT / "public" / "data"
MODEL = ROOT / "public" / "models" / "cupb" / "campus.glb"
BUILDINGS_SOURCE = SOURCE / "campus_buildings.geojson"
SCENE_SOURCE = SOURCE / "campus_scene.geojson"
SOURCE_URL = "https://map.cup.edu.cn/"
METRES_PER_DEGREE_LAT = 110540.0

# Exact source names and IDs are used to avoid silently picking a homonym.
# No point is invented for 一教、二教 or 综合体育馆: the GLB's same-origin
# source does not identify these buildings unambiguously.
LANDMARK_SPECS = [
    ("library", "图书馆", "1047", "building"),
    ("main-building-a", "主楼A座", "1011", "building"),
    ("gymnasium", "体育馆", "923", "building"),
    ("swimming-pool", "游泳馆", "1001", "building"),
    ("third-teaching", "第三教学楼", "965", "building"),
    ("fourth-teaching", "第四教学楼", "945", "building"),
    ("fifth-teaching", "第五教学楼", "937", "building"),
    ("geology-building", "地质楼", "981", "building"),
    ("energy-lab", "能源材料微结构实验室", "1028", "building"),
    ("nano-lab", "联合纳米岩石物理实验室", "977", "building"),
    ("acoustic-lab", "声波测井实验室", "957", "building"),
    ("first-canteen", "第一食堂", "1045", "building"),
    ("second-canteen", "第二食堂", "952", "building"),
    ("student-center", "学生活动中心", "1064", "building"),
    ("oil-building-a", "中油大厦A座", "1037", "building"),
    ("youth-residence", "青年园公寓2号楼", "1031", "building"),
    ("runjie-residence", "润杰学生公寓2号楼", "939", "building"),
    ("runjie-residence-five", "润杰学生公寓5号楼", "1059", "building"),
    ("huicai-residence-seven", "汇才学生公寓7号楼", "978", "building"),
    ("main-field", "红旗操场", "677", "scene"),
    ("north-gate", "北门", "914", "building"),
    ("south-gate", "南门", "1054", "scene"),
]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def coordinates(value):
    if isinstance(value, list) and len(value) >= 2 and all(
        isinstance(v, (int, float)) for v in value[:2]
    ):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from coordinates(child)


def source_origin(features):
    # This is model.py:267, repeated here so labels align with campus.glb.
    pts = [p for f in features for p in coordinates(f["geometry"]["coordinates"])]
    return (
        (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2,
        (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2,
    )


def projector(lon0, lat0):
    x_factor = 111320.0 * math.cos(math.radians(lat0))

    def project(point):
        return [round((point[0] - lon0) * x_factor, 3),
                round((point[1] - lat0) * METRES_PER_DEGREE_LAT, 3)]

    return project


def polygon_rings(geometry, project):
    kind = geometry["type"]
    if kind == "Polygon":
        raw_polygons = [geometry["coordinates"]]
    elif kind == "MultiPolygon":
        raw_polygons = geometry["coordinates"]
    else:
        return []
    polygons = []
    for polygon in raw_polygons:
        rings = []
        for raw_ring in polygon:
            ring = [project(p) for p in raw_ring]
            if ring and ring[0] == ring[-1]:
                ring.pop()
            if len(ring) >= 3:
                rings.append(ring)
        if rings:
            polygons.append(rings)
    return polygons


def flat_points(polygons):
    return [p for polygon in polygons for ring in polygon for p in ring]


def bounds_of(polygons):
    pts = flat_points(polygons)
    return [min(p[0] for p in pts), min(p[1] for p in pts),
            max(p[0] for p in pts), max(p[1] for p in pts)]


def center_of(bounds):
    return [round((bounds[0] + bounds[2]) / 2, 3),
            round((bounds[1] + bounds[3]) / 2, 3)]


def numeric(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def height_levels(props):
    levels = numeric(props.get("building:levels")) or numeric(props.get("楼层数"))
    height = numeric(props.get("height")) or (levels * 3.6 if levels else 12.0)
    return round(height, 2), round(levels or height / 3.6, 2)


def building_category(props):
    kind = props.get("building")
    if kind in ("student_bedroom", "dormitory", "residential"):
        return "living"
    if kind in ("library", "gymnasium"):
        return "culture"
    if kind in ("teaching", "experiment_building", "administration"):
        return "academic"
    if kind in ("part_entrance",):
        return "landmark"
    return "service"


def model_bounds_and_hash(path):
    data = path.read_bytes()
    if path.suffix.lower() == ".glb":
        if data[:4] != b"glTF":
            raise ValueError(f"Not a GLB: {path}")
        version, length = struct.unpack_from("<II", data, 4)
        if version != 2 or length != len(data):
            raise ValueError(f"Invalid GLB header: {path}")
        chunk_size = struct.unpack_from("<I", data, 12)[0]
        gltf = json.loads(data[20:20 + chunk_size])
    elif path.suffix.lower() == ".gltf":
        gltf = json.loads(data.decode("utf-8"))
    else:
        raise ValueError(f"Expected .glb or .gltf: {path}")
    mins = [a["min"] for a in gltf["accessors"] if a.get("type") == "VEC3" and "min" in a]
    maxs = [a["max"] for a in gltf["accessors"] if a.get("type") == "VEC3" and "max" in a]
    if not mins or not maxs:
        raise ValueError("Model has no position bounds")
    xyz_min = [min(a[i] for a in mins) for i in range(3)]
    xyz_max = [max(a[i] for a in maxs) for i in range(3)]
    return xyz_min, xyz_max, len(data), hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Prepare CUPB viewer data")
    parser.add_argument("--model", type=Path, default=MODEL.relative_to(ROOT),
                        help="model path under public/; default: public/models/cupb/campus.glb")
    args = parser.parse_args()
    model_path = (ROOT / args.model).resolve()
    public_root = (ROOT / "public").resolve()
    if not model_path.is_relative_to(public_root):
        raise ValueError("Model must be inside public/")
    source_buildings = read_json(BUILDINGS_SOURCE)["features"]
    source_scene = read_json(SCENE_SOURCE)["features"]
    lon0, lat0 = source_origin(source_buildings)
    project = projector(lon0, lat0)

    selected_ids = {source_id: landmark_id for landmark_id, _, source_id, kind
                    in LANDMARK_SPECS if kind == "building"}
    buildings = []
    for feature in source_buildings:
        props = feature["properties"]
        polygons = polygon_rings(feature["geometry"], project)
        if not polygons:
            continue
        bounds = bounds_of(polygons)
        height, levels = height_levels(props)
        source_id = str(props.get("id"))
        buildings.append({
            "id": f"cupb/{source_id}",
            "name": props.get("name") or f"未命名建筑 {source_id}",
            "category": building_category(props),
            "center": center_of(bounds),
            "height": height,
            "elevation": 0,
            "levels": levels,
            "insideCampus": True,
            "landmark": selected_ids.get(source_id),
            "polygons": polygons,
            "bounds": bounds,
        })

    by_building_id = {str(f["properties"].get("id")): f for f in source_buildings}
    by_scene_id = {}
    for feature in source_scene:
        source_id = str(feature["properties"].get("id"))
        by_scene_id.setdefault(source_id, []).append(feature)

    landmarks = []
    for landmark_id, expected_name, source_id, kind in LANDMARK_SPECS:
        features = ([by_building_id[source_id]] if kind == "building"
                    else by_scene_id.get(source_id, []))
        if not features or any(f["properties"].get("name") != expected_name for f in features):
            raise ValueError(f"Landmark source changed: {expected_name} ({source_id})")
        polygons = [poly for f in features
                    for poly in polygon_rings(f["geometry"], project)]
        bounds = bounds_of(polygons)
        center = center_of(bounds)
        props = features[0]["properties"]
        place_kind = ("sports" if landmark_id == "main-field" else
                      "gate" if landmark_id.endswith("gate") else None)
        height = (1.0 if place_kind == "sports" else height_levels(props)[0])
        category = (building_category(props) if kind == "building" else
                    "culture" if landmark_id == "main-field" else "landmark")
        entry = {
            "id": landmark_id,
            "osmId": f"cupb/{source_id}",
            "name": expected_name,
            "category": category,
            "center": center,
            "height": height,
            "elevation": 0,
            "bounds": bounds,
            "labelAnchor": [*center, round(height + 3, 2)],
            "description": f"{expected_name}，位置依据中石大校园矢量资料。",
            "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
            "sourceUrl": SOURCE_URL,
            "reference": "cupb-local-geojson",
            "distance": max(35, min(120, round(max(bounds[2] - bounds[0],
                                                bounds[3] - bounds[1]) * 1.8))),
            "zone": "cupb",
            "modelingBasis": "inferred",
        }
        if place_kind:
            entry["placeKind"] = place_kind
        landmarks.append(entry)

    xyz_min, xyz_max, size, digest = model_bounds_and_hash(model_path)
    # This is the loaded model's coverage rectangle, not a surveyed property
    # or fence line. The original data has no verified campus perimeter.
    west, east = round(xyz_min[0], 3), round(xyz_max[0], 3)
    south, north = round(-xyz_max[2], 3), round(-xyz_min[2], 3)
    boundary = {
        "version": 1,
        "name": "模型覆盖范围",
        "sourceUrl": SOURCE_URL,
        "snapshotAt": datetime.fromtimestamp(BUILDINGS_SOURCE.stat().st_mtime,
                                               timezone.utc).isoformat(),
        "note": "仅表示已接入 GLB 的覆盖范围，不代表校园围墙或权属边界；待核实边界数据后替换。",
        "rings": [[[west, south, 0], [east, south, 0], [east, north, 0],
                   [west, north, 0], [west, south, 0]]],
    }
    category_counts = Counter(f["properties"].get("_category", "other")
                              for f in source_scene)
    overview = {
        "snapshotAt": boundary["snapshotAt"],
        "buildings": len(buildings),
        "campusBuildings": len(buildings),
        "landmarks": len(landmarks),
        "trees": 0,
        "estimatedHeights": sum(1 for f in source_buildings
                                if numeric(f["properties"].get("height")) is None),
        "layers": {
            "buildings": len(buildings),
            "roads": category_counts["road"],
            "green": category_counts["green"],
            "water": category_counts["water"],
            "sports": category_counts["sport"],
            "tree": 0,
        },
        "coordinateSystem": {
            "units": "meters",
            "originLonLat": [lon0, lat0],
            "x": "east",
            "y": "up",
            "z": "south",
        },
        "modelCoverage": [west, south, east, north],
        "note": "校园 GLB 为用户提供的矢量重建模型；语义图层合并在单网格内。",
    }
    manifest = {
        "version": 2,
        "units": "meters",
        "axes": {"x": "east", "y": "up", "z": "south"},
        "base": {"url": model_path.relative_to(public_root).as_posix(),
                 "bytes": size, "sha256": digest},
        "zones": [], "landmarks": [], "infrastructure": [], "sports": [],
        "treePriorityPositions": [],
    }
    # 小地图中的主要道路取自同源场景矢量线，分段保留，避免跨段错误连线。
    road_names = {"府学路", "中石路", "亢山路", "燕平路"}
    road_paths = [
        {"name": feature["properties"]["name"],
         "path": [project(point) for point in feature["geometry"]["coordinates"]]}
        for feature in source_scene
        if feature["properties"].get("_category") == "road"
        and feature["properties"].get("name") in road_names
        and feature["geometry"]["type"] == "LineString"
        and len(feature["geometry"]["coordinates"]) >= 2
    ]

    write_json(PUBLIC / "buildings.json", buildings)
    write_json(PUBLIC / "landmarks.json", landmarks)
    write_json(PUBLIC / "campus-boundary.json", boundary)
    write_json(PUBLIC / "overview.json", overview)
    write_json(PUBLIC / "models.json", manifest)
    write_json(PUBLIC / "infrastructure-map.json", {"paths": road_paths})
    print(f"origin lon/lat {lon0:.8f}, {lat0:.8f}")
    print(f"wrote {len(buildings)} buildings and {len(landmarks)} landmarks")
    print(f"model {size} bytes; coverage {boundary['rings'][0]}")
    for landmark in landmarks:
        print(f"{landmark['id']} {landmark['name']} {landmark['center']} h={landmark['height']}")


if __name__ == "__main__":
    main()
