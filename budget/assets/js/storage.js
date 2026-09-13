export const DB_NAME='jhkim-budget';
export const DB_VERSION=1;
export class RevisionConflictError extends Error{constructor(){super('다른 창에서 데이터가 바뀌었어요. 최신 내용을 다시 불러와 주세요.');this.name='RevisionConflictError';}}
export class BudgetStorage{
  constructor(indexedDB=globalThis.indexedDB){this.indexedDB=indexedDB;this.db=null;}
  async open(){
    if(this.db)return this.db;if(!this.indexedDB)throw new Error('이 브라우저는 안전한 로컬 데이터베이스를 지원하지 않아요.');
    this.db=await new Promise((resolve,reject)=>{const request=this.indexedDB.open(DB_NAME,DB_VERSION);let settled=false;
      const fail=error=>{if(!settled){settled=true;reject(error);}};
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots');};
      request.onerror=()=>fail(request.error||new Error('로컬 데이터베이스를 열지 못했어요.'));
      request.onblocked=()=>fail(new Error('다른 가계부 창을 닫은 뒤 다시 시도해 주세요.'));
      request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;resolve(request.result);};
    });this.db.onversionchange=()=>{this.db?.close();this.db=null;};return this.db;
  }
  async load(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readonly'),req=tx.objectStore('snapshots').get('authoritative');req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});}
  async save(next,expectedRevision,{backup=false}={}){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');let failure;const req=store.get('authoritative');req.onsuccess=()=>{const current=req.result;if((current?.revision??0)!==expectedRevision){failure=new RevisionConflictError();tx.abort();return;}if(backup&&current)store.put(current,`backup:${Date.now()}`);store.put(next,'authoritative');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure||tx.error||new Error('저장하지 못했어요. 기존 데이터는 유지됩니다.'));tx.onabort=()=>reject(failure||tx.error||new Error('저장이 중단됐어요. 기존 데이터는 유지됩니다.'));});}
  async reset(next,expectedRevision){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');let failure;const req=store.get('authoritative');req.onsuccess=()=>{const current=req.result;if((current?.revision??0)!==expectedRevision){failure=new RevisionConflictError();tx.abort();return;}store.clear();store.put(next,'authoritative');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure||tx.error||new Error('초기화하지 못했어요. 기존 데이터는 유지됩니다.'));tx.onabort=()=>reject(failure||tx.error||new Error('초기화가 중단됐어요. 기존 데이터는 유지됩니다.'));});}
}
