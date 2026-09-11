import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState,normalizeBook,clone } from '../assets/js/domain.js';
import { ReadingRepository } from '../assets/js/repository.js';
import worker from '../proxy/worker.js';

const stamp='2026-09-11T00:00:00.000Z';
class MemoryAdapter{constructor(value=null){this.value=value&&clone(value);}async load(){return this.value&&clone(this.value);}async save(next,expected){if((this.value?.revision??0)!==expected)throw new Error('conflict');this.value=clone(next);}readLegacy(){return null;}async draftPut(){}async draftGet(){return null;}async draftDelete(){}}

test('ISBN만으로 확인하지 않은 Open Library 주소를 만들지 않는다',()=>{
  const book=normalizeBook({id:'b1',title:'표지 없는 책',isbn:'9788996991342',authors:[],createdAt:stamp,updatedAt:stamp});
  assert.equal(book.coverUrl,'');assert.deepEqual(book.coverFallbacks,[]);assert.equal(book.coverSource,'');assert.equal(book.coverCheckedAt,'');
});

test('표지 복구는 책 정보와 독서 기록을 보존하며 한 번에 저장한다',async()=>{
  const adapter=new MemoryAdapter(),repo=new ReadingRepository(adapter);await repo.init();const id=await repo.createBook({title:'그대로 둘 제목',isbn:'9788996991342',authors:['작가']},{status:'reading'});const before=clone(repo.state.readings);
  await repo.updateCovers([{bookId:id,coverUrl:'https://example.com/cover.jpg',coverFallbacks:['https://example.com/fallback.jpg'],coverSource:'국립중앙도서관',coverCheckedAt:stamp}]);
  const saved=repo.state.books.find(book=>book.id===id);assert.equal(saved.title,'그대로 둘 제목');assert.deepEqual(saved.authors,['작가']);assert.equal(saved.coverSource,'국립중앙도서관');assert.deepEqual(saved.coverFallbacks,['https://example.com/fallback.jpg']);assert.deepEqual(repo.state.readings,before);
});

test('국내 프록시는 ISBN 표지 후보를 국립중앙도서관부터 반환한다',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>{const host=new URL(String(url)).host;if(host==='www.nl.go.kr')return new Response(JSON.stringify({docs:[{TITLE:'국내 책',AUTHOR:'저자',EA_ISBN:'9788996991342',TITLE_URL:'http://example.com/nl.jpg'}]}));if(host==='openapi.naver.com')return new Response(JSON.stringify({items:[{title:'국내 책',author:'저자',isbn:'8996991341 9788996991342',image:'http://example.com/naver.jpg'}]}));return new Response(JSON.stringify({documents:[{title:'국내 책',authors:['저자'],isbn:'8996991341 9788996991342',thumbnail:'http://example.com/kakao.jpg'}]}));};
  try{const response=await worker.fetch(new Request('https://proxy.test/?action=cover&query=9788996991342&isbn=9788996991342'),{NL_CERT_KEY:'nl',NAVER_CLIENT_ID:'id',NAVER_CLIENT_SECRET:'secret',KAKAO_REST_API_KEY:'kakao'}),body=await response.json();assert.deepEqual(body.items.map(item=>item.source),['국립중앙도서관','네이버 책','카카오']);assert.ok(body.items.every(item=>item.coverUrl.startsWith('https://')));}
  finally{globalThis.fetch=original;}
});
