import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/place-catalog.json', import.meta.url), 'utf8'));
const covers = JSON.parse(await readFile(new URL('../data/place-cover-sources.json', import.meta.url), 'utf8'));

test('the one-time catalog contains the requested unique candidate places', () => {
  assert.equal(catalog.length, 30);
  assert.equal(new Set(catalog.map(item => item.id)).size, 30);
  const themes = Object.groupBy(catalog, item => item.theme);
  assert.deepEqual(Object.fromEntries(Object.entries(themes).map(([key, items]) => [key, items.length])),
    { food: 15, sights: 5, shopping: 5, activities: 5 });
  const meals = Object.groupBy(themes.food, item => item.subcategory);
  assert.deepEqual(Object.fromEntries(Object.entries(meals).map(([key, items]) => [key, items.length])),
    { breakfast: 3, lunch: 4, dinner: 4, cafe: 4 });
  for (const item of catalog) {
    assert.match(item.id, /^[FVSE]\d{2}$/);
    assert.ok(item.title && item.area && item.mapQuery);
    assert.equal(item.reviewedAt, '2026-10-12');
    assert.equal(typeof item.recommended, 'boolean');
    assert.equal(item.date, undefined);
    assert.equal(item.status, undefined);
  }
});

test('every catalog place has a licensed JPEG cover and a source link', async () => {
  assert.deepEqual(new Set(covers.map(item => item.id)), new Set(catalog.map(item => item.id)));
  for (const item of covers) {
    assert.match(item.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(item.photographer && item.license && item.context);
    assert.equal(typeof item.exact, 'boolean');
    const bytes = await readFile(new URL(`../public${item.asset}`, import.meta.url));
    assert.ok(bytes.length > 1000);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});
