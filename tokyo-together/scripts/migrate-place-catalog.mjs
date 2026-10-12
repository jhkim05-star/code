import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount, getAccessToken } = require('../node_modules/firebase-tools/lib/auth.js');
const projectId = 'tokyo-together-57264';
const resourceRoot = `projects/${projectId}/databases/(default)/documents`;
const root = `https://firestore.googleapis.com/v1/${resourceRoot}`;
const markerPath = 'appMigrations/catalog-2026-10-12';
const oldIds = ['idea_department_store','idea_disneyland','idea_food','idea_heritage','idea_museum','idea_odaiba','idea_yokohama'];
const linkedId = 'idea_food';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backupFlag = args.indexOf('--snapshot');
if (backupFlag < 0 || !args[backupFlag + 1]) throw new Error('Pass --snapshot private-backups/<timestamp>/firestore.json');
const backupContent = await readFile(args[backupFlag + 1], 'utf8');
const backup = JSON.parse(backupContent);
if (backup.projectId !== projectId || !Array.isArray(backup.documents)) throw new Error('Snapshot project or format does not match.');
const snapshotSha256 = createHash('sha256').update(backupContent).digest('hex');
const backupDocs = new Map(backup.documents.map(document => [document.name.slice(resourceRoot.length + 1), document]));
if (oldIds.some(id => !backupDocs.has(`places/${id}`))) throw new Error('Snapshot does not contain all seven earlier sample places.');

