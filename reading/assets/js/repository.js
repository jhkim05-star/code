/** Application service/repository. All mutations are validated and committed
 * before the in-memory state changes or a success event is emitted.
 */
import { emptyState,validateState,migrateLegacy,clone,nowIso,newBook,newReading,normalizeNote,normalizeBook,normalizeReading,activeReading,mergeStates,noteHasContent } from './domain.js';
import { ConflictError } from './storage.js';
export class ReadingRepository {
  constructor(adapter) { this.adapter=adapter;this.state=null;this.listeners=new Set();this.queue=Promise.resolve();this.warnings=[]; }
  async init(){
    let raw=await this.adapter.load();
    if(raw){this.state=validateState(raw);return this.state;}
    const legacy=this.adapter.readLegacy?.();
    let next=emptyState(),legacyBackup=null;
    if(legacy){
      let old;try{old=JSON.parse(legacy);}catch{throw new Error('이전 책 기록을 읽지 못했어요. 새 데이터로 덮어쓰지 않았어요. 기존 JSON을 먼저 내보내 주세요.');}
      const migrated=migrateLegacy(old);next=migrated.state;this.warnings=migrated.warnings;
      // Only book-related fields are retained in the migration backup.
      legacyBackup={version:1,books:clone(old.books),settings:{cols:old.settings?.cols,kakaoProxyUrl:old.settings?.kakaoProxyUrl,aladinKey:old.settings?.aladinKey}};
    }
    next.revision=1;
    try{await this.adapter.save(next,0,{legacyBackup});}catch(e){if(e instanceof ConflictError){this.state=validateState(await this.adapter.load());return this.state;}throw e;}
    this.state=next;
    if(legacy){try{this.adapter.retireLegacy?.();}catch{this.warnings.push('이전 저장본 정리에 실패했어요. 새 저장본은 정상이며 다음에 다시 확인해 주세요.');}}
    return this.state;
  }
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  notify(){for(const fn of this.listeners){try{fn(this.state);}catch(e){console.error(e);}}}
  async reload(){this.state=validateState(await this.adapter.load());this.notify();return this.state;}
  transact(fn,options={}){
    const job=async()=>{
      for(let attempt=0;attempt<3;attempt++){
        const current=validateState(await this.adapter.load()), next=clone(current);
        const result=fn(next); // Always synchronous; never do side effects inside fn.
        const valid=validateState(next);valid.revision=current.revision+1;valid.updatedAt=nowIso();
        try{await this.adapter.save(valid,current.revision,options);this.state=valid;this.notify();return result;}
        catch(e){if(!(e instanceof ConflictError)||attempt===2)throw e;}
      }
    };
    const result=this.queue.then(job,job);this.queue=result.catch(()=>{});return result;
  }
  createBook(data,readingData={}){
    const b=newBook(data), r=newReading(b.id,readingData);
    return this.transact(s=>{
      if(b.isbn && s.books.some(x=>x.isbn.replace(/[\s-]/g,'')===b.isbn.replace(/[\s-]/g,''))) throw new Error('같은 ISBN의 책이 이미 있어요. 기존 책에서 읽기 이력을 추가해 주세요.');
      s.books.push(b);s.readings.push(r);return b.id;
    });
  }
  editBook(bookId,patch){return this.transact(s=>{const i=s.books.findIndex(b=>b.id===bookId);if(i<0)throw new Error('책을 찾지 못했어요.');s.books[i]=normalizeBook({...s.books[i],...patch,id:bookId,updatedAt:nowIso()});});}
  updateCovers(updates){
    if(!Array.isArray(updates))return Promise.reject(new Error('표지 변경 목록 형식이 올바르지 않아요.'));
    return this.transact(s=>{for(const update of updates){const i=s.books.findIndex(b=>b.id===update.bookId);if(i<0)continue;s.books[i]=normalizeBook({...s.books[i],coverUrl:update.coverUrl,coverFallbacks:update.coverFallbacks||[],coverSource:update.coverSource||'',coverCheckedAt:update.coverCheckedAt||nowIso(),updatedAt:nowIso()});}return updates.length;});
  }
  editReading(readingId,patch){return this.transact(s=>{const i=s.readings.findIndex(r=>r.id===readingId);if(i<0)throw new Error('독서 이력을 찾지 못했어요.');s.readings[i]=normalizeReading({...s.readings[i],...patch,id:readingId,bookId:s.readings[i].bookId,updatedAt:nowIso()});});}
  resumeReading(readingId,date){return this.transact(s=>{
    const i=s.readings.findIndex(r=>r.id===readingId);
    if(i<0)throw new Error('독서 이력을 찾지 못했어요.');
    const r=s.readings[i];
    if(activeReading(s,r.bookId))throw new Error('진행 중인 읽기를 먼저 마쳐 주세요.');
    if(!['finished','abandoned'].includes(r.status))throw new Error('완료하거나 그만둔 읽기만 다시 읽는 중으로 바꿀 수 있어요.');
    s.readings[i]=normalizeReading({...r,status:'reading',startedAt:r.startedAt||date,startedTime:r.startedTime||(r.startedAt?'':nowIso()),finishedAt:'',finishedTime:'',updatedAt:nowIso()});
  });}
  reread(bookId,date){const r=newReading(bookId,{status:'reading',startedAt:date,startedTime:nowIso()});return this.transact(s=>{if(activeReading(s,bookId))throw new Error('진행 중인 읽기를 먼저 마쳐 주세요.');s.readings.push(r);return r.id;});}
  removeReread(readingId){return this.transact(s=>{
    const reading=s.readings.find(r=>r.id===readingId);
    if(!reading)throw new Error('독서 이력을 찾지 못했어요.');
    const rounds=s.readings.filter(r=>r.bookId===reading.bookId);
    if(rounds.length<2||rounds[0].id===readingId)throw new Error('첫 번째 읽기 기록은 책과 함께 보존해 주세요.');
    s.readings=s.readings.filter(r=>r.id!==readingId);
    // Keep the writing: it becomes a book-level note rather than an orphan.
    for(const note of s.notes)if(note.readingId===readingId)note.readingId=null;
  },{detachReadingId:readingId});}
  saveNote(note,expectedRev=0){
    if(expectedRev===0&&!noteHasContent(note))return Promise.reject(new Error('내용을 하나 이상 적은 뒤 저장해 주세요.'));
    return this.transact(s=>{
      const i=s.notes.findIndex(n=>n.id===note.id),old=i>=0?s.notes[i]:null;
      if((old?.rev??0)!==expectedRev)throw new ConflictError('같은 노트가 다른 창에서 수정됐어요. 현재 글을 파일로 보관하거나 별도 노트로 저장해 주세요.');
      const saved=normalizeNote({...note,rev:expectedRev+1,updatedAt:nowIso()});
      if(i<0)s.notes.push(saved);else s.notes[i]=saved;
      return saved;
    });
  }
  removeNote(noteId){return this.transact(s=>{s.notes=s.notes.filter(n=>n.id!==noteId);},{removeDraftIds:[noteId]});}
  removeBook(bookId){return this.transact(s=>{s.books=s.books.filter(b=>b.id!==bookId);s.readings=s.readings.filter(r=>r.bookId!==bookId);s.notes=s.notes.filter(n=>n.bookId!==bookId);},{removeBookId:bookId});}
  setting(patch){return this.transact(s=>Object.assign(s.settings,patch));}
  async import(incoming,{mode,conflicts='keep-local'}={}){
    if(!['merge','replace'].includes(mode))return Promise.reject(new Error('합치기 또는 덮어쓰기를 선택해 주세요.'));
    const parsed=validateState(incoming);
    return this.transact(s=>{
      const result=mode==='merge'?mergeStates(s,parsed,conflicts):clone(parsed);
      // Secret stays on this device; exports do not transfer keys between people.
      result.settings.aladinKey=s.settings.aladinKey;
      Object.assign(s,result);
    },{beforeImport:true,clearDrafts:mode==='replace'});
  }
  async draft(note,baseRev){return this.adapter.draftPut(note.id,{note:normalizeNote(note),baseRev,savedAt:nowIso()});}
  async wipe(){return this.transact(s=>Object.assign(s,emptyState()),{beforeImport:true,clearDrafts:true});}
}
