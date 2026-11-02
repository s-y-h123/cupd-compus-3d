import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  Fog,
  SRGBColorSpace,
} from 'three';
import type { Preset, Weather } from './types';

type SkyColors = { zenith: string; horizon: string; lower: string; far: number };
const SKIES: Record<Preset, SkyColors> = {
  morning: {
    zenith: '#adc9e3',
    horizon: '#e5e7e3',
    lower: '#99a5a0',
    far: 7000,
  },
  day: { zenith: '#a8cbe4', horizon: '#ece9dc', lower: '#a8ad97', far: 7800 },
  evening: {
    zenith: '#b7c5d8',
    horizon: '#edc7a8',
    lower: '#9d8e7c',
    far: 6500,
  },
  night: { zenith: '#101d32', horizon: '#344558', lower: '#1b2833', far: 5800 },
};
// 天气与清晨、白天、黄昏、夜晚分别配色；雨夜仍保留深色天光。
const WEATHER_SKIES: Record<Exclude<Weather, 'clear'>, Record<Preset, SkyColors>> = {
  cloudy: {
    morning: { zenith: '#9aaeba', horizon: '#c5c7c5', lower: '#a0aaa6', far: 6500 },
    day: { zenith: '#94aab8', horizon: '#cdd1ce', lower: '#a2aaa7', far: 6900 },
    evening: { zenith: '#a5a0af', horizon: '#cbb7b6', lower: '#928d91', far: 6100 },
    night: { zenith: '#18253a', horizon: '#3b4859', lower: '#25323e', far: 5500 },
  },
  rain: {
    morning: { zenith: '#788b9a', horizon: '#afb8b9', lower: '#818d91', far: 6000 },
    day: { zenith: '#8498a6', horizon: '#b7bfbe', lower: '#899497', far: 6500 },
    evening: { zenith: '#777789', horizon: '#a99b9e', lower: '#777984', far: 5700 },
    night: { zenith: '#122236', horizon: '#334758', lower: '#202e3b', far: 5200 },
  },
  haze: {
    morning: { zenith: '#b2ac9d', horizon: '#d2c8b7', lower: '#aaa596', far: 4900 },
    day: { zenith: '#b4afa2', horizon: '#c9c5b7', lower: '#aba998', far: 5100 },
    evening: { zenith: '#aa9c9b', horizon: '#c7b3a7', lower: '#998b89', far: 4700 },
    night: { zenith: '#252938', horizon: '#474650', lower: '#2e3039', far: 4300 },
  },
};

/** Keep the local haze band legible when fitting the campus into a narrow viewport. */
export function fogRange(preset: Preset, viewDistance: number) {
  // Desktop overview is about 3.7 km away; narrow screens need 9–11 km.
  // Compensate only the extra viewing distance, retaining the haze band's width.
  const offset = Math.max(0, viewDistance - 4000);
  return {
    near: (preset === 'night' ? 2500 : 2700) + offset,
    far: SKIES[preset].far + offset,
  };
}

/** A small, local equirectangular sky; reused for background and reflections. */
export function createSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  function paint(sky: { zenith: string; horizon: string; lower: string }) {
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, sky.zenith);
    // Keep a blue upper sky visible in the low-angle views used by the map;
    // concentrate the warm haze within roughly 20 degrees of the horizon.
    gradient.addColorStop(0.38, sky.zenith);
    gradient.addColorStop(0.49, sky.horizon);
    gradient.addColorStop(0.51, sky.horizon);
    gradient.addColorStop(1, sky.lower);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 128);
    // Three caches equirectangular cubemaps/PMREM by texture identity.
    // Dispose that cache before uploading a changed canvas (no network request).
    texture.dispose();
    texture.needsUpdate = true;
  }
  function setPreset(preset: Preset) {
    const sky = SKIES[preset];
    paint(sky);
    const range = fogRange(preset, 0);
    return new Fog(sky.horizon, range.near, range.far);
  }
  function setWeather(weather: Exclude<Weather, 'clear'>, preset: Preset) {
    const sky = WEATHER_SKIES[weather][preset];
    paint(sky);
    return new Fog(sky.horizon, weather === 'haze' ? 1100 : 2200, sky.far);
  }
  const fog = setPreset('day');
  return { texture, fog, setPreset, setWeather, dispose: () => texture.dispose() };
}