const catalog = JSON.parse(await readFile(new URL('../data/place-catalog.json', import.meta.url), 'utf8'));
if (catalog.length !== 30 || new Set(catalog.map(item => item.id)).size !== 30) throw new Error('Catalog must contain 30 unique places.');
const counts = catalog.reduce((out, item) => { out[item.theme] = (out[item.theme] || 0) + 1; return out; }, {});
if (counts.food !== 15 || counts.sights !== 5 || counts.shopping !== 5 || counts.activities !== 5) throw new Error('Catalog theme counts are wrong.');
for (const item of catalog) {
  if (!/^[FVSE]\d{2}$/.test(item.id) || !item.title || !item.area || !item.mapQuery ||
      item.reviewedAt !== '2026-10-12' || (item.referenceUrl && !/^https?:\/\//.test(item.referenceUrl))) {
    throw new Error(`Invalid catalog entry: ${item.id}`);
  }
}

const account = getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Sign in with Firebase CLI before migrating.');
const { access_token: token } = await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const encoded = path => path.split('/').map(encodeURIComponent).join('/');
const docUrl = path => `${root}/${encoded(path)}`;
async function request(url, init = {}, expected = [200]) {
  const response = await fetch(url, { ...init, headers });
  if (!expected.includes(response.status)) throw new Error(`Firestore ${init.method || 'GET'} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.status === 404 || response.status === 204 ? null : response.json();
}
const get = path => request(docUrl(path), {}, [200,404]);
async function collectionIds(parent) {
  const result = [];
  let pageToken;
  do {
    const data = await request(`${docUrl(parent)}:listCollectionIds`, { method: 'POST', body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }) });
    result.push(...(data.collectionIds || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return result;
}
async function collection(collectionPath) {
  const result = [];
  let pageToken;
  do {
    const url = new URL(docUrl(collectionPath));
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await request(url);
    result.push(...(data.documents || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return result;
}
const value = item => typeof item === 'boolean' ? { booleanValue: item } : { stringValue: String(item ?? '') };
function fieldsFor(item, now) {
  const values = {
    title: item.title, category: item.theme, theme: item.theme, subcategory: item.subcategory || '',
    area: item.area, localName: item.localName || '', intro: item.intro || '',
    recommendedMenu: item.recommendedMenu || '', toConfirm: item.visitTips || '', route: item.route || '',
    mapQuery: item.mapQuery, duration: item.duration || '', recommended: item.recommended,
    reviewedAt: item.reviewedAt, archived: false, additionalInfo: '', visitNotes: '', createdBy: 'catalog-import',
  };
  const fields = Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, value(entry)]));
  fields.infoUrls = { arrayValue: { values: item.referenceUrl ? [{ mapValue: { fields: {
    label: { stringValue: '참고 링크' }, url: { stringValue: item.referenceUrl },
  } } }] : [] } };
  fields.createdAt = { timestampValue: now };
  fields.updatedAt = { timestampValue: now };
  return fields;
}
async function patch(path, fields, precondition) {
  const url = new URL(docUrl(path));
  if (precondition?.exists === false) url.searchParams.set('currentDocument.exists', 'false');
  if (precondition?.updateTime) url.searchParams.set('currentDocument.updateTime', precondition.updateTime);
  if (precondition?.mask) for (const key of Object.keys(fields)) url.searchParams.append('updateMask.fieldPaths', key);
  return request(url, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
async function remove(path, updateTime) {
  const url = new URL(docUrl(path));
  url.searchParams.set('currentDocument.updateTime', updateTime);
  await request(url, { method: 'DELETE' }, [200,204]);
}
if (await get(markerPath)) { console.log('Migration marker exists; no changes made.'); process.exit(0); }
const livePlaces = new Map(await Promise.all(oldIds.map(async id => [id, await get(`places/${id}`)])));
const liveProposals = await collection('proposals');
const liveVisits = await collection('visits');
const linkedProposals = liveProposals.filter(document => document.fields?.placeId?.stringValue === linkedId);
const linkedVisits = liveVisits.filter(document => document.fields?.placeId?.stringValue === linkedId);
if (linkedProposals.length !== 1 || linkedVisits.length !== 1) throw new Error('Linked sample record count changed; review before migrating.');
for (const id of oldIds) {
  const current = livePlaces.get(id);
  if (!current) continue; // A prior partial run may already have removed this unlinked sample.
  const original = backupDocs.get(`places/${id}`);
  if (current.fields?.archived?.booleanValue === true && id === linkedId) continue;
  if (current.updateTime !== original.updateTime) throw new Error(`Earlier place changed since snapshot: ${id}`);
  if (id !== linkedId) {
    const children = await collectionIds(`places/${id}`);
    if (children.length || liveProposals.some(p => p.fields?.placeId?.stringValue === id) ||
        liveVisits.some(v => v.fields?.placeId?.stringValue === id)) throw new Error(`Earlier place has new linked records: ${id}`);
  }
}
for (const document of linkedProposals) {
  const path = document.name.slice(resourceRoot.length + 1);
  const original = backupDocs.get(path);
  if (!original || (document.fields?.archived?.booleanValue !== true && document.updateTime !== original.updateTime)) {
    throw new Error('Linked proposal changed since snapshot; review before migrating.');
  }
}
const existingCatalog = await Promise.all(catalog.map(item => get(`places/${item.id}`)));
for (const [index, document] of existingCatalog.entries()) {
  if (document && document.fields?.createdBy?.stringValue !== 'catalog-import') {
    throw new Error(`Catalog ID ${catalog[index].id} belongs to a different place; stop before overwriting it.`);
  }
}
const missing = catalog.filter((_, index) => !existingCatalog[index]);
const summary = { snapshotSha256, newCatalogPlaces: missing.length, unlinkedSamplesToRemove: oldIds.filter(id => id !== linkedId && livePlaces.get(id)).length,
  linkedSample: 'archive place and proposal; preserve comment and visit', preservedTripInfo: true };
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }, null, 2));
if (!apply) process.exit(0);

const now = new Date().toISOString();
for (const item of missing) await patch(`places/${item.id}`, fieldsFor(item, now), { exists: false });
for (const id of oldIds.filter(id => id !== linkedId)) {
  const current = livePlaces.get(id);
  if (current) await remove(`places/${id}`, current.updateTime);
}
const linkedPlace = livePlaces.get(linkedId);
if (linkedPlace && linkedPlace.fields?.archived?.booleanValue !== true) {
  await patch(`places/${linkedId}`, { archived: { booleanValue: true }, updatedAt: { timestampValue: now } },
    { updateTime: linkedPlace.updateTime, mask: true });
}
for (const document of linkedProposals) if (document.fields?.archived?.booleanValue !== true) {
  await patch(document.name.slice(resourceRoot.length + 1), { archived: { booleanValue: true }, updatedAt: { timestampValue: now } },
    { updateTime: document.updateTime, mask: true });
}
await patch(markerPath, {
  snapshotSha256: { stringValue: snapshotSha256 }, strategy: { stringValue: 'archive-linked-records' },
  appliedAt: { timestampValue: new Date().toISOString() }, catalogSize: { integerValue: '30' },
}, { exists: false });
console.log('Catalog migration completed; repeat runs will leave user edits and archived cards unchanged.');
