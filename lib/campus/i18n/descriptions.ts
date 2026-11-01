import { campusNames } from './names.ts';

/** 中石大英文地点说明使用同源 GeoJSON，不继承原校园的建筑故事。 */
export const englishDescriptions: Record<string, string> = {};

export function landmarkDescription(
  place: { id: string; name: string; description: string },
  locale: 'zh' | 'en',
) {
  if (locale === 'zh') return place.description;
  const name = campusNames[place.name]?.[1] ?? place.name;
  return englishDescriptions[place.id] ??
    `${name}. Its location follows the supplied campus GeoJSON; height and close-up viewpoint need on-site verification.`;
}
