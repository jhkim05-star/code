import { readFileSync } from 'node:fs';

function readEnv(path) {
  let contents;
  try { contents = readFileSync(path, 'utf8'); }
  catch { throw new Error(`${path} is missing. Follow README.md before deploying.`); }
  return Object.fromEntries(contents.split(/\r?\n/).filter(line => line && !line.trimStart().startsWith('#')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

const web = readEnv('.env.local');
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_APP_ID'];
for (const key of required) if (!web[key] || /^(demo|YOUR_|example)/i.test(web[key])) {
  throw new Error(`${key} must contain a real Firebase web app value.`);
}
if (web.VITE_USE_EMULATORS !== 'false') throw new Error('VITE_USE_EMULATORS must be false for deployment.');
const functions = readEnv('functions/.env');
if (!functions.TOKYO_STORAGE_BUCKET || functions.TOKYO_STORAGE_BUCKET !== web.VITE_FIREBASE_STORAGE_BUCKET) {
  throw new Error('functions/.env TOKYO_STORAGE_BUCKET must match the web app storage bucket.');
}
let firebaseRc;
try { firebaseRc = JSON.parse(readFileSync('.firebaserc', 'utf8')); }
catch { throw new Error('Select your Firebase project with firebase use --add before deploying.'); }
if (firebaseRc.projects?.default !== web.VITE_FIREBASE_PROJECT_ID) {
  throw new Error('.firebaserc default project must match VITE_FIREBASE_PROJECT_ID.');
}
console.log(`Production configuration checked for ${web.VITE_FIREBASE_PROJECT_ID}.`);
