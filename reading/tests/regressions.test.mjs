import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromAladin, parseAladinAuthors } from '../assets/js/api.js';
import { ReadingRepository } from '../assets/js/repository.js';
import { ConflictError } from '../assets/js/storage.js';
import { clone, newNote, noteHasContent, readingsFor } from '../assets/js/domain.js';
import { deleteReread } from '../assets/js/views-books.js';

class MemoryAdapter {
  constructor(){this.value=null;this.draftValues=new Map();}
  async load(){return this.value&&clone(this.value);}
  async save(next,expectedRevision){
    if((this.value?.revision??0)!==expectedRevision)throw new ConflictError();
    this.value=clone(next);
  }
  readLegacy(){return null;}
  async draftPut(key,value){this.draftValues.set(key,clone(value));}
  async draftGet(key){return this.draftValues.get(key)||null;}
  async draftDelete(key){this.draftValues.delete(key);}
}

test('알라딘 역할에서 저자와 역자만 각각 분리한다',()=>{
  const parsed=parseAladinAuthors('한강 (지은이), 홍길동 (글), 김철수 (옮긴이), 이영희 (번역), 박민수 (역자), 그림사람 (그림), 사진사람 (사진), 엮음사람 (엮은이), 감수자 (감수), 기획자 (기획), 해설자 (해설), 무라카미 하루키');
  assert.deepEqual(parsed.authors,['한강','홍길동','무라카미 하루키']);
  assert.equal(parsed.translator,'김철수, 이영희, 박민수');
});

test('역자와 부가 참여자만 있을 때 저자로 되돌리지 않는다',()=>{
  const parsed=parseAladinAuthors('김철수 (옮긴이), 이영희 (그림)');
  assert.deepEqual(parsed.authors,[]);
  assert.equal(parsed.translator,'김철수');
});

test('알라딘 itemPage를 검증한 페이지 수로 변환한다',()=>{
  const book=fromAladin({title:'책',author:'한강 (지은이), 김철수 (옮긴이)',subInfo:{itemPage:'352'}});
  assert.deepEqual(book.authors,['한강']);
  assert.equal(book.translator,'김철수');
  assert.equal(book.pageCount,352);
  assert.equal(fromAladin({title:'책',subInfo:{itemPage:'-1'}}).pageCount,null);
  assert.equal(fromAladin({title:'책',subInfo:{itemPage:'알 수 없음'}}).pageCount,null);
});

test('새 빈 노트는 저장하지 않고 실제 내용이 있으면 저장한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  await repo.createBook({title:'기록할 책'});const book=repo.state.books[0],beforeRevision=repo.state.revision;
  await assert.rejects(repo.saveNote(newNote(book.id,null,'review'),0),/내용/);
  assert.equal(repo.state.revision,beforeRevision);assert.equal(repo.state.notes.length,0);
  const saved=await repo.saveNote(newNote(book.id,null,'review',{reflection:'내 생각'}),0);
  assert.equal(repo.state.notes.length,1);assert.equal(noteHasContent(saved),true);
  await repo.saveNote({...saved,reflection:''},saved.rev);
  assert.equal(repo.state.notes.length,1);
});

test('책장의 읽은 책 추가에서 시작일을 완독일 앞에 받고 독서 이력에 보존한다',async()=>{
  const view=readFileSync(new URL('../assets/js/views-books.js',import.meta.url),'utf8');
  assert.match(view,/finished\?field\('읽기 시작일',pastStart\):null,finished\?field\('완독일',pastEnd\):null/);
  assert.match(view,/startedAt:finished\?pastStart\.value:'',finishedAt:finished\?pastEnd\.value:''/);
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  await repo.createBook({title:'이미 읽은 책'},{status:'finished',startedAt:'2026-08-01',finishedAt:'2026-08-12'});
  assert.equal(repo.state.readings[0].startedAt,'2026-08-01');
  assert.equal(adapter.value.readings[0].finishedAt,'2026-08-12');
  const previous=clone(repo.state);
  assert.throws(()=>repo.createBook({title:'날짜가 뒤바뀐 책'},{status:'finished',startedAt:'2026-08-13',finishedAt:'2026-08-12'}),/완독일은 시작일보다/);
  assert.deepEqual(repo.state,previous);
});

