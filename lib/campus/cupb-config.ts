import type { Landmark } from './types';

/**
 * 中石大场景配置入口。模型与点位统一使用米：X 向东，Y 向上，Z 向南。
 * 点位的二维 center/bounds 使用 [东, 北]，进入 Three.js 时北向变成 -Z。
 * 坐标以现有 campus.glb 的建筑范围中心为原点；不要混用旧 HTML 的 0–100 坐标。
 */
export const CUPB_CONFIG: {
  model: { url: string; origin: [number, number]; units: 'meters' };
  overview: { target: [number, number, number]; position: [number, number, number] };
  walk: {
    start: [number, number];
    fov: number;
    eyeHeight: number;
    speed: number;
    sprintSpeed: number;
    radius: number;
    mouseSensitivity: number;
  };
  tourOrder: string[];
  landmarks: Landmark[];
} = {
  // 模型加载入口：替换模型时保持与 public/data/models.json 的 base.url 一致。
  model: {
    url: 'models/cupb/campus.glb',
    origin: [116.24050845, 40.21605355],
    units: 'meters',
  },
  overview: {
    target: [0, 15, 0],
    position: [720, 870, 940],
  },
  // 第一视角米制参数：起点为 [东, 北]，会自动移到最近可通行空地。
  walk: {
    start: [65, 110],
    fov: 55,
    eyeHeight: 1.7,
    speed: 6,
    sprintSpeed: 14,
    radius: 1.1,
    mouseSensitivity: 0.0022,
  },
  // 巡游节点只引用下方点位 ID；页面沿用原仓库每站 8.5 秒的节奏。
  tourOrder: ["library","main-building-a","gymnasium","swimming-pool","third-teaching","fourth-teaching","fifth-teaching","geology-building","energy-lab","nano-lab","acoustic-lab","first-canteen","second-canteen","student-center","oil-building-a","youth-residence","runjie-residence","runjie-residence-five","huicai-residence-seven","main-field","north-gate","south-gate"],
  // 点位来自同坐标系 GeoJSON 足迹；独立机位可在各项 cameraOffset/distance 修改。
  landmarks: [
  {
    "id": "library",
    "osmId": "cupb/1047",
    "name": "图书馆",
    "category": "culture",
    "center": [
      74.911,
      248.953
    ],
    "height": 16.0,
    "elevation": 0,
    "bounds": [
      24.851,
      207.213,
      124.971,
      290.693
    ],
    "labelAnchor": [
      74.911,
      248.953,
      19.0
    ],
    "description": "图书馆，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "main-building-a",
    "osmId": "cupb/1011",
    "name": "主楼A座",
    "category": "academic",
    "center": [
      273.421,
      63.577
    ],
    "height": 60.0,
    "elevation": 0,
    "bounds": [
      241.514,
      47.206,
      305.328,
      79.948
    ],
    "labelAnchor": [
      273.421,
      63.577,
      63.0
    ],
    "description": "主楼A座，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 115,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "gymnasium",
    "osmId": "cupb/923",
    "name": "体育馆",
    "category": "culture",
    "center": [
      -10.06,
      128.962
    ],
    "height": 8.0,
    "elevation": 0,
    "bounds": [
      -41.436,
      102.189,
      21.315,
      155.734
    ],
    "labelAnchor": [
      -10.06,
      128.962,
      11.0
    ],
    "description": "体育馆，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 113,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "swimming-pool",
    "osmId": "cupb/1001",
    "name": "游泳馆",
    "category": "culture",
    "center": [
      1.437,
      89.454
    ],
    "height": 4.0,
    "elevation": 0,
    "bounds": [
      -30.071,
      66.871,
      32.944,
      112.038
    ],
    "labelAnchor": [
      1.437,
      89.454,
      7.0
    ],
    "description": "游泳馆，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 113,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "third-teaching",
    "osmId": "cupb/965",
    "name": "第三教学楼",
    "category": "academic",
    "center": [
      -28.29,
      -128.63
    ],
    "height": 32.0,
    "elevation": 0,
    "bounds": [
      -73.849,
      -180.451,
      17.269,
      -76.809
    ],
    "labelAnchor": [
      -28.29,
      -128.63,
      35.0
    ],
    "description": "第三教学楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "fourth-teaching",
    "osmId": "cupb/945",
    "name": "第四教学楼",
    "category": "academic",
    "center": [
      117.877,
      -89.233
    ],
    "height": 24.0,
    "elevation": 0,
    "bounds": [
      96.562,
      -118.095,
      139.192,
      -60.371
    ],
    "labelAnchor": [
      117.877,
      -89.233,
      27.0
    ],
    "description": "第四教学楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 104,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "first-canteen",
    "osmId": "cupb/1045",
    "name": "第一食堂",
    "category": "service",
    "center": [
      203.278,
      104.571
    ],
    "height": 20.0,
    "elevation": 0,
    "bounds": [
      182.545,
      71.967,
      224.011,
      137.175
    ],
    "labelAnchor": [
      203.278,
      104.571,
      23.0
    ],
    "description": "第一食堂，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 117,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "second-canteen",
    "osmId": "cupb/952",
    "name": "第二食堂",
    "category": "service",
    "center": [
      163.891,
      150.456
    ],
    "height": 8.0,
    "elevation": 0,
    "bounds": [
      129.791,
      126.53,
      197.991,
      174.382
    ],
    "labelAnchor": [
      163.891,
      150.456,
      11.0
    ],
    "description": "第二食堂，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "student-center",
    "osmId": "cupb/1064",
    "name": "学生活动中心",
    "category": "service",
    "center": [
      156.924,
      71.392
    ],
    "height": 16.0,
    "elevation": 0,
    "bounds": [
      121.843,
      55.53,
      192.006,
      87.255
    ],
    "labelAnchor": [
      156.924,
      71.392,
      19.0
    ],
    "description": "学生活动中心，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "oil-building-a",
    "osmId": "cupb/1037",
    "name": "中油大厦A座",
    "category": "academic",
    "center": [
      -116.755,
      -113.823
    ],
    "height": 44.0,
    "elevation": 0,
    "bounds": [
      -140.425,
      -152.54,
      -93.085,
      -75.106
    ],
    "labelAnchor": [
      -116.755,
      -113.823,
      47.0
    ],
    "description": "中油大厦A座，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "youth-residence",
    "osmId": "cupb/1031",
    "name": "青年园公寓2号楼",
    "category": "living",
    "center": [
      137.773,
      -17.288
    ],
    "height": 24.0,
    "elevation": 0,
    "bounds": [
      102.062,
      -23.882,
      173.484,
      -10.695
    ],
    "labelAnchor": [
      137.773,
      -17.288,
      27.0
    ],
    "description": "青年园公寓2号楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "runjie-residence",
    "osmId": "cupb/939",
    "name": "润杰学生公寓2号楼",
    "category": "living",
    "center": [
      -431.157,
      -341.226
    ],
    "height": 24.0,
    "elevation": 0,
    "bounds": [
      -477.812,
      -373.321,
      -384.502,
      -309.131
    ],
    "labelAnchor": [
      -431.157,
      -341.226,
      27.0
    ],
    "description": "润杰学生公寓2号楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "main-field",
    "osmId": "cupb/677",
    "name": "红旗操场",
    "category": "culture",
    "center": [
      -95.788,
      50.743
    ],
    "height": 1.0,
    "elevation": 0,
    "bounds": [
      -141.615,
      -38.064,
      -49.962,
      139.551
    ],
    "labelAnchor": [
      -95.788,
      50.743,
      4.0
    ],
    "description": "红旗操场，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred",
    "placeKind": "sports"
  },
  {
    "id": "north-gate",
    "osmId": "cupb/914",
    "name": "北门",
    "category": "landmark",
    "center": [
      71.197,
      395.291
    ],
    "height": 4.0,
    "elevation": 0,
    "bounds": [
      64.243,
      394.103,
      78.15,
      396.479
    ],
    "labelAnchor": [
      71.197,
      395.291,
      7.0
    ],
    "description": "北门，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 35,
    "zone": "cupb",
    "modelingBasis": "inferred",
    "placeKind": "gate"
  },
  {
    "id": "south-gate",
    "osmId": "cupb/1054",
    "name": "南门",
    "category": "landmark",
    "center": [
      84.019,
      -36.776
    ],
    "height": 4.0,
    "elevation": 0,
    "bounds": [
      83.08,
      -37.611,
      84.959,
      -35.942
    ],
    "labelAnchor": [
      84.019,
      -36.776,
      7.0
    ],
    "description": "南门，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 35,
    "zone": "cupb",
    "modelingBasis": "inferred",
    "placeKind": "gate"
  },
  {
    "id": "fifth-teaching",
    "osmId": "cupb/937",
    "name": "第五教学楼",
    "category": "academic",
    "center": [
      483.678,
      -277.096
    ],
    "height": 12,
    "elevation": 0,
    "bounds": [
      460.794,
      -312.248,
      506.561,
      -241.944
    ],
    "labelAnchor": [
      483.678,
      -277.096,
      15
    ],
    "description": "第五教学楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "geology-building",
    "osmId": "cupb/981",
    "name": "地质楼",
    "category": "academic",
    "center": [
      104.37,
      -146.173
    ],
    "height": 44,
    "elevation": 0,
    "bounds": [
      51.586,
      -169.209,
      157.154,
      -123.136
    ],
    "labelAnchor": [
      104.37,
      -146.173,
      47
    ],
    "description": "地质楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 120,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "energy-lab",
    "osmId": "cupb/1028",
    "name": "能源材料微结构实验室",
    "category": "academic",
    "center": [
      51.501,
      -125.9
    ],
    "height": 8,
    "elevation": 0,
    "bounds": [
      38.503,
      -142.525,
      64.498,
      -109.274
    ],
    "labelAnchor": [
      51.501,
      -125.9,
      11
    ],
    "description": "能源材料微结构实验室，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 60,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "nano-lab",
    "osmId": "cupb/977",
    "name": "联合纳米岩石物理实验室",
    "category": "academic",
    "center": [
      83.034,
      -184.099
    ],
    "height": 4,
    "elevation": 0,
    "bounds": [
      62.9,
      -189.305,
      103.167,
      -178.892
    ],
    "labelAnchor": [
      83.034,
      -184.099,
      7
    ],
    "description": "联合纳米岩石物理实验室，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 72,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "acoustic-lab",
    "osmId": "cupb/957",
    "name": "声波测井实验室",
    "category": "academic",
    "center": [
      145.011,
      -183.718
    ],
    "height": 4,
    "elevation": 0,
    "bounds": [
      130.02,
      -188.797,
      160.002,
      -178.638
    ],
    "labelAnchor": [
      145.011,
      -183.718,
      7
    ],
    "description": "声波测井实验室，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 54,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "runjie-residence-five",
    "osmId": "cupb/1059",
    "name": "润杰学生公寓5号楼",
    "category": "living",
    "center": [
      -484.434,
      -315.211
    ],
    "height": 24,
    "elevation": 0,
    "bounds": [
      -507.19,
      -330.31,
      -461.678,
      -300.111
    ],
    "labelAnchor": [
      -484.434,
      -315.211,
      27
    ],
    "description": "润杰学生公寓5号楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 82,
    "zone": "cupb",
    "modelingBasis": "inferred"
  },
  {
    "id": "huicai-residence-seven",
    "osmId": "cupb/978",
    "name": "汇才学生公寓7号楼",
    "category": "living",
    "center": [
      491.192,
      -356.807
    ],
    "height": 20,
    "elevation": 0,
    "bounds": [
      469.346,
      -373.52,
      513.039,
      -340.093
    ],
    "labelAnchor": [
      491.192,
      -356.807,
      23
    ],
    "description": "汇才学生公寓7号楼，位置依据中石大校园矢量资料。",
    "detail": "轮廓与位置来自用户提供的校园 GeoJSON；高度或地面视角仍需现场资料核实。",
    "sourceUrl": "https://map.cup.edu.cn/",
    "reference": "cupb-local-geojson",
    "distance": 79,
    "zone": "cupb",
    "modelingBasis": "inferred"
  }
],
};
