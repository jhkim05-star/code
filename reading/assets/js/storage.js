/** Browser adapter. Native app can inject an adapter with the same interface.
 * IndexedDB is the sole v2 authority; there is no stale mirror fallback.
 */
export const DB_NAME='bookshelf-reading';
export const LEGACY_KEY='bookshelf.data.v1';
export class ConflictError extends Error { constructor(message='다른 창에서 기록이 바뀌었어요. 다시 열어 내용을 확인해 주세요.') { super(message); this.name='ConflictError'; } }
export class BrowserStorage {
  constructor({indexedDB=globalThis.indexedDB,localStorage}={}) { this.idb=indexedDB; this.legacyProvider=()=>localStorage===undefined?globalThis.localStorage:localStorage; this.db=null; }
  async open() {
    if(this.db) return;
    if(!this.idb) throw new Error('이 환경은 로컬 데이터베이스를 지원하지 않아요. 기존 기록을 지우지 말고 지원되는 브라우저에서 열어 주세요.');
    this.db=await new Promise((resolve,reject)=>{
      let settled=false, req;
      const fail=e=>{if(!settled){settled=true;clearTimeout(timer);reject(e);}};
      const timer=setTimeout(()=>fail(new Error('저장소를 열지 못했어요. 다른 창을 닫고 다시 시도해 주세요.')),5000);
      try{ req=this.idb.open(DB_NAME,1); }catch(e){fail(e);return;}
      req.onupgradeneeded=()=>{for(const name of ['kv','drafts']) if(!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);};
      req.onerror=()=>fail(req.error||new Error('저장소 접근 실패'));
      req.onblocked=()=>fail(new Error('이전 앱 창이 저장소를 사용 중이에요. 다른 책꽂이 창을 닫아 주세요.'));
      req.onsuccess=()=>{if(settled){req.result.close();return;} settled=true;clearTimeout(timer);resolve(req.result);};
    });
    this.db.onversionchange=()=>{this.db?.close();this.db=null;};
  }
  async get(key,store='kv') {
    await this.open();
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction(store,'readonly'), req=tx.objectStore(store).get(key);
      let value; req.onsuccess=()=>{value=req.result;};
      tx.oncomplete=()=>resolve(value??null); tx.onerror=()=>reject(tx.error||req.error); tx.onabort=()=>reject(tx.error||new Error('읽기가 중단됐어요.'));
    });
  }
  async load(){return this.get('state');}
  async save(next,expectedRevision,{beforeImport=false,legacyBackup=null,clearDrafts=false,removeBookId=null,removeDraftIds=[]}={}) {
    await this.open();
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction(['kv','drafts'],'readwrite'), store=tx.objectStore('kv');
      let failure;
      const req=store.get('state');
      req.onsuccess=()=>{
        const current=req.result;
        if((current?.revision??0)!==expectedRevision){failure=new ConflictError();tx.abort();return;}
        if(beforeImport && current) store.put(current,'beforeImport');
        if(legacyBackup) store.put(legacyBackup,'legacyBooksBackup');
        store.put(next,'state');
        if(clearDrafts)tx.objectStore('drafts').clear();
        else {const drafts=tx.objectStore('drafts');for(const id of removeDraftIds)drafts.delete(id);if(removeBookId){const cursor=drafts.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(item.value.note?.bookId===removeBookId)item.delete();item.continue();};}}
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(failure||tx.error||new Error('저장 공간 또는 권한을 확인해 주세요.'));
      tx.onabort=()=>reject(failure||tx.error||new Error('저장하지 못했어요. 입력 내용은 화면에 남아 있어요.'));
    });
  }
  async draftPut(key,value) { return this._write('drafts',s=>s.put(value,key)); }
  async draftGet(key) {return this.get(key,'drafts');}
  async draftDelete(key) {return this._write('drafts',s=>s.delete(key));}
  async drafts() {
    await this.open(); return new Promise((resolve,reject)=>{
      const tx=this.db.transaction('drafts','readonly'), req=tx.objectStore('drafts').getAll();
      tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  async _write(name,fn){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(name,'readwrite');fn(tx.objectStore(name));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('저장 중단'));});}
  readLegacy(){return this.legacyProvider()?.getItem(LEGACY_KEY)||null;}
  retireLegacy(){this.legacyProvider()?.removeItem(LEGACY_KEY);}
  close(){this.db?.close();this.db=null;}
}
