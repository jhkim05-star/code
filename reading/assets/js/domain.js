/** Pure domain model. No DOM, browser storage or native dependencies. */
export const APP = 'bookshelf-reading';
export const VERSION = 2;
export const BUILD = '2.0.1-reading1';
export const STATUSES = { planned: '읽을 예정', reading: '읽는 중', paused: '잠시 멈춤', finished: '완독', abandoned: '그만 읽음' };
export const FORMATS = { paper: '종이책', ebook: '전자책', audio: '오디오북' };
export const GENRES = ['소설','시/에세이','인문','역사','철학','종교','사회/정치','경제/경영','자기계발','과학','IT/컴퓨터','공학/기술','의학/건강','예술/대중문화','여행','요리/취미','아동/청소년','만화','외국어','교육/학습','기타'];
export const MEMO_TYPES = { thought: '생각', quote: '인상 깊은 문장', question: '질문', action: '해볼 일' };
export const clone = x => structuredClone(x);
export const uid = (prefix = 'id') => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
export const nowIso = () => new Date().toISOString();
export function today(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number);
  if (y < 1000 || y > 9999) return false;
  const x = new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m-1 && x.getUTCDate() === d;
}
export function daysBetween(a,b) { return isDate(a) && isDate(b) && b >= a ? Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1 : null; }
export function displayDate(s) { return isDate(s) ? `${+s.slice(0,4)}. ${+s.slice(5,7)}. ${+s.slice(8,10)}.` : '날짜 미상'; }
export function durationOf(r, end = today()) { return daysBetween(r.startedAt, r.status === 'finished' ? r.finishedAt : end); }
export function cleanUrl(value, { image = false } = {}) {
  if (!value) return '';
  if (typeof value !== 'string') throw new Error('주소는 문자열이어야 해요.');
  if (image && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    if (value.length > 1500000) throw new Error('표지 이미지가 너무 커요. 작은 사진을 선택해 주세요.');
    return value;
  }
  let u; try { u = new URL(value.replace(/^http:\/\//i,'https://')); } catch { throw new Error('올바른 https 주소를 입력해 주세요.'); }
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('https 주소만 사용할 수 있어요.');
  return u.href;
}
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function requireObject(x, label) { if (!object(x)) throw new Error(`${label} 형식이 올바르지 않아요.`); }
function text(x, label = '텍스트', max = 1000000) { if (x == null) return ''; if (typeof x !== 'string' || x.length > max) throw new Error(`${label} 형식 또는 길이를 확인해 주세요.`); return x; }
function id(x) { const s = text(x,'ID',200); if (!s || /[\u0000-\u001f]/.test(s) || ['__proto__','prototype','constructor'].includes(s)) throw new Error('잘못된 ID예요.'); return s; }
function choice(x, list, def) { if (x === undefined || x === '') return def; if (!Object.hasOwn(list,x)) throw new Error('알 수 없는 상태 또는 분류예요.'); return x; }
function date(x) { const s = text(x,'날짜',10); if (s && !isDate(s)) throw new Error('유효하지 않은 날짜예요.'); return s; }
function stamp(x) { const s = text(x,'시각',40); if (s && !Number.isFinite(Date.parse(s))) throw new Error('시각 형식이 올바르지 않아요.'); return s || nowIso(); }
function number(x, min, max, integer = false) {
  if (x == null || x === '') return null;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max || (integer && !Number.isInteger(x))) throw new Error('숫자의 범위 또는 형식을 확인해 주세요.');
  return x;
}
function strings(x, label, max = 100) {
  if (x == null) return [];
  if (!Array.isArray(x) || x.length > max) throw new Error(`${label} 목록 형식이 올바르지 않아요.`);
  return [...new Set(x.map(v=>text(v,label,2000).trim()).filter(Boolean))];
}
export function emptyState() { return { app: APP, version: VERSION, revision: 0, books: [], readings: [], notes: [], settings: { cols: 4, kakaoProxyUrl: '', aladinKey: '', lastBackupRequestedAt: '' }, updatedAt: nowIso() }; }
export function normalizeBook(b) {
  requireObject(b,'책');
  const title = text(b.title,'제목',2000).trim(); if (!title) throw new Error('책 제목이 필요해요.');
  return { id:id(b.id), title, subtitle:text(b.subtitle), authors:strings(b.authors,'저자'), translator:text(b.translator), publisher:text(b.publisher), publishedDate:text(b.publishedDate), isbn:text(b.isbn), pageCount:number(b.pageCount,0,1000000,true), genre:text(b.genre,'장르',200), language:text(b.language), origin:choice(b.origin,{domestic:1,foreign:1},''), coverUrl:cleanUrl(b.coverUrl,{image:true}), description:text(b.description), source:text(b.source), createdAt:stamp(b.createdAt), updatedAt:stamp(b.updatedAt) };
}
export function normalizeReading(r) {
  requireObject(r,'독서 이력');
  const startedAt = date(r.startedAt), finishedAt = date(r.finishedAt);
  if (startedAt && finishedAt && finishedAt < startedAt) throw new Error('완독일은 시작일보다 빠를 수 없어요.');
  const status = choice(r.status,STATUSES,'planned');
  if (status !== 'finished' && finishedAt) throw new Error('완독하지 않은 이력에는 완독일을 넣을 수 없어요.');
  const rating = number(r.rating,0,5); if (rating != null && rating*2 !== Math.round(rating*2)) throw new Error('별점은 0.5점 단위로 입력해 주세요.');
  return { id:id(r.id), bookId:id(r.bookId), status, startedAt, finishedAt, startedTime:text(r.startedTime), finishedTime:text(r.finishedTime), format:choice(r.format,FORMATS,'paper'), rating, oneLiner:text(r.oneLiner,'한줄평',4000), why:text(r.why), stopReason:text(r.stopReason), legacyDurationDays:number(r.legacyDurationDays,0,1000000), createdAt:stamp(r.createdAt), updatedAt:stamp(r.updatedAt) };
}
export function normalizeNote(n) {
  requireObject(n,'노트');
  const result = { id:id(n.id), bookId:id(n.bookId), readingId:n.readingId ? id(n.readingId) : null, kind:choice(n.kind,{review:1,memo:1},'review'), stage:choice(n.stage,{draft:1,complete:1},'draft'), template:choice(n.template,{general:1,fiction:1,practical:1},'general'), memoType:choice(n.memoType,MEMO_TYPES,'thought'), title:text(n.title,'노트 제목',2000), summary:text(n.summary), reflection:text(n.reflection), takeaway:text(n.takeaway), questions:text(n.questions), actions:text(n.actions), text:text(n.text), locator:text(n.locator,'위치',1000), comment:text(n.comment), legacyText:text(n.legacyText), tags:strings(n.tags,'태그',30), pinned:!!n.pinned, rev:number(n.rev ?? 0,0,Number.MAX_SAFE_INTEGER,true), createdAt:stamp(n.createdAt), updatedAt:stamp(n.updatedAt) };
  if (result.stage === 'complete' && !noteHasContent(result)) throw new Error('내용을 하나 이상 적은 뒤 정리 완료로 표시해 주세요.');
  return result;
}
export function noteHasContent(n) { return ['summary','reflection','takeaway','questions','actions','text','comment','legacyText'].some(k=>String(n[k]||'').trim()); }
export function validateState(raw) {
  requireObject(raw,'백업');
  if (raw.app !== APP || raw.version !== VERSION) throw new Error('이 버전에서 지원하지 않는 백업이에요.');
  const out = emptyState();
  out.revision = number(raw.revision ?? 0,0,Number.MAX_SAFE_INTEGER,true);
  out.updatedAt = stamp(raw.updatedAt);
  for (const [key, fn] of [['books',normalizeBook],['readings',normalizeReading],['notes',normalizeNote]]) {
    if (!Array.isArray(raw[key]) || raw[key].length > 50000) throw new Error(`${key} 목록 형식을 확인해 주세요.`);
    const seen = new Set();
    out[key] = raw[key].map(v=>{ const x=fn(v); if(seen.has(x.id)) throw new Error(`${key}에 중복 ID가 있어요.`); seen.add(x.id); return x; });
  }
  const books = new Set(out.books.map(b=>b.id)), reads = new Map(out.readings.map(r=>[r.id,r]));
  const active = new Set();
  for (const r of out.readings) {
    if(!books.has(r.bookId)) throw new Error('책이 없는 독서 이력이 있어요.');
    if (!['finished','abandoned'].includes(r.status)) { if(active.has(r.bookId)) throw new Error('한 책에 진행 중인 독서 이력이 중복돼요.'); active.add(r.bookId); }
  }
  for (const n of out.notes) {
    if(!books.has(n.bookId) || (n.readingId && reads.get(n.readingId)?.bookId !== n.bookId)) throw new Error('노트와 책의 연결이 올바르지 않아요.');
  }
  const s = raw.settings || {}; requireObject(s,'설정');
  out.settings = { cols:s.cols === 3 ? 3 : 4, kakaoProxyUrl:s.kakaoProxyUrl ? cleanUrl(s.kakaoProxyUrl) : '', aladinKey:text(s.aladinKey,'검색 키',500), lastBackupRequestedAt:text(s.lastBackupRequestedAt,'백업 시각',40) };
  return out;
}
const oldNum = x => x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x);
export function migrateLegacy(raw) {
  requireObject(raw,'이전 백업');
  if (raw.version !== 1 || !Array.isArray(raw.books)) throw new Error('책꽂이 v1 백업이 아니에요.');
  const out = emptyState(), warnings = [];
  out.settings.cols = raw.settings?.cols === 3 ? 3 : 4;
  out.settings.kakaoProxyUrl = raw.settings?.kakaoProxyUrl || '';
  out.settings.aladinKey = raw.settings?.aladinKey || '';
  out.settings.lastBackupRequestedAt = raw.settings?.lastBackupAt || '';
  for (const b of raw.books) {
    requireObject(b,'이전 책');
    const bid = b.id || uid('book');
    const asDate = (s, label) => { if (!s) return ''; if (isDate(s)) return s; warnings.push(`${String(b.title||'책')}: ${label} 확인 필요 (${String(s)})`); return ''; };
    const startedAt=asDate(b.startedAt,'시작일'); let finishedAt=asDate(b.finishedAt,'완독일');
    if (startedAt && finishedAt && finishedAt < startedAt) { warnings.push(`${b.title}: 시작일보다 빠른 완독일은 원문 메모로 보존했어요.`); finishedAt=''; }
    const rating=oldNum(b.rating);
    out.books.push(normalizeBook({...b,id:bid,title:b.title || '(제목 없음)',authors:Array.isArray(b.authors)?b.authors:(b.authors?[b.authors]:[]),pageCount:oldNum(b.pageCount)}));
    const rid = `read_${bid}_1`, status = Object.hasOwn(STATUSES,b.status) ? b.status : 'planned';
    out.readings.push(normalizeReading({ id:rid,bookId:bid,status,startedAt,finishedAt:status==='finished'?finishedAt:'',startedTime:b.startedTime,finishedTime:b.finishedTime,format:b.format,rating:rating>0?Math.round(Math.min(5,rating)*2)/2:null,oneLiner:b.oneLiner,legacyDurationDays:oldNum(b.durationDays),createdAt:b.createdAt,updatedAt:b.updatedAt }));
    // Preserve old prose verbatim; never ask a model to guess its structure.
    if (b.note) out.notes.push(newNote(bid,rid,'review',{id:`note_${bid}_legacy`,legacyText:b.note,title:'기존 독서록',createdAt:b.createdAt,updatedAt:b.updatedAt}));
    if ((b.startedAt && startedAt!==b.startedAt) || (b.finishedAt && finishedAt!==b.finishedAt) || (status !== 'finished' && b.finishedAt)) out.notes.push(newNote(bid,rid,'memo',{id:`note_${bid}_dates`,title:'이전 날짜 기록',text:`이전 시작일: ${b.startedAt||'없음'}\n이전 완독일: ${b.finishedAt||'없음'}\n이전 기간: ${b.durationDays??'없음'}`,createdAt:b.createdAt,updatedAt:b.updatedAt}));
  }
  return { state:validateState(out), warnings };
}
export function parseBackup(content) {
  if (typeof content !== 'string' || content.length > 30000000) throw new Error('백업은 30MB 이하의 JSON 파일이어야 해요.');
  let data; try { data=JSON.parse(content); } catch { throw new Error('JSON 파일을 읽지 못했어요. 원본은 변경하지 않았어요.'); }
  if (data?.app === APP) return {state:validateState(data),warnings:[]};
  return migrateLegacy(data);
}
export function newBook(data={}) { const t=nowIso(); return normalizeBook({id:uid('book'),createdAt:t,updatedAt:t,...data}); }
export function newReading(bookId,data={}) { const t=nowIso(); return normalizeReading({id:uid('read'),bookId,status:'planned',createdAt:t,updatedAt:t,...data}); }
export function newNote(bookId,readingId=null,kind='review',data={}) { const t=nowIso(); return normalizeNote({id:uid('note'),bookId,readingId,kind,createdAt:t,updatedAt:t,...data}); }
export const readingsFor=(state,bookId)=>state.readings.filter(r=>r.bookId===bookId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
export const activeReading=(state,bookId)=>state.readings.find(r=>r.bookId===bookId&&!['finished','abandoned'].includes(r.status));
export function bookMatches(b,query) { const q=query.trim().toLocaleLowerCase(); return !q || [b.title,b.subtitle,b.authors.join(' '),b.publisher,b.genre,b.isbn].join(' ').toLocaleLowerCase().includes(q); }
export function noteMatches(n,b,query) { const q=query.trim().toLocaleLowerCase(); return !q || [b?.title,...['title','summary','reflection','takeaway','questions','actions','text','comment','legacyText','locator'].map(k=>n[k]),...n.tags].join(' ').toLocaleLowerCase().includes(q); }
export function summary(state,end=today()) {
  const done=state.readings.filter(r=>r.status==='finished');
  const dated=done.filter(r=>r.finishedAt);
  const periods=done.map(r=>durationOf(r)).filter(n=>n!==null);
  return { count:done.length, unique:new Set(done.map(r=>r.bookId)).size, year:dated.filter(r=>r.finishedAt.slice(0,4)===end.slice(0,4)).length, month:dated.filter(r=>r.finishedAt.slice(0,7)===end.slice(0,7)).length, notes:state.notes.filter(noteHasContent).length, avgDays:periods.length?Math.round(periods.reduce((a,b)=>a+b,0)/periods.length*10)/10:null, undated:done.length-dated.length, durationSamples:periods.length };
}
export function cleanExport(state) { const copy=validateState(state); copy.settings.aladinKey=''; return {...copy,exportedAt:nowIso()}; }
export function previewMerge(current,incoming) {
  const out={books:{added:0,same:0,conflict:0},readings:{added:0,same:0,conflict:0},notes:{added:0,same:0,conflict:0}};
  for(const k of ['books','readings','notes']) {
    const map=new Map(current[k].map(x=>[x.id,x]));
    for(const x of incoming[k]) { const old=map.get(x.id); out[k][!old?'added':JSON.stringify(x)===JSON.stringify(old)?'same':'conflict']++; }
  }
  return out;
}
export function mergeStates(current,incoming,conflicts='keep-local') {
  if(!['keep-local','use-backup'].includes(conflicts)) throw new Error('충돌 처리 방식을 선택해 주세요.');
  const out=clone(current);
  for(const k of ['books','readings','notes']) {
    const map=new Map(out[k].map(x=>[x.id,x]));
    for(const x of incoming[k]) if(!map.has(x.id)||conflicts==='use-backup') map.set(x.id,clone(x));
    out[k]=[...map.values()];
  }
  return validateState(out);
}
