/** One authoritative IndexedDB; per-day writes and revision-aware note edits. */
(function(root){
  'use strict';
  const D=root.HaruDomain;
  class ConflictError extends Error {constructor(message='다른 창에서 기록이 바뀌었어요. 입력은 남겨뒀으니 다시 확인해 주세요.'){super(message);this.name='ConflictError';}}
  class Store {
    constructor({name='haru-page-v1',indexedDB=root.indexedDB}={}) {this.name=name;this.idb=indexedDB;this.db=null;this.opening=null;this.epoch=null;this.queue=Promise.resolve();}
    async open(){
      if(this.db)return this.db;if(this.opening)return this.opening;
      if(!this.idb)throw new Error('이 브라우저는 기기 저장소를 사용할 수 없어요. Safari 또는 Chrome에서 열어 주세요.');
      this.opening=new Promise((resolve,reject)=>{let settled=false;const fail=e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);};
        const timer=setTimeout(()=>fail(new Error('저장소 응답이 늦어요. 다른 하루 페이지를 닫고 다시 열어 주세요.')),8000);
        let req;try{req=this.idb.open(this.name,1);}catch(e){fail(e);return;}
        req.onupgradeneeded=()=>{for(const n of ['days','meta'])if(!req.result.objectStoreNames.contains(n))req.result.createObjectStore(n);};
        req.onblocked=()=>fail(new Error('다른 창이 저장소를 사용 중이에요. 다른 하루 페이지를 닫아 주세요.'));
        req.onerror=()=>fail(req.error||new Error('기기 저장소 접근 실패'));
        req.onsuccess=()=>{const db=req.result;if(settled){db.close();return;}settled=true;clearTimeout(timer);this.db=db;
          const discard=()=>{try{db.close();}catch{}if(this.db===db)this.db=null;};db.onversionchange=discard;db.onclose=()=>{if(this.db===db)this.db=null;};resolve(db);};
      });try{return await this.opening;}finally{this.opening=null;}
    }
    async transaction(names,mode,run,retry=true){
      const db=await this.open();let tx;
      try{tx=db.transaction(names,mode);}catch(e){if(retry&&e.name==='InvalidStateError'){try{db.close();}catch{}if(this.db===db)this.db=null;return this.transaction(names,mode,run,false);}throw e;}
      return new Promise((resolve,reject)=>{let result,failed;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failed||tx.error||new Error('저장이 중단됐어요. 입력은 지우지 않았어요.'));tx.onerror=()=>{};
        const fail=e=>{failed=e;try{tx.abort();}catch{reject(e);}};
        try{run(tx,v=>{result=v;},fail);}catch(e){fail(e);}
      });
    }
    enqueue(fn){const job=this.queue.then(fn,fn);this.queue=job.catch(()=>{});return job;}
    async init(){this.epoch=await this.transaction(['meta'],'readwrite',(tx,result,fail)=>{const s=tx.objectStore('meta'),r=s.get('epoch');r.onsuccess=()=>{try{const e=r.result||D.id();if(!r.result)s.put(e,'epoch');result(e);}catch(e){fail(e);}};});return this;}
    async get(date){if(!D.validDate(date))throw new Error('날짜 오류');return this.transaction(['days'],'readonly',(tx,result,fail)=>{const r=tx.objectStore('days').get(date);r.onsuccess=()=>{try{result(r.result?D.day(r.result):D.emptyDay(date));}catch(e){fail(e);}};});}
    async all(){return this.transaction(['days'],'readonly',(tx,result,fail)=>{const r=tx.objectStore('days').getAll();r.onsuccess=()=>{try{result(r.result.map(D.day).sort((a,b)=>b.date.localeCompare(a.date)));}catch(e){fail(e);}};});}
    change(dates,mutate){
      return this.enqueue(()=>this.transaction(['days','meta'],'readwrite',(tx,result,fail)=>{
        const ds=tx.objectStore('days'),meta=tx.objectStore('meta'),e=meta.get('epoch');e.onsuccess=()=>{if(e.result!==this.epoch){fail(new ConflictError('다른 창에서 백업을 불러왔어요. 새로고침한 뒤 이어서 적어 주세요.'));return;}
          const pages=new Map();let left=dates.length;
          for(const date of dates){const r=ds.get(date);r.onsuccess=()=>{try{pages.set(date,r.result?D.day(r.result):D.emptyDay(date));if(--left)return;
            const value=mutate(pages);for(const p of pages.values()){const next=D.day(p);next.rev++;next.updatedAt=new Date().toISOString();ds.put(next,next.date);pages.set(next.date,next);}result({pages,value});
          }catch(err){fail(err);}};}
        };
      }));
    }
    async update(date,fn){const r=await this.change([date],m=>fn(m.get(date)));return {day:r.pages.get(date),value:r.value};}
    async saveNote(date,note,base){return this.update(date,p=>{if(p.note!==base&&p.note!==note)throw new ConflictError('같은 날짜의 메모가 다른 창에서 수정됐어요. 현재 초안은 기기에 남아 있어요.');p.note=note;});}
    async move(date,taskId,to){if(date===to)throw new Error('다른 날짜를 선택해 주세요.');return this.change([date,to],m=>{const from=m.get(date),dest=m.get(to),t=from.tasks.find(t=>t.id===taskId);if(!t||t.movedTo)throw new ConflictError('이미 옮겨졌거나 지워진 할 일이에요.');
      if(t.done)throw new Error('완료한 할 일은 옮기지 않아요.');if(t.fixed)throw new Error('고정 일정은 원본 앱에서 변경해 주세요.');
      const copy=D.carryTask(t,date,to);if(!copy.source||!dest.tasks.some(x=>x.source?.key===copy.source.key))dest.tasks.push(copy);t.movedTo=to;t.slot=null;});}
    async export(){return {app:D.APP,version:D.VERSION,exportedAt:new Date().toISOString(),days:await this.all()};}
    async import(data,mode){const incoming=D.backup(data);if(!['merge','replace'].includes(mode))throw new Error('불러오기 방식을 확인해 주세요.');
      return this.enqueue(async()=>{const newEpoch=D.id();await this.transaction(['days','meta'],'readwrite',(tx,result,fail)=>{
        const ds=tx.objectStore('days'),ms=tx.objectStore('meta'),er=ms.get('epoch');er.onsuccess=()=>{if(er.result!==this.epoch){fail(new ConflictError());return;}
          const r=ds.getAll();r.onsuccess=()=>{try{const old=r.result.map(D.day);ms.put({app:D.APP,version:D.VERSION,days:old},'beforeImport');
            const all=new Map(mode==='replace'?[]:old.map(d=>[d.date,d]));for(const d of incoming.days){const cur=all.get(d.date);const next=cur?D.mergeDay(cur,d):D.day(d);next.rev=(cur?.rev||0)+1;next.updatedAt=new Date().toISOString();all.set(d.date,next);}
            ds.clear();for(const d of all.values())ds.put(d,d.date);ms.put(newEpoch,'epoch');result(all.size);
          }catch(e){fail(e);}};
        };
      });this.epoch=newEpoch;});
    }
    async previousBackup(){return this.transaction(['meta'],'readonly',(tx,result)=>{const r=tx.objectStore('meta').get('beforeImport');r.onsuccess=()=>result(r.result||null);});}
    close(){this.db?.close();this.db=null;}
  }
  root.HaruStorage={Store,ConflictError};
})(globalThis);
