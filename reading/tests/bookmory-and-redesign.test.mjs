import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { emptyState,normalizeBook,normalizeReading,normalizeNote,validateState,suggestedCollection,collectionGroups,statistics,clone } from '../assets/js/domain.js';
import { parseBookmoryXlsx,bookmoryXlsx,bookmoryMatrix,BOOK_HEADERS,ROUND_HEADERS } from '../assets/js/bookmory.js';
import { ReadingRepository } from '../assets/js/repository.js';
import { ConflictError } from '../assets/js/storage.js';

const stamp='2026-01-01T00:00:00.000Z';
const book=(id,title,patch={})=>normalizeBook({id,title,authors:['한강'],createdAt:stamp,updatedAt:stamp,...patch});
const reading=(id,bookId,patch={})=>normalizeReading({id,bookId,status:'finished',startedAt:'2026-01-01',finishedAt:'2026-01-02',format:'paper',createdAt:stamp,updatedAt:stamp,...patch});

test('Bookmory canonical workbook has exact two-level headers and dynamic reading rounds',()=>{
  const state=emptyState();state.books.push(book('b1','다시 읽는 책',{publisher:'민음사',collection:'민음사 세계문학전집',series:'서가 1',tags:['고전'],origin:'europe'}));
  state.readings.push(reading('r1','b1',{rating:4}),reading('r2','b1',{startedAt:'2026-02-01',finishedAt:'2026-02-03',format:'ebook',rating:null,createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-03T00:00:00.000Z'}));
  state.notes.push(normalizeNote({id:'n1',bookId:'b1',readingId:'r1',kind:'review',stage:'complete',reflection:'좋았다',takeaway:'이전 필드는 보존',createdAt:stamp,updatedAt:stamp}));
  const matrix=bookmoryMatrix(validateState(state));
  assert.deepEqual(matrix.headers.slice(0,15),BOOK_HEADERS);assert.deepEqual(matrix.headers.slice(15,19),ROUND_HEADERS);assert.deepEqual(matrix.headers.slice(19,23),ROUND_HEADERS);assert.equal(matrix.group[15],'1 회차 읽은 기록');assert.equal(matrix.group[19],'2 회차 읽은 기록');assert.match(matrix.rows[0][11],/#출처_유럽/);assert.match(matrix.rows[0][11],/#시리즈_서가_1/);assert.match(matrix.rows[0][17],/이전 필드는 보존/);
});

test('Bookmory export and import round-trip preserves counts, formats, rating policy and metadata',async()=>{
  const state=emptyState();state.books.push(book('b1','왕복 책',{publisher:'출판사',genre:'소설',tags:['태그'],series:'연작',origin:'east'}),book('b2','듣는 책',{authors:['다른 작가']}));
  state.readings.push(reading('r1','b1',{format:'ebook',rating:4.5}),reading('r2','b1',{status:'reading',startedAt:'2026-03-01',finishedAt:'',format:'ebook',rating:null,createdAt:'2026-03-01T00:00:00.000Z',updatedAt:'2026-03-01T00:00:00.000Z'}));
  state.readings.push(reading('r3','b2',{format:'audio',rating:3.5}));
  const parsed=await parseBookmoryXlsx(await bookmoryXlsx(validateState(state)).arrayBuffer());
  assert.equal(parsed.sheetName,'책 목록');assert.equal(parsed.rounds,2);assert.equal(parsed.summary.books,2);assert.equal(parsed.summary.readings,3);assert.equal(parsed.summary.statuses['완독'],2);assert.equal(parsed.summary.statuses['읽는 중'],1);assert.equal(parsed.summary.formats['전자책'],2);assert.equal(parsed.summary.formats['오디오북'],1);assert.deepEqual(parsed.state.readings.map(r=>r.rating),[4.5,null,3.5]);assert.equal(parsed.state.books[0].series,'연작');assert.equal(parsed.state.books[0].origin,'east');assert.equal(parsed.state.books[0].genre,'소설');
});

test('실제 업로드 Bookmory 파일 전체를 파싱한다',{skip:!process.env.BOOKMORY_SAMPLE},async()=>{
  const parsed=await parseBookmoryXlsx(await fs.readFile(process.env.BOOKMORY_SAMPLE));
  assert.deepEqual({sheet:parsed.sheetName,rounds:parsed.rounds,books:parsed.summary.books,finished:parsed.summary.statuses['완독'],reading:parsed.summary.statuses['읽는 중'],paper:parsed.summary.formats['종이책'],ebook:parsed.summary.formats['전자책'],ratings:parsed.summary.ratings,notes:parsed.summary.notes,warnings:parsed.warnings.length},{sheet:'책 목록',rounds:1,books:106,finished:103,reading:3,paper:47,ebook:59,ratings:103,notes:14,warnings:0});
  assert.equal(parsed.state.books.filter(b=>!b.genre).length,0);assert.equal(parsed.state.books.filter(b=>!b.origin).length,0);assert.equal(parsed.state.books.filter(b=>b.coverUrl).length,102);
  const roundTrip=await parseBookmoryXlsx(await bookmoryXlsx(parsed.state).arrayBuffer());
  assert.deepEqual({books:roundTrip.summary.books,readings:roundTrip.summary.readings,finished:roundTrip.summary.statuses['완독'],reading:roundTrip.summary.statuses['읽는 중'],paper:roundTrip.summary.formats['종이책'],ebook:roundTrip.summary.formats['전자책'],ratings:roundTrip.summary.ratings,notes:roundTrip.summary.notes},{books:106,readings:106,finished:103,reading:3,paper:47,ebook:59,ratings:103,notes:14});
  assert.deepEqual(roundTrip.state.books.map(b=>[b.genre,b.origin,b.coverUrl]),parsed.state.books.map(b=>[b.genre,b.origin,b.coverUrl]));
});

test('strict Minumsa collection rule requires publisher and explicit collection evidence',()=>{
  assert.equal(suggestedCollection({publisher:'민음사',title:'세계문학전집 1',tags:[]}), '민음사 세계문학전집');
  assert.equal(suggestedCollection({publisher:'민음사',title:'평범한 소설',tags:[]}), '');
  assert.equal(suggestedCollection({publisher:'다른 출판사',title:'세계문학전집',tags:[]}), '');
});

test('collections, series and normalized authors group without an extra route',()=>{
  const state=emptyState();state.books.push(book('b1','첫 책',{authors:[' 한강 '],collection:'문학 모음',series:'연작'}),book('b2','둘째 책',{authors:['한강'],collection:'문학 모음',series:'연작'}));
  const groups=collectionGroups(validateState(state));assert.equal(groups.collections[0].books.length,2);assert.equal(groups.series[0].books.length,2);assert.equal(groups.authors[0].label.trim(),'한강');assert.equal(groups.authors[0].books.length,2);
});

test('statistics count rereads once, sort dates newest first and expose detail book ids',()=>{
  const state=emptyState();state.books.push(book('b1','한 권',{genre:'소설',origin:'korean'}),book('b2','두 권',{genre:'역사',origin:'europe'}));
  state.readings.push(reading('r1','b1',{startedAt:'2025-01-01',finishedAt:'2025-01-02'}),reading('r2','b1',{startedAt:'2026-02-01',finishedAt:'2026-02-03',format:'ebook',rating:4,createdAt:'2026-02-01T00:00:00.000Z'}),reading('r3','b2',{startedAt:'2026-03-01',finishedAt:'2026-03-04',rating:5,createdAt:'2026-03-01T00:00:00.000Z'}));
  const result=statistics(validateState(state));assert.equal(result.total,2);assert.deepEqual(result.years.map(x=>x.label),['2026']);assert.deepEqual(result.months.map(x=>x.label),['2026-03','2026-02']);assert.equal(result.years.find(x=>x.label==='2026').value,2);assert.deepEqual(result.years.find(x=>x.label==='2026').bookIds.sort(),['b1','b2']);assert.equal(result.genres.reduce((n,x)=>n+x.value,0),2);assert.equal(result.origins.find(x=>x.label==='한국').value,1);assert.equal(result.formats.find(x=>x.label==='전자책').value,1);assert.equal(result.authors.find(x=>x.label==='한강').value,2);
});

class MemoryAdapter{constructor(value=null){this.value=value&&clone(value);this.drafts=[];this.fail=false;this.lastOptions={};}async load(){return this.value&&clone(this.value);}async save(next,expected,options={}){if(this.fail)throw new Error('disk failed');if((this.value?.revision??0)!==expected)throw new ConflictError();this.value=clone(next);this.lastOptions=options;}readLegacy(){return null;}async draftPut(){}async draftGet(){return null;}async draftDelete(){}}
test('theme and independent background persist through validated settings and failed replace keeps old data',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();for(const theme of ['red','pink','blue','green','yellow']){await repo.setting({theme});assert.equal(repo.state.settings.theme,theme);assert.equal(adapter.value.settings.theme,theme);}for(const background of ['black','beige','white']){await repo.setting({background});assert.equal(repo.state.settings.background,background);assert.equal(adapter.value.settings.background,background);}await repo.createBook({title:'기존 책'});const before=clone(repo.state),incoming=emptyState();incoming.books.push(book('new','새 책'));incoming.readings.push(reading('new-read','new'));adapter.fail=true;await assert.rejects(repo.import(incoming,{mode:'replace'}));assert.deepEqual(repo.state,before);assert.deepEqual(adapter.value,before);
});

test('explicit wipe starts with empty records, clears drafts and remains atomic on failure',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();await repo.createBook({title:'지울 책'});await repo.wipe();assert.deepEqual([repo.state.books.length,repo.state.readings.length,repo.state.notes.length],[0,0,0]);assert.equal(adapter.lastOptions.clearDrafts,true);await repo.createBook({title:'보존할 책'});const before=clone(repo.state);adapter.fail=true;await assert.rejects(repo.wipe());assert.deepEqual(repo.state,before);
});

test('UI source has five tabs, no shared header, theme tokens and non-color cover layers',async()=>{
  const [app,index,css,books,notes,settings]=await Promise.all(['../assets/js/app.js','../index.html','../assets/css/app.css','../assets/js/views-books.js','../assets/js/views-notes.js','../assets/js/views-settings.js'].map(path=>fs.readFile(new URL(path,import.meta.url),'utf8')));
  for(const route of ["shelf:'책꽂이'","library:'책장'","notes:'노트'","stats:'통계'","settings:'설정'"])assert.match(app,new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(index,/id="topbar"/);assert.match(index,/data-background="black"/);assert.doesNotMatch(app,/책꽂이.*·.*기록/);for(const theme of ['red','pink','blue','green','yellow'])assert.match(css,new RegExp(`data-theme=${theme}`));for(const background of ['black','beige','white'])assert.match(css,new RegExp(`data-background=${background}`));assert.match(css,/Malgun Gothic/);assert.match(css,/format-paper.*paper-contrast/s);assert.match(css,/format-ebook.*border:3px double/s);assert.match(css,/format-ebook:before/);assert.match(css,/format-audio.*border:2px dashed/s);assert.match(css,/rating-overlay/);assert.match(books,/cover\(b,false,r\)/);assert.match(books,/button\.chart-row/);assert.match(books,/statDetail/);assert.match(books,/기존 책 정보 다시 검색/);assert.match(books,/책유형/);assert.doesNotMatch(books,/달력상 기간/);assert.doesNotMatch(notes,/나에게 남은 것/);assert.doesNotMatch(notes,/takeaway/);assert.match(settings,/Bookmory Excel 불러오기/);assert.match(settings,/background-choice/);assert.match(settings,/기존 기록 초기화/);assert.match(settings,/repo\.wipe\(\)/);
});

test('reading service worker remains scoped and does not mention workout caches',async()=>{
  const sw=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');assert.match(sw,/bookshelf-reading-/);assert.match(sw,/startsWith\(PREFIX\)/);assert.doesNotMatch(sw,/workout/i);assert.match(sw,/bookmory\.js/);
});
