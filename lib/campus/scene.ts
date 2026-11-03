import { loadCampusBoundary } from './boundary-data';
import { CUPB_CONFIG } from './cupb-config';
import { createProceduralCampus, type PedestrianRouteData } from './procedural-campus';
import { placeName, translate, type Locale, type Message } from './i18n';
import { landmarkLabelAnchor } from './labels';
import { createNightStyle, createRoadLights } from './night';
import { createPalette } from './palette';
import { createSky, fogRange } from './sky';
import { LIGHTING } from './lighting';
import { navigationFootprints, searchableBuildings } from './navigation';
import {
  treeAppearance,
  treeRotation,
  treeElevation,
  prioritizeTreeRows,
} from './vegetation';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchSportsSurfaces } from './sports-batching';
import { batchStaticRoadSurfaces } from './road-batching';
import { pruneGroundTriangles } from './ground-triangles';
import { createConvexCulling } from './convex-culling';
import { isTap } from './math';
import type { CameraSnapshot } from './share';
import {
  fetchModel,
  fetchJson,
  nearbyChunks,
  planDetails,
  ResourceQueue,
} from './streaming';
import type { StreamAsset as Asset } from './streaming';
import {
  asset,
  modelUrl,
  type BasePrefetch,
  type ModelManifest as Manifest,
} from './boot';
import {
  bridgeEntrancePose,
  entranceBox,
  fitBox,
  fitPoints,
  campusOverviewPoints,
  landmarkBox,
  landmarkDirection,
  benchmarkOrbitEnabled,
} from './camera';
import { DEFAULT_LAYERS } from './types';
import { AdaptiveQuality, qualityProfile } from './quality';
import { FramePacer } from './frame-pacing';
import { BenchmarkOrbit } from './benchmark-orbit';
import { ShadowFrustum } from './shadow-frustum';
import { disposeObject } from './resources';
import { createBoundary } from './boundary';
import { createContextStyle } from './context-style';
import type {
  Building,
  Landmark,
  Quality,
  Preset,
  SceneController,
  Metrics,
  LayerKey,
  LandmarkView,
  ViewportFrame,
  ViewMode,
  Weather,
} from './types';
interface Callbacks {
  onStatus: (message: Message, error?: boolean, progress?: number) => void;
  onReady: () => void;
  onHover: (id: string | null) => void;
  onSelect: (
    id: string | null,
    origin?: import('./types').SelectionOrigin,
  ) => void;
  onInteract: () => void;
  /** Optional: building the report is skipped when nobody reads it. */
  onMetrics?: (m: Metrics) => void;
  onOrbit: (on: boolean) => void;
  onCamera: (snapshot: CameraSnapshot) => void;
  onViewMode?: (mode: ViewMode) => void;
  onWeather?: (weather: Weather) => void;
}
export function createScene(
  host: HTMLElement,
  buildings: Building[],
  landmarks: Landmark[],
  callbacks: Callbacks,
  /** Consumed by the first initialization only; retries fetch again. */
  prefetch?: BasePrefetch,
): SceneController {
  let locale: Locale = 'zh';
  const t = (source: string, values?: Record<string, string | number>) =>
    translate(locale, source, values);
  const benchmarkOrbit = benchmarkOrbitEnabled(location.search);
  const scene = new THREE.Scene();
  let convexCulling: ReturnType<typeof createConvexCulling> | null = null;
  let convexPreparation: ReturnType<typeof setTimeout> | undefined;
  const contextStyle = createContextStyle();
  const palette = createPalette(buildings);
  const nightStyle = createNightStyle();
  let roadLights: ReturnType<typeof createRoadLights> | null = null;
  const sky = createSky();
  scene.background = sky.texture;
  scene.fog = sky.fog;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const shadowVolume = new ShadowFrustum();
  let shadowUpdates = 0;
  const canvas = renderer.domElement;
  const overviewCanvasLabel =
    '中国石油大学（北京）三维校园，方向键平移，加减键缩放，Home返回全景';
  canvas.setAttribute('aria-label', overviewCanvasLabel);
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  const camera = new THREE.PerspectiveCamera(41, 1, 1, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 18;
  controls.maxDistance = 18000;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.minPolarAngle = 0.02;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  const wheelHost = host.parentElement ?? host;
  function onOverlayWheel(event: WheelEvent) {
    if (event.target === canvas && viewMode !== 'walk') return;
    if (event.defaultPrevented) return;
    if (!(event.target instanceof Element)) return;
    // Scrollable menus keep their wheel gestures; other overlays zoom the map.
    for (let el: Element | null = event.target; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (
        (/(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight) ||
        (/(auto|scroll)/.test(style.overflowX) &&
          el.scrollWidth > el.clientWidth) ||
        el.matches('[role="dialog"], dialog')
      )
        return;
      if (el === wheelHost) break;
    }
    if (viewMode === 'walk') {
      event.preventDefault();
      view(event.deltaY < 0 ? 'zoomIn' : 'zoomOut');
      return;
    }
    // Retain wheel units, cursor position and pinch modifiers for OrbitControls.
    if (!canvas.dispatchEvent(new WheelEvent('wheel', event)))
      event.preventDefault();
  }
  wheelHost.addEventListener('wheel', onOverlayWheel, { passive: false });
  const ambient = new THREE.HemisphereLight('#d4e6fa', '#818363', 0.72);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff3de', 3.35);
  sun.position.set(-700, 1400, 600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.18;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#c3dcec', 0.18);
  fill.position.set(1000, 600, -700);
  scene.add(fill);
  const layers = { ...DEFAULT_LAYERS };
  const boundaryRoot = new THREE.Group();
  let overviewPoints: THREE.Vector3[] | null = null;
  scene.add(boundaryRoot);
  let boundaryReady = false,
    boundaryLoading = false,
    boundaryFailed = false;
  const dynamic = new THREE.Group();
  scene.add(dynamic);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 30000),
    new THREE.MeshStandardMaterial({ color: '#b8c9a9', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -22;
  scene.add(ground);
  scene.environment = sky.texture;
  scene.environmentIntensity = 0.24;
  const loader = new GLTFLoader();
  let decoderFailed = false;
  function createDecoder() {
    const decoder = new DRACOLoader();
    decoder.setDecoderPath(asset('draco/'));
    // The base model carries hundreds of Draco primitives. Phone-sized layouts
    // keep two decoder heaps; larger screens use spare cores, at most four.
    decoder.setWorkerLimit(
      window.innerWidth < 760
        ? 2
        : Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 2) - 1)),
    );
    // Fetch the decoder while the base model is still downloading. Model loads
    // still await this request; observing it here only avoids an unhandled
    // rejection when it fails before the first decode.
    (
      decoder.preload() as DRACOLoader & { decoderPending?: Promise<unknown> }
    ).decoderPending?.catch(() => {
      if (draco === decoder) decoderFailed = true;
    });
    return decoder;
  }
  let draco: DRACOLoader | null = null;
  let manifest: Manifest | null = null;
  let pendingPrefetch = prefetch;
  let baseRoot: THREE.Group | null = null;
  let procedural: ReturnType<typeof createProceduralCampus> | null = null;
  const pedestrianSettings = { count: 96, speed: 1, routesVisible: false };
  let weather: Weather = 'clear';
  let fallbackActive = false;
  let walkFlatGroundY: number | null = null;
  const walkGroundCache = new Map<string, number>();
  const cupbLayerMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
  let treesRoot: THREE.Group | null = null;
  let highTreesReady = false;
  let highTreesFailed = false;
  let treesFailed = false;
  let treeData: {
    data: number[][];
    terrain: {
      bounds: number[];
      cols: number;
      rows: number;
      heights: number[];
    };
  } | null = null;
  let disposed = false;
  let quality: Quality = 'auto';
  let preset: Preset = 'day';
  let selected: string | null = null;
  let viewMode: ViewMode = 'overview';
  let dogFollow = false;
  const dogFollowAnchor = new THREE.Vector3();
  const walkKeys = new Set<string>();
  let walkTouchForward = 0;
  let walkTouchSide = 0;
  const walkVelocity = new THREE.Vector3();
  const walkForward = new THREE.Vector3();
  const walkBounds = new THREE.Box3();
  const walkRay = new THREE.Raycaster();
  let walkYaw = 0;
  let walkPitch = 0;
  let walkPointer: number | null = null;
  let walkLastX = 0;
  let walkLastY = 0;
  let walkDragging = false;
  let hovered: string | null = null;
  let initialReady = false;
  let readyMs = 0;
  let loadedBytes = 0;
  let loop = 0;
  let modeSmooth = false;
  const adaptive = new AdaptiveQuality();
  let profile = qualityProfile('auto', false, false, adaptive.level);
  let effects: ReturnType<
    typeof import('./postprocessing').createPostprocessing
  > | null = null;
  let effectsLoading = false;
  let effectsFailed = false;
  function syncEffects() {
    if (!profile.postprocessing) {
      effects?.dispose();
      effects = null;
      return;
    }
    if (effects) {
      effects.resize();
      return;
    }
    if (effectsLoading || effectsFailed || !initialReady) return;
    effectsLoading = true;
    void import('./postprocessing')
      .then(({ createPostprocessing }) => {
        if (!disposed && profile.postprocessing) {
          effects = createPostprocessing(renderer, scene, camera);
          effects.setNight(preset === 'night');
          dirty = true;
        }
      })
      .catch(() => {
        effectsFailed = true;
      })
      .finally(() => {
        effectsLoading = false;
      });
  }
  function renderScene() {
    if (scene.fog instanceof THREE.Fog) {
      Object.assign(
        scene.fog,
        fogRange(preset, camera.position.distanceTo(controls.target)),
      );
      if (weather === 'haze') {
        const distance = camera.position.distanceTo(controls.target);
        scene.fog.near = viewMode === 'walk' ? 30 : distance * .34;
        scene.fog.far = viewMode === 'walk' ? 460 : distance + 390;
      } else if (weather === 'rain') {
        const distance = camera.position.distanceTo(controls.target);
        scene.fog.near = viewMode === 'walk' ? 130 : distance * .46;
        scene.fog.far = viewMode === 'walk' ? 1050 : distance + 850;
      } else if (weather === 'cloudy') {
        const distance = camera.position.distanceTo(controls.target);
        scene.fog.near = viewMode === 'walk' ? 220 : distance * .6;
        scene.fog.far = viewMode === 'walk' ? 1600 : distance + 1400;
      }
    }
    renderer.setRenderTarget(null);
    renderer.info.reset();
    if (renderer.shadowMap.enabled && renderer.shadowMap.needsUpdate)
      shadowUpdates++;
    if (effects && profile.postprocessing) effects.render();
    else renderer.render(scene, camera);
  }
  const saveData = () =>
    Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    );
  let lastFrame = 0;
  let benchmarkRun: BenchmarkOrbit | null = null;
  const framePacer = new FramePacer();
  let sampleStart = performance.now();
  let fps = 0;
  let lastRendered = 0;
  let activeFrameMs = 0;
  let activeFrames = 0;
  let dirty = true;
  let pendingRequest = 0;
  let frame: ViewportFrame = {
    left: 20,
    top: 100,
    width: Math.max(200, host.clientWidth - 100),
    height: Math.max(200, host.clientHeight - 160),
  };
  // UI occlusion can change without changing the current camera composition.
  let cameraFrame = frame;
  let framedWidth = host.clientWidth;
  let framedHeight = host.clientHeight;
  let selectedView: LandmarkView = 'oblique';
  let autoFramed = true;
  let orbiting = false;
  let restoredPose: Partial<CameraSnapshot> | null = null;
  let frameReady = false;
  let cameraChanged = true;
  let cameraSampleAt = 0;
  const compact = () => window.innerWidth < 760;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const loaded = new Map<string, THREE.Group>();
  const loading = new Set<string>();
  const failed = new Map<string, Asset>();
  const detailQueue = new ResourceQueue<void>(2);
  const lifecycle = new AbortController();
  const progresses = new Map<
    string,
    { label: string; name?: string; fraction: number }
  >();
  const geometryCosts = new Map<string, number>();
  const wanted = new Set<string>();
  const recentlyUsed = new Map<string, number>();
  let tween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    start: number;
  } | null = null;
  const labels = document.createElement('div');
  labels.className = 'scene-labels';
  host.appendChild(labels);
  const labelNodes = landmarks.map((l, i) => {
    const el = document.createElement('button');
    el.className = 'map-label';
    el.dataset.placeId = l.id;
    el.onpointerenter = () => setHovered(l.id);
    el.onpointerleave = () => setHovered(null);
    el.onfocus = () => setHovered(l.id);
    el.onblur = () => setHovered(null);
    const number = document.createElement('span');
    number.textContent = String(i + 1).padStart(2, '0');
    el.appendChild(number);
    const caption = document.createElement('span');
    caption.className = 'map-label-name';
    caption.textContent = placeName(l.name, locale);
    el.appendChild(caption);
    el.title = t('查看{name}', { name: placeName(l.name, locale) });
    el.onclick = () => {
      callbacks.onInteract();
      focus(l.id);
    };
    labels.appendChild(el);
    return {
      l,
      el,
      caption,
      width: 0,
      height: 0,
      point: landmarkLabelAnchor(l),
      bounds: [0, 0, 0, 0],
    };
  });
  // 北门至图书馆东侧的楼名取自建筑足迹，不额外加入巡游点位。
  const northBuildingIds = new Set(CUPB_CONFIG.northBuildingLabelIds);
  const buildingLabelNodes = buildings
    .filter((b) => northBuildingIds.has(b.id) && !b.landmark)
    .map((b) => {
      const el = document.createElement('button');
      el.className = 'map-label map-label-building';
      el.dataset.buildingId = b.id;
      const caption = document.createElement('span');
      caption.className = 'map-label-name';
      el.appendChild(caption);
      el.onclick = () => {
        callbacks.onInteract();
        focus(b.id);
      };
      labels.appendChild(el);
      return {
        b,
        el,
        caption,
        point: new THREE.Vector3(b.center[0], b.elevation + b.height + 3, -b.center[1]),
        width: 0,
        height: 0,
        bounds: [0, 0, 0, 0],
      };
    });
  const labelOrder = [...labelNodes];
  let orderedHover: string | null | undefined;
  let orderedSelection: string | null | undefined;
  const labelProjection = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const orbitAxis = new THREE.Vector3(0, 1, 0);
  const occupiedLabels: number[][] = [];
  const labelViewport = { width: 0, height: 0 };
  function measureLabels() {
    const layerDisplay = labels.style.display;
    labels.style.display = '';
    const allNodes = [...labelNodes, ...buildingLabelNodes];
    const displays = allNodes.map(({ el }) => el.style.display);
    for (const { el } of allNodes) el.style.display = '';
    for (const node of allNodes) {
      node.width = node.el.offsetWidth;
      node.height = node.el.offsetHeight;
    }
    allNodes.forEach(({ el }, i) => {
      el.style.display = displays[i];
    });
    labels.style.display = layerDisplay;
    dirty = true;
  }
  function setLocale(value: Locale) {
    locale = value;
    labels.lang = value === 'zh' ? 'zh-CN' : 'en';
    canvas.setAttribute(
      'aria-label',
      t('中国石油大学（北京）三维校园，方向键平移，加减键缩放，Home返回全景'),
    );
    for (const { l, el, caption } of labelNodes) {
      const name = placeName(l.name, locale);
      caption.textContent = name;
      el.title = t('查看{name}', { name });
      el.setAttribute('aria-label', el.title);
    }
    for (const { b, el, caption } of buildingLabelNodes) {
      const name = placeName(b.name, locale);
      caption.textContent = name;
      el.title = t('查看{name}', { name });
      el.setAttribute('aria-label', el.title);
    }
    measureLabels();
  }
  function updateLabelAnchors(id?: string) {
    for (const node of labelNodes) {
      if (id && node.l.id !== id) continue;
      const key = 'landmark-' + node.l.id;
      const model = loaded.get(key) ?? baseRoot?.getObjectByName(key);
      node.point.copy(landmarkLabelAnchor(node.l, model));
      node.el.dataset.anchor = node.point
        .toArray()
        .map((v) => v.toFixed(2))
        .join(',');
    }
    dirty = true;
  }
  function setHovered(id: string | null) {
    if (hovered === id) return;
    hovered = id;
    for (const { l, el } of labelNodes)
      el.classList.toggle('linked-hover', l.id === id);
    callbacks.onHover(id);
    dirty = true;
  }
  const proxies: THREE.Mesh[] = [];
  function footprintMesh(b: {
    polygons: number[][][][];
    height: number;
    elevation: number;
  }) {
    const groupShapes = b.polygons.map((poly) => {
      const s = new THREE.Shape(
        poly[0].map((v) => new THREE.Vector2(v[0], v[1])),
      );
      for (const ring of poly.slice(1))
        s.holes.push(
          new THREE.Path(ring.map((v) => new THREE.Vector2(v[0], v[1]))),
        );
      return s;
    });
    const geo = new THREE.ExtrudeGeometry(groupShapes, {
      depth: b.height,
      bevelEnabled: false,
      steps: 1,
    });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    mesh.position.y = b.elevation;
    mesh.updateMatrixWorld();
    return mesh;
  }
  let proxiesReady = false;
  function ensurePickProxies() {
    if (proxiesReady) return;
    for (const b of navigationFootprints(buildings, landmarks)) {
      const mesh = footprintMesh(b);
      mesh.userData = { id: b.landmark ?? b.id, layer: b.layer };
      proxies.push(mesh);
    }
    proxiesReady = true;
  }
  const namedBuildings = new Map(
    searchableBuildings(buildings, landmarks).map((b) => [b.id, b]),
  );
  // Only curated places participate in map hover and click selection.
  function pickTargets() {
    ensurePickProxies();
    return proxies.filter((p) => layers[p.userData.layer as LayerKey]);
  }
  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickTargets(), false)[0]?.object
      .userData as { id: string } | undefined;
  }
  let hoverFrame = 0;
  let hoverPoint: { x: number; y: number } | null = null;
  function clearPointerHover() {
    canvas.style.cursor = '';
    setHovered(null);
  }
  function updatePointerHover() {
    hoverFrame = 0;
    if (!hoverPoint || tween || downPointers > 0) return;
    const hit = pick(hoverPoint.x, hoverPoint.y);
    setHovered(hit?.id ?? null);
    canvas.style.cursor = hit ? 'pointer' : '';
  }
  const highlight = new THREE.Group();
  scene.add(highlight);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = { x: 0, y: 0, time: 0 };
  let maxTravel = 0;
  let downPointers = 0;
  function onDown(e: PointerEvent) {
    if (viewMode === 'walk') {
      if (e.button !== 0) return;
      e.preventDefault();
      walkPointer = e.pointerId;
      walkLastX = e.clientX;
      walkLastY = e.clientY;
      walkDragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      canvas.focus({ preventScroll: true });
      callbacks.onInteract();
      return;
    }
    downPointers++;
    down = { x: e.clientX, y: e.clientY, time: performance.now() };
    maxTravel = downPointers > 1 ? 999 : 0;
  }
  function onMove(e: PointerEvent) {
    if (viewMode === 'walk') {
      if (walkPointer === e.pointerId && walkDragging) {
        const dx = e.clientX - walkLastX;
        const dy = e.clientY - walkLastY;
        walkLastX = e.clientX;
        walkLastY = e.clientY;
        walkYaw -= dx * CUPB_CONFIG.walk.mouseSensitivity;
        walkPitch = Math.max(
          -1.22,
          Math.min(1.22, walkPitch - dy * CUPB_CONFIG.walk.mouseSensitivity),
        );
        if (procedural?.roboDogState.firstPerson) {
          cameraChanged = true;
          dirty = true;
        } else syncWalkLook();
      }
      return;
    }
    maxTravel = Math.max(
      maxTravel,
      Math.hypot(e.clientX - down.x, e.clientY - down.y),
    );
    if (e.pointerType !== 'mouse' || e.buttons) {
      clearPointerHover();
      return;
    }
    hoverPoint = { x: e.clientX, y: e.clientY };
    if (!hoverFrame) hoverFrame = requestAnimationFrame(updatePointerHover);
  }
  function onLeave() {
    if (viewMode === 'walk') return;
    hoverPoint = null;
    clearPointerHover();
  }
  function onUp(e: PointerEvent) {
    if (viewMode === 'walk') {
      if (walkPointer === e.pointerId) {
        if (canvas.hasPointerCapture(e.pointerId))
          canvas.releasePointerCapture(e.pointerId);
        walkPointer = null;
        walkDragging = false;
        canvas.style.cursor = 'grab';
      }
      return;
    }
    if (e.button !== 0) {
      downPointers = Math.max(0, downPointers - 1);
      return;
    }
    downPointers = Math.max(0, downPointers - 1);
    if (
      !isTap(
        down,
        { x: e.clientX, y: e.clientY, time: performance.now() },
        maxTravel,
      )
    )
      return;
    const hit = pick(e.clientX, e.clientY);
    clearPointerHover();
    if (hit) focus(hit.id);
  }
  function onCancel() {
    if (viewMode === 'walk') {
      if (walkPointer !== null && canvas.hasPointerCapture(walkPointer))
        canvas.releasePointerCapture(walkPointer);
      walkPointer = null;
      walkDragging = false;
      canvas.style.cursor = 'grab';
      return;
    }
    downPointers = 0;
    maxTravel = 999;
  }
  function onLostWalkPointer(e: PointerEvent) {
    if (walkPointer !== e.pointerId) return;
    walkPointer = null;
    walkDragging = false;
    if (viewMode === 'walk') canvas.style.cursor = 'grab';
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('lostpointercapture', onLostWalkPointer);
  function moveTo(target: THREE.Vector3, position: THREE.Vector3) {
    dogFollow = false;
    dirty = true;
    tween = null;
    if (reduced.matches) {
      controls.target.copy(target);
      camera.position.copy(position);
      controls.update();
    } else
      tween = {
        from: camera.position.clone(),
        to: position,
        fromTarget: controls.target.clone(),
        toTarget: target,
        start: performance.now(),
      };
  }
  function focus(
    id: string,
    origin: import('./types').SelectionOrigin = 'manual',
  ) {
    stopWalk();
    const l = landmarks.find((l) => l.id === id);
    if (!l) {
      if (namedBuildings.has(id)) focusBuilding(id, origin);
      return;
    }
    setHovered(null);
    selected = id;
    restoredPose = null;
    selectedView = 'oblique';
    autoFramed = true;
    setOrbit(false);
    const c = l;
    composeViewport();
    frameLandmark();
    const radius = Math.max(
      12,
      Math.hypot(c.bounds[2] - c.bounds[0], c.bounds[3] - c.bounds[1]) * 0.54,
    );
    clearGroup(highlight);
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.6, 64),
      new THREE.MeshBasicMaterial({
        color: '#d9ae56',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(c.center[0], c.elevation + 0.6, -c.center[1]);
    if (l?.placeKind === 'sports' || l?.placeKind === 'bridge') {
      mark.geometry.dispose();
      mark.material.dispose();
    } else highlight.add(mark);
    callbacks.onSelect(id, origin);
    reconcileDetails(true);
  }
  function buildingBox(b: Building) {
    const [x0, y0, x1, y1] = b.bounds;
    return new THREE.Box3(
      new THREE.Vector3(x0 - 4, b.elevation - 0.5, -y1 - 4),
      new THREE.Vector3(x1 + 4, b.elevation + b.height + 4, -y0 + 4),
    );
  }
  function focusBuilding(
    id: string,
    origin: import('./types').SelectionOrigin = 'manual',
  ) {
    const b = namedBuildings.get(id)!;
    clearPointerHover();
    selected = id;
    restoredPose = null;
    selectedView = 'oblique';
    autoFramed = true;
    setOrbit(false);
    composeViewport();
    frameLandmark();
    clearGroup(highlight);
    // A thin outline traces the footprint and roof so the building reads among its neighbours.
    const proxy = footprintMesh(b);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(proxy.geometry, 30),
      new THREE.LineBasicMaterial({
        color: '#e0b552',
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    outline.position.copy(proxy.position);
    outline.renderOrder = 10;
    proxy.geometry.dispose();
    (proxy.material as THREE.Material).dispose();
    highlight.add(outline);
    const [x0, y0, x1, y1] = b.bounds;
    const radius = Math.max(10, Math.hypot(x1 - x0, y1 - y0) * 0.54);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.6, 64),
      new THREE.MeshBasicMaterial({
        color: '#d9ae56',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.center[0], b.elevation + 0.6, -b.center[1]);
    highlight.add(ring);
    callbacks.onSelect(id, origin);
    reconcileDetails(true);
  }
  function frameLandmark(animate = true) {
    const place = landmarks.find((p) => p.id === selected);
    const building = place ? undefined : namedBuildings.get(selected ?? '');
    if (building) {
      const fit = fitBox(
        buildingBox(building),
        selectedView === 'top'
          ? new THREE.Vector3(0, 1, 0.025).normalize()
          : new THREE.Vector3(-0.5, 0.66, 1).normalize(),
        cameraFrame,
        { width: host.clientWidth, height: host.clientHeight },
        camera.fov,
      );
      if (animate) moveTo(fit.target, fit.position);
      else {
        tween = null;
        controls.target.copy(fit.target);
        camera.position.copy(fit.position);
        controls.update();
        dirty = true;
      }
      return;
    }
    if (!place) return;
    const detail = loaded.get('landmark-' + place.id);
    let box = detail
      ? new THREE.Box3().setFromObject(detail)
      : landmarkBox(place);
    if (selectedView === 'oblique') {
      const anchor = labelNodes.find((node) => node.l.id === place.id)!.point;
      // Full views include the label above small gates, which otherwise clips.
      box.expandByPoint(anchor.clone().add(new THREE.Vector3(0, 5, 0)));
    }
    if (selectedView === 'entrance' || selectedView === 'rear-entrance')
      box = entranceBox(
        place,
        box,
        selectedView === 'rear-entrance',
        buildings.find((b) => b.landmark === selected)?.architecture,
      );
    const framing = fitBox(
      box,
      landmarkDirection(
        place,
        selectedView,
        buildings.find((b) => b.landmark === selected)?.architecture,
      ),
      cameraFrame,
      { width: host.clientWidth, height: host.clientHeight },
      camera.fov,
    );
    const fitted =
      selectedView === 'entrance'
        ? bridgeEntrancePose(place, framing)
        : framing;
    if (animate) moveTo(fitted.target, fitted.position);
    else {
      tween = null;
      controls.target.copy(fitted.target);
      camera.position.copy(fitted.position);
      controls.update();
      dirty = true;
    }
  }
  function landmarkView(value: LandmarkView) {
    stopWalk();
    restoredPose = null;
    setOrbit(false);
    selectedView = value;
    composeViewport();
    autoFramed = true;
    frameLandmark();
  }
  function setOrbit(on: boolean) {
    if (viewMode === 'walk' && on) return;
    restoredPose = null;
    orbiting =
      on && landmarks.some((p) => p.id === selected) && !reduced.matches;
    benchmarkRun = null;
    callbacks.onOrbit(orbiting);
    if (orbiting) {
      composeViewport();
      selectedView = 'oblique';
      // Asset bounds change during calibration. A benchmark must retain the
      // explicit shared camera instead of fitting each asset set differently.
      if (benchmarkOrbit) {
        tween = null;
        // Compare the same orbit directions across reloads. Otherwise the
        // page's existing 1.5 s metrics timer gives each run a different phase.
        const startedAt = performance.now();
        benchmarkRun = new BenchmarkOrbit(
          startedAt,
          camera.position.clone().sub(controls.target),
        );
        sampleStart = startedAt;
        lastFrame = startedAt;
        lastRendered = 0;
        activeFrameMs = 0;
        activeFrames = 0;
        return;
      }
      // A sphere fits through a complete rotation, including the wider sides.
      const place = landmarks.find((p) => p.id === selected)!;
      const detail = loaded.get('landmark-' + place.id);
      const box = detail
        ? new THREE.Box3().setFromObject(detail)
        : landmarkBox(place);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const fit = fitBox(
        new THREE.Box3().setFromCenterAndSize(
          sphere.center,
          new THREE.Vector3().setScalar(sphere.radius * 2),
        ),
        landmarkDirection(place, 'oblique'),
        cameraFrame,
        { width: host.clientWidth, height: host.clientHeight },
      );
      moveTo(fit.target, fit.position);
    }
  }
  function composeViewport() {
    cameraFrame = frame;
    camera.setViewOffset(
      host.clientWidth,
      host.clientHeight,
      host.clientWidth / 2 - (frame.left + frame.width / 2),
      host.clientHeight / 2 - (frame.top + frame.height / 2),
      host.clientWidth,
      host.clientHeight,
    );
    cameraChanged = true;
    dirty = true;
  }
  function setViewport(value: ViewportFrame, reframe = false) {
    frame = value;
    const resized =
      framedWidth !== host.clientWidth || framedHeight !== host.clientHeight;
    dirty = true;
    // A panel toggle only changes label occlusion. Preserve position, target and
    // projection, including during an orbit or an in-flight navigation tween.
    if (frameReady && !resized && !reframe) return;
    frameReady = true;
    framedWidth = host.clientWidth;
    framedHeight = host.clientHeight;
    composeViewport();
    if (viewMode === 'walk') return;
    if (restoredPose?.position) applyRestoredPose();
    else if (orbiting) setOrbit(true);
    else if (selected && autoFramed) frameLandmark();
    else if (!selected && autoFramed) overview();
    dirty = true;
  }
  function visibleTangent() {
    return (
      (Math.tan((camera.fov * Math.PI) / 360) *
        Math.min(cameraFrame.width, cameraFrame.height)) /
      host.clientHeight
    );
  }
  function getSnapshot(): CameraSnapshot {
    return {
      selected,
      view: autoFramed && !orbiting ? selectedView : null,
      preset,
      weather,
      position: camera.position.toArray() as CameraSnapshot['position'],
      target: controls.target.toArray() as CameraSnapshot['target'],
      span: camera.position.distanceTo(controls.target) * visibleTangent(),
    };
  }
  function applyRestoredPose() {
    if (!restoredPose?.position || !restoredPose.target || !restoredPose.span)
      return;
    const target = new THREE.Vector3(...restoredPose.target);
    const offset = new THREE.Vector3(...restoredPose.position)
      .sub(target)
      .normalize();
    const distance = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, restoredPose.span / visibleTangent()),
    );
    tween = null;
    autoFramed = false;
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(offset, distance);
    controls.update();
    dirty = true;
  }
  function restoreSnapshot(snapshot: Partial<CameraSnapshot>) {
    if (snapshot.preset) setPreset(snapshot.preset);
    if (snapshot.weather) setWeather(snapshot.weather);
    if (snapshot.selected) {
      focus(snapshot.selected, 'restore');
      if (snapshot.view) landmarkView(snapshot.view);
    }
    restoredPose = snapshot.position ? snapshot : null;
    if (frameReady) applyRestoredPose();
  }
  function overview(animate = true) {
    const direction = new THREE.Vector3(0.55, 1.1, 1);
    const viewport = { width: host.clientWidth, height: host.clientHeight };
    const { target: t, position: p } = overviewPoints
      ? fitPoints(overviewPoints, direction, cameraFrame, viewport)
      : {
          target: new THREE.Vector3(...CUPB_CONFIG.overview.target),
          position: new THREE.Vector3(...CUPB_CONFIG.overview.position),
        };
    if (animate) moveTo(t, p);
    else {
      controls.target.copy(t);
      camera.position.copy(p);
      controls.update();
    }
  }
  overview(false);
  const walkDown = new THREE.Vector3(0, -1, 0);
  const walkRayOrigin = new THREE.Vector3();
  function pointInRing(x: number, north: number, ring: number[][]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (
        (a[1] > north) !== (b[1] > north) &&
        x < ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  }
  function nearRing(x: number, north: number, ring: number[][], radius: number) {
    const limit = radius * radius;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const span = dx * dx + dy * dy;
      const along = span
        ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / span))
        : 0;
      const px = x - a[0] - along * dx;
      const py = north - a[1] - along * dy;
      if (px * px + py * py < limit) return true;
    }
    return false;
  }
  /** 米制足迹用于玩家半径碰撞，X 东、二维北向对应 Three 的 -Z。 */
  function walkFree(x: number, z: number) {
    const radius = CUPB_CONFIG.walk.radius;
    if (
      x < walkBounds.min.x + radius ||
      x > walkBounds.max.x - radius ||
      z < walkBounds.min.z + radius ||
      z > walkBounds.max.z - radius
    )
      return false;
    const north = -z;
    for (const building of buildings) {
      if (!building.insideCampus || building.height <= 0) continue;
      const [west, south, east, northEdge] = building.bounds;
      if (
        x < west - radius || x > east + radius ||
        north < south - radius || north > northEdge + radius
      )
        continue;
      for (const polygon of building.polygons) {
        if (!polygon.length) continue;
        if (
          pointInRing(x, north, polygon[0]) &&
          !polygon.slice(1).some((ring) => pointInRing(x, north, ring))
        )
          return false;
        if (polygon.some((ring) => nearRing(x, north, ring, radius)))
          return false;
      }
    }
    return true;
  }
  /** 只取地面/道路/运动面的射线命中，不把建筑屋顶当作可行走地面。 */
  function walkGroundY(x: number, z: number) {
    if (!baseRoot) return 0;
    if (walkFlatGroundY !== null) return walkFlatGroundY;
    if (fallbackActive) return 0;
    const cell = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    const cached = walkGroundCache.get(cell);
    if (cached !== undefined) return cached;
    walkRayOrigin.set(x, walkBounds.max.y + 100, z);
    walkRay.set(walkRayOrigin, walkDown);
    walkRay.far = Math.max(200, walkBounds.max.y - walkBounds.min.y + 200);
    let height = walkBounds.min.y;
    for (const hit of walkRay.intersectObject(baseRoot, true)) {
      const mesh = hit.object as THREE.Mesh;
      const material = Array.isArray(mesh.material)
        ? mesh.material[hit.face?.materialIndex ?? 0]
        : mesh.material;
      const label = `${material?.name ?? ''} ${mesh.name} ${mesh.parent?.name ?? ''} ${mesh.userData.cupbSemanticLayer ?? ''}`;
      if (
        /cupb-(?:terrain|roads|sports)|terrain|ground|road|path|field|sport|地形|地面|道路|操场|walk-ground/i.test(label)
      )
        height = Math.max(height, hit.point.y);
    }
    if (walkGroundCache.size > 4096) walkGroundCache.clear();
    walkGroundCache.set(cell, height);
    return height;
  }
  function syncWalkLook() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(walkPitch, walkYaw, 0);
    camera.getWorldDirection(walkForward);
    controls.target.copy(camera.position).addScaledVector(walkForward, 12);
    cameraChanged = true;
    dirty = true;
  }
  function stopWalk() {
    if (procedural) procedural.roboDogState.firstPerson = false;
    if (viewMode !== 'walk') return;
    viewMode = 'overview';
    walkKeys.clear();
    walkTouchForward = 0;
    walkTouchSide = 0;
    walkVelocity.set(0, 0, 0);
    if (walkPointer !== null && canvas.hasPointerCapture(walkPointer))
      canvas.releasePointerCapture(walkPointer);
    walkPointer = null;
    walkDragging = false;
    controls.enabled = true;
    controls.enableDamping = true;
    camera.near = 1;
    camera.far = 30000;
    camera.fov = 41;
    camera.updateProjectionMatrix();
    canvas.style.cursor = '';
    canvas.setAttribute('aria-label', overviewCanvasLabel);
    callbacks.onViewMode?.('overview');
    dirty = true;
  }
  function setViewMode(mode: ViewMode) {
    dogFollow = false;
    if (mode === 'overview') {
      stopWalk();
      view('overview');
      return;
    }
    // 从机器狗视角选择普通步行时，重新初始化人的出生点和相机参数。
    if (procedural?.roboDogState.firstPerson) stopWalk();
    if (!initialReady || !baseRoot || viewMode === 'walk') return;
    setOrbit(false);
    tween = null;
    autoFramed = false;
    walkBounds.setFromObject(baseRoot);
    const targetPlace = landmarks.find((item) => item.id === selected);
    const preferred = targetPlace?.center ?? CUPB_CONFIG.walk.start;
    const seek = ([east, north]: [number, number], clearance = 0) => {
      for (let distance = clearance; distance <= 220; distance += 5) {
        const count = Math.max(8, Math.ceil((2 * Math.PI * distance) / 6));
        for (let i = 0; i < count; i++) {
          const x = east + Math.cos((i * Math.PI * 2) / count) * distance;
          const z = -north + Math.sin((i * Math.PI * 2) / count) * distance;
          if (walkFree(x, z)) return [x, z] as const;
        }
      }
      return null;
    };
    const clearance = targetPlace
      ? Math.max(
          targetPlace.bounds[2] - targetPlace.bounds[0],
          targetPlace.bounds[3] - targetPlace.bounds[1],
        ) * 0.5 + 25
      : 0;
    const spawn = seek(preferred, clearance) ?? seek(CUPB_CONFIG.walk.start);
    if (!spawn) return;
    selected = null;
    clearGroup(highlight);
    viewMode = 'walk';
    clearPointerHover();
    controls.enabled = false;
    controls.enableDamping = false;
    walkKeys.clear();
    walkVelocity.set(0, 0, 0);
    camera.near = 0.2;
    camera.far = 10000;
    camera.fov = CUPB_CONFIG.walk.fov;
    camera.updateProjectionMatrix();
    camera.position.set(
      spawn[0],
      walkGroundY(spawn[0], spawn[1]) + CUPB_CONFIG.walk.eyeHeight,
      spawn[1],
    );
    const lookPlace = targetPlace ?? landmarks.find((item) => item.id === 'library');
    const lookAt = lookPlace
      ? new THREE.Vector3(lookPlace.center[0], camera.position.y, -lookPlace.center[1])
      : new THREE.Vector3(spawn[0], camera.position.y, spawn[1] - 20);
    const delta = lookAt.sub(camera.position);
    walkYaw = delta.lengthSq() > 0.01 ? Math.atan2(-delta.x, -delta.z) : 0;
    walkPitch = lookPlace
      ? Math.min(
          0.2,
          Math.atan2(
            Math.max(0, lookPlace.height * 0.5 - CUPB_CONFIG.walk.eyeHeight),
            Math.hypot(delta.x, delta.z),
          ),
        )
      : 0;
    syncWalkLook();
    reconcileDetails(true);
    canvas.style.cursor = 'grab';
    canvas.setAttribute(
      'aria-label',
      '中国石油大学（北京）第一视角漫游，WASD移动，Shift加速，按住鼠标左键拖拽视角，Home返回全景',
    );
    canvas.focus({ preventScroll: true });
    callbacks.onViewMode?.('walk');
    callbacks.onInteract();
    pendingRequest = performance.now();
  }
  function setWalkInput(forward: number, side: number) {
    if (viewMode !== 'walk') return;
    walkTouchForward = Number.isFinite(forward)
      ? Math.max(-1, Math.min(1, forward))
      : 0;
    walkTouchSide = Number.isFinite(side)
      ? Math.max(-1, Math.min(1, side))
      : 0;
    if (walkTouchForward || walkTouchSide) callbacks.onInteract();
  }
  function updateWalk(time: number) {
    if (viewMode !== 'walk') return false;
    if (procedural?.roboDogState.firstPerson && procedural.roboDog.children.length) return false;
    const dt = Math.min(0.08, Math.max(0, (time - lastFrame) / 1000));
    if (dt === 0) return false;
    const forward = Math.max(-1, Math.min(1,
      Number(walkKeys.has('KeyW')) - Number(walkKeys.has('KeyS')) + walkTouchForward,
    ));
    const side = Math.max(-1, Math.min(1,
      Number(walkKeys.has('KeyD')) - Number(walkKeys.has('KeyA')) + walkTouchSide,
    ));
    const length = Math.hypot(forward, side) || 1;
    const speed =
      walkKeys.has('ShiftLeft') || walkKeys.has('ShiftRight')
        ? CUPB_CONFIG.walk.sprintSpeed
        : CUPB_CONFIG.walk.speed;
    const x = ((-Math.sin(walkYaw) * forward + Math.cos(walkYaw) * side) / length) * speed;
    const z = ((-Math.cos(walkYaw) * forward - Math.sin(walkYaw) * side) / length) * speed;
    const blend = 1 - Math.exp(-10 * dt);
    walkVelocity.x += (x - walkVelocity.x) * blend;
    walkVelocity.z += (z - walkVelocity.z) * blend;
    if (Math.abs(walkVelocity.x) + Math.abs(walkVelocity.z) < 0.02)
      walkVelocity.set(0, 0, 0);
    if (walkVelocity.lengthSq() === 0) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(walkVelocity.x, walkVelocity.z) * dt / 0.55));
    let moved = false;
    for (let i = 0; i < steps; i++) {
      const nextX = camera.position.x + (walkVelocity.x * dt) / steps;
      const nextZ = camera.position.z + (walkVelocity.z * dt) / steps;
      const ground = camera.position.y - CUPB_CONFIG.walk.eyeHeight;
      if (Math.abs(walkVelocity.x) > 0.001 && walkFree(nextX, camera.position.z)) {
        const newGround = walkGroundY(nextX, camera.position.z);
        if (Math.abs(newGround - ground) <= 0.55) {
          camera.position.x = nextX;
          camera.position.y = newGround + CUPB_CONFIG.walk.eyeHeight;
          moved = true;
        } else walkVelocity.x = 0;
      } else walkVelocity.x = 0;
      if (Math.abs(walkVelocity.z) > 0.001 && walkFree(camera.position.x, nextZ)) {
        const newGround = walkGroundY(camera.position.x, nextZ);
        if (Math.abs(newGround - (camera.position.y - CUPB_CONFIG.walk.eyeHeight)) <= 0.55) {
          camera.position.z = nextZ;
          camera.position.y = newGround + CUPB_CONFIG.walk.eyeHeight;
          moved = true;
        } else walkVelocity.z = 0;
      } else walkVelocity.z = 0;
    }
    if (moved) {
      syncWalkLook();
      pendingRequest = time;
    }
    return moved;
  }
  function classify(o: THREE.Object3D) {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p.userData.layer) return p.userData.layer as string;
      p = p.parent;
    }
    return '';
  }
  /** 按原 GLB 的顶点色重排三角形索引，不重新生成建筑，供原图层开关使用。 */
  function splitCupbLayers(root: THREE.Object3D) {
    cupbLayerMaterials.clear();
    walkGroundCache.clear();
    walkFlatGroundY = null;
    let flatMin = Infinity;
    let flatMax = -Infinity;
    const semanticLayers: [LayerKey, RegExp][] = [
      ['buildings', /building|architecture|建筑|楼体/i],
      ['roads', /road|street|bridge|path|道路|桥|路面/i],
      ['vegetation', /tree|vegetation|plant|植被|树|绿地/i],
      ['water', /water|lake|river|水体|湖|河/i],
      ['sports', /sport|stadium|field|操场|运动场/i],
    ];
    const namedLayer = (object: THREE.Object3D) => {
      for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
        const label = node.name;
        const found = semanticLayers.find(([, pattern]) => pattern.test(label));
        if (found) return found[0];
      }
      return null;
    };
    const swatches: [string, [number, number, number]][] = [
      ['buildings', [0.9, 0.88, 0.84]],
      ['buildings', [1, 0.99, 0.96]],
      ['vegetation', [0.62, 0.79, 0.55]],
      ['water', [0.53, 0.77, 0.9]],
      ['roads', [0.73, 0.74, 0.76]],
      ['roads', [0.9, 0.88, 0.83]],
      ['sports', [0.85, 0.5, 0.4]],
      ['roads', [0.68, 0.68, 0.67]],
      ['terrain', [0.86, 0.86, 0.83]],
    ];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry;
      const colors = geometry.getAttribute('color');
      const positions = geometry.getAttribute('position');
      const index = geometry.index;
      if (!colors || !index || !(object.material instanceof THREE.MeshStandardMaterial)) {
        // 新模型若按节点命名分层，可直接沿用节点，不要求固定顶点色。
        const layer = namedLayer(object);
        if (layer) object.userData.cupbSemanticLayer = layer;
        return;
      }
      const buckets = new Map<string, number[]>();
      for (let i = 0; i < index.count; i += 3) {
        const vertex = index.getX(i);
        const rgb = [colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)];
        let best = 'terrain';
        let score = Infinity;
        for (const [layer, color] of swatches) {
          const distance = color.reduce((sum, v, axis) => sum + (rgb[axis] - v) ** 2, 0);
          if (distance < score) { score = distance; best = layer; }
        }
        if (best === 'terrain' && score < 0.02 && positions) {
          for (let k = 0; k < 3; k++) {
            const y = positions.getY(index.getX(i + k));
            flatMin = Math.min(flatMin, y);
            flatMax = Math.max(flatMax, y);
          }
        }
        if (!buckets.has(best)) buckets.set(best, []);
        buckets.get(best)!.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
      const original = object.material;
      const materials: THREE.MeshStandardMaterial[] = [];
      const indices: number[] = [];
      geometry.clearGroups();
      for (const [layer, triangles] of buckets) {
        const material = original.clone();
        material.name = `cupb-${layer}`;
        material.vertexColors = true;
        materials.push(material);
        if (!cupbLayerMaterials.has(layer)) cupbLayerMaterials.set(layer, []);
        cupbLayerMaterials.get(layer)!.push(material);
        geometry.addGroup(indices.length, triangles.length, materials.length - 1);
        for (const vertex of triangles) indices.push(vertex);
      }
      geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
      object.material = materials;
      original.dispose();
    });
    if (Number.isFinite(flatMin) && flatMax - flatMin < 0.03)
      walkFlatGroundY = flatMin;
  }
  /** 外部模型缺失时才使用可见的简易占位；不会加载广西大学建筑。 */
  function createFallbackCampus() {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1150, 960),
      new THREE.MeshStandardMaterial({ color: '#deddd5', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);
    const blocks = new THREE.Group();
    blocks.userData.layer = 'buildings';
    const material = new THREE.MeshStandardMaterial({ color: '#d4d0c8', roughness: 0.9 });
    for (const building of buildings) {
      const [west, south, east, north] = building.bounds;
      const width = Math.max(1, east - west), depth = Math.max(1, north - south);
      const height = Math.max(3, building.height);
      const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      box.position.set((west + east) / 2, height / 2, -(south + north) / 2);
      box.castShadow = box.receiveShadow = true;
      blocks.add(box);
    }
    root.add(blocks);
    return root;
  }
  function styleMeshes(root: THREE.Object3D, refineTerrain = true) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (refineTerrain) palette.terrain(o);
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          palette.surface(m);
          contextStyle.apply(m);
          if (
            ['sportWhite', 'roadWhite', 'roadYellow', 'tactile'].includes(
              m.name,
            )
          ) {
            // Paint is a decal surface: bias its depth at oblique/distant views
            // as well as retaining geometric separation through Draco export.
            m.polygonOffset = true;
            m.polygonOffsetFactor = -2;
            m.polygonOffsetUnits = -2;
            o.castShadow = false;
          }
          if (m.name === 'water') {
            o.castShadow = false;
            m.roughness = 0.3;
            m.metalness = 0.28;
          }
          if (m.name === 'timeSilver') m.envMapIntensity = 1.5;
        }
      }
    });
    applyModelLighting(root);
  }
  function applyModelLighting(root: THREE.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      nightStyle.apply(o, preset === 'night');
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof THREE.MeshStandardMaterial)) continue;
        if (m.name === 'timeSilver' || m.name === 'timeLight') {
          m.emissive.set('#83b6e2');
          m.emissiveIntensity =
            preset === 'night' ? (m.name === 'timeSilver' ? 0.16 : 1.8) : 0;
        }
      }
    });
  }
  function syncRoadLights() {
    if (preset === 'night' && baseRoot && !roadLights) {
      roadLights = createRoadLights(baseRoot);
      scene.add(roadLights);
    }
    if (roadLights) {
      roadLights.visible = preset === 'night' && layers.roads;
      roadLights.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    }
  }
  function detailLayer(key: string): LayerKey {
    if (key.startsWith('basketball-bank-')) return 'sports';
    return key.startsWith('infra-') ||
      landmarks.some(
        (l) => 'landmark-' + l.id === key && l.placeKind === 'bridge',
      )
      ? 'roads'
      : 'buildings';
  }
  function applyLayers() {
    for (const [key, root] of loaded) {
      const isZone =
        key.startsWith('chunk-') ||
        key.startsWith('infra-') ||
        key.startsWith('basketball-bank-');
      root.visible = layers[detailLayer(key)] && (!isZone || !modeSmooth);
    }
    if (baseRoot) {
      for (const child of baseRoot.children)
        child.visible =
          (layers[classify(child) as LayerKey] ?? true) &&
          !loaded.get(child.name)?.visible;
      baseRoot.traverse((object) => {
        const layer = object.userData.cupbSemanticLayer as LayerKey | undefined;
        if (layer) object.visible = layers[layer];
      });
    }
    // 合并 GLB 的材质组对应原模型的顶点色类别。
    for (const [layer, materials] of cupbLayerMaterials)
      for (const material of materials)
        material.visible = layers[layer as LayerKey] ?? true;
    syncRoadLights();
    boundaryRoot.visible = layers.boundary;
    if (treesRoot) treesRoot.visible = layers.vegetation;
    labels.style.display = layers.labels ? '' : 'none';
    highlight.visible = layers[detailLayer('landmark-' + selected)];
    // Model attach/release, tree density, quality and layer changes all arrive here.
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }
  function updateLoadStatus() {
    if (disposed) return;
    const foreground =
      progresses.get('landmark-' + selected) ??
      progresses.get('base') ??
      progresses.values().next().value;
    if (foreground) {
      const percent = Math.round(foreground.fraction * 100);
      // A request that has not reported bytes yet shows no misleading 0%.
      callbacks.onStatus(
        {
          text: foreground.name
            ? percent
              ? '正在加载{name} {percent}%'
              : '正在加载{name}'
            : percent
              ? '{label} {percent}%'
              : '{label}',
          values: {
            label: foreground.label,
            name: foreground.name ?? '',
            percent,
          },
        },
        false,
        foreground.fraction,
      );
    } else if (boundaryFailed && layers.boundary)
      callbacks.onStatus('模型覆盖范围加载失败，可重试', true);
    else if (treesFailed || (highTreesFailed && !modeSmooth))
      callbacks.onStatus('部分树木加载失败，可重试', true);
    else if ([...failed.keys()].some((key) => wanted.has(key)))
      callbacks.onStatus('部分细节加载失败，可重试', true);
    else if (initialReady) callbacks.onStatus('');
  }
  async function loadGLB(
    a: Asset,
    key = 'base',
    signal = lifecycle.signal,
    prefetched?: BasePrefetch,
  ) {
    const label =
      key === 'base'
        ? '正在加载校园'
        : key.startsWith('trees')
          ? '正在加载树木'
          : key.startsWith('landmark-')
            ? '正在加载{name}'
            : '正在加载周边细节';
    const progress = (fraction: number) => {
      progresses.set(key, {
        label,
        fraction,
        name: key.startsWith('landmark-')
          ? (landmarks.find((l) => 'landmark-' + l.id === key)?.name ?? '地标')
          : undefined,
      });
      updateLoadStatus();
    };
    let unsubscribe: (() => void) | undefined;
    try {
      let buffer: ArrayBuffer;
      if (prefetched) {
        unsubscribe = prefetched.onProgress(progress);
        buffer = await prefetched.base;
      } else buffer = await fetchModel(modelUrl(a), a.bytes, signal, progress);
      signal.throwIfAborted();
      const modelFolder = a.url.slice(0, a.url.lastIndexOf('/') + 1);
      if (!draco) { draco = createDecoder(); loader.setDRACOLoader(draco); }
      const gltf = await loader.parseAsync(buffer, asset(modelFolder));
      if (disposed || signal.aborted) {
        disposeObject(gltf.scene);
        throw new DOMException('Request cancelled', 'AbortError');
      }
      loadedBytes += a.bytes;
      const yieldLoading = async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal.throwIfAborted();
        if (disposed) throw new DOMException('Scene disposed', 'AbortError');
      };
      try {
        if (key === 'base' && a.url === CUPB_CONFIG.model.url)
          splitCupbLayers(gltf.scene);
        if (key !== 'base') palette.buildings(gltf.scene, key);
        const styledPreset = preset;
        styleMeshes(gltf.scene, key !== 'base');
        await yieldLoading();
        batchSportsSurfaces(gltf.scene);
        await yieldLoading();
        batchStaticRoadSurfaces(gltf.scene);
        await yieldLoading();
        if (key === 'base') pruneGroundTriangles(gltf.scene);
        // Preset changes during a yield cannot reach this unattached root.
        // Synchronize after the last yield, before the caller publishes it.
        if (preset !== styledPreset) applyModelLighting(gltf.scene);
        return gltf;
      } catch (error) {
        // A cancelled detail must not leak a decoded root while yielding.
        disposeObject(gltf.scene);
        throw error;
      }
    } finally {
      unsubscribe?.();
      progresses.delete(key);
      updateLoadStatus();
    }
  }
  function releaseDetail(key: string) {
    const root = loaded.get(key);
    if (!root) return;
    dynamic.remove(root);
    disposeObject(root, [scene]);
    loaded.delete(key);
    if (key.startsWith('landmark-'))
      updateLabelAnchors(key.slice('landmark-'.length));
    recentlyUsed.delete(key);
  }
  function detailCost(root: THREE.Object3D) {
    const buffers = new Set<ArrayBufferLike>();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const attribute of Object.values(o.geometry.attributes) as (
        | THREE.BufferAttribute
        | THREE.InterleavedBufferAttribute
      )[]) {
        const a =
          attribute instanceof THREE.InterleavedBufferAttribute
            ? attribute.data.array
            : attribute.array;
        buffers.add(a.buffer);
      }
      if (o.geometry.index) buffers.add(o.geometry.index.array.buffer);
    });
    return [...buffers].reduce((n, buffer) => n + buffer.byteLength, 0);
  }
  function reconcileDetails(focusing = false) {
    if (!manifest || disposed || !initialReady) return;
    const cap = profile.detailBudgetMiB * 1048576;
    const currentKey = 'landmark-' + selected;
    const foreground = manifest.landmarks.find((a) => a.id === selected);
    // A flight selects details around its destination, not the passing campus area.
    const destination = tween?.toTarget ?? controls.target;
    const destinationCamera = tween?.to ?? camera.position;
    const x = destination.x;
    const y = -destination.z;
    const near =
      !modeSmooth &&
      (focusing || destinationCamera.distanceTo(destination) < 1050);
    const candidates =
      near && layers.buildings ? nearbyChunks(manifest.zones, x, y) : [];
    // Keep in-flight building chunks ahead of new background work.
    candidates.sort(
      (a, b) =>
        Number(Boolean(detailQueue.tasks.get(b.asset.id!)?.started)) -
        Number(Boolean(detailQueue.tasks.get(a.asset.id!)?.started)),
    );
    const plan = planDetails({
      foreground:
        foreground && layers[detailLayer(currentKey)]
          ? [currentKey, foreground]
          : undefined,
      foregroundReady: loaded.has(currentKey),
      roads:
        near && layers.roads
          ? nearbyChunks(manifest.infrastructure ?? [], x, y, 230).map(
              ({ asset }) => asset,
            )
          : [],
      buildings: candidates.map(({ asset }) => asset),
      sports:
        near && layers.sports && destinationCamera.distanceTo(destination) < 300
          ? nearbyChunks(manifest.sports ?? [], x, y, 120).map(
              ({ asset }) => asset,
            )
          : [],
      costs: geometryCosts,
      cap,
    });
    const wantedAssets = plan.assets;
    let allocation = plan.allocation;
    wanted.clear();
    wantedAssets.forEach(([key]) => wanted.add(key));
    for (const key of detailQueue.tasks.keys())
      if (key !== 'trees-near' && !wanted.has(key)) detailQueue.cancel(key);
    for (const key of failed.keys()) if (!wanted.has(key)) failed.delete(key);
    // One recent landmark can stay warm if it fits the decoded-geometry budget.
    const older = [...loaded.keys()]
      .filter((key) => !wanted.has(key))
      .sort((a, b) => (recentlyUsed.get(b) ?? 0) - (recentlyUsed.get(a) ?? 0));
    let warm = false;
    for (const key of older) {
      const cost = geometryCosts.get(key) ?? 0;
      if (
        !warm &&
        key.startsWith('landmark-') &&
        layers[detailLayer(key)] &&
        allocation + cost <= cap
      ) {
        allocation += cost;
        warm = true;
      } else releaseDetail(key);
    }
    for (const [index, [key, a]] of wantedAssets.entries()) {
      if (loaded.has(key)) recentlyUsed.set(key, performance.now());
      else loadDetail(a, key, index);
    }
    if (
      profile.nearTrees &&
      treesRoot &&
      manifest.treesNear &&
      !highTreesReady &&
      !highTreesFailed &&
      !loading.has('trees') &&
      !detailQueue.tasks.has('trees-near') &&
      destinationCamera.distanceTo(destination) < 1000
    )
      void detailQueue
        .enqueue('trees-near', 5, (signal) => loadTrees(true, signal))
        .catch((error) => {
          if (!disposed && error?.name !== 'AbortError')
            callbacks.onStatus('近处树木加载失败，可重试', true);
        });
    applyLayers();
    updateLoadStatus();
  }
  function loadDetail(a: Asset, key: string, priority = 2) {
    if (
      loaded.has(key) ||
      detailQueue.tasks.has(key) ||
      failed.has(key) ||
      disposed
    )
      return;
    void detailQueue
      .enqueue(key, priority, async (signal) => {
        const g = await loadGLB(a, key, signal);
        if (disposed || !wanted.has(key)) {
          disposeObject(g.scene);
          return;
        }
        dynamic.add(g.scene);
        loaded.set(key, g.scene);
        if (key.startsWith('landmark-'))
          updateLabelAnchors(key.slice('landmark-'.length));
        recentlyUsed.set(key, performance.now());
        geometryCosts.set(key, detailCost(g.scene));
        failed.delete(key);
        if (key === 'landmark-' + selected && autoFramed && !orbiting)
          frameLandmark();
        reconcileDetails();
      })
      .catch((error) => {
        if (!disposed && error?.name !== 'AbortError') {
          failed.set(key, a);
          updateLoadStatus();
        }
      })
      .finally(() => {
        if (!disposed) pendingRequest = performance.now();
      });
  }
  async function loadTrees(near = false, signal = lifecycle.signal) {
    if (
      !manifest ||
      (!near && !manifest.trees) ||
      (near ? highTreesReady || !manifest.treesNear : treesRoot) ||
      loading.has('trees')
    )
      return;
    loading.add('trees');
    try {
      const [data, terrain] = treeData
        ? [treeData.data, treeData.terrain]
        : await Promise.all([
            fetch(asset('data/vegetation.json'), {
              signal: lifecycle.signal,
            }).then((r) => {
              if (!r.ok) throw new Error('vegetation');
              return r.json();
            }) as Promise<number[][]>,
            fetch(asset('data/terrain.json'), {
              signal: lifecycle.signal,
            }).then((r) => {
              if (!r.ok) throw new Error('terrain');
              return r.json();
            }) as Promise<{
              bounds: number[];
              cols: number;
              rows: number;
              heights: number[];
            }>,
          ]);
      if (disposed) return;
      treeData = { data, terrain };
      const g = await loadGLB(
        near ? manifest.treesNear! : manifest.trees!,
        near ? 'trees-near' : 'trees',
        signal,
      );
      if (!treesRoot) {
        treesRoot = new THREE.Group();
        treesRoot.name = 'vegetation';
        treesRoot.userData.layer = 'vegetation';
        scene.add(treesRoot);
      }
      const parts: THREE.Mesh[] = [];
      g.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) parts.push(o);
      });
      for (let typ = 0; typ < 3; typ++) {
        const partsForType = parts.filter((o) => {
          let p: THREE.Object3D | null = o;
          while (p) {
            if (
              p.userData.template === typ ||
              p.name === `Tree-template-${typ}`
            )
              return true;
            p = p.parent;
          }
          return false;
        });
        if (!partsForType.length) continue;
        const geometries = partsForType.map((part) => {
          const geometry = part.geometry.index
            ? part.geometry.toNonIndexed()
            : part.geometry.clone();
          const material = (
            Array.isArray(part.material) ? part.material[0] : part.material
          ) as THREE.MeshStandardMaterial;
          const color = material.color;
          const colors = new Float32Array(
            geometry.getAttribute('position').count * 3,
          );
          for (let i = 0; i < colors.length; i += 3) {
            colors[i] = color.r;
            colors[i + 1] = color.g;
            colors[i + 2] = color.b;
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          geometry.deleteAttribute('uv');
          return geometry;
        });
        const geometry = mergeGeometries(geometries)!;
        geometries.forEach((g) => g.dispose());
        const material = new THREE.MeshStandardMaterial({
          name: 'treeCanopy',
          vertexColors: true,
          roughness: 0.94,
          side: THREE.DoubleSide,
        });
        const sectors = new Map<string, number[][]>();
        for (const row of data) {
          if (row[3] !== typ) continue;
          const key = `${Math.floor(row[0] / 450)},${Math.floor(row[1] / 450)}`;
          if (!sectors.has(key)) sectors.set(key, []);
          sectors.get(key)!.push(row);
        }
        for (const sectorRows of sectors.values()) {
          const rows = prioritizeTreeRows(
            sectorRows,
            manifest.treePriorityPositions || [],
          );
          const inst = new THREE.InstancedMesh(geometry, material, rows.length);
          const transform = new THREE.Object3D();
          rows.forEach((row, i) => {
            const [x, y, h] = row;
            transform.position.set(x, treeElevation(row, terrain), -y);
            transform.rotation.set(0, treeRotation(x, y), 0);
            const appearance = treeAppearance(x, y);
            transform.scale.set(
              (appearance.width * h) / 9,
              (appearance.height * h) / 9,
              (appearance.width * h) / 9,
            );
            transform.updateMatrix();
            inst.setMatrixAt(i, transform.matrix);
            inst.setColorAt(i, new THREE.Color(...appearance.tint));
          });
          nightStyle.apply(inst, preset === 'night');
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingSphere();
          inst.castShadow = true;
          inst.receiveShadow = true;
          inst.userData.fullCount = rows.length;
          inst.userData.lod = near ? 1 : 0;
          inst.userData.center = new THREE.Vector3(
            rows.reduce((sum, r) => sum + r[0], 0) / rows.length,
            0,
            -rows.reduce((sum, r) => sum + r[1], 0) / rows.length,
          );
          treesRoot.add(inst);
        }
      }
      disposeObject(g.scene);
      if (near) highTreesReady = true;
      // Materials and geometry are shared with the instanced meshes and disposed once during teardown.
      setQuality(quality);
      applyLayers();
    } catch (error) {
      if (!disposed && !signal.aborted) {
        if (near) highTreesFailed = true;
        else treesFailed = true;
      }
      throw error;
    } finally {
      loading.delete('trees');
      pendingRequest = performance.now();
    }
  }
  function applyTreeLOD() {
    if (!treesRoot) return;
    for (const o of treesRoot.children) {
      const near =
        highTreesReady &&
        profile.nearTrees &&
        camera.position.distanceTo(o.userData.center) < 500;
      const visible = o.userData.lod === 1 ? near : !near;
      if (o.visible !== visible) renderer.shadowMap.needsUpdate = true;
      o.visible = visible;
    }
  }
  async function loadBoundary() {
    if (boundaryLoading || boundaryReady || disposed) return;
    boundaryLoading = true;
    try {
      const data = await loadCampusBoundary(lifecycle.signal);
      if (disposed) return;
      boundaryRoot.add(createBoundary(data));
      contextStyle.setBoundary(data);
      overviewPoints = campusOverviewPoints(data.rings, buildings, landmarks);
      if (!selected && autoFramed && !restoredPose?.position) overview();
      boundaryReady = true;
      boundaryFailed = false;
      applyLayers();
    } catch {
      if (!disposed) boundaryFailed = true;
    } finally {
      boundaryLoading = false;
      if (!disposed) updateLoadStatus();
    }
  }
  async function initialize() {
    if (loading.has('base') || initialReady) return;
    loading.add('base');
    callbacks.onStatus('正在加载校园…');
    // A failed prefetch is not reused: retries go through the normal fetches.
    const boot = pendingPrefetch;
    pendingPrefetch = undefined;
    try {
      manifest = await (boot?.manifest ??
        fetchJson<Manifest>(asset('data/models.json'), lifecycle.signal));
      if (disposed) return;
      // 建筑沿米制坐标生成，路面恢复为原校园 GLB 中的道路几何。
      const infrastructure = await fetchJson<{ paths: { name: string; path: number[][] }[] }>(
        asset('data/infrastructure-map.json'), lifecycle.signal,
      );
      const pedestrianRoutes = await fetchJson<PedestrianRouteData>(
        asset('data/pedestrian-routes.json'), lifecycle.signal,
      );
      procedural = createProceduralCampus(buildings, landmarks, infrastructure.paths, pedestrianRoutes);
      procedural.setPedestrianCount(pedestrianSettings.count);
      procedural.setPedestrianSpeed(pedestrianSettings.speed);
      procedural.setPedestrianRoutesVisible(pedestrianSettings.routesVisible);
      await procedural.loadOriginalRoads(asset('models/cupb/original-roads.glb'));
      // 广西大学树木模板使用 Draco 压缩，复用当前场景的解码器。
      if (!draco) { draco = createDecoder(); loader.setDRACOLoader(draco); }
      await procedural.loadMappedGreens(
        asset('models/cupb/original-greens.glb'),
        asset('models/trees.glb'),
        asset('data/cupb-green-trees.json'),
        loader,
      );
      baseRoot = procedural.root;
      fallbackActive = true; // 当前生成地面为 y=0，第一人称沿用平地碰撞。
      scene.add(baseRoot);
      procedural.setWeather(weather, preset);
      updateLabelAnchors();
      const terrainMesh: THREE.Mesh[] = [];
      baseRoot.traverse((o) => {
        if (
          o instanceof THREE.Mesh &&
          o.material instanceof THREE.MeshStandardMaterial &&
          o.material.name === 'grass'
        )
          terrainMesh.push(o);
      });
      if (terrainMesh[0]) {
        const mat = terrainMesh[0].material as THREE.MeshStandardMaterial;
        ground.material.dispose();
        ground.material = mat.clone();
        nightStyle.copyDayColor(mat, ground.material);
        nightStyle.apply(ground, preset === 'night');
        contextStyle.apply(ground.material);
        const uv = ground.geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, uv.getX(i) * 7500, uv.getY(i) * 7500);
        uv.needsUpdate = true;
      }
      initialReady = true;
      syncEffects();
      readyMs = Math.round(performance.now());
      applyLayers();
      callbacks.onReady();
      callbacks.onStatus('');
      // Publish and paint the base before optional CPU-side colour/normal refinement.
      // No additional model or texture transfer; deferred work keeps startup latency flat.
      requestAnimationFrame(() => {
        if (disposed) return;
        const refine = async () => {
          if (disposed || !baseRoot) return;
          if (procedural) return;
          palette.buildings(baseRoot, 'base');
          const meshes: THREE.Mesh[] = [];
          baseRoot.traverse((o) => {
            if (o instanceof THREE.Mesh) meshes.push(o);
          });
          // Keep the original summation order and publish the GPU normal buffer
          // only once it is complete. Yield between bounded vertex batches.
          for (const mesh of meshes) {
            const steps = palette.terrainSteps(mesh);
            while (!disposed) {
              const step = steps.next();
              if (step.done) break;
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            if (disposed) return;
          }
          renderer.shadowMap.needsUpdate = true;
          dirty = true;
        };
        if ('requestIdleCallback' in window)
          window.requestIdleCallback(refine, { timeout: 1500 });
        else setTimeout(refine, 0);
      });
      void loadBoundary();
      reconcileDetails();
      if (manifest.trees)
        void loadTrees().catch(() => {
          if (!disposed) callbacks.onStatus('树木加载失败，可重试', true);
        });
    } catch (error) {
      if (!disposed) {
        console.error('校园场景初始化失败', error);
        // 仅在 GLB/清单读取失败时启用占位几何，仍可使用原 UI 检查点位。
        fallbackActive = true;
        baseRoot = createFallbackCampus();
        scene.add(baseRoot);
        initialReady = true;
        applyLayers();
        callbacks.onReady();
        callbacks.onStatus('校园模型加载失败，当前显示简易占位；请检查模型路径后重试', true);
        void loadBoundary();
      }
    } finally {
      loading.delete('base');
    }
  }
  function setQuality(q: Quality) {
    if (q !== quality) {
      adaptive.reset();
      effectsFailed = false;
    }
    quality = q;
    applyQuality();
  }
  function applyQuality() {
    profile = qualityProfile(quality, compact(), saveData(), adaptive.level);
    modeSmooth = profile.level === 2;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, profile.pixelRatio) *
        profile.resolutionScale,
    );
    renderer.shadowMap.enabled = profile.shadows;
    sun.castShadow = profile.shadows;
    syncEffects();
    if (!profile.shadows) {
      sun.shadow.dispose();
      sun.shadow.map = null;
      sun.shadow.mapPass = null;
    }
    if (!profile.nearTrees) {
      detailQueue.cancel('trees-near');
      if (treesRoot && highTreesReady) {
        const retired = new THREE.Group();
        for (const child of treesRoot.children.slice())
          if (child.userData.lod === 1) retired.add(child);
        disposeObject(retired, [scene]);
        highTreesReady = false;
      }
    }
    treesRoot?.traverse((o) => {
      if (o instanceof THREE.InstancedMesh)
        o.count = Math.ceil(o.userData.fullCount * profile.treeDensity);
    });
    dirty = true;
    applyLayers();
    reconcileDetails();
  }
  function setPreset(p: Preset) {
    preset = p;
    procedural?.setWeather(weather, p);
    scene.fog = weather === 'clear'
      ? sky.setPreset(p)
      : sky.setWeather(weather, p);
    const light = LIGHTING[p];
    const factors = {
      clear: { sun: 1, ambient: 1, fill: 1, environment: 1, exposure: 1 },
      cloudy: { sun: .6, ambient: .85, fill: .8, environment: .85, exposure: .94 },
      rain: { sun: .54, ambient: .77, fill: .8, environment: .85, exposure: .9 },
      haze: { sun: .66, ambient: .72, fill: .8, environment: .85, exposure: .86 },
    }[weather];
    sun.color.set(light.sun);
    sun.intensity = light.power * factors.sun;
    ambient.color.set(light.skyLight);
    ambient.groundColor.set(light.bounce);
    ambient.intensity = light.hemisphere * factors.ambient;
    fill.color.set(light.fill);
    fill.intensity = light.fillPower * factors.fill;
    scene.environmentIntensity = light.environment * factors.environment;
    renderer.toneMappingExposure = light.exposure * factors.exposure;
    // shadowFrustum owns the target-relative light position, including when
    // reapplying the same preset while its cached volume is unchanged.
    effects?.setNight(p === 'night');
    syncRoadLights();
    labels.dataset.light = p;
    applyModelLighting(scene);
    if (p === 'night') {
      // Pane attributes are created lazily; include them in the existing LOD budget.
      for (const [key, root] of loaded)
        geometryCosts.set(key, detailCost(root));
      reconcileDetails();
    }
    dirty = true;
  }
  function setWeather(next: Weather) {
    weather = next;
    setPreset(preset);
    callbacks.onWeather?.(next);
  }
  function view(v: string) {
    if (viewMode === 'walk') {
      if (v === 'zoomIn' || v === 'zoomOut') {
        camera.fov = Math.max(
          28,
          Math.min(70, camera.fov * (v === 'zoomIn' ? 0.85 : 1.18)),
        );
        camera.updateProjectionMatrix();
        dirty = true;
        return;
      }
      if (v === 'north') {
        walkYaw = 0;
        walkPitch = 0;
        syncWalkLook();
        return;
      }
      if (v !== 'overview') return;
    }
    stopWalk();
    restoredPose = null;
    setOrbit(false);
    if (v === 'overview') {
      setHovered(null);
      composeViewport();
      autoFramed = true;
      selected = null;
      callbacks.onSelect(null);
      clearGroup(highlight);
      overview();
      return;
    }
    autoFramed = false;
    if (v === 'top' || v === 'tilt' || v === 'north') composeViewport();
    const t = controls.target.clone();
    const offset = camera.position.clone().sub(t);
    if (v === 'top')
      moveTo(t, t.clone().add(new THREE.Vector3(0, offset.length(), 0.01)));
    else if (v === 'tilt')
      moveTo(
        t,
        t
          .clone()
          .add(
            new THREE.Vector3(-0.45, 0.66, 0.8)
              .normalize()
              .multiplyScalar(offset.length()),
          ),
      );
    else if (v === 'north')
      moveTo(
        t,
        t
          .clone()
          .add(new THREE.Vector3(0, offset.y, Math.hypot(offset.x, offset.z))),
      );
    else {
      const factor = v === 'zoomIn' ? 0.75 : 1.33;
      const d = Math.max(
        controls.minDistance,
        Math.min(controls.maxDistance, offset.length() * factor),
      );
      moveTo(t, t.clone().add(offset.normalize().multiplyScalar(d)));
    }
  }
  function onKey(e: KeyboardEvent) {
    if (viewMode === 'walk') return;
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (dirs[e.key]) {
      e.preventDefault();
      callbacks.onInteract();
      autoFramed = false;
      setOrbit(false);
      tween = null;
      const d = camera.position.distanceTo(controls.target) * 0.035;
      const [x, z] = dirs[e.key];
      camera.position.x += x * d;
      camera.position.z += z * d;
      controls.target.x += x * d;
      controls.target.z += z * d;
      dirty = true;
    } else if (['+', '=', '-', 'Home'].includes(e.key)) {
      e.preventDefault();
      callbacks.onInteract();
      view(
        e.key === 'Home' ? 'overview' : e.key === '-' ? 'zoomOut' : 'zoomIn',
      );
    }
  }
  canvas.addEventListener('keydown', onKey);
  const walkKeyCodes = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
  ]);
  function onWalkKeyDown(e: KeyboardEvent) {
    if (viewMode !== 'walk' || e.isComposing) return;
    if (
      e.target instanceof HTMLElement &&
      e.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    )
      return;
    if (e.key === 'Home') {
      e.preventDefault();
      setViewMode('overview');
      return;
    }
    if (procedural?.roboDogState.firstPerson) return;
    if (!walkKeyCodes.has(e.code)) return;
    e.preventDefault();
    if (!walkKeys.has(e.code)) callbacks.onInteract();
    walkKeys.add(e.code);
  }
  function onWalkKeyUp(e: KeyboardEvent) {
    walkKeys.delete(e.code);
  }
  function onWeatherKeyDown(e: KeyboardEvent) {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    const next = ({ Digit1: 'clear', Digit2: 'cloudy', Digit3: 'rain', Digit4: 'haze' } as const)[e.code as 'Digit1' | 'Digit2' | 'Digit3' | 'Digit4'];
    if (next) { e.preventDefault(); setWeather(next); }
  }
  function onWalkSuspend() {
    walkKeys.clear();
    walkTouchForward = 0;
    walkTouchSide = 0;
    walkVelocity.set(0, 0, 0);
    if (viewMode === 'walk') onCancel();
  }
  function onWalkVisibility() {
    if (document.hidden) onWalkSuspend();
  }
  window.addEventListener('keydown', onWalkKeyDown);
  window.addEventListener('keydown', onWeatherKeyDown);
  window.addEventListener('keyup', onWalkKeyUp);
  window.addEventListener('blur', onWalkSuspend);
  document.addEventListener('visibilitychange', onWalkVisibility);
  controls.addEventListener('start', () => {
    dogFollow = false;
    tween = null;
    autoFramed = false;
    setOrbit(false);
    callbacks.onInteract();
    dirty = true;
  });
  controls.addEventListener('change', () => {
    cameraChanged = true;
    dirty = true;
    pendingRequest = performance.now();
  });
  function resize() {
    const rect = host.getBoundingClientRect();
    labelViewport.width = rect.width;
    labelViewport.height = rect.height;
    measureLabels();
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    // Preserve the current optical centre until the measured viewport arrives.
    // ResizeObserver may also fire without an actual canvas size change.
    const previousView = camera.view;
    camera.setViewOffset(
      w,
      h,
      previousView ? (previousView.offsetX * w) / previousView.fullWidth : 0,
      previousView ? (previousView.offsetY * h) / previousView.fullHeight : 0,
      w,
      h,
    );
    setQuality(quality);
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function shadowFrustum() {
    const size = Math.min(
      1700,
      Math.max(100, camera.position.distanceTo(controls.target) * 0.8),
    );
    const t = controls.target;
    if (!shadowVolume.changed(t.x, t.y, t.z, size, preset)) return;
    renderer.shadowMap.needsUpdate = true;
    sun.shadow.normalBias = preset === 'evening' ? 1.2 : size < 350 ? 0.3 : 0.8;
    sun.shadow.bias = preset === 'evening' ? -0.00025 : -0.00012;
    sun.target.position.copy(t);
    const dir = LIGHTING[preset].direction;
    sun.position.set(t.x + dir[0], t.y + dir[1], t.z + dir[2]);
    Object.assign(sun.shadow.camera, {
      left: -size,
      right: size,
      top: size,
      bottom: -size,
      near: 1,
      far: 5000,
    });
    sun.shadow.camera.updateProjectionMatrix();
  }
  function metrics(): Metrics {
    const mem = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    return {
      readyMs,
      postprocessing: effects
        ? 'ready'
        : effectsFailed
          ? 'failed'
          : effectsLoading
            ? 'loading'
            : 'off',
      ...(benchmarkOrbit
        ? {
            benchmark: {
              orbiting,
              elapsedMs: benchmarkRun?.elapsedMs ?? 0,
              sampleIndex: benchmarkRun?.sampleIndex ?? 0,
              camera: getSnapshot(),
              viewport: [host.clientWidth, host.clientHeight],
              frame: { ...cameraFrame },
            },
          }
        : {}),
      heapMiB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      shadowUpdates,
      fps: Math.round(fps),
      triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixelRatio: renderer.getPixelRatio(),
      quality: ['精细', '均衡', '流畅'][profile.level],
      automaticQualityLevel: adaptive.level,
      shadows: profile.shadows,
      nearTrees: profile.nearTrees,
      detailBudgetMiB: profile.detailBudgetMiB,
      loadedBytes,
      loadedDetails: [...loaded.keys()],
      queuedDetails: detailQueue.tasks.size,
      residentDetailBytes: [...loaded.keys()].reduce(
        (n, key) =>
          n +
          (manifest?.landmarks.find((a) => 'landmark-' + a.id === key)?.bytes ??
            manifest?.zones.find((a) => a.id === key)?.bytes ??
            manifest?.infrastructure?.find((a) => a.id === key)?.bytes ??
            manifest?.sports?.find((a) => a.id === key)?.bytes ??
            0),
        0,
      ),
      detailGeometryMiB:
        Math.round(
          ([...loaded.keys()].reduce(
            (n, key) => n + (geometryCosts.get(key) ?? 0),
            0,
          ) /
            1048576) *
            10,
        ) / 10,
    };
  }
  function animate(time: number) {
    if (disposed) return;
    loop = requestAnimationFrame(animate);
    if (!framePacer.shouldUpdate(time, modeSmooth)) return;
    const moving = viewMode === 'walk' ? false : controls.update();
    const walking = updateWalk(time);
    if (procedural) {
      procedural.update(Math.min(.08, Math.max(0, (time - lastFrame) / 1000)), time, camera);
      dirty = true;
    }
    if (procedural?.roboDogState.firstPerson && procedural.roboDog.children.length) {
      // 相机固定在机身上方，避免转身时前置镜头探入路边建筑。
      camera.position.copy(procedural.roboDogState.position).add(new THREE.Vector3(0, 1.15, 0));
      camera.quaternion.copy(procedural.roboDogState.quaternion).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(walkPitch, walkYaw, 0, 'YXZ')),
      );
      camera.getWorldDirection(walkForward);
      controls.target.copy(camera.position).addScaledVector(walkForward, 8);
      cameraChanged = true;
      dirty = true;
    }
    if (orbiting && !tween) {
      if (reduced.matches) setOrbit(false);
      else {
        const offset = benchmarkRun
          ? benchmarkRun.position(time)
          : orbitOffset
              .subVectors(camera.position, controls.target)
              .applyAxisAngle(
                orbitAxis,
                Math.min(0.05, (time - lastFrame) / 1000) * 0.13,
              );
        camera.position.copy(controls.target).add(offset);
        camera.lookAt(controls.target);
        dirty = true;
      }
    }
    if (tween) {
      const f = Math.min(1, (time - tween.start) / 1300);
      const e = 1 - (1 - f) ** 3;
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      if (f === 1) tween = null;
      dirty = true;
    }
    if (dogFollow && procedural?.roboDog.children.length) {
      const current = procedural.roboDog.position;
      if (!tween) {
        const delta = current.clone().sub(dogFollowAnchor);
        camera.position.add(delta);
        controls.target.add(delta);
        dirty = true;
      }
      dogFollowAnchor.copy(current);
    }
    if (dirty || moving || walking || tween) {
      cameraChanged = true;
      // A 1 m near plane wastes depth precision at campus-wide altitude,
      // causing thin road/terrain surfaces to flicker in the overview.
      const near = viewMode === 'walk'
        ? 0.2
        : Math.max(1, Math.min(100, (camera.position.y - 50) * 0.01));
      if (camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      shadowFrustum();
      applyTreeLOD();
      convexCulling?.update(camera, modeSmooth && !renderer.shadowMap.enabled);
      renderScene();
      // Paint the complete geometry first. Only the shadow-free smooth tier
      // needs this CPU-side optimisation; switching away cancels its need.
      if (
        baseRoot &&
        modeSmooth &&
        !renderer.shadowMap.enabled &&
        !convexCulling &&
        convexPreparation === undefined
      ) {
        convexPreparation = setTimeout(() => {
          convexPreparation = undefined;
          if (
            disposed ||
            !baseRoot ||
            !modeSmooth ||
            renderer.shadowMap.enabled
          )
            return;
          convexCulling = createConvexCulling(baseRoot);
          dirty = true;
        }, 0);
      }
      dirty = false;
      lastFrame = time;
      if (
        lastRendered &&
        (time - lastRendered < 1000 || orbiting || moving || walking || tween)
      ) {
        activeFrameMs += time - lastRendered;
        activeFrames++;
      }
      lastRendered = time;
      if (orderedHover !== hovered || orderedSelection !== selected) {
        orderedHover = hovered;
        orderedSelection = selected;
        // Reset tie order to the catalogue order, matching the previous sort.
        for (let i = 0; i < labelNodes.length; i++)
          labelOrder[i] = labelNodes[i];
        labelOrder.sort(
          (a, b) =>
            Number(b.l.id === hovered) * 2 +
            Number(b.l.id === selected) -
            (Number(a.l.id === hovered) * 2 + Number(a.l.id === selected)),
        );
      }
      const occupied = occupiedLabels;
      occupied.length = 0;
      for (const { l, el, point, width, height, bounds } of labelOrder) {
        const p = labelProjection.copy(point).project(camera);
        const dist = camera.position.distanceTo(point);
        const x = ((p.x + 1) * labelViewport.width) / 2,
          y = ((-p.y + 1) * labelViewport.height) / 2;
        bounds[0] = x - width / 2;
        bounds[1] = y - height;
        bounds[2] = x + width / 2;
        bounds[3] = y;
        const overlap = occupied.some(
          (r) =>
            bounds[0] < r[2] + 6 &&
            bounds[2] > r[0] - 6 &&
            bounds[1] < r[3] + 6 &&
            bounds[3] > r[1] - 6,
        );
        const obscured =
          bounds[0] < frame.left ||
          bounds[2] > frame.left + frame.width ||
          bounds[1] < frame.top ||
          bounds[3] > frame.top + frame.height;
        const hidden =
          (l.placeKind === 'sports'
            ? !layers.sports
            : !layers[detailLayer('landmark-' + l.id)]) ||
          p.z < 0 ||
          p.z > 1 ||
          Math.abs(p.x) > 1 ||
          Math.abs(p.y) > 1 ||
          (selected && dist > 650) ||
          (viewMode === 'walk' && dist > 250) ||
          overlap ||
          obscured;
        el.style.display = hidden ? 'none' : '';
        if (!hidden) occupied.push(bounds);
        el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
        el.classList.toggle('active', selected === l.id);
      }
      for (const { b, el, point, width, height, bounds } of buildingLabelNodes) {
        const p = labelProjection.copy(point).project(camera);
        const dist = camera.position.distanceTo(point);
        const x = ((p.x + 1) * labelViewport.width) / 2;
        const y = ((-p.y + 1) * labelViewport.height) / 2;
        bounds[0] = x - width / 2;
        bounds[1] = y - height;
        bounds[2] = x + width / 2;
        bounds[3] = y;
        const overlap = occupied.some(
          (r) => bounds[0] < r[2] + 6 && bounds[2] > r[0] - 6 &&
            bounds[1] < r[3] + 6 && bounds[3] > r[1] - 6,
        );
        const obscured = bounds[0] < frame.left || bounds[2] > frame.left + frame.width ||
          bounds[1] < frame.top || bounds[3] > frame.top + frame.height;
        const hidden = !layers.buildings || p.z < 0 || p.z > 1 ||
          Math.abs(p.x) > 1 || Math.abs(p.y) > 1 ||
          (selected && dist > 650) || (viewMode === 'walk' && dist > 250) ||
          overlap || obscured;
        el.style.display = hidden ? 'none' : '';
        if (!hidden) occupied.push(bounds);
        el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
        el.classList.toggle('active', selected === b.id);
      }
    }

    if (cameraChanged && time - cameraSampleAt > 200) {
      callbacks.onCamera(getSnapshot());
      cameraSampleAt = time;
      cameraChanged = false;
    }
    if (benchmarkRun ? benchmarkRun.sampleDue() : time - sampleStart > 1500) {
      if (activeFrames > 0 && activeFrameMs > 0)
        fps = (1000 * activeFrames) / activeFrameMs;
      callbacks.onMetrics?.(metrics());
      if (quality === 'auto' && !compact() && !saveData() && !document.hidden) {
        if (
          adaptive.sample(
            fps,
            activeFrames,
            orbiting || Boolean(tween) || Boolean(moving) || walking || walkDragging,
          )
        )
          applyQuality();
      }
      activeFrameMs = 0;
      activeFrames = 0;
      sampleStart = time;
    }
    if (
      manifest &&
      initialReady &&
      pendingRequest &&
      time - pendingRequest > 450
    ) {
      pendingRequest = 0;
      reconcileDetails();
    }
  }
  loop = requestAnimationFrame(animate);
  void initialize();
  const onLost = (event: Event) => {
    event.preventDefault();
    callbacks.onStatus('图形显示中断，恢复后将自动重绘，也可刷新页面', true);
  };
  const onRestored = () => {
    callbacks.onStatus('');
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return {
    focus,
    setHovered,
    landmarkView,
    setOrbit,
    setViewport,
    setLayer: (key, on) => {
      if (!on) setHovered(null);
      layers[key] = on;
      applyLayers();
      if (key === 'buildings' || key === 'roads' || key === 'sports')
        reconcileDetails();
      if (key === 'boundary' && on) void loadBoundary();
      updateLoadStatus();
    },
    setPreset,
    setWeather,
    setGateOpen: (name, open) => {
      const changed = procedural?.setGateOpen(name, open) ?? false;
      if (changed) dirty = true;
      return changed;
    },
    setPedestrianCount: (count) => {
      pedestrianSettings.count = count;
      procedural?.setPedestrianCount(count);
      dirty = true;
    },
    setPedestrianSpeed: (speed) => {
      pedestrianSettings.speed = speed;
      procedural?.setPedestrianSpeed(speed);
      dirty = true;
    },
    setPedestrianRoutesVisible: (visible) => {
      pedestrianSettings.routesVisible = visible;
      procedural?.setPedestrianRoutesVisible(visible);
      dirty = true;
    },
    loadRoboDog: async (modelUrl: string, onProgress?: (fraction: number | null) => void) => {
      if (!procedural) throw new Error('校园尚未加载完成');
      await procedural.loadRoboDog(modelUrl, loader, onProgress);
      dirty = true;
    },
    getRoboDogPreview: () => procedural?.roboDog.children[0]?.clone(true) ?? null,
    focusRoboDog: () => {
      if (!procedural?.roboDog.children.length) return false;
      stopWalk();
      restoredPose = null;
      setOrbit(false);
      selected = null;
      autoFramed = false;
      callbacks.onSelect(null);
      clearGroup(highlight);
      composeViewport();
      const target = procedural.roboDog.position.clone().add(new THREE.Vector3(0, .5, 0));
      moveTo(target, target.clone().add(new THREE.Vector3(3.8, 2.6, 4.5)));
      dogFollowAnchor.copy(procedural.roboDog.position);
      dogFollow = true;
      return true;
    },
    setRoboDogFirstPerson: (on: boolean) => {
      if (!procedural?.roboDog.children.length) return;
      if (!on) {
        if (procedural.roboDogState.firstPerson) setViewMode('overview');
        return;
      }
      if (viewMode !== 'walk') setViewMode('walk');
      if (viewMode !== 'walk') return;
      dogFollow = false;
      walkYaw = 0;
      walkPitch = -.04;
      procedural.roboDogState.firstPerson = true;
      canvas.setAttribute('aria-label', '中国石油大学（北京）机器狗第一视角，拖拽环顾，Home返回全景');
      dirty = true;
    },
    setRoboDogSpeed: (speed: number) => {
      if (procedural) procedural.roboDogState.speed = Math.max(0, Math.min(20, speed));
    },
    setRoboDogColor: (hex: string) => { procedural?.setRoboDogColor(hex); dirty = true; },
    setRoboDogPose: (position, quaternion) => {
      if (!procedural) return;
      procedural.stopRoboDogPatrol();
      procedural.roboDogState.position.set(...position);
      procedural.roboDog.position.copy(procedural.roboDogState.position);
      if (quaternion) {
        procedural.roboDogState.quaternion.set(...quaternion);
        procedural.roboDog.quaternion.copy(procedural.roboDogState.quaternion);
      }
      dirty = true;
    },
    moveRoboDog: (dt: number, direction: [number, number, number]) => {
      procedural?.moveRoboDog(dt, new THREE.Vector3(...direction));
      dirty = true;
    },
    getRoboDogState: () => {
      const state = procedural?.roboDogState;
      return {
        position: (state?.position.toArray() ?? [0, 0, 0]) as [number, number, number],
        quaternion: (state?.quaternion.toArray() ?? [0, 0, 0, 1]) as [number, number, number, number],
        speed: state?.speed ?? 0,
        state: state?.state ?? 'idle',
        firstPerson: state?.firstPerson ?? false,
      };
    },
    startRoboDogPatrol: (id) => {
      const started = procedural?.startRoboDogPatrol(id) ?? false;
      if (started) dirty = true;
      return started;
    },
    pauseRoboDogPatrol: () => { procedural?.pauseRoboDogPatrol(); dirty = true; },
    resumeRoboDogPatrol: () => { procedural?.resumeRoboDogPatrol(); dirty = true; },
    stopRoboDogPatrol: () => { procedural?.stopRoboDogPatrol(); dirty = true; },
    getRoboDogPatrolState: () => procedural?.getRoboDogPatrolState() ?? {
      routeId: null, status: 'idle', checkpoint: null, checkpointIndex: 0,
      checkpointCount: 0, distance: 0, total: 0,
    },
    setQuality,
    setViewMode,
    setWalkInput,
    view,
    exportImage: async () => {
      convexCulling?.update(camera, modeSmooth && !renderer.shadowMap.enabled);
      renderScene();
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(canvas, 0, 0);
      const size = Math.max(15, Math.round(out.width / 110));
      ctx.font = `${size}px sans-serif`;
      const segments = [t('中国石油大学（北京）校园地图'), '© OpenStreetMap contributors'];
      if (layers.boundary && boundaryReady)
        segments.push(t('白色细线：模型覆盖范围'));
      const label = segments.join('  |  ');
      const available = out.width - size * 2;
      const lines =
        ctx.measureText(label).width <= available ? [label] : segments;
      const lineHeight = size * 1.5;
      const footerHeight = lineHeight * lines.length + size;
      ctx.fillStyle = '#1d3b31dd'; // Radix jade-12
      ctx.fillRect(0, out.height - footerHeight, out.width, footerHeight);
      ctx.fillStyle = 'white';
      for (let i = 0; i < lines.length; i++) {
        ctx.font = `${size}px sans-serif`;
        const fittedSize = Math.min(
          size,
          (size * available) / ctx.measureText(lines[i]).width,
        );
        ctx.font = `${fittedSize}px sans-serif`;
        ctx.fillText(
          lines[i],
          size,
          out.height - footerHeight + size + lineHeight * i,
        );
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Export failed');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = t('中石大-校园视图.png');
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    retry: () => {
      // A rejected decoderPending is permanent for that loader instance.
      // All subsequent parses must share a fresh decoder after a failed preload.
      if (decoderFailed) {
        draco?.dispose();
        decoderFailed = false;
        draco = createDecoder();
        loader.setDRACOLoader(draco);
      }
      if (fallbackActive) {
        if (baseRoot) { scene.remove(baseRoot); disposeObject(baseRoot, [scene]); }
        baseRoot = null;
        fallbackActive = false;
        initialReady = false;
        void initialize();
      } else if (!initialReady) void initialize();
      else {
        void loadBoundary();
        failed.clear();
        highTreesFailed = false;
        treesFailed = false;
        reconcileDetails();
        if (!treesRoot && manifest?.trees)
          void loadTrees().catch(() =>
            callbacks.onStatus('树木加载失败，请稍后重试', true),
          );
      }
    },
    setLocale,
    getSnapshot,
    restoreSnapshot,
    dispose: () => {
      disposed = true;
      walkKeys.clear();
      if (walkPointer !== null && canvas.hasPointerCapture(walkPointer))
        canvas.releasePointerCapture(walkPointer);
      lifecycle.abort();
      detailQueue.dispose();
      cancelAnimationFrame(loop);
      clearTimeout(convexPreparation);
      observer.disconnect();
      wheelHost.removeEventListener('wheel', onOverlayWheel);
      controls.dispose();
      draco?.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('lostpointercapture', onLostWalkPointer);
      cancelAnimationFrame(hoverFrame);
      canvas.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onWalkKeyDown);
      window.removeEventListener('keydown', onWeatherKeyDown);
      window.removeEventListener('keyup', onWalkKeyUp);
      window.removeEventListener('blur', onWalkSuspend);
      document.removeEventListener('visibilitychange', onWalkVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      convexCulling = null;
      disposeObject(scene);
      for (const p of proxies) {
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
      }
      contextStyle.dispose();
      effects?.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
      labels.remove();
    },
  };
}
function clearGroup(group: THREE.Group) {
  for (const c of group.children.slice()) {
    group.remove(c);
    disposeObject(c);
  }
}