test('완독한 책을 읽는 중으로 시작하면 앞선 기록과 노트를 보존하고 두 번째 회차만 삭제한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  const bookId=await repo.createBook({title:'다시 읽는 책'},{status:'finished',startedAt:'2026-01-01',finishedAt:'2026-01-10',rating:4.5});
  const first=clone(repo.state.readings[0]);
  const secondId=await repo.reread(bookId,'2026-09-18');
  assert.deepEqual(repo.state.readings.find(r=>r.id===first.id),first);
  assert.equal(repo.state.readings.find(r=>r.id===secondId).status,'reading');
  assert.equal(readingsFor(repo.state,bookId)[0].id,secondId);
  assert.equal(readingsFor({readings:repo.state.readings.map(r=>({...r,createdAt:first.createdAt}))},bookId)[0].id,secondId);
  await assert.rejects(repo.reread(bookId,'2026-09-19'),/진행 중인/);
  const note=await repo.saveNote(newNote(bookId,secondId,'memo',{text:'다시 읽으며 남긴 생각'}),0);
  await assert.rejects(repo.removeReread(first.id),/첫 번째/);
  await repo.removeReread(secondId);
  assert.deepEqual(repo.state.readings,[first]);
  assert.equal(repo.state.notes.find(n=>n.id===note.id).readingId,null);
  assert.equal(repo.state.notes.find(n=>n.id===note.id).text,'다시 읽으며 남긴 생각');
  const reopened=new ReadingRepository(adapter);await reopened.init();
  assert.deepEqual(reopened.state.readings,[first]);
  assert.equal(reopened.state.notes[0].readingId,null);
});

test('오늘로 미리 완독한 읽기를 같은 회차로 되돌리고 완독일만 비운다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  const bookId=await repo.createBook({title:'아직 읽는 책'},{status:'finished',startedAt:'2026-09-01',finishedAt:'2026-09-18',finishedTime:'2026-09-18T03:00:00.000Z',rating:4,oneLiner:'미리 입력한 평'});
  const original=clone(repo.state.readings[0]);
  const note=await repo.saveNote(newNote(bookId,original.id,'memo',{text:'읽는 중 남긴 메모'}),0);
  await repo.resumeReading(original.id,'2026-09-18');
  assert.equal(repo.state.readings.length,1);
  assert.equal(repo.state.readings[0].id,original.id);
  assert.equal(repo.state.readings[0].status,'reading');
  assert.equal(repo.state.readings[0].startedAt,'2026-09-01');
  assert.equal(repo.state.readings[0].finishedAt,'');
  assert.equal(repo.state.readings[0].finishedTime,'');
  assert.equal(repo.state.readings[0].rating,4);
  assert.equal(repo.state.readings[0].oneLiner,'미리 입력한 평');
  assert.equal(repo.state.notes.find(n=>n.id===note.id).readingId,original.id);
  const reopened=new ReadingRepository(adapter);await reopened.init();
  assert.equal(reopened.state.readings.length,1);
  assert.equal(reopened.state.readings[0].status,'reading');
  assert.equal(reopened.state.readings[0].finishedAt,'');
  await assert.rejects(repo.resumeReading(original.id,'2026-09-18'),/진행 중인/);
});

test('완독일이 비어 있던 과거 기록은 같은 ID로 읽는 중이 되고 다른 진행 중 회차는 보존한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  const bookId=await repo.createBook({title:'두 번 읽는 책'},{status:'finished',finishedAt:'2026-09-18'});
  const firstId=repo.state.readings[0].id;
  await repo.resumeReading(firstId,'2026-09-18');
  assert.equal(repo.state.readings[0].startedAt,'2026-09-18');
  await repo.editReading(firstId,{status:'finished',finishedAt:'2026-09-18'});
  const secondId=await repo.reread(bookId,'2026-09-18');
  const before=clone(repo.state);
  await assert.rejects(repo.resumeReading(firstId,'2026-09-18'),/진행 중인/);
  assert.deepEqual(repo.state,before);
  assert.equal(repo.state.readings.find(r=>r.id===secondId).status,'reading');
});

