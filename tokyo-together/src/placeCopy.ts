import catalogKo from '../data/place-catalog.json';
import catalogEn from '../data/place-catalog.en.json';
import type { Locale } from './i18n';
import type { Id, Place } from './types';

export type PlaceCopyField = 'title' | 'area' | 'intro' | 'recommendedMenu' | 'route' | 'toConfirm' | 'duration';
type Original = { id: string; title: string; area: string; intro: string; recommendedMenu?: string; route?: string; visitTips?: string; duration?: string };
type Translation = Partial<Record<PlaceCopyField,string>>;

const originals = new Map((catalogKo as Original[]).map(item => [item.id,item]));
const translations = catalogEn as Record<string,Translation>;

/** Show translated catalog copy only while that specific shared field still matches its imported Korean value. */
export function placeCopy(item: Id<Place>, field: PlaceCopyField, locale: Locale): string {
  const current = item[field] || '';
  if (locale !== 'en' || item.createdBy !== 'catalog-import') return current;
  const original = originals.get(item.id);
  const originalValue = field === 'toConfirm' ? original?.visitTips : original?.[field];
  const english = translations[item.id]?.[field];
  return english && current === (originalValue || '') ? english : current;
}
