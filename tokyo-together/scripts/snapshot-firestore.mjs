import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount, getAccessToken } = require('../node_modules/firebase-tools/lib/auth.js');
const projectId = 'tokyo-together-57264';
const resourceRoot = `projects/${projectId}/databases/(default)/documents`;
const root = `https://firestore.googleapis.com/v1/${resourceRoot}`;
const account = getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Sign in with Firebase CLI before making a snapshot.');
const { access_token: token } = await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const encoded = path => path.split('/').map(encodeURIComponent).join('/');

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Firestore snapshot request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
async function collectionIds(parent = '') {
  const result = [];
  let pageToken;
  do {
    const body = { pageSize: 100, ...(pageToken ? { pageToken } : {}) };
    const data = await request(`${root}${parent ? `/${encoded(parent)}` : ''}:listCollectionIds`, { method: 'POST', body: JSON.stringify(body) });
    result.push(...(data.collectionIds || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return result.sort();
}
async function documents(collectionPath) {
  const result = [];
  let pageToken;
  do {
    const url = new URL(`${root}/${encoded(collectionPath)}`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await request(url);
    result.push(...(data.documents || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return result;
}

const all = [];
async function walk(parent = '', depth = 0) {
  if (depth > 8) throw new Error('Unexpected Firestore nesting depth; snapshot stopped.');
  for (const collectionId of await collectionIds(parent)) {
    const collectionPath = parent ? `${parent}/${collectionId}` : collectionId;
    for (const document of await documents(collectionPath)) {
      all.push(document);
      if (all.length > 10000) throw new Error('Unexpected Firestore document count; snapshot stopped.');
      if (!document.name.startsWith(`${resourceRoot}/`)) throw new Error('Unexpected Firestore document name.');
      await walk(document.name.slice(resourceRoot.length + 1), depth + 1);
    }
  }
}
await walk();
all.sort((a, b) => a.name.localeCompare(b.name));
const snapshot = { projectId, capturedAt: new Date().toISOString(), accountEmail: account.user.email, documents: all };
const content = JSON.stringify(snapshot, null, 2) + '\n';
const stamp = snapshot.capturedAt.replace(/[:.]/g, '-');
const directory = new URL(`../private-backups/${stamp}/`, import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const path = new URL('firestore.json', directory);
await writeFile(path, content, { flag: 'wx', mode: 0o600 });
const counts = {};
for (const document of all) {
  const path = document.name.slice(resourceRoot.length + 1);
  const topLevel = path.split('/')[0];
  counts[topLevel] = (counts[topLevel] || 0) + 1;
}
console.log(JSON.stringify({ snapshot: path.pathname, sha256: createHash('sha256').update(content).digest('hex'), documents: all.length, counts }, null, 2));
