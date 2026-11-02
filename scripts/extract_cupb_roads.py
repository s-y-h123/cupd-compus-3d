"""从原校园 GLB 的路面顶点色提取道路，不重新生成路网。"""

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/models/cupb/campus.glb"
TARGET = ROOT / "public/models/cupb/original-roads.glb"
ROAD_COLORS = {
    (0.68, 0.68, 0.67),  # 原模型沥青路面
    (0.73, 0.74, 0.76),  # 原模型灰色步道
    (0.90, 0.88, 0.83),  # 原模型浅色铺装
}


def main():
    source = SOURCE.read_bytes()
    json_length = struct.unpack_from("<I", source, 12)[0]
    doc = json.loads(source[20 : 20 + json_length])
    binary_start = 20 + json_length + 8
    accessors = doc["accessors"]
    views = doc["bufferViews"]
    primitive = doc["meshes"][0]["primitives"][0]

    def data(index, component_size):
        accessor = accessors[index]
        view = views[accessor["bufferView"]]
        start = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return [source[start + i * component_size : start + (i + 1) * component_size]
                for i in range(accessor["count"])]

    positions = data(primitive["attributes"]["POSITION"], 12)
    normals = data(primitive["attributes"]["NORMAL"], 12)
    colors = data(primitive["attributes"]["COLOR_0"], 12)
    indices = [struct.unpack("<I", item)[0] for item in data(primitive["indices"], 4)]
    chosen = []
    for i in range(0, len(indices), 3):
        triangle = indices[i : i + 3]
        color = tuple(round(v, 2) for v in struct.unpack("<fff", colors[triangle[0]]))
        if color in ROAD_COLORS and all(struct.unpack("<fff", positions[k])[1] < .2 for k in triangle):
            chosen.extend(triangle)

    arrays = [b"".join(items[k] for k in chosen) for items in (positions, normals, colors)]
    points = [struct.unpack("<fff", positions[k]) for k in chosen]
    mins = [min(p[axis] for p in points) for axis in range(3)]
    maxes = [max(p[axis] for p in points) for axis in range(3)]
    offsets = [0, len(arrays[0]), len(arrays[0]) + len(arrays[1])]
    binary = b"".join(arrays)
    binary += b"\0" * ((-len(binary)) % 4)
    gltf = {
        "asset": {"version": "2.0", "generator": "extract_cupb_roads.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "原校园道路", "mesh": 0, "extras": {"layer": "roads"}}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2}, "material": 0}]}],
        "materials": [{"name": "originalRoads", "pbrMetallicRoughness": {
            "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": .95},
            "doubleSided": True}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [{"buffer": 0, "byteOffset": offsets[i], "byteLength": len(arrays[i]), "target": 34962}
                        for i in range(3)],
        "accessors": [{"bufferView": i, "componentType": 5126, "count": len(chosen), "type": "VEC3",
                       **({"min": mins, "max": maxes} if i == 0 else {})}
                      for i in range(3)],
    }
    packed_json = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed_json += b" " * ((-len(packed_json)) % 4)
    total = 12 + 8 + len(packed_json) + 8 + len(binary)
    TARGET.write_bytes(struct.pack("<4sII", b"glTF", 2, total) +
                       struct.pack("<I4s", len(packed_json), b"JSON") + packed_json +
                       struct.pack("<I4s", len(binary), b"BIN\0") + binary)
    print(f"Extracted {len(chosen) // 3} original road triangles to {TARGET.name}")


if __name__ == "__main__":
    main()
