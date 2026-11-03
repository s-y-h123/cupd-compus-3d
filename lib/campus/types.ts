import type { CameraSnapshot } from './share';
import type { PatrolSnapshot } from './robo-dog-patrol';
import type { Object3D } from 'three';
export type LayerKey =
  | 'buildings'
  | 'vegetation'
  | 'roads'
  | 'boundary'
  | 'water'
  | 'sports'
  | 'context'
  | 'labels';
export type SelectionOrigin = 'manual' | 'tour' | 'restore';
export type Quality = 'auto' | 'fine' | 'smooth';
export type Preset = 'morning' | 'day' | 'evening' | 'night';
export type ViewMode = 'overview' | 'walk';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'haze';
export type LandmarkView =
  | 'oblique'
  | 'front'
  | 'back'
  | 'top'
  | 'entrance'
  | 'rear-entrance';
export interface ViewportFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type Category =
  | 'academic'
  | 'living'
  | 'culture'
  | 'service'
  | 'infrastructure'
  | 'landmark';
/** Fields published to the page; see scripts/runtime-data.mjs. */
export interface Building {
  architecture?: { origin: [number, number]; angle: number };
  id: string;
  name: string;
  category: Category;
  center: [number, number];
  height: number;
  elevation: number;
  levels: number;
  insideCampus: boolean;
  landmark: string | null;
  polygons: number[][][][];
  bounds: number[];
}
export interface Landmark {
  /** Optional east/north/up label position in metres. */
  labelAnchor?: [number, number, number];
  modelingBasis: 'photo' | 'type' | 'inferred';
  placeKind?: 'sports' | 'gate' | 'bridge' | 'sculpture';
  pickPolygon?: number[][];
  portalCenter?: [number, number];
  approachPath?: number[][];
  additionalReferences?: string[];
  id: string;
  osmId?: string;
  name: string;
  category: Category;
  center: [number, number];
  height: number;
  elevation: number;
  bounds: number[];
  description: string;
  /** Estimated site extent [west, south, east, north], relative to center. */
  siteBoundsOffset?: [number, number, number, number];
  detail: string;
  sourceUrl: string;
  reference: string;
  distance: number;
  cameraOffset?: [number, number, number];
  frontBearing?: number;
  zone: string;
  osmEditedAt?: string;
}
export interface Overview {
  infrastructureSnapshotAt?: string;
  publicRoadMeters?: number;
  bridges?: number;
  snapshotAt: string;
  buildings: number;
  campusBuildings: number;
  landmarks: number;
  trees: number;
  estimatedHeights: number;
  layers: Record<string, number>;
}
export interface Metrics {
  postprocessing?: 'ready' | 'failed' | 'loading' | 'off';
  benchmark?: {
    orbiting: boolean;
    elapsedMs: number;
    sampleIndex: number;
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      span: number;
    };
    viewport: number[];
    frame: ViewportFrame;
  };
  readyMs: number;
  heapMiB: number | null;
  shadowUpdates?: number;
  fps: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  quality: string;
  automaticQualityLevel: number;
  shadows: boolean;
  nearTrees: boolean;
  detailBudgetMiB: number;
  loadedBytes: number;
  loadedDetails: string[];
  queuedDetails: number;
  residentDetailBytes: number;
  detailGeometryMiB: number;
}
export interface SceneController {
  setLocale: (locale: import('./i18n').Locale) => void;
  setHovered: (id: string | null) => void;
  focus: (id: string, origin?: SelectionOrigin) => void;
  landmarkView: (view: LandmarkView) => void;
  setOrbit: (on: boolean) => void;
  setViewport: (frame: ViewportFrame, reframe?: boolean) => void;
  setLayer: (key: LayerKey, on: boolean) => void;
  setPreset: (p: Preset) => void;
  setWeather: (weather: Weather) => void;
  /** 已定位北门、东门、南门的双扇门开关。 */
  setGateOpen: (name: '北门' | '东门' | '南门', open: boolean) => boolean;
  setPedestrianCount: (count: number) => void;
  setPedestrianSpeed: (speed: number) => void;
  setPedestrianRoutesVisible: (visible: boolean) => void;
  /** 真实机器狗 GLB/GLTF 仅在显式调用时加载；初始容器为空。 */
  loadRoboDog: (modelUrl: string, onProgress?: (fraction: number | null) => void) => Promise<void>;
  getRoboDogPreview: () => Object3D | null;
  focusRoboDog: () => boolean;
  setRoboDogFirstPerson: (on: boolean) => void;
  setRoboDogSpeed: (speed: number) => void;
  setRoboDogColor: (hex: string) => void;
  setRoboDogPose: (position: [number, number, number], quaternion?: [number, number, number, number]) => void;
  moveRoboDog: (dt: number, direction: [number, number, number]) => void;
  getRoboDogState: () => { position: [number, number, number]; quaternion: [number, number, number, number]; speed: number; state: 'idle' | 'walking' | 'turning'; firstPerson: boolean };
  startRoboDogPatrol: (id: string) => boolean;
  pauseRoboDogPatrol: () => void;
  resumeRoboDogPatrol: () => void;
  stopRoboDogPatrol: () => void;
  getRoboDogPatrolState: () => PatrolSnapshot;
  setQuality: (q: Quality) => void;
  setViewMode: (mode: ViewMode) => void;
  /** Touch/onscreen movement: forward +1 is ahead, side +1 is right. */
  setWalkInput: (forward: number, side: number) => void;
  view: (
    v: 'overview' | 'top' | 'tilt' | 'north' | 'zoomIn' | 'zoomOut',
  ) => void;
  exportImage: () => Promise<void>;
  retry: () => void;
  dispose: () => void;
  getSnapshot: () => CameraSnapshot;
  restoreSnapshot: (snapshot: Partial<CameraSnapshot>) => void;
}
export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  buildings: true,
  vegetation: true,
  roads: true,
  boundary: true,
  water: true,
  sports: true,
  context: true,
  labels: true,
};
export const CATEGORY_NAMES: Record<Category, string> = {
  academic: '教学',
  living: '生活',
  culture: '文体',
  service: '校园服务',
  infrastructure: '路桥',
  landmark: '校门',
};
