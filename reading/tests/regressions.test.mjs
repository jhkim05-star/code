import test from 'node:test';
import assert from 'node:assert/strict';
import { fromAladin, parseAladinAuthors } from '../assets/js/api.js';
import { ReadingRepository } from '../assets/js/repository.js';
import { ConflictError } from '../assets/js/storage.js';
import { clone, newNote, noteHasContent } from '../assets/js/domain.js';

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