test('회차 삭제 저장 실패 시 이전 기록과 연결을 그대로 유지한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  const bookId=await repo.createBook({title:'보존할 책'},{status:'finished'});
  const secondId=await repo.reread(bookId,'2026-09-18');
  await repo.saveNote(newNote(bookId,secondId,'memo',{text:'보존할 메모'}),0);
  const before=clone(repo.state),save=adapter.save.bind(adapter);
  adapter.save=async()=>{throw new Error('저장 실패');};
  await assert.rejects(repo.removeReread(secondId),/저장 실패/);
  assert.deepEqual(repo.state,before);
  assert.deepEqual(adapter.value,before);
  adapter.save=save;
});

test('삭제 확인창 이후에도 두 번째 읽기만 삭제하고 취소 시 기록을 보존한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();
  const bookId=await repo.createBook({title:'다시 읽는 책'},{status:'finished'});
  const firstId=repo.state.readings[0].id,secondId=await repo.reread(bookId,'2026-09-18');
  const trigger={disabled:false},events=[],ctx={repo,refresh:()=>events.push('refresh'),toast:message=>events.push(message)};
  await deleteReread(ctx,{id:secondId},2,trigger,async()=>false);
  assert.equal(trigger.disabled,false);
  assert.deepEqual(repo.state.readings.map(r=>r.id),[firstId,secondId]);
  assert.deepEqual(events,[]);
  await deleteReread(ctx,{id:secondId},2,trigger,async()=>{
    assert.equal(trigger.disabled,true);
    await Promise.resolve(); // The original click event has finished by now.
    return true;
  });
  assert.equal(trigger.disabled,false);
  assert.deepEqual(repo.state.readings.map(r=>r.id),[firstId]);
  assert.deepEqual(adapter.value.readings.map(r=>r.id),[firstId]);
  assert.equal(events[0],'refresh');
});

test('책 상세에 회차별 읽는 중 전환·수정·삭제와 별점 선택 버튼을 둔다',()=>{
  const view=readFileSync(new URL('../assets/js/views-books.js',import.meta.url),'utf8');
  assert.match(view,/button\('읽는 중으로'.*resumeReading\(r\.id,today\(\)\)/);
  assert.match(view,/button\('다시 읽기 · 새 회차'.*reread\(b\.id,today\(\)\)/);
  assert.match(view,/button\('수정',\(\)=>recordForm\(ctx,b,r\)/);
  assert.match(view,/if\(index>1\)actions\.push\(button\('이 읽기 삭제',e=>deleteReread\(ctx,r,index,e\.currentTarget\)/);
  assert.match(view,/button\('★'/);
  assert.match(view,/finished\?field\('평점',pastRating\):null/);
  assert.match(view,/rating:finished\?pastRating\.value:null/);
  assert.doesNotMatch(view,/날짜 · 별점 · 책유형 수정/);
  assert.doesNotMatch(view,/ratingOpts=/);
});

test('새 책 담기와 읽은 책 추가의 기본 책유형은 전자책이며 기존 회차 수정은 저장값을 따른다',()=>{
  const view=readFileSync(new URL('../assets/js/views-books.js',import.meta.url),'utf8');
  const bookForm=view.slice(view.indexOf('export function bookForm('),view.indexOf('function statDetail('));
  assert.match(bookForm,/format=select\(FORMATS,'ebook'\)/);
  assert.match(bookForm,/format:format\.value/);
  assert.match(view,/format=select\(FORMATS,r\.format\)/);
  assert.doesNotMatch(bookForm,/format=select\(FORMATS,'paper'\)/);
});
