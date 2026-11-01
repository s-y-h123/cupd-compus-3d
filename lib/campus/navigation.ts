import { placeName, translate, type Locale } from './i18n/index.ts';
import type { Building, Category, Landmark } from './types';

export const LANDMARK_ALIASES: Record<string, string[]> = {
  'main-building-a': ['主楼', '主楼A座'],
  gymnasium: ['综合体育馆', '体育馆'],
  'main-field': ['主操场', '红旗操场'],
  'third-teaching': ['三教', '第三教学楼'],
  'fourth-teaching': ['四教', '第四教学楼'],
  'oil-building-a': ['中油大厦', '中油大厦A座'],
  'south-gate': ['南门'],
  library: ['校图书馆', '中石大图书馆'],
  'student-center': ['大活', '学生活动中心'],
};

/** Search the curated catalogue, including its confirmed bilingual aliases. */
export function searchLandmarks(
  landmarks: Landmark[],
  query: string,
  category: Category | 'all' = 'all',
): Landmark[] {
  const term = query.trim().toLocaleLowerCase();
  return landmarks.filter(
    (place) =>
      (category === 'all' || place.category === category) &&
      [
        place.name,
        placeName(place.name, 'zh'),
        placeName(place.name, 'en'),
        ...(LANDMARK_ALIASES[place.id] ?? []),
        ...(ENGLISH_ALIASES[place.id] ?? []),
      ].some((name) => name.toLocaleLowerCase().includes(term)),
  );
}

export function navigableBuildings(
  buildings: Building[],
  landmarks: Landmark[],
): Building[] {
  const ids = new Set(landmarks.map((place) => place.id));
  return buildings.filter(
    (building) => building.landmark !== null && ids.has(building.landmark),
  );
}

/** Independent landmark POIs have estimated pick bounds, never OSM building IDs. */
export function navigationFootprints(
  buildings: Building[],
  landmarks: Landmark[],
) {
  return [
    ...navigableBuildings(buildings, landmarks).map((b) => ({
      ...b,
      layer: 'buildings' as const,
    })),
    ...landmarks
      .filter((l) =>
        ['gate', 'bridge', 'sculpture'].includes(l.placeKind ?? ''),
      )
      .map((l) => {
        const [x0, y0, x1, y1] = l.bounds;
        return {
          id: l.id,
          landmark: l.id,
          insideCampus: true,
          layer:
            l.placeKind === 'bridge'
              ? ('roads' as const)
              : ('buildings' as const),
          height: l.height,
          elevation: l.elevation,
          polygons: [
            [
              l.pickPolygon ?? [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
                [x0, y0],
              ],
            ],
          ],
        };
      }),
  ];
}

/** Search associations do not change the canonical name or merge physical places. */
export const ENGLISH_ALIASES: Record<string, string[]> = {};

/** OSM objects without a usable name keep a numeric placeholder; they are not searchable. */
const PLACEHOLDER_NAME = /^校内建筑 \d+$/;

// Navigation eligibility is entity-specific; do not rename or merge source footprints.
/** Named campus buildings outside the curated catalogue: search-only destinations, not toured. */
export function searchableBuildings(
  buildings: Building[],
  landmarks: Landmark[],
): Building[] {
  const curated = new Set(landmarks.map((place) => place.id));
  return buildings.filter(
    (building) =>
      building.insideCampus &&
      building.name.trim() !== '' &&
      !PLACEHOLDER_NAME.test(building.name) &&
      !(building.landmark && curated.has(building.landmark)),
  );
}

const collators = {
  zh: new Intl.Collator('zh-CN', { numeric: true }),
  en: new Intl.Collator('en', { numeric: true }),
};

const DIRECTIONS = ['东', '东北', '北', '西北', '西', '西南', '南', '东南'];

/** Approximate map position, not a claim about campus membership or walking distance. */
export function buildingLocationLabel(
  building: Building,
  landmarks: Landmark[],
  locale: Locale = 'zh',
): string {
  let nearest: Landmark | undefined;
  let distance = Infinity;
  for (const landmark of landmarks) {
    const candidate = Math.hypot(
      building.center[0] - landmark.center[0],
      building.center[1] - landmark.center[1],
    );
    if (
      candidate < distance ||
      (candidate === distance && nearest && landmark.id < nearest.id)
    ) {
      nearest = landmark;
      distance = candidate;
    }
  }
  if (!nearest) return '';
  const name = placeName(nearest.name, locale);
  if (distance < 10) return translate(locale, '{name}附近', { name });
  const angle = Math.atan2(
    building.center[1] - nearest.center[1],
    building.center[0] - nearest.center[0],
  );
  const direction = DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  return translate(locale, '{name}{direction}侧约 {distance} 米', {
    name,
    direction: translate(locale, direction),
    distance: Math.round(distance / 10) * 10,
  });
}

/** Exact names first, then prefixes, then any substring in either language; ties sort by displayed name. */
export function searchBuildings(
  buildings: Building[],
  landmarks: Landmark[],
  query: string,
  locale: 'zh' | 'en' = 'zh',
): Building[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const rank = (building: Building) => {
    const names = [
      building.name,
      placeName(building.name, 'zh'),
      placeName(building.name, 'en'),
    ].map((name) => name.toLocaleLowerCase());
    if (names.some((name) => name === term)) return 0;
    if (names.some((name) => name.startsWith(term))) return 1;
    return names.some((name) => name.includes(term)) ? 2 : -1;
  };
  return searchableBuildings(buildings, landmarks)
    .map((building) => ({ building, rank: rank(building) }))
    .filter(({ rank }) => rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        collators[locale].compare(
          placeName(a.building.name, locale),
          placeName(b.building.name, locale),
        ) ||
        a.building.id.localeCompare(b.building.id),
    )
    .map(({ building }) => building);
}
