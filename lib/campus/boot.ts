import { fetchJson, type StreamAsset } from './streaming.ts';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DATA_VERSION = process.env.NEXT_PUBLIC_DATA_VERSION;
export const asset = (path: string) =>
  `${BASE}/${path}` +
  (DATA_VERSION && path.startsWith('data/') && path.endsWith('.json')
    ? `?v=${DATA_VERSION}`
    : '');
/** Content-hashed model URL; prefetch and scene must request the same URL. */
export const modelUrl = (a: StreamAsset) =>
  asset(a.url) + (a.sha256 ? `?v=${a.sha256}` : '');

export interface ModelManifest {
  treePriorityPositions?: number[][];
  base: StreamAsset;
  trees?: StreamAsset;
  treesNear?: StreamAsset;
  zones: StreamAsset[];
  landmarks: StreamAsset[];
  infrastructure?: StreamAsset[];
  sports?: StreamAsset[];
}

export interface BasePrefetch {
  manifest: Promise<ModelManifest>;
  base: Promise<ArrayBuffer>;
  /** Replays the latest fraction, then reports later download progress. */
  onProgress: (listener: (fraction: number) => void) => () => void;
}

/**
 * 几何校园只预取清单；机器狗模型由显式 loadRoboDog 调用加载。
 */
export function prefetchBase(signal: AbortSignal): BasePrefetch {
  const manifest = fetchJson<ModelManifest>(asset('data/models.json'), signal);
  const base = Promise.resolve(new ArrayBuffer(0));
  manifest.catch(() => {});
  base.catch(() => {});
  return {
    manifest,
    base,
    onProgress() {
      return () => {};
    },
  };
}
